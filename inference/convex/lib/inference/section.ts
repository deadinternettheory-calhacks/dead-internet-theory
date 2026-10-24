// Comment-section astroturfing index (0-100): one number for the whole
// discussion, built from measured parts. Hand-weighted and uncalibrated; it
// ranks discussions for review and is not a probability.
import type { ClusterAssessment, HistoryResult, Score, Stance } from '../contract';
import { daysBetween, mentions, round2 } from './features';
import type { GraphIndex, HistorySample } from './packet';
import { tierFor } from './rubric';
import type { CommentScore } from './scoring';

/** Weights before renormalizing over the parts that could be measured. */
export const SECTION_WEIGHTS = { rubric: 0.4, coordination: 0.25, historyContrast: 0.25, oneSided: 0.1 } as const;
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
  subjectLabel: string;
  scored: CommentScore[];
  /** True when there were no product recommendations, so nothing was promoted. */
  noRecommendations: boolean;
  clusters: ClusterAssessment[];
  results: HistoryResult[];
  sample: HistorySample;
  counts: Record<Stance, number>;
  analyzedCount: number;
  fullCoverage: boolean;
  known: ReadonlySet<string>;
  handle: (commentId: string) => string;
}

export interface SectionParts {
  rubric: number | null;
  coordination: number | null;
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
      const hits = r.comments.filter(c => mentions(c.text, input.subjectLabel));
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

  // History contrast: the random supportive sample against the random unsupportive baseline.
  let historyContrast: number | null = null;
  const sup = groupStats(input.sample.supportive.sampled, input);
  const uns = groupStats(input.sample.unsupportive.sampled, input);
  const contrasts: number[] = [];
  const contrastNotes: string[] = [];
  if (sup.withHistory >= MIN_GROUP && uns.withHistory >= MIN_GROUP && sup.mentionRate !== null && uns.mentionRate !== null) {
    contrasts.push(clamp01((sup.mentionRate - uns.mentionRate) / FULL_MENTION_GAP));
    contrastNotes.push(`sampled supportive users mention ${input.subjectLabel || 'the subject'} in ${pct(sup.mentionRate)} of their recent comments, unsupportive users in ${pct(uns.mentionRate)}`);
    refs.push(...sup.mentionRefs.slice(0, 10));
  }
  if (sup.newShare !== null && uns.newShare !== null) {
    contrasts.push(clamp01((sup.newShare - uns.newShare) / FULL_NEW_ACCOUNT_GAP));
    contrastNotes.push(`${pct(sup.newShare)} of supportive and ${pct(uns.newShare)} of unsupportive sampled accounts were under ${NEW_ACCOUNT_DAYS} days old`);
  }
  if (contrasts.length) {
    historyContrast = mean(contrasts);
    notes.push(`History contrast ${Math.round(historyContrast * 100)}: ${contrastNotes.join('; ')}.`);
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

  const parts: SectionParts = { rubric, coordination, historyContrast, oneSided };
  const measured = (Object.keys(SECTION_WEIGHTS) as (keyof SectionParts)[]).filter(k => parts[k] !== null);
  if (input.analyzedCount < MIN_ANALYZED || measured.length === 0) {
    return {
      parts,
      score: {
        score: null,
        confidence: null,
        explanation: `Too little to measure: ${input.analyzedCount} comment(s) analyzed. A missing index is not a low index.`,
        evidenceRefs: [],
      },
    };
  }
  const weight = measured.reduce((t, k) => t + SECTION_WEIGHTS[k], 0);
  const value = Math.round((100 * measured.reduce((t, k) => t + SECTION_WEIGHTS[k] * parts[k]!, 0)) / weight);
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
        `Weights: rubric ${SECTION_WEIGHTS.rubric * 100}%, coordination ${SECTION_WEIGHTS.coordination * 100}%, history contrast ${SECTION_WEIGHTS.historyContrast * 100}%, one-sided support ${SECTION_WEIGHTS.oneSided * 100}%, spread over the parts that could be measured.`,
        sampleNote,
        'This is an uncalibrated, hand-weighted index for prioritizing review, not a probability or a finding that the discussion was astroturfed.',
      ].join(' '),
      evidenceRefs: Array.from(new Set(refs)).filter(id => input.known.has(id)),
    },
  };
}
