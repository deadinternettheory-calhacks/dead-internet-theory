import { afterEach, expect, it, vi } from 'vitest';
import { EXTENSION_CLIENT_ID, EXTENSION_ID_HEADER, EXTENSION_SESSION_HEADER } from '../../contracts/extension-client.mjs';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it('authenticates with the actual Chrome runtime ID rather than the unpacked development ID', async () => {
  const storeId = 'p'.repeat(32);
  expect(storeId).not.toBe(EXTENSION_CLIENT_ID);
  vi.stubGlobal('chrome', { runtime: { id: storeId, sendMessage: vi.fn(async () => ({ ok: true, value: 'a'.repeat(43) })) } });
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ schemaVersion: '1.0.0', platforms: [] }), { headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  const { client } = await import('./client');
  await client.getCapabilities();
  const init = fetch.mock.calls[0]?.[1] as RequestInit;
  expect(new Headers(init.headers).get(EXTENSION_ID_HEADER)).toBe(storeId);
  expect(new Headers(init.headers).get(EXTENSION_SESSION_HEADER)).toHaveLength(43);
  expect(init.credentials).toBe('omit');
});
