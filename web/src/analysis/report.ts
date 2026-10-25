// Turns a stored v1 analysis plus its graph into the plain-language report the
// analysis page shows (SPEC 4.2 order: post, result, findings, details,
// coverage and limitations). Only fields the API returned are shown.
import type { AnalysisResource, AxisAssessment, AxisName, CommentNode, EnrichmentJob, GraphEnvelope, Stance } from '../api/contract';

export type Tone = 'high' | 'medium' | 'low' | 'neutral';

export interface EvidenceItem {
  id: string;
  author: string | null;
  text: string;
  url: string | null;
  createdAt: string | null;
  source: 'discussion' | 'history';
}

/** A contract axis, or the per-comment realism roll-up computed from comment estimates. */
export type SignalKind = AxisName | 'comment_realism' | 'shop_names';

type SignalAssessment = Omit<AxisAssessment, 'axis'> & { axis: SignalKind };

export interface Finding {
  axis: Exclude<SignalKind, 'disclosure_concerns'>;
  title: string;
  description: string;
  details: string;
  evidence: EvidenceItem[];
  /** Cited comments already quoted under an earlier finding. */
  repeatedEvidence: number;
}

export interface CommentRow extends EvidenceItem {
  stance: Stance;
  rationale: string;
  isRecommendation: boolean;
  /** 0-100 astroturfing estimate for this comment, when the analysis has one. */
  estimate: { score: number; reasons: string[] } | null;
}

export interface AccountRow {
  authorId: string;
  author: string | null;
  score: number | null;
  historyCount: number;
  unknown: string[];
  signals: { ruleId: string; evidence: string }[];
  /** Evidence of an ordinary human user (E2, E4, E7); no automation signals are shown then. */
  humanSignals: { ruleId: string; evidence: string }[];
}

/** A zero over a mostly unavailable review must not look like an all-clear. */
export function accountReviewLimited(account: AccountRow): boolean {
  return account.score === null || (account.score === 0 && account.unknown.length > 0 && !account.humanSignals.length);
}

export interface Report {
  synthetic: boolean;
  post: { title: string | null; text: string; url: string; platform: string; author: string | null; createdAt: string | null };
  subject: string;
  verdict: { label: string; description: string; tone: Tone };
  index: { score: number; confidence: number | null; explanation: string } | null;
  findings: Finding[];
  axes: { axis: SignalKind; title: string; score: number | null; explanation: string; evidence: EvidenceItem[] }[];
  discussion: EvidenceItem[];
  histories: { id: string; author: string | null; status: string; comments: EvidenceItem[]; account?: AccountRow | null }[];
  /** Sampled accounts with an automation-signal index, highest first. */
  accounts: AccountRow[];
  comments: CommentRow[];
  clusters: { id: string; size: number; explanation: string }[];
  coverage: { analyzed: number; retrieved: number; reported: number | null; completeness: string; sentiment: Record<Stance, number>; histories: string | null; collectedAt: string | null };
  limitations: string[];
  inferenceVersion: string;
}

const FINDING_COPY: Record<Exclude<SignalKind, 'disclosure_concerns'>, { title: string; description: string }> = {
  comment_realism: { title: 'Comments read like promotion', description: 'Many comments praising the product read as unnatural or ad-like, come from seller-style or random usernames, or reuse template phrases.' },
  shop_names: { title: 'Shop-style usernames', description: 'Many accounts praising the product have shop, store or deal-style names. Sellers often comment on each other’s posts to boost them.' },
  semantic_coordination: { title: 'Accounts used nearly identical wording', description: 'Several accounts recommended the product with almost the same words or details.' },
  temporal_coordination: { title: 'Recommendations arrived close together', description: 'Recommendations came in a tight burst compared with the rest of the discussion.' },
  engagement_anomalies: { title: 'Accounts backed each other up', description: 'Accounts recommending the product replied to, agreed with or defended each other.' },
  account_anomalies: { title: 'Some accounts showed unusual patterns', description: 'Some recommending accounts had unusual account traits, such as being very new.' },
  promotional_intent: { title: 'Recommendations read like promotion', description: 'The recommendations use marketing-style language, or the accounts mention the brand often elsewhere.' },
};

