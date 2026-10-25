// Client for the v1 REST API (contracts/openapi.yaml). By default it calls the
// site's own /api proxy (web/server/proxy.ts), which adds backend credentials.
// VITE_API_BASE_URL can point elsewhere; it is a public URL, never a secret.
import type { AnalysisResource, ApiErrorBody, CapabilityResponse, EnrichmentJob, GraphEnvelope, InvestigationResource } from './contract';

export const apiBaseUrl: string = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || '/api';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryable: boolean) {
    super(message);
  }
}

export function createApiClient(baseUrl = apiBaseUrl, transport?: typeof fetch) {
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await (transport ?? fetch)(`${baseUrl}${path}`, init);
    } catch (error) {
      if (init?.signal?.aborted) throw error;
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
  return {
    getCapabilities: (signal?: AbortSignal) => call<CapabilityResponse>('/v1/capabilities', { signal }),
    createInvestigation: (sourceUrl: string, idempotencyKey: string, signal?: AbortSignal) => call<InvestigationResource>('/v1/investigations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ sourceUrl }),
      signal,
    }),
    getInvestigation: (id: string, signal?: AbortSignal) => call<InvestigationResource>(`/v1/investigations/${enc(id)}`, { signal }),
    getGraph: (id: string, signal?: AbortSignal) => call<GraphEnvelope>(`/v1/investigations/${enc(id)}/graph`, { signal }),
    getAnalysis: (id: string, signal?: AbortSignal) => call<AnalysisResource>(`/v1/investigations/${enc(id)}/analysis`, { signal }),
    getEnrichment: (id: string, enrichmentId: string, signal?: AbortSignal) => call<EnrichmentJob>(`/v1/investigations/${enc(id)}/enrichments/${enc(enrichmentId)}`, { signal }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export const { getCapabilities, createInvestigation, getInvestigation, getGraph, getAnalysis, getEnrichment } = createApiClient();

export function forgetIdempotencyKeyFor(sourceUrl: string): void {
  try { sessionStorage.removeItem(`dit:idem:${sourceUrl}`); } catch { /* storage unavailable */ }
}

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
