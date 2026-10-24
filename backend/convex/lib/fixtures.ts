// The labeled synthetic fixture (SPEC 12.3) used by mock ingestion, mock
// enrichment and mock CREAO. Mock mode serves only this one synthetic URL, so
// a real link is never answered with fabricated data.
import type { EnrichmentJob, GraphEnvelope, HistoryResult } from './contract';
import graphFixture from '../../fixtures/synthetic-espresso/graph.json';
import enrichmentFixture from '../../fixtures/synthetic-espresso/enrichment-completed.json';
import triageResponse from '../../fixtures/synthetic-espresso/creao-triage-response.json';
import scoringResponse from '../../fixtures/synthetic-espresso/creao-scoring-response.json';

export const SYNTHETIC_GRAPH = graphFixture as unknown as GraphEnvelope;
export const SYNTHETIC_ENRICHMENT = enrichmentFixture as unknown as EnrichmentJob;
export const SYNTHETIC_SOURCE_URL = (SYNTHETIC_GRAPH.nodes.find(n => n.id === SYNTHETIC_GRAPH.rootId) as { url: string }).url;

export const SYNTHETIC_CREAO_RESPONSES = {
  triage: JSON.stringify(triageResponse),
  scoring: JSON.stringify(scoringResponse),
};

export function isSyntheticSourceUrl(url: string): boolean {
  const normalize = (u: string) => u.replace(/\/+$/, '').toLowerCase();
  return normalize(url) === normalize(SYNTHETIC_SOURCE_URL);
}

export function syntheticHistory(authorId: string): HistoryResult | undefined {
  return SYNTHETIC_ENRICHMENT.results?.find(r => r.authorId === authorId);
}
