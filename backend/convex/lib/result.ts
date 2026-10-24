// Uniform result passed from Convex queries/mutations to the HTTP layer, which
// adds the request ID and serializes it. Bodies follow the v1 contract.

export interface ApiResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export function ok(status: number, body: unknown): ApiResult {
  return { status, body };
}

export function fail(status: number, code: string, message: string, retryable = false, details?: Record<string, unknown>): ApiResult {
  return { status, body: { error: { code, message, retryable, ...(details ? { details } : {}) } } };
}

/** Convex function return value: the body is pre-serialized JSON. */
export interface WireResult {
  status: number;
  body: string;
}

export function toWire(result: ApiResult): WireResult {
  return { status: result.status, body: JSON.stringify(result.body) };
}
