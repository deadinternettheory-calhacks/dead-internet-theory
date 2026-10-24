import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EnrichmentJob, EnrichmentRequest, GraphEnvelope } from '../convex/lib/contract';
import { assembleAnalysis } from '../convex/lib/inference/assemble';
import { MockCreaoClient } from '../convex/lib/inference/creao';
import { checkSubmission } from '../convex/lib/inference/evidence';
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

  it('counts any product recommender as supportive, fills the other side with users who recommend nothing, and anchors each user on their own comment', () => {
    const sample = sampleHistoryAuthors(graph, triage);
    // d recommends a competing machine, so is a recommender too.
    expect(new Set(sample.supportive.sampled)).toEqual(new Set([id('a'), id('b'), id('c'), id('d')]));
    expect(new Set(sample.unsupportive.sampled)).toEqual(new Set([id('e'), id('f')]));
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
    expect(risk.explanation).toMatch(/History contrast \d+: sampled supportive users mention the recommended products in \d+%/);
    expect(risk.explanation).toMatch(/random sample of 4 of 4 supportive and 2 of 2 unsupportive users/);
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

describe('account automation signals', () => {
  const facts = { authorId: 'a', platform: 'reddit' as const, historyCount: 10, historyPartial: false, productMentionIds: [] as string[], accountAgeDays: null as number | null, anchorCommentId: 'reddit:comment:t1_syn01', communityCount: 1, historyIds: ['reddit:comment:t1_syn_a01', 'reddit:comment:t1_syn_a02', 'reddit:comment:t1_syn_a03'] };
  const known = new Set(['reddit:comment:t1_syn01', 'reddit:comment:t1_syn_a01', 'reddit:comment:t1_syn_a02', 'reddit:comment:t1_syn_a03']);

  it('re-scores the model’s account rules, keeping only family B with real evidence', async () => {
    const { scoreAccount } = await import('../convex/lib/inference/scoring');
    const s = scoreAccount({
      authorId: 'a',
      signals: [
        { id: 'B8', evidence: 'polished prose throughout', evidenceRefs: ['reddit:comment:t1_syn_a01'] },
        { id: 'B5', evidence: 'style shift', evidenceRefs: ['reddit:comment:invented'] },
        { id: 'C1', evidence: 'not an account rule', evidenceRefs: ['reddit:comment:t1_syn_a01'] },
      ],
      unknown: ['B6'],
    }, facts, known);
    expect(s.signals.map(x => x.id)).toEqual(['B8']);
    expect(s.discarded.join(' ')).toMatch(/B5: no resolvable evidence/);
    expect(s.discarded.join(' ')).toMatch(/C1: not an account rule/);
    expect(s.score).toBe(Math.round((100 * 5) / (94 - 8)));
  });

  it('adds measured brand focus and new-account signals even without a model review, and scores only what was checked', async () => {
    const { scoreAccount } = await import('../convex/lib/inference/scoring');
    const s = scoreAccount(undefined, { ...facts, productMentionIds: ['reddit:comment:t1_syn_a01', 'reddit:comment:t1_syn_a02', 'reddit:comment:t1_syn_a03'], accountAgeDays: 12 }, known);
    expect(s.signals.map(x => [x.id, x.points])).toEqual([['B1', 20], ['B4', 8]]);
    expect(s.score).toBe(Math.round((100 * 28) / 32));
  });

  it('reports no automation signs for an account that shows it is an ordinary human user', async () => {
    const { scoreAccount } = await import('../convex/lib/inference/scoring');
    const proposal = {
      authorId: 'a',
      signals: [{ id: 'B8', evidence: 'polished prose', evidenceRefs: ['reddit:comment:t1_syn_a01'] }],
      exculpatory: [{ id: 'E7', evidence: 'criticized the brand in another thread', evidenceRefs: ['reddit:comment:t1_syn_a02'] }],
      unknown: [],
    };
    const s = scoreAccount(proposal, facts, known);
    expect(s.score).toBe(0);
    expect(s.signals).toEqual([]);
    expect(s.humanSignals.map(x => x.id)).toEqual(['E7']);
  });

  it('recognizes an established account from measured facts alone', async () => {
    const { scoreAccount } = await import('../convex/lib/inference/scoring');
    const s = scoreAccount(undefined, { ...facts, accountAgeDays: 2000, communityCount: 5, productMentionIds: ['reddit:comment:t1_syn_a01'] }, known);
    expect(s.score).toBe(0);
    expect(s.humanSignals.map(x => x.id)).toEqual(['E2']);
    // Too new, or brand-heavy, is not established.
    expect(scoreAccount(undefined, { ...facts, accountAgeDays: 200, communityCount: 5 }, known).humanSignals).toEqual([]);
    expect(scoreAccount(undefined, { ...facts, accountAgeDays: 2000, communityCount: 5, productMentionIds: facts.historyIds }, known).humanSignals).toEqual([]);
  });

  it('ignores human-signal proposals that are not account-level or lack evidence', async () => {
    const { scoreAccount } = await import('../convex/lib/inference/scoring');
    const s = scoreAccount({ authorId: 'a', signals: [], exculpatory: [{ id: 'E3', evidence: 'balanced', evidenceRefs: ['reddit:comment:t1_syn_a01'] }, { id: 'E2', evidence: 'old', evidenceRefs: ['reddit:comment:nope'] }], unknown: [] }, facts, known);
    expect(s.humanSignals).toEqual([]);
    expect(s.discarded.join(' ')).toMatch(/E3: not an account-level human signal/);
  });

  it('has no score without history', async () => {
    const { scoreAccount } = await import('../convex/lib/inference/scoring');
    expect(scoreAccount(undefined, { ...facts, historyCount: 0 }, known).score).toBeNull();
  });

  it('attaches signals to each sampled user’s anchor comment in a contract-valid submission', () => {
    const { submission } = assembleAnalysis({ graph, triage, analyzedCommentIds: buildTriagePacket(graph).analyzedCommentIds, enrichments: [enrichment], scoring });
    const withSignals = submission.commentAssessments.filter(c => c.accountSignals);
    expect(withSignals.length).toBe(6);
    expect(withSignals.find(c => c.commentId === 'reddit:comment:t1_syn01')!.accountSignals!.signals.map(s => s.ruleId)).toContain('B1');
    expect(checkSubmission(submission, graph, [enrichment])).toBeNull();
    expect(JSON.stringify(withSignals)).not.toMatch(/\bbots?\b/i);
  });
});
