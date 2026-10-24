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

export interface Finding {
  axis: AxisName;
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
}

export interface Report {
  synthetic: boolean;
  post: { title: string | null; text: string; url: string; platform: string; author: string | null; createdAt: string | null };
  subject: string;
  verdict: { label: string; description: string; tone: Tone };
  index: { score: number; confidence: number | null; explanation: string } | null;
  findings: Finding[];
  axes: { axis: AxisName; title: string; score: number | null; explanation: string; evidence: EvidenceItem[] }[];
  discussion: EvidenceItem[];
  histories: { id: string; author: string | null; status: string; comments: EvidenceItem[] }[];
  comments: CommentRow[];
  clusters: { id: string; size: number; explanation: string }[];
  coverage: { analyzed: number; retrieved: number; reported: number | null; completeness: string; sentiment: Record<Stance, number>; histories: string | null };
  limitations: string[];
  inferenceVersion: string;
}

const FINDING_COPY: Record<Exclude<AxisName, 'disclosure_concerns'>, { title: string; description: string }> = {
  semantic_coordination: { title: 'Accounts used nearly identical wording', description: 'Several accounts recommended the product with almost the same words or details.' },
  temporal_coordination: { title: 'Recommendations arrived close together', description: 'Recommendations came in a tight burst compared with the rest of the discussion.' },
  engagement_anomalies: { title: 'Accounts backed each other up', description: 'Accounts recommending the product replied to, agreed with or defended each other.' },
  account_anomalies: { title: 'Some accounts showed unusual patterns', description: 'Some recommending accounts had unusual account traits, such as being very new.' },
  promotional_intent: { title: 'Recommendations read like promotion', description: 'The recommendations use marketing-style language, or the accounts mention the brand often elsewhere.' },
};

const AXIS_TITLE: Record<AxisName, string> = {
  semantic_coordination: 'Similar wording',
  temporal_coordination: 'Timing',
  engagement_anomalies: 'Accounts backing each other',
  account_anomalies: 'Account patterns',
  promotional_intent: 'Promotional language',
  disclosure_concerns: 'Disclosure',
};

/** Cutoffs follow the rubric's tiers (rubrics/product-astroturfing.md section 7), which are uncalibrated. */
export function verdictFor(score: number | null, subject: string): Report['verdict'] {
  const about = subject ? ` about ${subject}` : '';
  if (score === null) return { tone: 'neutral', label: 'We couldn’t measure coordinated promotion here.', description: `There was not enough evidence${about} to apply our checks.` };
  if (score >= 55) return { tone: 'high', label: 'We found several signs of possible coordinated promotion.', description: `Some recommendations${about} show patterns that often appear in coordinated campaigns. These are signals worth a closer look, not proof.` };
  if (score >= 35) return { tone: 'medium', label: 'We found some signals worth a closer look.', description: `A few patterns in the recommendations${about} stood out. They have innocent explanations too.` };
  return { tone: 'low', label: 'We found few signs of coordinated promotion.', description: `The recommendations${about} did not show strong coordination signals. This is not a guarantee that every comment is genuine.` };
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

  const ranked = a.axes
    .filter((x): x is AxisAssessment & { axis: Exclude<AxisName, 'disclosure_concerns'> } => x.axis !== 'disclosure_concerns' && x.score !== null && x.score > 0)
    .sort((x, y) => (y.score ?? 0) - (x.score ?? 0));
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

  const recommendationIds = new Set(a.commentAssessments.filter(c => c.promotionalIntentScore !== null).map(c => c.commentId));
  const rows: CommentRow[] = a.commentAssessments.flatMap(c => {
    const node = comments.get(c.commentId);
    if (!node) return [];
    return [{
      id: node.id, author: handleFor(graph, node.authorId), text: node.text, url: node.url, createdAt: node.createdAt, source: 'discussion' as const,
      stance: c.stance, rationale: c.rationale, isRecommendation: recommendationIds.has(c.commentId),
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
  return {
    synthetic: isSyntheticGraph(graph),
    post: { title: root.title ?? null, text: root.text, url: root.url, platform: root.platform, author: handleFor(graph, root.authorId), createdAt: root.createdAt },
    subject: a.subject.label,
    verdict: verdictFor(score, a.subject.kind === 'unknown' ? '' : a.subject.label),
    index: score === null ? null : { score, confidence: a.overallCoordinationRisk.confidence, explanation: a.overallCoordinationRisk.explanation },
    findings,
    axes: a.axes.map(x => ({ axis: x.axis, title: AXIS_TITLE[x.axis], score: x.score, explanation: x.explanation, evidence: evidenceFor(x.evidenceRefs) })),
    discussion: [...comments.values()].filter(c => c.contentStatus === 'visible' && c.text.trim()).map(c => ({ id: c.id, author: handleFor(graph, c.authorId), text: c.text, url: c.url, createdAt: c.createdAt, source: 'discussion' as const })),
    histories: enrichments.flatMap(j => (j.results ?? []).map(r => ({
      id: `${j.enrichmentId}:${r.authorId}`, author: handleFor(graph, r.authorId), status: r.status,
      comments: r.comments.map(c => ({ id: c.id, author: handleFor(graph, c.authorId), text: c.text, url: c.url, createdAt: c.createdAt, source: 'history' as const })),
    }))),
    comments: rows.sort((x, y) => Number(y.isRecommendation) - Number(x.isRecommendation)),
    clusters: a.clusters.map(c => ({ id: c.clusterId, size: c.commentIds.length, explanation: c.explanation })),
    coverage: {
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
