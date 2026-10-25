import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { expect, it } from 'vitest';
import type { EnrichmentJob, GraphEnvelope } from '../convex/lib/contract';
import { ACCOUNT_REVIEW_SCHEMA, accountReviewInputs, parseAccountReview, reviewAccounts } from '../convex/lib/inference/accounts';
import { MockCreaoClient } from '../convex/lib/inference/creao';
import type { ProposedAccount, TriageOutput } from '../convex/lib/inference/outputs';
import { runSequential, scoringInputs } from '../convex/lib/inference/pipeline';
import { scoreAccount } from '../convex/lib/inference/scoring';

const read = (name: string) => JSON.parse(readFileSync(resolve(__dirname, '../fixtures/synthetic-espresso', name), 'utf8'));
const graph = read('graph.json') as GraphEnvelope;
const job = read('enrichment-completed.json') as EnrichmentJob;
const triage = read('creao-triage-response.json') as TriageOutput;
const input = accountReviewInputs(graph, triage, [job])!;
const authors = JSON.parse(input.evidence).authors as { authorId: string; history: { id: string }[] }[];
const accounts: ProposedAccount[] = authors.map((a, i) => ({
  authorId: a.authorId,
  signals: i === 0 ? [{ id: 'B8', points: 5, evidence: 'Uniform marketing-style wording across the supplied sample.', evidenceRefs: [a.history[0].id] }] : [],
  exculpatory: [], unknown: ['B4', 'B5', 'B6', 'B9'],
}));

it('includes every retrieved history, even when there are no recommendation targets, without another collection', () => {
  const quiet = { ...triage, comments: triage.comments.map(c => ({ ...c, recommendsProduct: null, recommendsSubject: false })) };
  expect(accountReviewInputs(graph, quiet, [job])!.authorIds).toEqual(input.authorIds);
  expect(authors).toHaveLength(job.results!.filter(r => r.comments.length).length);
  expect(accountReviewInputs(graph, triage, [])).toBeNull();
  expect(accountReviewInputs({ ...graph, platform: 'tiktok' }, triage, [job])).toBeNull();
  expect(JSON.parse(scoringInputs(graph, triage, [job], true).evidence).accountsReviewed).toBeTruthy();
  expect(scoringInputs(graph, triage, [job], true).instructions).toContain('Return accounts: []');
});

it('rejects omitted, duplicated or foreign authors instead of silently fabricating account zeroes', () => {
  const parse = (value: ProposedAccount[]) => parseAccountReview([JSON.stringify({ accounts: value })], input.authorIds);
  expect(parse(accounts)).toEqual(accounts);
  expect(() => parse(accounts.slice(1))).toThrow('every supplied author');
  expect(() => parse(accounts.map((a, i) => i === 0 ? accounts[1] : a))).toThrow('every supplied author');
  expect(() => parse(accounts.map((a, i) => i === 0 ? { ...a, authorId: 'foreign' } : a))).toThrow('every supplied author');
});

it('bounds semantic retries and closes the structured schema', async () => {
  let calls = 0;
  const client = { beta: { messages: { stream: () => {
    calls++;
    return { finalMessage: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"accounts":[]}' }] }) };
  } } } } as unknown as Anthropic;
  await expect(reviewAccounts({ apiKey: 'test', client }, input)).rejects.toThrow('every supplied author');
  expect(calls).toBe(3);
  const walk = (s: Record<string, unknown>) => {
    if (s.type === 'object') expect(s.additionalProperties).toBe(false);
    for (const v of Object.values(s)) if (v && typeof v === 'object') walk(v as Record<string, unknown>);
  };
  walk(ACCOUNT_REVIEW_SCHEMA);
});

it('reviews all histories on Claude even when the broad CREAO scoring stage is skipped', async () => {
  const quiet = { ...triage, comments: triage.comments.map(c => ({ ...c, recommendsProduct: null, recommendsSubject: false })) };
  let calls = 0;
  const client = { beta: { messages: { stream: () => ({ finalMessage: async () => ({
    stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(++calls === 1 ? quiet : { accounts }) }],
  }) }) } } } as unknown as Anthropic;
  const creao = new MockCreaoClient({ triage: '', scoring: '' });
  creao.startRun = async () => { throw new Error('CREAO must not run without recommendation targets'); };
  const result = await runSequential(graph, { creao, claude: { apiKey: 'test', client }, requestEnrichment: async () => job, getEnrichment: async () => job });
  const rows = result.submission.commentAssessments.flatMap(c => c.accountSignals ? [c.accountSignals] : []);
  expect(calls).toBe(2);
  expect(rows).toHaveLength(input.authorIds.length);
  expect(rows.find(a => a.authorId === accounts[0].authorId)?.signals.map(s => s.ruleId)).toContain('B8');
});

it('keeps absent product context unknown and rejects another author’s history as account evidence', () => {
  const facts = { authorId: 'a', platform: 'reddit' as const, historyCount: 10, historyPartial: false, hasProductContext: false, productMentionIds: [], accountAgeDays: null, anchorCommentId: 'anchor', communityCount: 1, historyIds: ['own-history'] };
  const known = new Set(['anchor', 'own-history', 'foreign-history']);
  const score = scoreAccount(undefined, facts, known);
  expect(score.score).toBeNull();
  expect(score.unknown).toContain('B1');
  const foreign = scoreAccount({ authorId: 'a', signals: [{ id: 'B8', evidence: 'other author', evidenceRefs: ['foreign-history'] }], unknown: [] }, facts, known);
  expect(foreign.signals).toHaveLength(0);
  expect(foreign.unknown).toContain('B8');
});
