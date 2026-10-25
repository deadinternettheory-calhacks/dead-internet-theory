import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnalysisSubmission, EnrichmentJob, GraphEnvelope } from '../convex/lib/contract';
import { assembleAnalysis, safeText } from '../convex/lib/inference/assemble';
import { MockCreaoClient } from '../convex/lib/inference/creao';
import { checkSubmission } from '../convex/lib/inference/evidence';
import { extractJsonObject, parseScoring, parseTriage, type TriageOutput } from '../convex/lib/inference/outputs';
import { buildScoringPacket, buildTriagePacket } from '../convex/lib/inference/packet';
import { runSequential } from '../convex/lib/inference/pipeline';
import { validateModel } from '../convex/lib/schema';
import { buildDemo, buildExample } from '../scripts/generate-demo';

const dir = resolve(__dirname, '../fixtures/synthetic-espresso');
const read = (name: string) => readFileSync(resolve(dir, name), 'utf8');
const graph = JSON.parse(read('graph.json')) as GraphEnvelope;
const enrichment = JSON.parse(read('enrichment-completed.json')) as EnrichmentJob;
const triage = JSON.parse(read('creao-triage-response.json')) as TriageOutput;

describe('model output parsing', () => {
  it('extracts JSON from fenced or chatty replies', () => {
    expect(extractJsonObject('Here you go:\n```json\n{"a": {"b": "}"}}\n```')).toEqual({ a: { b: '}' } });
    expect(extractJsonObject('prefix {"x": 1} suffix')).toEqual({ x: 1 });
  });

  it('rejects malformed triage output', () => {
    expect(() => parseTriage('{"subject": {"label": "x"}}')).toThrow(/Triage output failed validation/);
    expect(() => parseTriage('no json here')).toThrow(/no JSON/);
  });

  it('falls back to the full chat reply when result.text is a summary', () => {
    const summary = '{"stage":"triage","coordination_score":0.68,"duplicate_clusters":1}';
    const chat = `Triage complete.\n\n\`\`\`json\n${read('creao-triage-response.json')}\n\`\`\``;
    expect(parseTriage([summary, chat]).subject.label).toBe('BrewMaster Mini');
    expect(() => parseTriage([summary])).toThrow(/Triage output failed validation/);
  });

  it('accepts the recorded fixture responses', () => {
    expect(parseTriage(read('creao-triage-response.json')).comments).toHaveLength(8);
    expect(parseScoring(read('creao-scoring-response.json')).assessments).toHaveLength(5);
  });
});

describe('packets and selection', () => {
  it('includes every retrieved comment in the triage packet', () => {
    const { packet, analyzedCommentIds } = buildTriagePacket(graph);
    expect(analyzedCommentIds).toHaveLength(graph.coverage.retrievedCommentCount);
    expect(packet.root.title).toContain('[Synthetic example]');
  });

  it('computes measurements for the scoring packet', () => {
    const packet = buildScoringPacket(graph, triage, [enrichment]);
    expect(packet.measurements.largestRecommendationBurst30m.commentIds).toHaveLength(3);
    expect(packet.measurements.similarPairs[0].wordOverlap).toBeGreaterThan(0.5);
    expect(packet.authors.find(a => a.handle === 'brewfan_22')?.subjectMentionCount).toBe(5);
  });
});

describe('assembled analysis', () => {
  it('produces a contract-valid submission from the demo pipeline', async () => {
    const demo = await buildDemo();
    expect(validateModel('AnalysisResource', demo.analysis).valid).toBe(true);
    expect(checkSubmission(demo.analysis.result, graph, demo.enrichments)).toBeNull();
    expect(demo.analysis.result.overallCoordinationRisk.score).toBe(67);
  });

  it('keeps generated example files in sync (npm run demo)', async () => {
    const demo = await buildDemo();
    expect(JSON.parse(read('analysis-resource.json'))).toEqual(demo.analysis);
    const example = await buildExample();
    const web = JSON.parse(readFileSync(resolve(__dirname, '../../web/src/demo/example-report.json'), 'utf8'));
    expect(web.analysis).toEqual(example.analysis);
    expect(web.graph).toEqual(example.graph);
  });

  it('rejects a submission citing evidence that does not exist', async () => {
    const demo = await buildDemo();
    const tampered: AnalysisSubmission = structuredClone(demo.analysis.result);
    tampered.axes[0].evidenceRefs = ['reddit:comment:t1_invented'];
    expect(checkSubmission(tampered, graph, [enrichment])?.code).toBe('INVALID_EVIDENCE_REF');
    expect(checkSubmission(demo.analysis.result, graph, [])?.code).toBe('INVALID_EVIDENCE_REF');
    expect(checkSubmission({ ...demo.analysis.result, graphRevision: 2 }, graph, [enrichment])?.code).toBe('STALE_GRAPH_REVISION');
  });

  it('returns a low section index when nothing recommends a product', () => {
    const quiet: TriageOutput = { ...triage, comments: triage.comments.map(c => ({ ...c, recommendsProduct: null, recommendsSubject: false })) };
    const { analyzedCommentIds } = buildTriagePacket(graph);
    const { submission } = assembleAnalysis({ graph, triage: quiet, analyzedCommentIds, enrichments: [], scoring: { assessments: [], clusters: [], overallSummary: '' } });
    expect(submission.overallCoordinationRisk.score).toBeLessThan(15);
    expect(submission.overallCoordinationRisk.explanation).toMatch(/No comment recommended a product/);
    expect(checkSubmission(submission, graph, [])).toBeNull();
  });

  it('replaces accusatory model text', () => {
    expect(safeText('These accounts are paid shills.', 'fallback')).toBe('fallback');
    expect(safeText('Pattern consistent with coordinated promotion.', 'fallback')).toBe('Pattern consistent with coordinated promotion.');
  });

  it('re-runs a stage when CREAO replies without the requested JSON', async () => {
    const replies: Record<string, string[]> = {
      triage: ['Dashboard rendered; session metrics recorded.', read('creao-triage-response.json')],
      scoring: ['{"stage":"scoring","coordination_score":0.5}', 'Full JSON described above.', read('creao-scoring-response.json')],
    };
    const started: string[] = [];
    const creao = {
      label: 'flaky',
      startRun: async (i: { stage: string }) => { started.push(i.stage); return `${i.stage}-${started.length}`; },
      getRun: async (id: string) => ({ runId: id, status: 'completed' as const, outputs: [replies[id.split('-')[0]].shift()!], errorCode: null }),
    };
    const result = await runSequential(graph, { creao, requestEnrichment: async () => enrichment, getEnrichment: async () => enrichment, sleep: async () => {} });
    expect(started).toEqual(['triage', 'triage', 'scoring', 'scoring', 'scoring']);
    expect(result.submission.overallCoordinationRisk.score).toBe(67);
  });

  it('fails instead of submitting when CREAO output is unusable', async () => {
    const creao = new MockCreaoClient({ triage: 'I cannot help with that.', scoring: '{}' });
    await expect(runSequential(graph, { creao, sleep: async () => {} })).rejects.toThrow(/no JSON/);
  });
});