const AXIS_TITLE: Record<SignalKind, string> = {
  comment_realism: 'Comment realism',
  shop_names: 'Shop-style usernames',
  semantic_coordination: 'Similar wording',
  temporal_coordination: 'Timing',
  engagement_anomalies: 'Accounts backing each other',
  account_anomalies: 'Account patterns',
  promotional_intent: 'Promotional language',
  disclosure_concerns: 'Disclosure',
};

/** Cutoffs follow the rubric's tiers (rubrics/product-astroturfing.md section 7), which are uncalibrated. */
/** Mirrors inference/convex/lib/inference/section.ts: a comment at this estimate or above is suspicious; this share counts fully. */
const SUSPICIOUS_ESTIMATE = 50;
const FULL_SUSPICIOUS_SHARE = 0.3;

/** Same cut-off as the moderate band of the section score. */
const FINDING_MIN_SCORE = 35;

/** Findings order: promotional language first, then shop-style names, then the rest by score. */
const FINDING_PRIORITY: SignalKind[] = ['comment_realism', 'promotional_intent', 'shop_names'];
/** The per-comment estimate reason inference gives a seller-style username (inference/convex/lib/inference/signals.ts). */
const SHOP_REASON = 'Seller-style username';

export function verdictFor(score: number | null, subject: string): Report['verdict'] {
  const about = subject ? ` for ${subject}` : '';
  if (score === null) return { tone: 'neutral', label: 'Not enough to score', description: `Too little evidence${about}.` };
  if (score >= 55) return { tone: 'high', label: 'Strong signs of coordinated promotion', description: `Several recommendations${about} look coordinated.` };
  if (score >= 35) return { tone: 'medium', label: 'Some signs of coordinated promotion', description: `A few recommendations${about} look unusual.` };
  return { tone: 'low', label: 'Few signs of coordinated promotion', description: `Recommendations${about} look like ordinary users.` };
}

export function isSyntheticGraph(graph: GraphEnvelope): boolean {
  return graph.coverage.limitations.some(l => /synthetic fixture/i.test(l));
}

function handleFor(graph: GraphEnvelope, authorId: string | null): string | null {
  if (!authorId) return null;
  const author = graph.nodes.find(n => n.id === authorId && n.type === 'author');
  const handle = author && author.type === 'author' ? author.handle : null;
  if (!handle) return null;
  return graph.platform === 'reddit' ? `u/${handle}` : graph.platform === 'x' ? `@${handle}` : handle;
}

