import { lookup } from 'node:dns/promises';
import https from 'node:https';
import ipaddr from 'ipaddr.js';

const SHARE_HOSTS = ['www.tiktok.com', 'tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'];
const REDIRECTS = [301, 302, 303, 307, 308];
const failed = () => new Error('Could not resolve the TikTok share link. Try its full video URL.');

function parsed(raw: string): URL | null {
  if (!/^https:\/\//i.test(raw) || /[\\\s\x00-\x1f]/.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || raw.slice(8).split(/[/?#]/)[0].includes(':')) return null;
    return SHARE_HOSTS.includes(url.hostname) ? url : null;
  } catch { return null; }
}

export function isTikTokShareUrl(raw: string): boolean {
  const url = parsed(raw);
  return !!url && (['vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname)
    ? /^\/[A-Za-z0-9_-]{1,128}\/?$/.test(url.pathname)
    : /^\/t\/[A-Za-z0-9_-]{1,128}\/?$/.test(url.pathname));
}

export function publicAddress(address: string): boolean {
  try {
    let ip = ipaddr.parse(address);
    if (ip.kind() === 'ipv6' && (ip as ipaddr.IPv6).isIPv4MappedAddress()) ip = (ip as ipaddr.IPv6).toIPv4Address();
    return ip.range() === 'unicast';
  } catch { return false; }
}

type Head = (url: string) => Promise<{ status: number; location?: string }>;

// Fetch headers only from a validated TikTok share URL. Pin the validated DNS
// address, never follow redirects automatically and never send auth or cookies.
export const shareHead: Head = async raw => {
  if (!isTikTokShareUrl(raw)) throw failed();
  const url = new URL(raw);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true }),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(failed()), 4000); }),
  ]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw failed();
  const selected = addresses[0];
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'HEAD', agent: false,
      lookup: (_hostname, options, callback) => {
        if ((options as { all?: boolean }).all) {
          (callback as unknown as (error: null, results: { address: string; family: number }[]) => void)(null, [selected]);
        } else callback(null, selected.address, selected.family);
      },
    }, res => {
      const result = { status: res.statusCode ?? 500, location: res.headers.location };
      res.destroy();
      resolve(result);
    });
    const deadline = setTimeout(() => req.destroy(failed()), 4000);
    req.on('error', () => reject(failed()));
    req.on('close', () => clearTimeout(deadline));
    req.end();
  });
};

export async function resolveTikTokShareUrl(raw: string, head: Head = shareHead): Promise<string> {
  if (!isTikTokShareUrl(raw)) return raw;
  let current = raw;
  for (let hop = 0; hop < 2; hop++) {
    const response = await head(current);
    if (!REDIRECTS.includes(response.status) || !response.location) throw failed();
    const target = new URL(response.location, current).href;
    const url = parsed(target);
    if (!url) throw failed();
    if (['www.tiktok.com', 'tiktok.com'].includes(url.hostname) && /^\/@[A-Za-z0-9_.]+\/video\/\d+\/?$/.test(url.pathname)) {
      return `https://www.tiktok.com${url.pathname.replace(/\/$/, '')}`;
    }
    if (!isTikTokShareUrl(target)) throw failed();
    current = target;
  }
  throw failed();
}
