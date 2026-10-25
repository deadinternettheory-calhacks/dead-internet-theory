import { parsePostUrl } from '../../web/src/url';

/** Reuse shared URL safety checks, then restrict this shortcut to supported post/video paths. */
export function isCurrentPagePost(value: string): boolean {
  const parsed = parsePostUrl(value);
  if (!parsed.ok || parsed.url.protocol !== 'https:') return false;
  const { url, platform } = parsed;
  if (platform === 'reddit') return /^\/r\/[A-Za-z0-9_]+\/comments\/[A-Za-z0-9]+(?:\/[^/]*)?\/?$/.test(url.pathname) && url.hostname !== 'redd.it';
  if (platform === 'youtube') {
    const id = url.hostname === 'youtu.be' ? url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1]
      : url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
    return !!id && /^[A-Za-z0-9_-]{11}$/.test(id);
  }
  if (platform === 'tiktok') return ['vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname)
    ? /^\/[A-Za-z0-9_-]{1,128}\/?$/.test(url.pathname)
    : /^\/@[A-Za-z0-9_.]+\/video\/\d+\/?$/.test(url.pathname) || /^\/t\/[A-Za-z0-9_-]{1,128}\/?$/.test(url.pathname);
  return false;
}