export function buildReport(analysis: AnalysisResource, graph: GraphEnvelope, enrichments: EnrichmentJob[] = []): Report {
  const a = analysis.result;
  const root = graph.nodes.find(n => n.id === graph.rootId);
  if (!root || root.type !== 'discussion') throw new Error('Graph has no discussion root.');
  const comments = new Map(graph.nodes.filter((n): n is CommentNode => n.type === 'comment').map(n => [n.id, n]));
  const history = new Map(enrichments.flatMap(j => j.results ?? []).flatMap(r => r.comments).map(c => [c.id, c]));

  const evidenceFor = (refs: string[]): EvidenceItem[] => {
    const items: EvidenceItem[] = [];
    for (const ref of refs) {
      const c = comments.get(ref);
      if (c) { items.push({ id: c.id, author: handleFor(graph, c.authorId), text: c.text, url: c.url, createdAt: c.createdAt, source: 'discussion' }); continue; }
      const h = history.get(ref);
      if (h) items.push({ id: h.id, author: handleFor(graph, h.authorId), text: h.text, url: h.url, createdAt: h.createdAt, source: 'history' });
    }
    return items;
  };

  // Comment realism: share of endorsing comments estimated at 50+ (same thresholds as inference/section.ts).
  const recommendationIds = new Set(a.commentAssessments.filter(c => c.promotionalIntentScore !== null).map(c => c.commentId));
  const endorsing = a.commentAssessments.filter(c => c.astroturfEstimate && comments.get(c.commentId)?.text.trim() && (c.stance === 'supportive' || recommendationIds.has(c.commentId)));
  const suspicious = endorsing.filter(c => c.astroturfEstimate!.score >= SUSPICIOUS_ESTIMATE).sort((x, y) => y.astroturfEstimate!.score - x.astroturfEstimate!.score);
  const realism: SignalAssessment | null = endorsing.length >= 5 ? {
    axis: 'comment_realism',
    score: Math.round(100 * Math.min(1, suspicious.length / endorsing.length / FULL_SUSPICIOUS_SHARE)),
    confidence: null,
    assessedCommentCount: endorsing.length,
    explanation: `${suspicious.length} of ${endorsing.length} comments praising the product are estimated at ${SUSPICIOUS_ESTIMATE}+ out of 100, from unnatural or ad-like text, seller-style or random usernames, template phrases, store outreach and copied praise.`,
    evidenceRefs: suspicious.map(c => c.commentId),
  } : null;
  // Shop-style names: share of accounts praising the product whose username reads like a shop (30% counts fully, as in inference).
  const endorsingAuthors = new Set(endorsing.map(c => comments.get(c.commentId)?.authorId ?? c.commentId));
  const shopComments = endorsing.filter(c => c.astroturfEstimate!.reasons.includes(SHOP_REASON));
  const shopAuthors = new Set(shopComments.map(c => comments.get(c.commentId)?.authorId ?? c.commentId));
  const shops: SignalAssessment | null = endorsingAuthors.size >= 5 && shopAuthors.size ? {
    axis: 'shop_names',
    score: Math.round(100 * Math.min(1, shopAuthors.size / endorsingAuthors.size / FULL_SUSPICIOUS_SHARE)),
    confidence: null,
    assessedCommentCount: endorsing.length,
    explanation: `${shopAuthors.size} of ${endorsingAuthors.size} accounts praising the product have shop, store or deal-style usernames. 30% counts fully. Name patterns are a heuristic: a real small business can comment too.`,
    evidenceRefs: shopComments.map(c => c.commentId),
  } : null;
  const signals: SignalAssessment[] = [...(realism ? [realism] : []), ...(shops ? [shops] : []), ...a.axes];

  // Only signals in the moderate band or above count as standing out; weaker ones stay in the details.
  const ranked = signals
    .filter((x): x is SignalAssessment & { axis: Exclude<SignalKind, 'disclosure_concerns'> } => x.axis !== 'disclosure_concerns' && x.score !== null && x.score >= FINDING_MIN_SCORE)
    .sort((x, y) => {
      const rank = (k: SignalKind) => (FINDING_PRIORITY.includes(k) ? FINDING_PRIORITY.indexOf(k) : FINDING_PRIORITY.length);
      return rank(x.axis) - rank(y.axis) || (y.score ?? 0) - (x.score ?? 0);
    });
  // Show each quoted comment once, under the first finding that cites it.
  const shown = new Set<string>();
  const findings: Finding[] = ranked.slice(0, 3).map(x => {
    const cited = evidenceFor(x.evidenceRefs);
    const fresh = cited.filter(e => !shown.has(e.id)).slice(0, 6);
    fresh.forEach(e => shown.add(e.id));
    return {
      axis: x.axis,
      title: FINDING_COPY[x.axis].title,
      description: FINDING_COPY[x.axis].description,
      details: x.explanation,
      evidence: fresh,
      repeatedEvidence: cited.length - fresh.length,
    };
  });

  const rows: CommentRow[] = a.commentAssessments.flatMap(c => {
    const node = comments.get(c.commentId);
    if (!node) return [];
    return [{
      id: node.id, author: handleFor(graph, node.authorId), text: node.text, url: node.url, createdAt: node.createdAt, source: 'discussion' as const,
      stance: c.stance, rationale: c.rationale, isRecommendation: recommendationIds.has(c.commentId),
      estimate: c.astroturfEstimate ?? null,
    }];
  });

  const results = enrichments.flatMap(j => j.results ?? []);
  const histories = results.length
    ? `${results.length} account histories requested: ${(['complete', 'partial', 'unavailable', 'unsupported', 'failed'] as const)
        .map(s => [s, results.filter(r => r.status === s).length] as const)
        .filter(([, n]) => n > 0)
        .map(([s, n]) => `${n} ${s}`)
        .join(', ')}.`
    : null;

  const score = a.overallCoordinationRisk.score;
  const accounts: AccountRow[] = a.commentAssessments
    .flatMap(c => (c.accountSignals ? [c.accountSignals] : []))
    .map(x => ({ authorId: x.authorId, author: handleFor(graph, x.authorId), score: x.score, historyCount: x.historyCount, unknown: x.unknown, signals: x.signals.map(s => ({ ruleId: s.ruleId, evidence: s.evidence })), humanSignals: (x.humanSignals ?? []).map(s => ({ ruleId: s.ruleId, evidence: s.evidence })) }))
    // Highest scores first; accounts that look like ordinary users last.
    .sort((x, y) => Number(x.humanSignals.length > 0) - Number(y.humanSignals.length > 0) || (y.score ?? -1) - (x.score ?? -1));
  const accountByAuthor = new Map(accounts.map(x => [x.authorId, x]));
  return {
    synthetic: isSyntheticGraph(graph),
    post: { title: root.title ?? null, text: root.text, url: root.url, platform: root.platform, author: handleFor(graph, root.authorId), createdAt: root.createdAt },
    subject: a.subject.label,
    verdict: verdictFor(score, a.subject.kind === 'unknown' ? '' : a.subject.label),
    index: score === null ? null : { score, confidence: a.overallCoordinationRisk.confidence, explanation: a.overallCoordinationRisk.explanation },
    findings,
    axes: signals.map(x => ({ axis: x.axis, title: AXIS_TITLE[x.axis], score: x.score, explanation: x.explanation, evidence: evidenceFor(x.evidenceRefs) })),
    discussion: [...comments.values()].filter(c => c.contentStatus === 'visible' && c.text.trim()).map(c => ({ id: c.id, author: handleFor(graph, c.authorId), text: c.text, url: c.url, createdAt: c.createdAt, source: 'discussion' as const })),
    accounts,
    histories: enrichments.flatMap(j => (j.results ?? []).map(r => ({
      id: `${j.enrichmentId}:${r.authorId}`, author: handleFor(graph, r.authorId), status: r.status, account: accountByAuthor.get(r.authorId) ?? null,
      comments: r.comments.map(c => ({ id: c.id, author: handleFor(graph, c.authorId), text: c.text, url: c.url, createdAt: c.createdAt, source: 'history' as const })),
    }))),
    // Recommendations first, then by estimate, highest first.
    comments: rows.sort((x, y) => Number(y.isRecommendation) - Number(x.isRecommendation) || (y.estimate?.score ?? -1) - (x.estimate?.score ?? -1)),
    clusters: a.clusters.map(c => ({ id: c.clusterId, size: c.commentIds.length, explanation: c.explanation })),
    coverage: {
      collectedAt: graph.coverage.collectedAt ?? null,
      analyzed: a.sentiment.analyzedCommentCount,
      retrieved: graph.coverage.retrievedCommentCount,
      reported: graph.coverage.reportedCommentCount,
      completeness: graph.coverage.completeness,
      sentiment: a.sentiment.counts,
      histories,
    },
    limitations: Array.from(new Set([...a.limitations, ...a.sentiment.limitations])),
    inferenceVersion: a.inferenceVersion,
  };
}

export interface ThreadPreview {
  post: { title: string | null; text: string; platform: string; author: string | null };
  comments: { id: string; author: string | null; text: string; isReply: boolean }[];
  /** Visible comments not shown in the preview. */
  moreCount: number;
  collectedCount: number;
}

/**
 * The collected post and its first comments, shown while the analysis is still
 * running so the page is useful before the result arrives. Plain text only.
 */
export function buildThreadPreview(graph: GraphEnvelope, limit = 12): ThreadPreview {
  const root = graph.nodes.find(n => n.id === graph.rootId);
  if (!root || root.type !== 'discussion') throw new Error('Graph has no discussion root.');
  const visible = graph.nodes.filter((n): n is CommentNode => n.type === 'comment' && n.contentStatus === 'visible' && n.text.trim() !== '');
  return {
    post: { title: root.title ?? null, text: root.text, platform: root.platform, author: handleFor(graph, root.authorId) },
    comments: visible.slice(0, limit).map(c => ({ id: c.id, author: handleFor(graph, c.authorId), text: c.text, isReply: c.parentId !== null && c.parentId !== graph.rootId })),
    moreCount: Math.max(0, visible.length - limit),
    collectedCount: graph.coverage.retrievedCommentCount,
  };
}
