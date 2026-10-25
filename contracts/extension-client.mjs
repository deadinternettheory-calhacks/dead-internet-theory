/** Public client identity and transport; no credentials belong here. See browser-extension.md. */
export const EXTENSION_CLIENT_ID = 'nodkcggcbpiolpkphjkfedhlmaallhnb';
/** Explicitly approved identities. Add the store-assigned ID after its first draft upload. */
export const EXTENSION_CLIENT_IDS = [EXTENSION_CLIENT_ID];
export const EXTENSION_SITE_ORIGIN = 'https://www.deadinternettheory.us';
export const EXTENSION_ID_HEADER = 'X-DIT-Extension-Id';
export const EXTENSION_SESSION_HEADER = 'X-DIT-Extension-Session';
export const EXTENSION_SESSION_PATTERN = /^[A-Za-z0-9_-]{43}$/;
