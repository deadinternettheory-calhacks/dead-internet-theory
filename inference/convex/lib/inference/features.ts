// Deterministic measurements handed to the model as facts. They are
// observations only; whether a rubric rule fires is still a judgment, and the
// rubric's caps keep any one measurement from deciding the result.

const STOPWORDS = new Set(
  'a an and are as at be but by for from had has have i if in is it its just me my not of on or so that the this to was we with you your our they them out all can get got one very really'.split(' '),
);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

/** Jaccard overlap of content-word sets, 0-1. */
export function wordJaccard(a: string, b: string): number {
  const sa = new Set(tokens(a));
  const sb = new Set(tokens(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const TRACKING_PARAMS = /^(utm_\w+|ref|ref_id|referral|aff|aff_id|affiliate|tag|coupon|promo|code|via|src)$/i;
const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 'amzn.to', 't.co', 'goo.gl', 'ow.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at']);
const CODE_PATTERN = /\b(?:code|coupon|promo)\s*[:\-]?\s*["']?([A-Z0-9]{4,})\b/;

export interface LinkFacts {
  domains: string[];
  trackingParams: string[];
  shortened: boolean;
  discountCode: boolean;
  linkInBio: boolean;
}

export function linkFacts(text: string): LinkFacts {
  const domains: string[] = [];
  const trackingParams: string[] = [];
  let shortened = false;
  for (const match of text.matchAll(/https?:\/\/[^\s)\]]+/g)) {
    try {
      const url = new URL(match[0]);
      const host = url.hostname.toLowerCase();
      domains.push(host);
      if (SHORTENERS.has(host)) shortened = true;
      for (const key of url.searchParams.keys()) if (TRACKING_PARAMS.test(key)) trackingParams.push(key);
    } catch {
      // Not a parseable URL; ignore.
    }
  }
  return {
    domains: Array.from(new Set(domains)),
    trackingParams: Array.from(new Set(trackingParams)),
    shortened,
    discountCode: CODE_PATTERN.test(text),
    linkInBio: /link in (?:my )?bio/i.test(text),
  };
}

export function minutesBetween(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const diff = Date.parse(toIso) - Date.parse(fromIso);
  return Number.isFinite(diff) ? Math.round(diff / 60000) : null;
}

export function daysBetween(fromIso: string | null | undefined, toIso: string | null | undefined): number | null {
  if (!fromIso || !toIso) return null;
  const diff = Date.parse(toIso) - Date.parse(fromIso);
  return Number.isFinite(diff) ? Math.floor(diff / 86400000) : null;
}

/** Case-insensitive mention of a product label, or of its first distinctive word (the brand). */
export function mentions(text: string, label: string): boolean {
  const haystack = text.toLowerCase();
  const needle = label.toLowerCase().trim();
  if (!needle) return false;
  if (haystack.includes(needle)) return true;
  const brand = needle.split(/\s+/)[0];
  return brand.length >= 4 && haystack.includes(brand);
}

/** Reddit community from a comment URL, when present. */
export function communityFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = /\/r\/([^/]+)\//i.exec(url);
  return match ? `r/${match[1]}` : null;
}

export interface Burst {
  windowMinutes: number;
  commentIds: string[];
}

/** Largest set of timestamps falling within any window of the given length. */
export function largestBurst(items: { id: string; createdAt: string | null }[], windowMinutes: number): Burst {
  const timed = items
    .filter(i => i.createdAt)
    .map(i => ({ id: i.id, t: Date.parse(i.createdAt as string) }))
    .sort((a, b) => a.t - b.t);
  let best: string[] = [];
  let start = 0;
  for (let end = 0; end < timed.length; end++) {
    while (timed[end].t - timed[start].t > windowMinutes * 60000) start++;
    if (end - start + 1 > best.length) best = timed.slice(start, end + 1).map(x => x.id);
  }
  return { windowMinutes, commentIds: best };
}
