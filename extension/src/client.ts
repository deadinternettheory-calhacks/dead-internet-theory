import { EXTENSION_CLIENT_ID, EXTENSION_ID_HEADER, EXTENSION_SESSION_HEADER, EXTENSION_SITE_ORIGIN } from '../../contracts/extension-client';
import { createApiClient } from '../../web/src/api/client';
import { requestWorker } from './state';

let session: Promise<string> | undefined;
const transport: typeof fetch = async (input, init) => {
  session ??= requestWorker<string>({ type: 'GET_SESSION' }).catch(error => { session = undefined; throw error; });
  const headers = new Headers(init?.headers);
  headers.set(EXTENSION_ID_HEADER, EXTENSION_CLIENT_ID);
  headers.set(EXTENSION_SESSION_HEADER, await session);
  return fetch(input, { ...init, headers, credentials: 'omit', redirect: 'error' });
};
export const client = createApiClient(`${EXTENSION_SITE_ORIGIN}/api`, transport);
