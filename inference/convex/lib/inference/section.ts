// Comment-section astroturfing index (0-100): one number for the whole
// discussion, built from measured parts. Hand-weighted and uncalibrated; it
// ranks discussions for review and is not a probability.
import type { ClusterAssessment, HistoryResult, Score, Stance } from '../contract';
import { daysBetween, mentions, round2 } from './features';
import type { GraphIndex, HistorySample } from './packet';
import { hasAccountHistory, tierFor } from './rubric';
import type { CommentScore } from './scoring';
import type { ThreadSignals } from './signals';

/** Weights before renormalizing over the parts that could be measured. One-sided support is not a part: it adds a small bonus. */
export const SECTION_WEIGHTS = { comments: 0.35, coordination: 0.2, commercial: 0.2, rubric: 0.15, historyContrast: 0.1 } as const;
/** A comment estimated at this or above counts as suspicious; this share of endorsing comments counts fully. */
export const SUSPICIOUS_ESTIMATE = 50;
export const FULL_SUSPICIOUS_SHARE = 0.3;
const MIN_ENDORSING = 5;
/** One-sided support adds at most this many points, and only when the other parts reach ONE_SIDED_MIN_BASE. */
const ONE_SIDED_MAX_BONUS = 10;
const ONE_SIDED_MIN_BASE = 15;
/** Mention-rate gap (supportive minus unsupportive) that counts as the maximum contrast. */
const FULL_MENTION_GAP = 0.3;
/** New-account-share gap that counts as the maximum contrast. */
const FULL_NEW_ACCOUNT_GAP = 0.5;
const NEW_ACCOUNT_DAYS = 90;
const MIN_ANALYZED = 3;
const MIN_GROUP = 2;
const MIN_STANCES = 5;

export interface SectionInput {
  index: GraphIndex;
  /** Subject label and every product recommended in the thread; history mentions of any count. */
  mentionTerms: string[];
  scored: CommentScore[];
  /** True when there were no product recommendations, so nothing was promoted. */
  noRecommendations: boolean;
  clusters: ClusterAssessment[];
  /** Seller accounts, template phrases, outreach and duplicate praise, measured without the model. */
  thread: ThreadSignals;
  /** Per-comment astroturfing estimates, with whether the comment endorses the product. */
  estimates: { score: number; endorses: boolean }[];
  results: HistoryResult[];
  sample: HistorySample;
  counts: Record<Stance, number>;
  analyzedCount: number;
  fullCoverage: boolean;
  known: ReadonlySet<string>;
  handle: (commentId: string) => string;
}

export interface SectionParts {
  comments: number | null;
  rubric: number | null;
  coordination: number | null;
  commercial: number | null;
  historyContrast: number | null;
  oneSided: number | null;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number) => `${Math.round(n * 100)}%`;
const mean = (xs: number[]) => xs.reduce((t, x) => t + x, 0) / xs.length;

interface GroupStats {
  withHistory: number;
  mentionRate: number | null;
  newShare: number | null;
  profiles: number;
  mentionRefs: string[];
}

function groupStats(authorIds: string[], input: SectionInput): GroupStats {
  const byAuthor = new Map(input.results.map(r => [r.authorId, r]));
  const rates: number[] = [];
  const isNew: boolean[] = [];
  const mentionRefs: string[] = [];
  for (const authorId of authorIds) {
    const r = byAuthor.get(authorId);
    if (!r) continue;
    if (r.comments.length) {
      const hits = r.comments.filter(c => input.mentionTerms.some(term => mentions(c.text, term)));
      rates.push(hits.length / r.comments.length);
      mentionRefs.push(...hits.map(c => c.id).filter(id => input.known.has(id)));
    }
    const profile = r.profile ?? input.index.authors.get(authorId)?.profile;
    const age = daysBetween(profile?.accountCreatedAt, input.index.comment(r.anchorCommentId)?.createdAt ?? null);
    if (age !== null) isNew.push(age < NEW_ACCOUNT_DAYS);
  }
  return {
    withHistory: rates.length,
    mentionRate: rates.length ? mean(rates) : null,
    newShare: isNew.length >= MIN_GROUP ? isNew.filter(Boolean).length / isNew.length : null,
    profiles: isNew.length,
    mentionRefs,
  };
}

