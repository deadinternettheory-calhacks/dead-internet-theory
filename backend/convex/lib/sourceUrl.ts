import type { Platform } from './contract';

// Server-side revalidation (SPEC REQ-URL-1). This backend never fetches the
// submitted URL itself; collection goes through the ingestion provider.
const HOSTS: Record<string, Platform> = {
  'reddit.com': 'reddit',
  'www.reddit.com': 'reddit',
  'old.reddit.com': 'reddit',
  'redd.it': 'reddit',
  'x.com': 'x',
  'www.x.com': 'x',
  'twitter.com': 'x',
  'www.twitter.com': 'x',
  'youtube.com': 'youtube',
  'www.youtube.com': 'youtube',
  'm.youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'tiktok.com': 'tiktok',
  'www.tiktok.com': 'tiktok',
};

export type SourceUrlResult =
  | { ok: true; sourceUrl: string; platform: Platform }
  | { ok: false; reason: string };

export function validateSourceUrl(input: string): SourceUrlResult {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, reason: 'The link is not a valid URL.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'Only http and https links are accepted.' };
  }
  if (url.username || url.password || url.port) {
    return { ok: false, reason: 'Links with credentials or ports are not accepted.' };
  }
  const platform = HOSTS[url.hostname.toLowerCase()];
  if (!platform) return { ok: false, reason: 'This site is not supported.' };
  url.protocol = 'https:';
  url.hash = '';
  return { ok: true, sourceUrl: url.href, platform };
}
