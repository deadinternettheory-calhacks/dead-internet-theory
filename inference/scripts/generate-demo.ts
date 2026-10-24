// Runs the real inference pipeline on the synthetic espresso fixture, with
// CREAO replaced by recorded mock responses, and writes the mocked example
// response. Usage: npm run demo (write) or npm run demo:check (verify).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnalysisResource, EnrichmentJob, GraphEnvelope, InvestigationResource } from '../convex/lib/contract';
import { MockCreaoClient } from '../convex/lib/inference/creao';
import { runSequential } from '../convex/lib/inference/pipeline';
import { assertModel } from '../convex/lib/schema';
import { canonicalJson } from '../convex/lib/util';
import { SYNTHETIC_SOURCE_URL } from '../convex/lib/fixtures';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(here, '../fixtures/synthetic-espresso');
const webFixture = resolve(here, '../../web/src/demo/synthetic-report.json');
const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(fixtureDir, name), 'utf8')) as T;

export { SYNTHETIC_SOURCE_URL };
export const SYNTHETIC_NOTICE =
  'Synthetic example. Every account, comment, history and number here is fabricated to show what a finished report looks like. It is not a real investigation.';

export async function buildDemo() {
  const graph = read<GraphEnvelope>('graph.json');
  const enrichment = read<EnrichmentJob>('enrichment-completed.json');
  const creao = new MockCreaoClient({
    triage: readFileSync(resolve(fixtureDir, 'creao-triage-response.json'), 'utf8'),
    scoring: readFileSync(resolve(fixtureDir, 'creao-scoring-response.json'), 'utf8'),
  });
  const result = await runSequential(graph, {
    creao,
    requestEnrichment: async request => {
      const requested = request.authors.map(a => `${a.authorId}|${a.anchorCommentId}`).sort();
      const available = (enrichment.results ?? []).map(r => `${r.authorId}|${r.anchorCommentId}`).sort();
      if (canonicalJson(requested) !== canonicalJson(available)) {
        throw new Error(`Author selection changed; regenerate the fixture histories. Requested: ${requested.join(', ')}`);
      }
      return enrichment;
    },
    getEnrichment: async () => enrichment,
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
  assertModel('EnrichmentJob', enrichment);
  return { analysis, investigation, graph, enrichment, scores: result.scores };
}

function format(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main() {
  const check = process.argv.includes('--check');
  const demo = await buildDemo();
  const outputs: [string, string][] = [
    [resolve(fixtureDir, 'analysis-resource.json'), format(demo.analysis)],
    [resolve(fixtureDir, 'investigation.json'), format(demo.investigation)],
    [webFixture, format({ notice: SYNTHETIC_NOTICE, investigation: demo.investigation, graph: demo.graph, enrichment: demo.enrichment, analysis: demo.analysis })],
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
  for (const s of demo.scores) console.log(`${s.commentId}: ${s.label} ${s.score ?? '-'} ${s.tier ?? ''} (${s.confidence}) caps=${s.capsApplied.join(',') || 'none'} discarded=${s.discarded.length}`);
  console.log(`Overall coordination index: ${demo.analysis.result.overallCoordinationRisk.score}`);
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
