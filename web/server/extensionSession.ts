import { EXTENSION_CLIENT_ID, EXTENSION_ID_HEADER, EXTENSION_SESSION_HEADER, EXTENSION_SESSION_PATTERN } from '../../contracts/extension-client.js';

const ORIGIN = `chrome-extension://${EXTENSION_CLIENT_ID}`;
const ALLOWED_HEADERS = ['content-type', 'idempotency-key', EXTENSION_ID_HEADER.toLowerCase(), EXTENSION_SESSION_HEADER.toLowerCase()];

export function extensionCors(response: Response, origin: string | null): Response {
  if (origin !== ORIGIN) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', ORIGIN);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '));
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}

export function extensionPreflightAllowed(request: Request): boolean {
  const method = request.headers.get('Access-Control-Request-Method');
  const headers = (request.headers.get('Access-Control-Request-Headers') ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  return request.headers.get('Origin') === ORIGIN && (method === 'GET' || method === 'POST') && headers.every(header => ALLOWED_HEADERS.includes(header));
}

/** A public client ID is an allowlist, never a credential. The nonce is the anonymous session credential. */
export function extensionSession(request: Request): string | null | false {
  const client = request.headers.get(EXTENSION_ID_HEADER);
  const session = request.headers.get(EXTENSION_SESSION_HEADER);
  const origin = request.headers.get('Origin');
  if (client === null && session === null && !origin?.startsWith('chrome-extension://')) return null;
  if (client !== EXTENSION_CLIENT_ID || !session || !EXTENSION_SESSION_PATTERN.test(session) || (origin !== null && origin !== ORIGIN)) return false;
  return session;
}

export async function extensionSubject(session: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(session));
  return `web:extension:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
