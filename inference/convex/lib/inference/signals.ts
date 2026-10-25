// Thread-level commercial signals measured without the model: seller-style
// accounts, template and seller phrases, store-owner outreach, and identical
// short praise from different accounts. They need no recommendations or
// histories, so they work on video platforms too. Hand-chosen heuristics;
// each one has innocent explanations, so the section score weights them.
import type { CommentNode } from '../contract';
import type { TriageOutput } from './outputs';
import type { GraphIndex } from './packet';

/** Handles that read like shops, sellers or deal accounts. */
const SELLER_HANDLE = /(shop|store|official|sourcing|deals?|finds|mart\b|outlet|boutique|supply|wholesale|trading|dropship|ecom|commerce|amz|amazon|goods|achad|_home\b|home(co)?$|buyingonly|shoppingbuddy|smartbuy)/i;

/** Phrases sellers and comment templates use; real customers rarely write them. */
const TEMPLATE_PHRASES: { pattern: RegExp; label: string }[] = [
  { pattern: /\bwinning product\b/i, label: '"winning product"' },
  { pattern: /\b(total |absolute |real )?life ?saver\b/i, label: '"lifesaver"' },
  { pattern: /\b(erases?|removes?|eliminates?|fixes?)\b[^.!?]{0,40}\bin (seconds|minutes)\b/i, label: '"… in seconds"' },
  { pattern: /\bchanged my (life|momentum|game|routine)\b/i, label: '"changed my life"' },
  { pattern: /\bmust[- ]?have\b/i, label: '"must-have"' },
  { pattern: /\b(link|shop) in (my )?bio\b/i, label: '"link in bio"' },
];

/** Outreach from sellers or marketers fishing for the store owner. */
const OUTREACH = /\b(store owner|shop owner|shopify( store)?|reach out to the (store|shop|owner)|conversation with the (store|shop|owner)|promote your (store|shop|product)|collab(oration)?\b|dm me for)/i;

