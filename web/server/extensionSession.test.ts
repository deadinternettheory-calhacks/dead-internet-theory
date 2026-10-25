import { expect, it } from 'vitest';
import { EXTENSION_CLIENT_ID, EXTENSION_ID_HEADER, EXTENSION_SESSION_HEADER } from '../../contracts/extension-client.mjs';
import { extensionCors, extensionPreflightAllowed, extensionSession } from './extensionSession';

it('accepts an explicitly configured store identity without trusting arbitrary Chrome extensions', () => {
  const id = 'p'.repeat(32), origin = `chrome-extension://${id}`;
  const clients = [EXTENSION_CLIENT_ID, id];
  const headers = { Origin: origin, [EXTENSION_ID_HEADER]: id, [EXTENSION_SESSION_HEADER]: 'a'.repeat(43) };
  const request = new Request('https://site.test/api/v1/capabilities', { headers });
  expect(extensionSession(request, clients)).toBe('a'.repeat(43));
  expect(extensionSession(request)).toBe(false);
  expect(extensionCors(new Response('ok'), origin, clients).headers.get('Access-Control-Allow-Origin')).toBe(origin);
  expect(extensionCors(new Response('ok'), origin).headers.get('Access-Control-Allow-Origin')).toBeNull();
  const preflight = new Request('https://site.test/api/v1/capabilities', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': `${EXTENSION_ID_HEADER}, ${EXTENSION_SESSION_HEADER}` } });
  expect(extensionPreflightAllowed(preflight, clients)).toBe(true);
  expect(extensionPreflightAllowed(preflight)).toBe(false);
  const mismatched = new Request(request.url, { headers: { ...headers, [EXTENSION_ID_HEADER]: EXTENSION_CLIENT_ID } });
  expect(extensionSession(mismatched, clients)).toBe(false);
});
