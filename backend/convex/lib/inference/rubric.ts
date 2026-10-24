// Machine-readable copy of the rule table in rubrics/product-astroturfing.md
// (proposal v0.3). The model only chooses which rules fire and cites evidence;
// points, caps, tiers and confidence are recomputed here. tests/rubric.test.ts
// checks this table against the Markdown so the two cannot drift.
//
// AXIS is this implementation's provisional mapping from rubric rules to the
// v1 contract axes. It is unvalidated; see backend/README.md.
import type { AxisName, Platform } from '../contract';

export const RUBRIC_VERSION = '0.3';

export type Family = 'C' | 'B' | 'T' | 'X' | 'E';
/** Evidence level a rule needs: T discussion, A author history, C co-recommender history. */
export type Level = 'T' | 'A' | 'C';

export interface Rule {
  id: string;
  family: Family;
  /** Allowed point values. Positive for signals, negative for exculpatory rules. E1 is a cap, so 0. */
  points: number[];
  level: Level;
  platforms: Platform[];
  axis: AxisName | null;
  signal: string;
}

const ALL: Platform[] = ['reddit', 'x', 'youtube', 'tiktok'];
const RX: Platform[] = ['reddit', 'x'];

export const RULES: Rule[] = [
  { id: 'C1', family: 'C', points: [25], level: 'T', platforms: ALL, axis: 'semantic_coordination', signal: 'Two or more accounts recommend the product with near-identical wording, structure, or the same unusual details.' },
  { id: 'C2', family: 'C', points: [20], level: 'C', platforms: RX, axis: 'engagement_anomalies', signal: "Co-recommenders interact with each other: reply to, agree with or defend each other's recommendation, or appear together in other discussions more than chance would explain." },
  { id: 'C3', family: 'C', points: [15], level: 'C', platforms: RX, axis: 'account_anomalies', signal: 'Co-recommenders share account traits: created within a few days of each other, matching handle patterns, or similar profile statistics.' },
  { id: 'C4', family: 'C', points: [10], level: 'T', platforms: ALL, axis: 'temporal_coordination', signal: 'Several recommendations of the product arrive in a tight burst while other comments trickle in.' },
  { id: 'C5', family: 'C', points: [15], level: 'C', platforms: RX, axis: 'engagement_anomalies', signal: "Root author and recommender look paired: the root asks a question tailored to the product's selling points, and the root author has little other history or has appeared with the recommender before." },
  { id: 'C6', family: 'C', points: [15], level: 'C', platforms: RX, axis: 'semantic_coordination', signal: 'Distinctive writing quirks shared between the author and another co-recommender across their histories.' },
  { id: 'B1', family: 'B', points: [20], level: 'A', platforms: RX, axis: 'promotional_intent', signal: "Brand concentration: the brand appears in a large share of the author's recent comments (3 or more of the last 10), especially across unrelated communities." },
  { id: 'B2', family: 'B', points: [20], level: 'A', platforms: RX, axis: 'semantic_coordination', signal: 'The author has posted the same or near-identical recommendation in other discussions.' },
  { id: 'B3', family: 'B', points: [10], level: 'A', platforms: RX, axis: 'account_anomalies', signal: 'Engagement farming: history is mostly generic, low-effort posts in high-traffic spaces, then a switch to product talk; on Reddit also a large post-karma vs comment-karma imbalance.' },
  { id: 'B4', family: 'B', points: [8, 12], level: 'A', platforms: RX, axis: 'account_anomalies', signal: 'Account age under 30 days (+8), or dormant for 6+ months and reactivated mainly to discuss products (+12).' },
  { id: 'B5', family: 'B', points: [10], level: 'A', platforms: RX, axis: 'account_anomalies', signal: 'Abrupt style shift within the account: casual writing turns into polished marketing prose, or the language changes.' },
  { id: 'B6', family: 'B', points: [8], level: 'A', platforms: RX, axis: 'temporal_coordination', signal: 'Schedule looks like a work shift or machine-regular intervals in an account that is not about work topics.' },
  { id: 'B7', family: 'B', points: [8], level: 'A', platforms: RX, axis: 'promotional_intent', signal: "Consistently positive about the brand where the community's view is mixed, and consistently negative about competitors." },
  { id: 'B8', family: 'B', points: [5], level: 'A', platforms: RX, axis: 'account_anomalies', signal: "LLM-style prose across most of the author's history comments." },
  { id: 'B9', family: 'B', points: [3], level: 'A', platforms: RX, axis: 'account_anomalies', signal: 'History hidden or mostly deleted, only when the platform reports it.' },
  { id: 'T1', family: 'T', points: [8], level: 'T', platforms: ALL, axis: 'promotional_intent', signal: 'Unprompted: the recommendation does not answer what was asked or what the root is about.' },
  { id: 'T2', family: 'T', points: [8], level: 'T', platforms: RX, axis: 'account_anomalies', signal: 'Seeding-shaped root: a generic "best X?" or "alternatives to Y?" question from an account with almost no other history.' },
  { id: 'T3', family: 'T', points: [5, 10], level: 'T', platforms: ALL, axis: 'account_anomalies', signal: 'Other recommenders of the same product in the discussion are deleted, removed by moderators, or suspended (+5 each, up to +10).' },
  { id: 'T4', family: 'T', points: [5], level: 'T', platforms: ALL, axis: 'engagement_anomalies', signal: 'Visibility out of proportion: a short, low-effort recommendation from a little-active account outranks detailed comments.' },
  { id: 'T5', family: 'T', points: [8], level: 'T', platforms: ALL, axis: 'engagement_anomalies', signal: 'Criticism of the product is answered quickly by several defenders (score C2 instead when defenders are co-recommenders with history).' },
  { id: 'X1', family: 'X', points: [8], level: 'T', platforms: ALL, axis: 'promotional_intent', signal: 'Tracking link or code: affiliate tag, referral or discount code, UTM parameters, link shortener, or an unrequested product-page link.' },
  { id: 'X2', family: 'X', points: [6], level: 'T', platforms: ALL, axis: 'promotional_intent', signal: 'Marketing register: full official product name, trademark styling, feature list matching official copy, slogans, prices.' },
  { id: 'X3', family: 'X', points: [6], level: 'T', platforms: ALL, axis: 'promotional_intent', signal: 'Shaped to be quoted: a self-contained, list-style "best X" answer that ranks one brand first with numbered reasons.' },
  { id: 'X4', family: 'X', points: [4], level: 'T', platforms: ALL, axis: 'promotional_intent', signal: 'Unprompted authenticity claims: "not affiliated", "not a bot", "I was skeptical too".' },
  { id: 'X5', family: 'X', points: [4], level: 'T', platforms: ALL, axis: 'promotional_intent', signal: 'Generic experience: no specific, costly-to-fake detail, or a timeline that does not fit.' },
  { id: 'X6', family: 'X', points: [3], level: 'T', platforms: ALL, axis: 'account_anomalies', signal: 'This one comment reads as LLM-written.' },
  { id: 'X7', family: 'X', points: [3], level: 'T', platforms: ALL, axis: 'promotional_intent', signal: 'Competitor disparagement without specifics.' },
  { id: 'E1', family: 'E', points: [0], level: 'T', platforms: ALL, axis: 'disclosure_concerns', signal: 'Disclosed tie: the author states a commercial relationship with the brand. Disclosed promotion, not astroturfing; caps the score at 15.' },
  { id: 'E2', family: 'E', points: [-15], level: 'A', platforms: RX, axis: null, signal: 'Established account: over a year old, broad participation across unrelated communities, consistent style, brand mentions rare (not from partial history).' },
  { id: 'E3', family: 'E', points: [-10], level: 'T', platforms: ALL, axis: null, signal: 'Specific, balanced experience: names drawbacks, compares fairly, gives costly-to-fake detail.' },
  { id: 'E4', family: 'E', points: [-10], level: 'T', platforms: ['reddit'], axis: null, signal: 'Recognized community member: trusted flair, moderator, or long-time regular. Paid verification badges never count.' },
  { id: 'E5', family: 'E', points: [-10], level: 'T', platforms: ALL, axis: null, signal: 'Popular product: many unrelated accounts recommend it across many discussions over a long period.' },
  { id: 'E6', family: 'E', points: [-5], level: 'T', platforms: ALL, axis: null, signal: 'Answers a direct question: the root or parent asks about this product or category and the comment addresses it.' },
  { id: 'E7', family: 'E', points: [-5], level: 'A', platforms: RX, axis: null, signal: 'The author has criticized this brand elsewhere in their history (not from partial history).' },
];

export const RULES_BY_ID: ReadonlyMap<string, Rule> = new Map(RULES.map(r => [r.id, r]));

export type Tier = 'Minimal' | 'Low' | 'Moderate' | 'High' | 'Very high';
export type RubricConfidence = 'Low' | 'Medium' | 'High';
export type RecommendedAction = 'none' | 'monitor' | 'human_review' | 'priority_human_review';

export function tierFor(score: number): Tier {
  if (score >= 75) return 'Very high';
  if (score >= 55) return 'High';
  if (score >= 35) return 'Moderate';
  if (score >= 15) return 'Low';
  return 'Minimal';
}

export function actionFor(tier: Tier): RecommendedAction {
  switch (tier) {
    case 'Very high': return 'priority_human_review';
    case 'High': return 'human_review';
    case 'Moderate': return 'monitor';
    default: return 'none';
  }
}

/** Contract confidence is 0-1. These anchors are provisional and uncalibrated. */
export const CONFIDENCE_VALUE: Record<RubricConfidence, number> = { Low: 0.3, Medium: 0.55, High: 0.8 };
