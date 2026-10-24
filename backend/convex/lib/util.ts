// Small helpers shared by HTTP handlers, Convex functions and tests.

/** JSON with object keys sorted, so equal payloads hash the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/** RFC3339 UTC with a Z suffix and no milliseconds, as the contract requires. */
export function utcNow(ms: number = Date.now()): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

const IDEMPOTENCY_KEY = /^[\x20-\x7E]{8,128}$/;
export function isValidIdempotencyKey(key: string | null): key is string {
  return key !== null && IDEMPOTENCY_KEY.test(key);
}

export function unique<T>(items: Iterable<T>): T[] {
  return Array.from(new Set(items));
}
