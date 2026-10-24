// Client for the v1 REST API (contracts/openapi.yaml). By default it calls the
// site's own /api proxy (web/server/proxy.ts), which adds backend credentials.
// VITE_API_BASE_URL can point elsewhere; it is a public URL, never a secret.
import type { AnalysisResource, ApiErrorBody, EnrichmentJob, GraphEnvelope, InvestigationResource } from './contract';

export const apiBaseUrl: string = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || '/api';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryable: boolean) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, init);
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach the analysis service.', true);
  }
  const body = await response.json().catch(() => null);
  // No JSON at all means no API is deployed at this base (for example, the SPA page came back instead).
  if (body === null) throw new ApiError(response.status, 'SERVICE_NOT_CONFIGURED', 'The analysis service is not connected.', false);
  if (!response.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    throw new ApiError(response.status, error?.code ?? `HTTP_${response.status}`, error?.message ?? 'Request failed.', error?.retryable ?? response.status >= 500);
  }
  return body as T;
}

const enc = encodeURIComponent;

export function createInvestigation(sourceUrl: string, idempotencyKey: string) {
  return call<InvestigationResource>('/v1/investigations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ sourceUrl }),
  });
}
export const getInvestigation = (id: string) => call<InvestigationResource>(`/v1/investigations/${enc(id)}`);
export const getGraph = (id: string) => call<GraphEnvelope>(`/v1/investigations/${enc(id)}/graph`);
export const getAnalysis = (id: string) => call<AnalysisResource>(`/v1/investigations/${enc(id)}/analysis`);
export const getEnrichment = (id: string, enrichmentId: string) => call<EnrichmentJob>(`/v1/investigations/${enc(id)}/enrichments/${enc(enrichmentId)}`);

/** One key per submitted link per tab, so a refresh replays instead of creating a duplicate. */
export function idempotencyKeyFor(sourceUrl: string): string {
  const storageKey = `dit:idem:${sourceUrl}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
  } catch { /* storage unavailable */ }
  const key = `web-${crypto.randomUUID()}`;
  try { sessionStorage.setItem(storageKey, key); } catch { /* storage unavailable */ }
  return key;
}
