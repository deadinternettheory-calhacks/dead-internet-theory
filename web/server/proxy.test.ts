import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import vercel from '../vercel.json';
import { handleProxy, requestedPath } from './proxy';
import { EXTENSION_CLIENT_ID, EXTENSION_ID_HEADER, EXTENSION_SESSION_HEADER } from '../../contracts/extension-client';

const secret = 's'.repeat(48);
const env = { BACKEND_BASE_URL: 'https://backend.test/', BACKEND_JWT_SECRET: secret };

function upstream(status = 200, body: unknown = { ok: true }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Retry-After': '3' } });
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}

async function subjectOf(init: RequestInit) {
  const token = (init.headers as Record<string, string>).Authorization.replace('Bearer ', '');
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: 'dit-backend', audience: 'dit-v1' });
  return payload;
}

describe('Vercel Function modules', () => {
  // Vercel runs api/ as native ES modules, where relative imports need a file
  // extension; an extensionless import crashes the function at load time.
  it('uses .js extensions for relative imports', () => {
    for (const dir of ['api', 'server']) {
      for (const file of readdirSync(resolve(__dirname, '..', dir)).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'vitePlugin.ts')) {
        const source = readFileSync(resolve(__dirname, '..', dir, file), 'utf8');
        for (const [, spec] of source.matchAll(/from '(\.{1,2}\/[^']+)'/g)) expect(spec, `${dir}/${file}`).toMatch(/\.js$/);
      }
    }
  });
});

