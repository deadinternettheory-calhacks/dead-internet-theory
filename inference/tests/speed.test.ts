import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type { EnrichmentJob, GraphEnvelope } from '../convex/lib/contract';
import { claudeTriage, ClaudeError, CLAUDE_SCORING_SCHEMA, CLAUDE_TRIAGE_SCHEMA, scoringProviderFrom } from '../convex/lib/inference/claude';
import { createCreaoClient, MockCreaoClient } from '../convex/lib/inference/creao';
import type { TriageOutput } from '../convex/lib/inference/outputs';
import { buildScoringPacket } from '../convex/lib/inference/packet';
import { runSequential, triageInputs } from '../convex/lib/inference/pipeline';
import { parseTriage } from '../convex/lib/inference/outputs';
import { ACCOUNT_REVIEW_SCHEMA, accountReviewInputs } from '../convex/lib/inference/accounts';

const dir = resolve(__dirname, '../fixtures/synthetic-espresso');
const read = (name: string) => readFileSync(resolve(dir, name), 'utf8');
const graph = JSON.parse(read('graph.json')) as GraphEnvelope;
const enrichment = JSON.parse(read('enrichment-completed.json')) as EnrichmentJob;
const triage = JSON.parse(read('creao-triage-response.json')) as TriageOutput;

function fakeAnthropic(reply: { stop_reason: string; text?: string; stop_details?: unknown }, accountReply?: string, scoringReply?: string) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        stream: (params: Record<string, unknown>) => {
          calls.push(params);
          const schema = (params.output_config as { format: { schema: unknown } }).format.schema;
          const text = schema === ACCOUNT_REVIEW_SCHEMA ? accountReply ?? reply.text : schema === CLAUDE_SCORING_SCHEMA ? scoringReply ?? reply.text : reply.text;
          return { finalMessage: async () => ({ stop_reason: reply.stop_reason, stop_details: reply.stop_details ?? null, content: text ? [{ type: 'text', text }] : [] }) };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

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
  it('requires complete, unique comment coverage and tries later valid candidates before another run', () => {
    const ids = triage.comments.map(c => c.commentId);
    const missing = { ...triage, comments: triage.comments.slice(0, 1) };
    expect(() => parseTriage(JSON.stringify(missing), ids)).toThrow('every analyzed comment');
    expect(() => parseTriage(JSON.stringify({ ...triage, comments: triage.comments.map((c,i) => i ? c : triage.comments[1]) }), ids)).toThrow();
    expect(() => parseTriage(JSON.stringify({ ...triage, comments: triage.comments.map((c,i) => i ? c : { ...c, commentId: 'foreign' }) }), ids)).toThrow();
    expect(parseTriage([JSON.stringify(missing), JSON.stringify(triage)], ids)).toEqual(triage);
  });

  it('bounds retries when a fast model omits most comments instead of treating that as completed work', async () => {
    const { client, calls } = fakeAnthropic({ stop_reason: 'end_turn', text: JSON.stringify({ ...triage, comments: triage.comments.slice(0,1) }) });
    const creao = new MockCreaoClient({ triage: '', scoring: '' });
    await expect(runSequential(graph, { creao, claude: { apiKey: 'k', client } })).rejects.toThrow('every analyzed comment');
    expect(calls).toHaveLength(3);
  });
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
    for (const schema of [CLAUDE_TRIAGE_SCHEMA, CLAUDE_SCORING_SCHEMA]) {
      walk(schema);
      expect(JSON.stringify(schema)).not.toMatch(/minimum|maximum|minLength|pattern/);
    }
  });

  it('reports refusals as non-retryable', async () => {
    const { client } = fakeAnthropic({ stop_reason: 'refusal', stop_details: { category: 'cyber' } });
    const err = (await claudeTriage({ apiKey: 'k', client }, triageInputs(graph).inputs).catch((e: unknown) => e)) as ClaudeError;
    expect(err).toBeInstanceOf(ClaudeError);
    expect(err.code).toBe('CLAUDE_REFUSAL');
    expect(err.retryable).toBe(false);
  });

  it('replaces the CREAO triage run in the pipeline', async () => {
    const accounts = accountReviewInputs(graph, triage, [enrichment])!.authorIds.map(authorId => ({ authorId, signals: [], exculpatory: [], unknown: [] }));
    const { client, calls } = fakeAnthropic({ stop_reason: 'end_turn', text: read('creao-triage-response.json') }, JSON.stringify({ accounts }));
    const creao = new MockCreaoClient({ triage: 'must not be used', scoring: read('creao-scoring-response.json') });
    const started: string[] = [];
    const tracked = { label: creao.label, startRun: async (i: { stage: 'triage' | 'scoring'; instructions: string; evidence: string }) => { started.push(i.stage); return creao.startRun(i); }, getRun: (r: string) => creao.getRun(r) };
    const result = await runSequential(graph, { creao: tracked, claude: { apiKey: 'k', client }, scoringProvider: 'creao', requestEnrichment: async () => enrichment, getEnrichment: async () => enrichment, sleep: async () => {} });
    expect(started).toEqual(['scoring']);
    expect(calls).toHaveLength(2);
    expect(result.submission.inferenceVersion).toContain('account-history-2026-10-25a');
    expect(result.submission.inferenceVersion).toContain('claude:claude-opus-5-5');
  });
});

describe('scoring provider switch', () => {
  it('defaults to Claude when a key is set and switches to CREAO on request', () => {
    expect(scoringProviderFrom(undefined, true)).toBe('claude');
    expect(scoringProviderFrom('claude', true)).toBe('claude');
    expect(scoringProviderFrom(' CREAO ', true)).toBe('creao');
    expect(scoringProviderFrom('claude', false)).toBe('creao');
  });

  it('scores on Claude by default without starting any CREAO run', async () => {
    const accounts = accountReviewInputs(graph, triage, [enrichment])!.authorIds.map(authorId => ({ authorId, signals: [], exculpatory: [], unknown: [] }));
    const { client, calls } = fakeAnthropic({ stop_reason: 'end_turn', text: read('creao-triage-response.json') }, JSON.stringify({ accounts }), read('creao-scoring-response.json'));
    const creao = new MockCreaoClient({ triage: 'must not be used', scoring: 'must not be used' });
    const started: string[] = [];
    const tracked = { label: creao.label, startRun: async (i: { stage: 'triage' | 'scoring'; instructions: string; evidence: string }) => { started.push(i.stage); return creao.startRun(i); }, getRun: (r: string) => creao.getRun(r) };
    const result = await runSequential(graph, { creao: tracked, claude: { apiKey: 'k', client }, requestEnrichment: async () => enrichment, getEnrichment: async () => enrichment, sleep: async () => {} });
    expect(started).toEqual([]);
    expect(calls).toHaveLength(3);
    expect((calls[2] as { output_config: { format: { schema: unknown } } }).output_config.format.schema).toBe(CLAUDE_SCORING_SCHEMA);
    expect(result.scoring?.assessments.length).toBeGreaterThan(0);
    expect(result.submission.inferenceVersion).toContain('claude-scoring:claude-opus-5-5');
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
