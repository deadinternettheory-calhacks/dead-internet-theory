// Deterministic rubric scoring (rubrics/product-astroturfing.md sections 5-7).
// The model proposes which rules fire; this module drops anything the platform,
// the available evidence or the graph does not support, then sums points and
// applies caps K1-K6 itself.
import type { Platform } from '../contract';
import type { ProposedAssessment, ProposedSignal } from './outputs';
import {
  actionFor,
  RULES_BY_ID,
  tierFor,
  type Family,
  type RecommendedAction,
  type RubricConfidence,
  type Rule,
  type Tier,
} from './rubric';

export interface ScoredSignal {
  id: string;
  family: Family;
  points: number;
  evidence: string;
  evidenceRefs: string[];
}

export interface CommentScore {
  commentId: string;
  label: 'scored' | 'disclosed_promotion' | 'not_applicable';
  product: string | null;
  score: number | null;
  tier: Tier | null;
  confidence: RubricConfidence;
  signals: ScoredSignal[];
  exculpatory: ScoredSignal[];
  unknown: string[];
  capsApplied: string[];
  recommendedAction: RecommendedAction;
  summary: string;
  /** Model-proposed signals removed by validation, with reasons. */
  discarded: string[];
}

/** What evidence exists for one target comment's author and co-recommenders. */
export interface EvidenceAvailability {
  platform: Platform;
  /** Items in the target author's history (0 if none). */
  authorHistoryCount: number;
  authorHistoryPartial: boolean;
  /** Profile fields present for the target author (Reddit only). */
  authorHasProfile: boolean;
  /** History item counts for co-recommenders (other authors recommending the same product). */
  coRecommenderHistoryCounts: number[];
  /** History items for the root author, when they are not the target author. */
  rootAuthorHistoryCount: number;
  anyUsedHistoryPartial: boolean;
}

function levelAvailable(rule: Rule, a: EvidenceAvailability): boolean {
  if (rule.level === 'T') return true;
  if (rule.level === 'A') return a.authorHistoryCount > 0 || a.authorHasProfile;
  // Level C: in-discussion interactions are visible, but the rubric needs a co-recommender or root author history.
  return a.rootAuthorHistoryCount > 0 || a.coRecommenderHistoryCounts.some(n => n > 0);
}

function confidenceFor(a: EvidenceAvailability): RubricConfidence {
  if (a.platform === 'youtube' || a.platform === 'tiktok') return 'Low';
  let level: RubricConfidence;
  if (a.authorHistoryCount < 10) level = 'Low';
  else if (a.coRecommenderHistoryCounts.length > 0 && a.coRecommenderHistoryCounts.every(n => n >= 10)) level = 'High';
  else level = 'Medium';
  if (a.platform === 'x' && a.anyUsedHistoryPartial) level = level === 'High' ? 'Medium' : 'Low';
  return level;
}

function acceptSignals(
  proposed: ProposedSignal[],
  exculpatory: boolean,
  a: EvidenceAvailability,
  knownIds: ReadonlySet<string>,
  discarded: string[],
): ScoredSignal[] {
  const out: ScoredSignal[] = [];
  const seen = new Set<string>();
  for (const s of proposed) {
    const rule = RULES_BY_ID.get(s.id);
    const why = (reason: string) => discarded.push(`${s.id}: ${reason}`);
    if (!rule) { why('unknown rule'); continue; }
    if ((rule.family === 'E') !== exculpatory) { why('listed in the wrong section'); continue; }
    if (seen.has(rule.id)) { why('duplicate'); continue; }
    if (!rule.platforms.includes(a.platform)) { why(`not allowed on ${a.platform}`); continue; }
    if (!levelAvailable(rule, a)) { why(`needs level ${rule.level} evidence that is not available`); continue; }
    if ((rule.id === 'E2' || rule.id === 'E7') && a.authorHistoryPartial) { why('cannot fire from partial history'); continue; }
    const refs = Array.from(new Set(s.evidenceRefs.filter(r => knownIds.has(r))));
    if (refs.length === 0) { why('no resolvable evidence reference'); continue; }
    const points = s.points !== undefined && rule.points.includes(s.points) ? s.points : rule.points[0];
    seen.add(rule.id);
    out.push({ id: rule.id, family: rule.family, points, evidence: s.evidence, evidenceRefs: refs });
  }
  return out;
}

export function scoreComment(
  proposal: ProposedAssessment,
  availability: EvidenceAvailability,
  knownIds: ReadonlySet<string>,
): CommentScore {
  const discarded: string[] = [];
  const confidence = confidenceFor(availability);
  const base = {
    commentId: proposal.commentId,
    product: proposal.product,
    confidence,
    unknown: Array.from(new Set(proposal.unknown.filter(id => RULES_BY_ID.has(id)))),
    summary: proposal.summary,
    discarded,
  };
  if (proposal.label === 'not_applicable') {
    return { ...base, label: 'not_applicable', score: null, tier: null, signals: [], exculpatory: [], capsApplied: [], recommendedAction: 'none' };
  }

  const signals = acceptSignals(proposal.signals, false, availability, knownIds, discarded);
  const exculpatory = acceptSignals(proposal.exculpatory, true, availability, knownIds, discarded);
  const capsApplied: string[] = [];

  const content = signals.filter(s => s.family === 'X').reduce((t, s) => t + s.points, 0);
  const cappedContent = Math.min(content, 20);
  if (cappedContent < content) capsApplied.push('K1');
  const nonContent = signals.filter(s => s.family !== 'X').reduce((t, s) => t + s.points, 0);
  const minus = exculpatory.reduce((t, s) => t + Math.abs(s.points), 0);
  let score = Math.max(0, nonContent + cappedContent - minus);

  const families = new Set(signals.map(s => s.family));
  const cap = (id: string, max: number) => {
    if (score > max) { score = max; capsApplied.push(id); }
  };
  if (!families.has('C') && !families.has('B') && !families.has('T')) cap('K2', 25);
  if (!(families.size >= 2 && (families.has('C') || families.has('B')))) cap('K3', 54);
  if (!(families.has('C') && families.has('B'))) cap('K4', 74);
  const disclosed = exculpatory.some(s => s.id === 'E1') || proposal.label === 'disclosed_promotion';
  if (disclosed) cap('K5', 15);
  score = Math.min(100, Math.max(0, score));

  const tier = tierFor(score);
  return {
    ...base,
    label: disclosed ? 'disclosed_promotion' : 'scored',
    score,
    tier,
    signals,
    exculpatory,
    capsApplied,
    recommendedAction: actionFor(tier),
  };
}
