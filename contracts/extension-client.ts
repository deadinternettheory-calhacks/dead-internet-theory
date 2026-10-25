/** Public client identity and transport; no credentials belong here. See browser-extension.md. */
export const EXTENSION_CLIENT_ID = 'nodkcggcbpiolpkphjkfedhlmaallhnb';
export const EXTENSION_SITE_ORIGIN = 'https://www.deadinternettheory.us';
export const EXTENSION_ID_HEADER = 'X-DIT-Extension-Id';
export const EXTENSION_SESSION_HEADER = 'X-DIT-Extension-Session';
export const EXTENSION_SESSION_PATTERN = /^[A-Za-z0-9_-]{43}$/;
