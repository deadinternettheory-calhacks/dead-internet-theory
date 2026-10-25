// Same-origin proxy ("BFF") between the website and the ingestion backend's v1
// API (backend/INTEGRATION.md). The backend requires a bearer JWT on every
// route and allows no browser cross-origin calls, so the browser calls /api/v1/*
// here, and this server attaches a short-lived frontend token.
//
// Each browser gets an anonymous session ID in an HttpOnly cookie. Tokens use
// `web:<session>` as the subject, so the backend's owner check lets a visitor
// read only investigations they created. The signing secret stays server-side.
import { SignJWT } from 'jose';
import { isTikTokShareUrl, resolveTikTokShareUrl } from './tiktokShare.js';

export interface ProxyEnv {
  /** Backend HTTP base, e.g. https://<deployment>.convex.site */
  BACKEND_BASE_URL?: string;
  /** The backend's AUTH_JWT_SECRET (HS256). Server-side only. */
  BACKEND_JWT_SECRET?: string;
}

export interface ProxyDeps {
  fetch?: typeof fetch;
  nowSeconds?: () => number;
  resolveTikTokShare?: typeof resolveTikTokShareUrl;
}

const COOKIE = 'dit_sid';
const SESSION_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;
const ID = '[A-Za-z0-9_-]{1,128}';
const MAX_BODY_BYTES = 8 * 1024;
const TOKEN_SECONDS = 300;

/** The frontend role's routes from contracts/openapi.yaml. Inference routes are never proxied. */
const ROUTES: { method: 'GET' | 'POST'; pattern: RegExp }[] = [
  { method: 'POST', pattern: /^v1\/investigations$/ },
  { method: 'GET', pattern: new RegExp(`^v1/investigations/${ID}$`) },
  { method: 'GET', pattern: new RegExp(`^v1/investigations/${ID}/graph$`) },
  { method: 'GET', pattern: new RegExp(`^v1/investigations/${ID}/analysis$`) },
  { method: 'GET', pattern: new RegExp(`^v1/investigations/${ID}/enrichments/${ID}$`) },
  { method: 'GET', pattern: /^v1\/capabilities$/ },
];

function json(status: number, code: string, message: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: { code, message, retryable: status >= 500, requestId: crypto.randomUUID() } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

/** The v1 path being requested: from `?path=` (Vercel rewrite) or the URL after /api/. */
export function requestedPath(url: URL): string {
  const fromQuery = url.searchParams.get('path');
  const raw = fromQuery ?? url.pathname.replace(/^\/api\/?/, '');
  return raw.replace(/^\/+|\/+$/g, '');
}

function sessionFrom(request: Request): string | null {
  const cookie = request.headers.get('Cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) {
      const value = rest.join('=');
      return SESSION_PATTERN.test(value) ? value : null;
    }
  }
  return null;
}

function newSession(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function mintFrontendToken(secret: string, subject: string, nowSeconds: number): Promise<string> {
  return new SignJWT({ role: 'frontend' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject)
    .setIssuer('dit-backend')
    .setAudience('dit-v1')
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + TOKEN_SECONDS)
    .sign(new TextEncoder().encode(secret));
}

export async function handleProxy(request: Request, env: ProxyEnv, deps: ProxyDeps = {}): Promise<Response> {
  const url = new URL(request.url);
  const path = requestedPath(url);
  const route = ROUTES.find(r => r.pattern.test(path));
  if (!route) return json(404, 'NOT_FOUND', 'Route not found.');
  if (request.method !== route.method) return json(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', { Allow: route.method });

  const base = env.BACKEND_BASE_URL?.replace(/\/+$/, '');
  const secret = env.BACKEND_JWT_SECRET;
  if (!base || !secret || secret.length < 32) {
    return json(503, 'SERVICE_NOT_CONFIGURED', 'The analysis service is not connected.');
  }

  let body: string | undefined;
  if (route.method === 'POST') {
    // Same-origin only: a cross-site page must not create investigations with a visitor's session.
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json(403, 'FORBIDDEN', 'Cross-origin requests are not allowed.');
    body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) return json(413, 'INVALID_REQUEST', 'Request body too large.');
    let value: unknown;
    try { value = JSON.parse(body); } catch { return json(400, 'INVALID_REQUEST', 'Invalid JSON.'); }
    if (value && typeof value === 'object' && 'sourceUrl' in value && typeof value.sourceUrl === 'string' && isTikTokShareUrl(value.sourceUrl)) {
      try {
        value.sourceUrl = await (deps.resolveTikTokShare ?? resolveTikTokShareUrl)(value.sourceUrl);
        body = JSON.stringify(value);
      } catch { return json(502, 'SOURCE_LINK_UNAVAILABLE', 'Could not open the TikTok share link. Try its full video URL.'); }
    }
  }

  let session = sessionFrom(request);
  const isNewSession = !session;
  session ??= newSession();
  const now = deps.nowSeconds?.() ?? Math.floor(Date.now() / 1000);
  const token = await mintFrontendToken(secret, `web:${session}`, now);

  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const key = request.headers.get('Idempotency-Key');
  if (key) headers['Idempotency-Key'] = key;

  let upstream: Response;
  try {
    upstream = await (deps.fetch ?? fetch)(`${base}/${path}`, {
      method: route.method,
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return json(502, 'BACKEND_UNREACHABLE', 'Could not reach the analysis service.');
  }

  const responseHeaders = new Headers({ 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-store' });
  const retryAfter = upstream.headers.get('Retry-After');
  if (retryAfter) responseHeaders.set('Retry-After', retryAfter);
  // A homepage capability read must not race a create and overwrite its owner cookie.
  if (isNewSession && path !== 'v1/capabilities') {
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    responseHeaders.append('Set-Cookie', `${COOKIE}=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
  }
  return new Response(await upstream.text(), { status: upstream.status, headers: responseHeaders });
}
