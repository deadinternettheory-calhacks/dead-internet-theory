// HTTP client for the ingestion backend's v1 API (contracts/openapi.yaml), used
// with the inference role described in backend/INTEGRATION.md. Every response
// is validated against the canonical schema before use.
import { SignJWT } from 'jose';
import type { AnalysisReceipt, AnalysisSubmission, EnrichmentJob, EnrichmentRequest, GraphEnvelope } from './contract';
import { validateModel, type ModelName } from './schema';

export class BackendError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryable: boolean) {
    super(message);
  }
}

export interface BackendConfig {
  baseUrl: string;
  /** Shared HS256 secret (the backend's AUTH_JWT_SECRET); tokens are minted per investigation. */
  jwtSecret?: string;
  /** Alternative: a pre-issued inference JWT (expires within an hour; local demos only). */
  staticToken?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface BackendClient {
  getGraph(investigationId: string): Promise<GraphEnvelope>;
  requestEnrichment(investigationId: string, request: EnrichmentRequest, idempotencyKey: string): Promise<EnrichmentJob>;
  getEnrichment(investigationId: string, enrichmentId: string): Promise<EnrichmentJob>;
  submitAnalysis(investigationId: string, submission: AnalysisSubmission, idempotencyKey: string): Promise<AnalysisReceipt>;
}

/** Least privilege: a five-minute token scoped to the one investigation being analyzed. */
export async function mintInferenceToken(secret: string, investigationId: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  return new SignJWT({ role: 'inference', investigations: [investigationId] })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('dit-inference')
    .setIssuer('dit-backend')
    .setAudience('dit-v1')
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + 300)
    .sign(new TextEncoder().encode(secret));
}

export function createBackendClient(config: BackendConfig): BackendClient {
  const base = config.baseUrl.replace(/\/+$/, '');
  const fetchImpl = config.fetchImpl ?? fetch;
  if (!config.jwtSecret && !config.staticToken) throw new BackendError(0, 'BACKEND_NOT_CONFIGURED', 'Set BACKEND_JWT_SECRET or BACKEND_API_TOKEN.', false);

  async function call<T>(name: ModelName, investigationId: string, method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const token = config.jwtSecret ? await mintInferenceToken(config.jwtSecret, investigationId) : config.staticToken!;
    let response: Response;
    try {
      response = await fetchImpl(`${base}/v1/investigations/${encodeURIComponent(investigationId)}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(config.timeoutMs ?? 20_000),
      });
    } catch {
      throw new BackendError(0, 'BACKEND_UNREACHABLE', 'Could not reach the ingestion backend.', true);
    }
    const json = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string; retryable?: boolean } } | null;
    if (!response.ok) {
      const e = json?.error;
      throw new BackendError(response.status, e?.code ?? `HTTP_${response.status}`, e?.message ?? `Backend returned ${response.status}.`, e?.retryable ?? (response.status === 429 || response.status >= 500));
    }
    const check = validateModel(name, json);
    if (!check.valid) throw new BackendError(response.status, 'BACKEND_CONTRACT_VIOLATION', `Backend ${name} failed schema validation: ${check.errors.join('; ')}`, false);
    return json as T;
  }

  return {
    getGraph: id => call<GraphEnvelope>('GraphEnvelope', id, 'GET', '/graph'),
    requestEnrichment: (id, request, key) => call<EnrichmentJob>('EnrichmentJob', id, 'POST', '/enrichments', request, key),
    getEnrichment: (id, enrichmentId) => call<EnrichmentJob>('EnrichmentJob', id, 'GET', `/enrichments/${encodeURIComponent(enrichmentId)}`),
    submitAnalysis: (id, submission, key) => call<AnalysisReceipt>('AnalysisReceipt', id, 'POST', '/analysis', submission, key),
  };
}
