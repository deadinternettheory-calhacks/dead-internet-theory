import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EnrichmentJob, EnrichmentRequest, GraphEnvelope } from '../convex/lib/contract';
import { assembleAnalysis } from '../convex/lib/inference/assemble';
import { MockCreaoClient } from '../convex/lib/inference/creao';
import { parseScoring, type ScoringOutput, type TriageOutput } from '../convex/lib/inference/outputs';
import { buildTriagePacket, sampleHistoryAuthors } from '../convex/lib/inference/packet';
import { runSequential } from '../convex/lib/inference/pipeline';

const dir = resolve(__dirname, '../fixtures/synthetic-espresso');
const read = (name: string) => readFileSync(resolve(dir, name), 'utf8');
const graph = JSON.parse(read('graph.json')) as GraphEnvelope;
const enrichment = JSON.parse(read('enrichment-completed.json')) as EnrichmentJob;
const triage = JSON.parse(read('creao-triage-response.json')) as TriageOutput;
const scoring = parseScoring(read('creao-scoring-response.json'));
const id = (n: string) => `reddit:author:t2_syn_${n}`;

/** A synthetic thread with many supportive and critical commenters. */
function bigThread(supportive: number, critical: number): { graph: GraphEnvelope; triage: TriageOutput } {
  const nodes: GraphEnvelope['nodes'] = [graph.nodes.find(n => n.type === 'discussion')!];
  const comments: TriageOutput['comments'] = [];
  const add = (i: number, stance: 'supportive' | 'critical') => {
    const authorId = `reddit:author:t2_big_${stance}_${i}`;
    const commentId = `reddit:comment:t1_big_${stance}_${i}`;
    nodes.push({ id: authorId, type: 'author', handle: `${stance}_${i}`, displayName: null } as never);
    nodes.push({ id: commentId, type: 'comment', authorId, parentId: graph.rootId, text: `${stance} ${i}`, createdAt: null, url: null, metrics: {}, contentStatus: 'visible' } as never);
    comments.push({ commentId, stance, recommendsProduct: null, recommendsSubject: stance === 'supportive', rationale: '' });
  };
  for (let i = 0; i < supportive; i++) add(i, 'supportive');
  for (let i = 0; i < critical; i++) add(i, 'critical');
  return { graph: { ...graph, nodes, coverage: { ...graph.coverage, retrievedCommentCount: comments.length } }, triage: { subject: triage.subject, comments } };
}

describe('random history sample', () => {
  it('draws up to six users from each side, not everyone', () => {
    const big = bigThread(40, 30);
    const sample = sampleHistoryAuthors(big.graph, big.triage);
    expect(sample.supportive.population).toBe(40);
    expect(sample.unsupportive.population).toBe(30);
    expect(sample.supportive.sampled).toHaveLength(6);
    expect(sample.unsupportive.sampled).toHaveLength(6);
    expect(sample.pairs).toHaveLength(12);
    expect(sample.supportive.sampled.every(a => a.includes('supportive'))).toBe(true);
    expect(sample.unsupportive.sampled.every(a => a.includes('critical'))).toBe(true);
  });

  it('is random across threads but repeatable for the same thread', () => {
    const big = bigThread(40, 30);
    const first = sampleHistoryAuthors(big.graph, big.triage);
    expect(sampleHistoryAuthors(big.graph, big.triage)).toEqual(first);
    const other = sampleHistoryAuthors({ ...big.graph, investigationId: 'inv_other' }, big.triage);
    expect(other.supportive.sampled).not.toEqual(first.supportive.sampled);
    // Not simply the first users in thread order.
    expect(first.supportive.sampled).not.toEqual(Array.from({ length: 6 }, (_, i) => `reddit:author:t2_big_supportive_${i}`));
  });

  it('fills the unsupportive side with neutral users when few are critical, and anchors each user on their own comment', () => {
    const sample = sampleHistoryAuthors(graph, triage);
    expect(new Set(sample.supportive.sampled)).toEqual(new Set([id('a'), id('b'), id('c')]));
    expect(new Set(sample.unsupportive.sampled)).toEqual(new Set([id('e'), id('d'), id('f')]));
    const nodes = new Map(graph.nodes.map(n => [n.id, n]));
    for (const p of sample.pairs) expect((nodes.get(p.anchorCommentId) as { authorId: string }).authorId).toBe(p.authorId);
  });

  it('requests nothing on platforms without histories', () => {
    expect(sampleHistoryAuthors({ ...graph, platform: 'youtube' }, triage).pairs).toEqual([]);
  });

  it('sends one history request for the sample', async () => {
    const requests: EnrichmentRequest[] = [];
    const creao = new MockCreaoClient({ triage: read('creao-triage-response.json'), scoring: read('creao-scoring-response.json') });
    await runSequential(graph, {
      creao,
      requestEnrichment: async r => (requests.push(r), enrichment),
      getEnrichment: async () => enrichment,
      sleep: async () => {},
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].authors).toEqual(sampleHistoryAuthors(graph, triage).pairs);
  });
});

describe('comment-section index', () => {
  const { analyzedCommentIds } = buildTriagePacket(graph);
  const assemble = (jobs: EnrichmentJob[], t: TriageOutput = triage, s: ScoringOutput | null = scoring) =>
    assembleAnalysis({ graph, triage: t, analyzedCommentIds, enrichments: jobs, scoring: s }).submission.overallCoordinationRisk;

  it('gives one 0-100 score for the whole section, explained part by part', () => {
    const risk = assemble([enrichment]);
    expect(risk.score).toBeGreaterThanOrEqual(55);
    expect(risk.score).toBeLessThanOrEqual(100);
    expect(risk.explanation).toMatch(/Comment-section astroturfing index/);
    expect(risk.explanation).toMatch(/History contrast \d+: sampled supportive users mention BrewMaster Mini in \d+%/);
    expect(risk.explanation).toMatch(/random sample of 3 of 3 supportive and 3 of 3 unsupportive users/);
    expect(risk.explanation).toMatch(/not a probability/);
  });

  it('scores lower without the supportive users’ brand-heavy histories', () => {
    const baselineOnly = { ...enrichment, results: (enrichment.results ?? []).filter(r => ['d', 'e', 'f'].some(n => r.authorId === id(n))) };
    const withContrast = assemble([enrichment]);
    const without = assemble([baselineOnly]);
    expect(without.explanation).toMatch(/History contrast not measured/);
    expect(withContrast.confidence!).toBeGreaterThan(without.confidence!);
  });

  it('is low, not missing, when nothing is promoted', () => {
    const quiet: TriageOutput = { ...triage, comments: triage.comments.map(c => ({ ...c, stance: 'neutral' as const, recommendsProduct: null, recommendsSubject: false })) };
    const risk = assemble([], quiet, null);
    expect(risk.score).toBe(0);
    expect(risk.explanation).toMatch(/No comment recommended a product/);
  });
});
