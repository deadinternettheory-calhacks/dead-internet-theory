// Labeled synthetic fixtures (SPEC 12.3) and recorded CREAO replies for them.
// Without a CREAO key the worker can analyze only these synthetic discussions,
// so genuine user data is never answered with recorded responses.
import type { EnrichmentJob, GraphEnvelope } from './contract';
import espressoGraph from '../../fixtures/synthetic-espresso/graph.json';
import espressoEnrichment from '../../fixtures/synthetic-espresso/enrichment-completed.json';
import espressoTriage from '../../fixtures/synthetic-espresso/creao-triage-response.json';
import espressoScoring from '../../fixtures/synthetic-espresso/creao-scoring-response.json';
import exampleTriage from '../../fixtures/contract-example-reddit/creao-triage-response.json';
import exampleScoring from '../../fixtures/contract-example-reddit/creao-scoring-response.json';

export const SYNTHETIC_GRAPH = espressoGraph as unknown as GraphEnvelope;
export const SYNTHETIC_ENRICHMENT = espressoEnrichment as unknown as EnrichmentJob;
export const SYNTHETIC_SOURCE_URL = (SYNTHETIC_GRAPH.nodes.find(n => n.id === SYNTHETIC_GRAPH.rootId) as { url: string }).url;

export interface RecordedResponses {
  triage: string;
  scoring: string;
}

/**
 * Recorded replies keyed by discussion root ID: the espresso demo, and the
 * contracts/examples Reddit graph that the ingestion backend serves in fixture mode.
 */
const RECORDED: Record<string, RecordedResponses> = {
  [SYNTHETIC_GRAPH.rootId]: { triage: JSON.stringify(espressoTriage), scoring: JSON.stringify(espressoScoring) },
  'reddit:discussion:t3_demo': { triage: JSON.stringify(exampleTriage), scoring: JSON.stringify(exampleScoring) },
};

/** True only for graphs that declare themselves synthetic fixtures. */
export function isSyntheticGraph(graph: GraphEnvelope): boolean {
  return graph.coverage.limitations.some(l => /synthetic/i.test(l));
}

export function recordedResponsesFor(graph: GraphEnvelope): RecordedResponses | null {
  if (!isSyntheticGraph(graph)) return null;
  return RECORDED[graph.rootId] ?? null;
}