describe('extension sessions', () => {
  const origin = `chrome-extension://${EXTENSION_CLIENT_ID}`;
  const nonce = 'a'.repeat(43);
  const headers = { Origin: origin, [EXTENSION_ID_HEADER]: EXTENSION_CLIENT_ID, [EXTENSION_SESSION_HEADER]: nonce };

  it('gives the extension a stable separate owner without exposing a signing secret or setting a cookie', async () => {
    const { calls, fetch } = upstream();
    for (const url of ['v1/investigations', 'v1/investigations/inv_1']) {
      const response = await handleProxy(new Request(`https://site.test/api/${url}`, { method: url.endsWith('inv_1') ? 'GET' : 'POST', headers, body: url.endsWith('inv_1') ? undefined : '{}' }), env, { fetch });
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(response.headers.get('Set-Cookie')).toBeNull();
    }
    const subject = (await subjectOf(calls[0].init)).sub;
    expect(subject).toMatch(/^web:extension:[a-f0-9]{64}$/);
    expect((await subjectOf(calls[1].init)).sub).toBe(subject);
    expect(JSON.stringify(calls)).not.toContain(nonce);
    expect(JSON.stringify(calls)).not.toContain(secret);
    const response = await handleProxy(new Request('https://site.test/api/v1/investigations/inv_1', { headers: { ...headers, [EXTENSION_SESSION_HEADER]: 'b'.repeat(43), Cookie: 'dit_sid=abcdefghijklmnopqrstuvwxyz012345' } }), env, { fetch });
    expect(response.status).toBe(200);
    expect((await subjectOf(calls[2].init)).sub).not.toBe(subject);
  });

  it('supports extension fetch without an Origin header while preserving the same nonce owner', async () => {
    const { calls, fetch } = upstream();
    await handleProxy(new Request('https://site.test/api/v1/capabilities', { headers: { [EXTENSION_ID_HEADER]: EXTENSION_CLIENT_ID, [EXTENSION_SESSION_HEADER]: nonce } }), env, { fetch });
    await handleProxy(new Request('https://site.test/api/v1/capabilities', { headers }), env, { fetch });
    expect((await subjectOf(calls[0].init)).sub).toBe((await subjectOf(calls[1].init)).sub);
  });

  it('rejects forged browser origins, unlisted clients, missing and malformed credentials before forwarding', async () => {
    const { calls, fetch } = upstream();
    const invalid: Record<string, string>[] = [
      { ...headers, Origin: 'https://evil.test' }, { ...headers, Origin: 'null' },
      { ...headers, Origin: `chrome-extension://${'a'.repeat(32)}` },
      { ...headers, [EXTENSION_ID_HEADER]: 'a'.repeat(32) },
      { ...headers, [EXTENSION_SESSION_HEADER]: 'short' },
      { ...headers, [EXTENSION_SESSION_HEADER]: ' '.repeat(43) },
      { Origin: origin }, { [EXTENSION_SESSION_HEADER]: nonce }, { [EXTENSION_ID_HEADER]: EXTENSION_CLIENT_ID },
    ];
    for (const value of invalid) {
      const response = await handleProxy(new Request('https://site.test/api/v1/investigations', { method: 'POST', headers: value, body: '{}' }), env, { fetch });
      expect(response.status).toBe(403);
      if (value.Origin === 'https://evil.test') expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
    expect(calls).toHaveLength(0);
  });

  it('limits extension preflights to the listed frontend operations and headers', async () => {
    const { calls, fetch } = upstream();
    const preflight = { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': `content-type, idempotency-key, ${EXTENSION_ID_HEADER}, ${EXTENSION_SESSION_HEADER}` };
    const allowed = await handleProxy(new Request('https://site.test/api/v1/investigations', { method: 'OPTIONS', headers: preflight }), env, { fetch });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    for (const [path, value] of [
      ['v1/investigations/inv_1/analysis', preflight],
      ['v1/investigations', { ...preflight, Origin: 'https://evil.test' }],
      ['v1/investigations', { ...preflight, 'Access-Control-Request-Headers': 'Authorization' }],
    ] as const) {
      expect((await handleProxy(new Request(`https://site.test/api/${path}`, { method: 'OPTIONS', headers: value }), env, { fetch })).status).toBe(403);
    }
    expect(calls).toHaveLength(0);
  });
});

describe('API proxy', () => {
  it('routes /api/v1/* through the proxy function before the SPA rewrite', () => {
    expect(vercel.rewrites[0]).toEqual({ source: '/api/v1/(.*)', destination: '/api/proxy?path=v1/$1' });
    expect(requestedPath(new URL('https://site.test/api/proxy?path=v1/investigations/inv_1'))).toBe('v1/investigations/inv_1');
    expect(requestedPath(new URL('https://site.test/api/v1/capabilities'))).toBe('v1/capabilities');
  });

  it('reports not connected until backend credentials are configured', async () => {
    const res = await handleProxy(new Request('https://site.test/api/v1/investigations/inv_1'), {});
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('SERVICE_NOT_CONFIGURED');
  });

  it('creates an investigation with a fresh anonymous session and frontend token', async () => {
    const { calls, fetch } = upstream(202, { investigationId: 'inv_1' });
    const res = await handleProxy(
      new Request('https://site.test/api/v1/investigations', {
        method: 'POST',
        headers: { Origin: 'https://site.test', 'Content-Type': 'application/json', 'Idempotency-Key': 'web-key-123' },
        body: JSON.stringify({ sourceUrl: 'https://www.reddit.com/r/example/comments/demo/' }),
      }),
      env,
      { fetch },
    );
    expect(res.status).toBe(202);
    expect(calls[0].url).toBe('https://backend.test/v1/investigations');
    expect((calls[0].init.headers as Record<string, string>)['Idempotency-Key']).toBe('web-key-123');
    expect(calls[0].init.body).toContain('sourceUrl');
    const cookie = res.headers.get('Set-Cookie')!;
    expect(cookie).toMatch(/^dit_sid=[A-Za-z0-9_-]{22,64}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=31536000; Secure$/);
    const sid = cookie.split(';')[0].split('=')[1];
    const claims = await subjectOf(calls[0].init);
    expect(claims).toMatchObject({ sub: `web:${sid}`, role: 'frontend' });
    expect((claims.exp as number) - (claims.iat as number)).toBe(300);
    expect(claims.investigations).toBeUndefined();
  });

  it('reuses an existing session so the visitor can read their own investigation', async () => {
    const { calls, fetch } = upstream();
    const sid = 'abcdefghijklmnopqrstuvwxyz012345';
    const res = await handleProxy(new Request('https://site.test/api/v1/investigations/inv_1/analysis', { headers: { Cookie: `other=1; dit_sid=${sid}` } }), env, { fetch });
    expect(res.headers.get('Set-Cookie')).toBeNull();
    expect((await subjectOf(calls[0].init)).sub).toBe(`web:${sid}`);
    expect(res.headers.get('Retry-After')).toBe('3');
  });

  it('resolves TikTok shares server-side before sending the canonical video to the backend', async () => {
    const { calls, fetch } = upstream(202);
    const original = { schemaVersion: '1.0.0', sourceUrl: 'https://www.tiktok.com/t/SHARED/' };
    const resolved = 'https://www.tiktok.com/@example/video/1234567890123456789';
    const res = await handleProxy(new Request('https://site.test/api/v1/investigations', { method: 'POST', body: JSON.stringify(original), headers: { 'Idempotency-Key': 'stable-key-123' } }), env, { fetch, resolveTikTokShare: async () => resolved });
    expect(res.status).toBe(202);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ ...original, sourceUrl: resolved });
    expect((calls[0].init.headers as Record<string, string>)['Idempotency-Key']).toBe('stable-key-123');
  });

  it('does not create an investigation when a TikTok share cannot be resolved', async () => {
    const { calls, fetch } = upstream();
    const res = await handleProxy(new Request('https://site.test/api/v1/investigations', { method: 'POST', body: JSON.stringify({ sourceUrl: 'https://www.tiktok.com/t/SHARED/' }) }), env, { fetch, resolveTikTokShare: async () => { throw Error('unavailable'); } });
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('SOURCE_LINK_UNAVAILABLE');
    expect(calls).toHaveLength(0);
  });

  it('replaces a malformed session cookie', async () => {
    const { fetch } = upstream();
    const res = await handleProxy(new Request('https://site.test/api/v1/investigations/inv_1', { headers: { Cookie: 'dit_sid=bad;value' } }), env, { fetch });
    expect(res.headers.get('Set-Cookie')).toMatch(/^dit_sid=/);
  });

  it('does not let a capability read overwrite the cookie of a concurrent create', async () => {
    const { calls, fetch } = upstream();
    const [capability, create] = await Promise.all([
      handleProxy(new Request('https://site.test/api/v1/capabilities'), env, { fetch }),
      handleProxy(new Request('https://site.test/api/v1/investigations', { method: 'POST', body: '{}' }), env, { fetch }),
    ]);
    expect(capability.status).toBe(200);
    expect(capability.headers.get('Set-Cookie')).toBeNull();
    const sid = create.headers.get('Set-Cookie')!.split(';')[0].split('=')[1];
    const sent = calls.find(call => call.url.endsWith('/investigations'))!;
    expect((await subjectOf(sent.init)).sub).toBe(`web:${sid}`);
  });

  it('never proxies inference routes or unknown paths', async () => {
    const { calls, fetch } = upstream();
    for (const [method, path] of [['POST', 'v1/investigations/inv_1/analysis'], ['POST', 'v1/investigations/inv_1/enrichments'], ['GET', 'v1/../admin'], ['GET', 'v2/investigations']]) {
      const res = await handleProxy(new Request(`https://site.test/api/proxy?path=${encodeURIComponent(path)}`, { method, headers: { Origin: 'https://site.test' }, body: method === 'POST' ? '{}' : undefined }), env, { fetch });
      expect([404, 405], `${method} ${path}`).toContain(res.status);
    }
    expect(calls).toHaveLength(0);
  });

  it('rejects cross-origin and oversized creates', async () => {
    const { calls, fetch } = upstream();
    const cross = await handleProxy(new Request('https://site.test/api/v1/investigations', { method: 'POST', headers: { Origin: 'https://evil.test' }, body: '{}' }), env, { fetch });
    expect(cross.status).toBe(403);
    const big = await handleProxy(new Request('https://site.test/api/v1/investigations', { method: 'POST', body: 'x'.repeat(9000) }), env, { fetch });
    expect(big.status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it('passes backend errors through unchanged', async () => {
    const { fetch } = upstream(409, { error: { code: 'ANALYSIS_NOT_READY', message: 'wait', retryable: true, requestId: 'r' } });
    const res = await handleProxy(new Request('https://site.test/api/v1/investigations/inv_1/analysis'), env, { fetch });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('ANALYSIS_NOT_READY');
  });
});