export interface ThreadSignals {
  /** Commenters with seller-style handles who praise or endorse the product. */
  sellerPraise: { commentIds: string[]; authors: number; supportiveAuthors: number };
  templates: { commentId: string; label: string }[];
  outreach: string[];
  /** Largest group of distinct accounts posting the same short text. */
  duplicates: { text: string; commentIds: string[]; authors: number } | null;
  /** 0-1 strength of the combined commercial evidence. */
  strength: number;
  /** 0-100 promotional index (seller praise, templates, outreach) and its evidence, for the promotional-intent axis. */
  promotion: { score: number; refs: string[] };
  /** 0-100 duplicate-praise index and its evidence, for the similar-wording axis. */
  duplication: { score: number; refs: string[] };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function threadSignals(index: GraphIndex, triage: TriageOutput): ThreadSignals {
  const stance = new Map(triage.comments.map(c => [c.commentId, c]));
  const visible = index.comments.filter(c => c.contentStatus === 'visible' && c.text.trim() && c.authorId !== index.root.authorId);
  const supportive = (c: CommentNode) => {
    const t = stance.get(c.id);
    return !!t && (t.stance === 'supportive' || t.recommendsSubject || !!t.recommendsProduct);
  };

  const supportiveAuthors = new Set(visible.filter(supportive).map(c => c.authorId));
  const seller = visible.filter(c => supportive(c) && SELLER_HANDLE.test(index.handle(c.authorId) ?? ''));
  const sellerAuthors = new Set(seller.map(c => c.authorId));

  const templates: ThreadSignals['templates'] = [];
  for (const c of visible) {
    const hit = TEMPLATE_PHRASES.find(p => p.pattern.test(c.text));
    if (hit) templates.push({ commentId: c.id, label: hit.label });
  }
  const outreach = visible.filter(c => OUTREACH.test(c.text)).map(c => c.id);

  // Identical short texts (after normalizing case, punctuation and emoji) from different accounts.
  const groups = new Map<string, CommentNode[]>();
  for (const c of visible) {
    const key = c.text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
    if (!key || key.length > 40) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  let duplicates: ThreadSignals['duplicates'] = null;
  for (const [text, cs] of groups) {
    const authors = new Set(cs.map(c => c.authorId)).size;
    if (authors >= 3 && (!duplicates || authors > duplicates.authors)) duplicates = { text, commentIds: cs.map(c => c.id), authors };
  }

  // Seller praise: 30% of supportive accounts counts fully. Templates: 3 comments count fully.
  // Outreach: 2 comments count fully. Duplicates: 8 accounts count fully (common words like "good" are weak alone).
  const parts = [
    { w: 0.4, x: supportiveAuthors.size >= 5 ? clamp01(sellerAuthors.size / supportiveAuthors.size / 0.3) : 0 },
    { w: 0.3, x: clamp01(templates.length / 3) },
    { w: 0.15, x: clamp01(outreach.length / 2) },
    { w: 0.15, x: duplicates ? clamp01(duplicates.authors / 8) : 0 },
  ];
  const [seller_, templates_, outreach_, duplicates_] = parts;
  return {
    promotion: {
      score: Math.round((100 * (seller_.w * seller_.x + templates_.w * templates_.x + outreach_.w * outreach_.x)) / (seller_.w + templates_.w + outreach_.w)),
      refs: [...seller.map(c => c.id), ...templates.map(t => t.commentId), ...outreach],
    },
    duplication: { score: Math.round(100 * duplicates_.x), refs: duplicates?.commentIds ?? [] },
    sellerPraise: { commentIds: seller.map(c => c.id), authors: sellerAuthors.size, supportiveAuthors: supportiveAuthors.size },
    templates,
    outreach,
    duplicates,
    strength: parts.reduce((t, p) => t + p.w * p.x, 0),
  };
}

export type HandleKind = 'seller' | 'random' | 'default' | 'normal';

/**
 * What a username looks like: a shop or deal account, a random-looking string
 * (letters and digits with few vowels, e.g. "wkkvdqwsunsg4p"), a platform
 * default ("user" plus digits), or a normal name. Defaults and random strings
 * are also common for real casual users, so they weigh less than seller names.
 */
export function handleKind(handle: string | null): HandleKind {
  if (!handle) return 'normal';
  const h = handle.toLowerCase();
  if (SELLER_HANDLE.test(h)) return 'seller';
  if (/^user\d{6,}$/.test(h)) return 'default';
  const letters = h.replace(/[^a-z]/g, '');
  const digits = h.replace(/[^0-9]/g, '').length;
  const vowels = letters.replace(/[^aeiou]/g, '').length;
  if (h.length >= 10 && letters.length >= 6 && (vowels / letters.length < 0.2 || (digits >= 4 && vowels / letters.length < 0.3))) return 'random';
  return 'normal';
}

export interface CommentEstimate {
  /** 0-100 estimate of how likely the comment is astroturfed. Hand-weighted, uncalibrated. */
  score: number;
  reasons: string[];
}

/** Points per signal; the estimate is the larger of the rubric score and these points summed (capped at 100). */
export const ESTIMATE_POINTS = {
  unnatural: 35,
  generic: 10,
  sellerHandle: 40,
  randomHandle: 15,
  defaultHandle: 10,
  template: 30,
  outreach: 25,
  duplicate: 10,
} as const;

export function commentEstimate(args: {
  realism: 'natural' | 'generic' | 'unnatural' | undefined;
  handle: string | null;
  endorses: boolean;
  template: string | null;
  outreach: boolean;
  duplicate: boolean;
  rubricScore: number | null;
}): CommentEstimate {
  const reasons: string[] = [];
  let points = 0;
  const add = (n: number, why: string) => { points += n; reasons.push(why); };
  // Realism and duplicate praise only matter for comments that push the product.
  if (args.endorses && args.realism === 'unnatural') add(ESTIMATE_POINTS.unnatural, 'Unnatural or ad-like text');
  if (args.endorses && args.realism === 'generic') add(ESTIMATE_POINTS.generic, 'Generic praise');
  const kind = handleKind(args.handle);
  if (args.endorses || args.outreach) {
    if (kind === 'seller') add(ESTIMATE_POINTS.sellerHandle, 'Seller-style username');
    if (kind === 'random') add(ESTIMATE_POINTS.randomHandle, 'Random-looking username');
    if (kind === 'default') add(ESTIMATE_POINTS.defaultHandle, 'Default username');
  }
  if (args.template) add(ESTIMATE_POINTS.template, `Template phrase ${args.template}`);
  if (args.outreach) add(ESTIMATE_POINTS.outreach, 'Store-owner outreach');
  if (args.endorses && args.duplicate) add(ESTIMATE_POINTS.duplicate, 'Same text as other accounts');
  if (args.rubricScore !== null && args.rubricScore > points) reasons.unshift(`Rubric ${args.rubricScore}/100`);
  return { score: Math.min(100, Math.max(points, args.rubricScore ?? 0)), reasons };
}