export function sectionIndex(input: SectionInput): { score: Score; parts: SectionParts } {
  const notes: string[] = [];
  const refs: string[] = [];

  // Rubric strength: mean of the top three recommendation scores.
  let rubric: number | null = null;
  if (input.noRecommendations) {
    rubric = 0;
    notes.push('No comment recommended a product, so rubric strength is 0.');
  } else if (input.scored.length) {
    const top = input.scored.slice().sort((a, b) => b.score! - a.score! || a.commentId.localeCompare(b.commentId)).slice(0, 3);
    rubric = mean(top.map(s => s.score!)) / 100;
    refs.push(...top.map(s => s.commentId));
    notes.push(`Rubric strength ${Math.round(rubric * 100)}: the top ${top.length} recommendation(s) scored ${top.map(s => `${s.score} (${input.handle(s.commentId)})`).join(', ')} on the rubric.`);
  }

  // Coordination: strongest cluster of recommendations that share coordination signals.
  let coordination: number | null = null;
  if (input.noRecommendations || input.scored.length) {
    const best = input.clusters.slice().sort((a, b) => (b.coordinationScore ?? 0) - (a.coordinationScore ?? 0))[0];
    coordination = best ? (best.coordinationScore ?? 0) / 100 : 0;
    if (best) refs.push(...best.commentIds);
    notes.push(best ? `Coordination ${Math.round(coordination * 100)}: ${best.commentIds.length} recommendations form the strongest cluster.` : 'Coordination 0: no cluster of recommendations shared coordination signals.');
  }

  // Comment realism: share of endorsing comments whose per-comment estimate is high.
  let comments: number | null = null;
  const endorsing = input.estimates.filter(e => e.endorses);
  if (endorsing.length >= MIN_ENDORSING) {
    const suspicious = endorsing.filter(e => e.score >= SUSPICIOUS_ESTIMATE).length;
    comments = clamp01(suspicious / endorsing.length / FULL_SUSPICIOUS_SHARE);
    notes.push(`Comment realism ${Math.round(comments * 100)}: ${suspicious} of ${endorsing.length} endorsing comments are estimated at ${SUSPICIOUS_ESTIMATE}+ (unnatural text, seller or random usernames, template phrases, duplicates).`);
  }

  // Commercial signals: seller-style accounts praising the product, template phrases, outreach, duplicate praise.
  const t = input.thread;
  const commercial = t.strength;
  const commercialNotes = [
    t.sellerPraise.authors ? `${t.sellerPraise.authors} of ${t.sellerPraise.supportiveAuthors} supportive accounts have seller-style names` : '',
    t.templates.length ? `${t.templates.length} comment(s) use seller or template phrases (${[...new Set(t.templates.map(x => x.label))].join(', ')})` : '',
    t.outreach.length ? `${t.outreach.length} comment(s) fish for the store owner` : '',
    t.duplicates ? `${t.duplicates.authors} different accounts posted exactly "${t.duplicates.text}"` : '',
  ].filter(Boolean);
  notes.push(commercialNotes.length ? `Commercial signals ${Math.round(commercial * 100)}: ${commercialNotes.join('; ')}.` : 'Commercial signals 0: no seller accounts, template phrases, outreach or duplicate praise found.');
  refs.push(...t.sellerPraise.commentIds.slice(0, 8), ...t.templates.map(x => x.commentId), ...t.outreach);

  // History contrast: the random supportive sample against the random unsupportive baseline.
  let historyContrast: number | null = null;
  const sup = groupStats(input.sample.supportive.sampled, input);
  const uns = groupStats(input.sample.unsupportive.sampled, input);
  const contrasts: number[] = [];
  const contrastNotes: string[] = [];
  if (sup.withHistory >= MIN_GROUP && uns.withHistory >= MIN_GROUP && sup.mentionRate !== null && uns.mentionRate !== null) {
    contrasts.push(clamp01((sup.mentionRate - uns.mentionRate) / FULL_MENTION_GAP));
    contrastNotes.push(`sampled supportive users mention the recommended products in ${pct(sup.mentionRate)} of their recent comments, unsupportive users in ${pct(uns.mentionRate)}`);
    refs.push(...sup.mentionRefs.slice(0, 10));
  }
  if (sup.newShare !== null && uns.newShare !== null) {
    contrasts.push(clamp01((sup.newShare - uns.newShare) / FULL_NEW_ACCOUNT_GAP));
    contrastNotes.push(`${pct(sup.newShare)} of supportive and ${pct(uns.newShare)} of unsupportive sampled accounts were under ${NEW_ACCOUNT_DAYS} days old`);
  }
  if (contrasts.length) {
    historyContrast = mean(contrasts);
    notes.push(`History contrast ${Math.round(historyContrast * 100)}: ${contrastNotes.join('; ')}.`);
  } else if (!hasAccountHistory(input.index.graph.platform)) {
    notes.push('History contrast not measured: this platform does not give access to commenter histories, so it is left out and the other parts carry its weight.');
  } else {
    notes.push(`History contrast not measured: it needs at least ${MIN_GROUP} sampled users with history in each group (supportive ${sup.withHistory}, unsupportive ${uns.withHistory}).`);
  }

  // One-sided support: how far supportive comments outnumber critical and mixed ones.
  let oneSided: number | null = null;
  const stanceTotal = input.counts.supportive + input.counts.critical + input.counts.mixed;
  if (stanceTotal >= MIN_STANCES) {
    const share = input.counts.supportive / stanceTotal;
    oneSided = clamp01((share - 0.5) / 0.5);
    notes.push(`One-sided support ${Math.round(oneSided * 100)}: ${pct(share)} of comments taking a side were supportive.`);
  }

  const parts: SectionParts = { comments, rubric, coordination, commercial, historyContrast, oneSided };
  const measured = (Object.keys(SECTION_WEIGHTS) as (keyof typeof SECTION_WEIGHTS)[]).filter(k => parts[k] !== null);
  if (input.analyzedCount < MIN_ANALYZED || measured.length === 0) {
    return {
      parts,
      score: {
        score: null,
        confidence: null,
        explanation: `Too little to measure: ${input.analyzedCount} comment(s) analyzed.`,
        evidenceRefs: [],
      },
    };
  }
  const weight = measured.reduce((sum, k) => sum + SECTION_WEIGHTS[k], 0);
  const base = Math.round((100 * measured.reduce((sum, k) => sum + SECTION_WEIGHTS[k] * parts[k]!, 0)) / weight);
  // Lopsided praise is normal under product posts, so it only strengthens other evidence.
  const bonus = oneSided !== null && base >= ONE_SIDED_MIN_BASE ? Math.round(ONE_SIDED_MAX_BONUS * oneSided) : 0;
  const value = Math.min(100, base + bonus);
  const confidence = round2(
    Math.min(0.8, 0.3 + (historyContrast !== null ? 0.25 : 0) + (input.scored.length >= 2 || input.noRecommendations ? 0.15 : 0) + (input.fullCoverage ? 0.1 : 0)),
  );
  const sampleNote = input.sample.pairs.length
    ? `Histories came from a random sample of ${input.sample.supportive.sampled.length} of ${input.sample.supportive.population} supportive and ${input.sample.unsupportive.sampled.length} of ${input.sample.unsupportive.population} unsupportive users.`
    : 'No user histories were sampled.';
  return {
    parts,
    score: {
      score: value,
      confidence,
      explanation: [
        `Comment-section astroturfing index: ${value}/100 (${tierFor(value)}).`,
        ...notes,
        `Weights: comment realism ${SECTION_WEIGHTS.comments * 100}%, coordination ${SECTION_WEIGHTS.coordination * 100}%, commercial signals ${SECTION_WEIGHTS.commercial * 100}%, rubric ${SECTION_WEIGHTS.rubric * 100}%, history contrast ${SECTION_WEIGHTS.historyContrast * 100}%, spread over the parts that could be measured; one-sided support adds up to ${ONE_SIDED_MAX_BONUS} points only when the rest reach ${ONE_SIDED_MIN_BASE}${bonus ? ` (+${bonus} here)` : ''}.`,
        sampleNote,
      ].join(' '),
      evidenceRefs: Array.from(new Set(refs)).filter(id => input.known.has(id)),
    },
  };
}
