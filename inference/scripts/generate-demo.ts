// Runs the inference pipeline with recorded model replies and writes:
// - the website example: a real r/BuyItForLife thread (usernames and comment IDs
//   replaced) with the Claude triage and CREAO scoring replies recorded from a
//   live run (fixtures/example-reddit-knife);
// - the synthetic espresso test fixture's expected output.
// Usage: npm run demo (write) or npm run demo:check (verify).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnalysisResource, EnrichmentJob, EnrichmentRequest, GraphEnvelope, HistoryResult, InvestigationResource } from '../convex/lib/contract';
import { MockCreaoClient } from '../convex/lib/inference/creao';
import { runSequential } from '../convex/lib/inference/pipeline';
import { assertModel } from '../convex/lib/schema';
import { SYNTHETIC_SOURCE_URL } from '../convex/lib/fixtures';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(here, '../fixtures/synthetic-espresso');
const exampleDir = resolve(here, '../fixtures/example-reddit-knife');
const webFixture = resolve(here, '../../web/src/demo/example-report.json');
const webTestFixture = resolve(here, '../../web/src/test/synthetic-espresso-report.json');
const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(fixtureDir, name), 'utf8')) as T;

export { SYNTHETIC_SOURCE_URL };

/** The website example: recorded live replies for the anonymized real thread. */
export async function buildExample() {
  const readEx = <T>(name: string): T => JSON.parse(readFileSync(resolve(exampleDir, name), 'utf8')) as T;
  const graph = readEx<GraphEnvelope>('graph.json');
  const job = readEx<EnrichmentJob>('enrichment-completed.json');
  const creao = new MockCreaoClient({ triage: JSON.stringify(readEx('triage-response.json')), scoring: JSON.stringify(readEx('scoring-response.json')) });
  // The replies came from Claude (triage) and the CREAO agent (scoring); label the analysis accordingly.
  Object.defineProperty(creao, 'label', { value: 'recorded:claude-opus-5-5+creao-app-trigger' });
  const result = await runSequential(graph, {
    creao,
    requestEnrichment: async () => job,
    getEnrichment: async () => job,
    sleep: async () => {},
    inferredAt: '2026-10-24T20:40:00Z',
  });
  const root = graph.nodes.find(n => n.id === graph.rootId) as { url: string };
  const analysis: AnalysisResource = { schemaVersion: '1.0.0', analysisId: 'anl_example_knife', investigationId: graph.investigationId, storedAt: '2026-10-24T20:40:05Z', result: result.submission };
  const investigation: InvestigationResource = {
    schemaVersion: '1.0.0',
    investigationId: graph.investigationId,
    sourceUrl: root.url,
    platform: graph.platform,
    ingestionStatus: 'completed',
    analysisStatus: 'completed',
    graphRevision: graph.graphRevision,
    graphFingerprint: graph.graphFingerprint,
    createdAt: '2026-10-24T20:10:47Z',
    updatedAt: '2026-10-24T20:40:05Z',
  };
  assertModel('AnalysisResource', analysis);
  assertModel('InvestigationResource', investigation);
  assertModel('GraphEnvelope', graph);
  for (const j of result.enrichments) assertModel('EnrichmentJob', j);
  return { analysis, investigation, graph, enrichments: result.enrichments, scores: result.scores };
}

