import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type { EnrichmentJob, EnrichmentRequest, GraphEnvelope } from '../convex/lib/contract';
import { claudeTriage, ClaudeError, CLAUDE_TRIAGE_SCHEMA } from '../convex/lib/inference/claude';
import { createCreaoClient, MockCreaoClient } from '../convex/lib/inference/creao';
import type { TriageOutput } from '../convex/lib/inference/outputs';
import { buildScoringPacket, speculativeEnrichmentPairs } from '../convex/lib/inference/packet';
import { followupRequestFor, runSequential, speculativeRequestFor, triageInputs } from '../convex/lib/inference/pipeline';

const dir = resolve(__dirname, '../fixtures/synthetic-espresso');
const read = (name: string) => readFileSync(resolve(dir, name), 'utf8');
const graph = JSON.parse(read('graph.json')) as GraphEnvelope;
const enrichment = JSON.parse(read('enrichment-completed.json')) as EnrichmentJob;
const triage = JSON.parse(read('creao-triage-response.json')) as TriageOutput;
const id = (n: string) => `reddit:author:t2_syn_${n}`;

function fakeAnthropic(reply: { stop_reason: string; text?: string; stop_details?: unknown }) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        stream: (params: Record<string, unknown>) => {
          calls.push(params);
          return { finalMessage: async () => ({ stop_reason: reply.stop_reason, stop_details: reply.stop_details ?? null, content: reply.text ? [{ type: 'text', text: reply.text }] : [] }) };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

describe('speculative histories', () => {
  it('picks likely recommenders from the thread alone', () => {
    const pairs = speculativeEnrichmentPairs(graph);
    expect(pairs.map(p => p.authorId)).toEqual([id('a'), id('b'), id('c'), id('e')]);
    const nodes = new Map(graph.nodes.map(n => [n.id, n]));
    for (const p of pairs) expect((nodes.get(p.anchorCommentId) as { authorId: string }).authorId).toBe(p.authorId);
  });

  it('asks triage only for authors not already requested', () => {
    const requested = new Set(speculativeRequestFor(graph)!.authors.map(a => a.authorId));
    expect(followupRequestFor(graph, triage, requested)!.authors).toEqual([{ authorId: id('d'), anchorCommentId: 'reddit:comment:t1_syn04' }]);
    expect(followupRequestFor(graph, triage, new Set([id('a'), id('b'), id('c'), id('d')]))).toBeNull();
  });

  it('requests nothing on platforms without histories', () => {
    expect(speculativeEnrichmentPairs({ ...graph, platform: 'tiktok' })).toEqual([]);
  });

  it('runs triage and the speculative request in parallel, then a follow-up', async () => {
    const order: string[] = [];
    let release!: () => void;
    const triageGate = new Promise<void>(r => (release = r));
    const creao = {
      label: 'gated',
      startRun: async (i: { stage: string }) => { order.push(`start:${i.stage}`); return i.stage; },
      getRun: async (runId: string) => {
        if (runId === 'triage') await triageGate;
        return { runId, status: 'completed' as const, outputs: [read(runId === 'triage' ? 'creao-triage-response.json' : 'creao-scoring-response.json')], errorCode: null };
      },
    };
    const requests: EnrichmentRequest[] = [];
    const result = await runSequential(graph, {
      creao,
      requestEnrichment: async r => {
        requests.push(r);
        order.push(`enrich:${r.authors.length}`);
        if (requests.length === 1) release(); // triage can only finish after the speculative request went out
        return { ...enrichment, enrichmentId: `enr_${requests.length}`, results: (enrichment.results ?? []).filter(x => r.authors.some(a => a.authorId === x.authorId)) };
      },
      getEnrichment: async () => enrichment,
      sleep: async () => {},
    });
    expect(order.slice(0, 2).sort()).toEqual(['enrich:4', 'start:triage']);
    expect(requests.map(r => r.authors.length)).toEqual([4, 1]);
    expect(result.submission.usedEnrichmentIds).toEqual(['enr_1', 'enr_2']);
    expect(result.submission.overallCoordinationRisk.score).toBe(76);
  });
});

describe('smaller scoring packet', () => {
  it('sends recommendations and their context, not every comment', () => {
    const quiet: TriageOutput = { ...triage, comments: triage.comments.map(c => (c.commentId.endsWith('syn01') ? c : { ...c, recommendsProduct: null, recommendsSubject: false })) };
    const packet = buildScoringPacket(graph, quiet, [enrichment]);
    expect(packet.targets).toEqual(['reddit:comment:t1_syn01']);
    expect(packet.comments.length + packet.omittedCommentCount).toBe(graph.coverage.retrievedCommentCount);
    expect(packet.comments.map(c => c.id)).toContain('reddit:comment:t1_syn05'); // reply to the target
  });
});

describe('direct Claude triage', () => {
  it('uses structured outputs, low effort, default fallbacks and untrusted-evidence framing', async () => {
    const { client, calls } = fakeAnthropic({ stop_reason: 'end_turn', text: read('creao-triage-response.json') });
    const outputs = await claudeTriage({ apiKey: 'k', client }, triageInputs(graph).inputs);
    expect(JSON.parse(outputs[0]).subject.label).toBe('BrewMaster Mini');
    const params = calls[0] as { model: string; betas: string[]; fallbacks: string; output_config: { effort: string; format: { type: string } }; messages: { content: string }[] };
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(params.fallbacks).toBe('default');
    expect(params.output_config.effort).toBe('low');
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.messages[0].content).toContain('<evidence>');
  });

  it('closes every object in the structured-output schema', () => {
    const walk = (s: Record<string, unknown>): void => {
      if (s.type === 'object') expect(s.additionalProperties, JSON.stringify(Object.keys(s.properties as object))).toBe(false);
      for (const v of Object.values(s)) if (v && typeof v === 'object') walk(v as Record<string, unknown>);
    };
    walk(CLAUDE_TRIAGE_SCHEMA);
    expect(JSON.stringify(CLAUDE_TRIAGE_SCHEMA)).not.toMatch(/minimum|maximum|minLength/);
  });

  it('reports refusals as non-retryable', async () => {
    const { client } = fakeAnthropic({ stop_reason: 'refusal', stop_details: { category: 'cyber' } });
    const err = (await claudeTriage({ apiKey: 'k', client }, triageInputs(graph).inputs).catch((e: unknown) => e)) as ClaudeError;
    expect(err).toBeInstanceOf(ClaudeError);
    expect(err.code).toBe('CLAUDE_REFUSAL');
    expect(err.retryable).toBe(false);
  });

  it('replaces the CREAO triage run in the pipeline', async () => {
    const { client } = fakeAnthropic({ stop_reason: 'end_turn', text: read('creao-triage-response.json') });
    const creao = new MockCreaoClient({ triage: 'must not be used', scoring: read('creao-scoring-response.json') });
    const started: string[] = [];
    const tracked = { label: creao.label, startRun: async (i: { stage: 'triage' | 'scoring'; instructions: string; evidence: string }) => { started.push(i.stage); return creao.startRun(i); }, getRun: (r: string) => creao.getRun(r) };
    const result = await runSequential(graph, { creao: tracked, claude: { apiKey: 'k', client }, requestEnrichment: async () => enrichment, getEnrichment: async () => enrichment, sleep: async () => {} });
    expect(started).toEqual(['scoring']);
    expect(result.submission.inferenceVersion).toContain('claude:claude-opus-5-5');
  });
});

describe('CREAO webhooks', () => {
  it('asks CREAO to call back when a webhook URL is configured', async () => {
    const bodies: unknown[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return new Response(JSON.stringify({ id: 'run-1', status: 'pending' }), { status: 202 });
    }) as unknown as typeof fetch;
    const hook = 'https://inference.example/creao-webhook?token=t';
    await createCreaoClient({ apiKey: 'capi_x', appId: 'a', webhookUrl: hook, fetchImpl }).startRun({ stage: 'scoring', instructions: 'i', evidence: '{}' });
    await createCreaoClient({ apiKey: 'cr_sk_x', agentId: 'g', webhookUrl: hook, fetchImpl }).startRun({ stage: 'scoring', instructions: 'i', evidence: '{}' });
    expect(bodies[0]).toMatchObject({ webhookUrl: hook });
    expect(bodies[1]).toMatchObject({ webhook_url: hook });
  });
});