export async function buildDemo() {
  const graph = read<GraphEnvelope>('graph.json');
  const fixtureHistories = read<EnrichmentJob>('enrichment-completed.json');
  const jobs = new Map<string, EnrichmentJob>();
  // Serves the fixture histories for whichever authors are requested, one job per request.
  const fulfil = (request: EnrichmentRequest): EnrichmentJob => {
    const enrichmentId = jobs.size === 0 ? fixtureHistories.enrichmentId : `${fixtureHistories.enrichmentId}_${jobs.size + 1}`;
    const results: HistoryResult[] = request.authors.map(({ authorId, anchorCommentId }) => {
      const known = fixtureHistories.results?.find(r => r.authorId === authorId);
      if (known) return { ...known, anchorCommentId };
      return {
        authorId,
        anchorCommentId,
        status: 'unavailable',
        strategy: 'none',
        comments: [],
        coverage: { requestedCount: 10, returnedCount: 0, candidateFetchedCount: 0, providerTruncated: null, reachedAnchorWindow: null, oldestFetchedAt: null, newestFetchedAt: null, collectedAt: null, sourceSnapshotRef: null, actorRunIds: [], limitations: ['Synthetic fixture has no history for this author.'] },
      };
    });
    const job: EnrichmentJob = { ...fixtureHistories, enrichmentId, results };
    jobs.set(enrichmentId, job);
    return job;
  };
  const creao = new MockCreaoClient({
    triage: readFileSync(resolve(fixtureDir, 'creao-triage-response.json'), 'utf8'),
    scoring: readFileSync(resolve(fixtureDir, 'creao-scoring-response.json'), 'utf8'),
  });
  const result = await runSequential(graph, {
    creao,
    requestEnrichment: async request => fulfil(request),
    getEnrichment: async id => jobs.get(id)!,
    sleep: async () => {},
    inferredAt: '2026-10-24T06:03:00Z',
  });

  const analysis: AnalysisResource = {
    schemaVersion: '1.0.0',
    analysisId: 'anl_synthetic_espresso',
    investigationId: graph.investigationId,
    storedAt: '2026-10-24T06:03:05Z',
    result: result.submission,
  };
  const investigation: InvestigationResource = {
    schemaVersion: '1.0.0',
    investigationId: graph.investigationId,
    sourceUrl: SYNTHETIC_SOURCE_URL,
    platform: graph.platform,
    ingestionStatus: 'completed',
    analysisStatus: 'completed',
    graphRevision: graph.graphRevision,
    graphFingerprint: graph.graphFingerprint,
    createdAt: '2026-10-24T05:54:00Z',
    updatedAt: '2026-10-24T06:03:05Z',
  };
  assertModel('AnalysisResource', analysis);
  assertModel('InvestigationResource', investigation);
  assertModel('GraphEnvelope', graph);
  for (const job of result.enrichments) assertModel('EnrichmentJob', job);
  return { analysis, investigation, graph, enrichments: result.enrichments, scores: result.scores };
}

function format(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main() {
  const check = process.argv.includes('--check');
  const demo = await buildDemo();
  const example = await buildExample();
  const outputs: [string, string][] = [
    [resolve(fixtureDir, 'analysis-resource.json'), format(demo.analysis)],
    [resolve(fixtureDir, 'investigation.json'), format(demo.investigation)],
    [resolve(exampleDir, 'analysis-resource.json'), format(example.analysis)],
    [webFixture, format({ investigation: example.investigation, graph: example.graph, enrichments: example.enrichments, analysis: example.analysis })],
    // Test-only: the made-up espresso analysis exercises findings, clusters and histories in UI tests.
    [webTestFixture, format({ investigation: demo.investigation, graph: demo.graph, enrichments: demo.enrichments, analysis: demo.analysis })],
  ];
  let stale = 0;
  for (const [path, text] of outputs) {
    if (check) {
      let current = '';
      try { current = readFileSync(path, 'utf8'); } catch { /* missing */ }
      if (current !== text) { stale++; console.error(`Out of date: ${path}`); }
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      console.log(`Wrote ${path}`);
    }
  }
  for (const s of example.scores) console.log(`${s.commentId}: ${s.label} ${s.score ?? '-'} ${s.tier ?? ''} (${s.confidence}) caps=${s.capsApplied.join(',') || 'none'} discarded=${s.discarded.length}`);
  console.log(`Example section index: ${example.analysis.result.overallCoordinationRisk.score}; espresso test fixture: ${demo.analysis.result.overallCoordinationRisk.score}`);
  if (stale) {
    console.error('Run `npm run demo` in backend/ to regenerate.');
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
