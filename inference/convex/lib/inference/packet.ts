// Builds the bounded evidence packets sent to the CREAO agent and selects which
// authors to enrich. Everything in a packet comes from the graph, the
// enrichment job, or deterministic measurements over them.
import type {
  AuthorAnchor,
  AuthorNode,
  CommentNode,
  DiscussionNode,
  EnrichmentJob,
  GraphEnvelope,
  HistoryResult,
  Platform,
} from '../contract';
import { isAuthor, isComment, isDiscussion } from '../contract';
import {
  communityFromUrl,
  daysBetween,
  largestBurst,
  linkFacts,
  mentions,
  minutesBetween,
  round2,
  wordJaccard,
} from './features';
import type { TriageOutput } from './outputs';

/** CREAO caps serialized run input at 256 KB; leave room for instructions. */
export const MAX_EVIDENCE_BYTES = 180_000;
export const MAX_ENRICHMENT_PAIRS = 25;
export const HISTORY_PLATFORMS: Platform[] = ['reddit', 'x'];

export class GraphIndex {
  readonly root: DiscussionNode;
  readonly comments: CommentNode[];
  readonly authors = new Map<string, AuthorNode>();
  readonly nodes = new Map<string, GraphEnvelope['nodes'][number]>();

  constructor(readonly graph: GraphEnvelope) {
    for (const node of graph.nodes) {
      this.nodes.set(node.id, node);
      if (isAuthor(node)) this.authors.set(node.id, node);
    }
    const root = graph.nodes.find(isDiscussion);
    if (!root) throw new Error('Graph has no discussion root.');
    this.root = root;
    this.comments = graph.nodes
      .filter(isComment)
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id));
  }

  comment(id: string): CommentNode | undefined {
    const node = this.nodes.get(id);
    return node && isComment(node) ? node : undefined;
  }

  handle(authorId: string | null): string | null {
    if (!authorId) return null;
    return this.authors.get(authorId)?.handle ?? null;
  }
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…[truncated]`;
}

export interface PacketComment {
  id: string;
  authorId: string | null;
  authorHandle: string | null;
  parentId: string | null;
  createdAt: string | null;
  minutesAfterRoot: number | null;
  contentStatus: CommentNode['contentStatus'];
  metrics: CommentNode['metrics'];
  text: string;
}

function packetComments(index: GraphIndex, maxChars: number, maxComments: number, only?: ReadonlySet<string>): PacketComment[] {
  const source = only ? index.comments.filter(c => only.has(c.id)) : index.comments;
  return source.slice(0, maxComments).map(c => ({
    id: c.id,
    authorId: c.authorId,
    authorHandle: index.handle(c.authorId),
    parentId: c.parentId,
    createdAt: c.createdAt,
    minutesAfterRoot: minutesBetween(index.root.createdAt, c.createdAt),
    contentStatus: c.contentStatus,
    metrics: c.metrics,
    text: clip(c.text, maxChars),
  }));
}

function rootSummary(index: GraphIndex) {
  const r = index.root;
  return {
    id: r.id,
    kind: r.kind,
    title: r.title ?? null,
    text: clip(r.text, 4000),
    authorId: r.authorId,
    authorHandle: index.handle(r.authorId),
    createdAt: r.createdAt,
    metrics: r.metrics,
  };
}

/** Shrinks comment text, then comment count, until the packet fits. */
function fit<T>(build: (maxChars: number, maxComments: number) => T): { packet: T; analyzedAll: boolean; maxComments: number } {
  const attempts: [number, number][] = [[1500, 400], [800, 400], [500, 300], [400, 200], [300, 120]];
  for (const [chars, count] of attempts) {
    const packet = build(chars, count);
    if (new TextEncoder().encode(JSON.stringify(packet)).length <= MAX_EVIDENCE_BYTES) {
      return { packet, analyzedAll: true, maxComments: count };
    }
  }
  const [chars, count] = attempts[attempts.length - 1];
  return { packet: build(chars, count), analyzedAll: false, maxComments: count };
}

export interface TriagePacket {
  stage: 'triage';
  platform: Platform;
  root: ReturnType<typeof rootSummary>;
  comments: PacketComment[];
  coverage: { retrievedCommentCount: number; includedCommentCount: number; completeness: string };
}

export function buildTriagePacket(graph: GraphEnvelope): { packet: TriagePacket; analyzedCommentIds: string[] } {
  const index = new GraphIndex(graph);
  const { packet } = fit((chars, count) => {
    const comments = packetComments(index, chars, count);
    return {
      stage: 'triage' as const,
      platform: graph.platform,
      root: rootSummary(index),
      comments,
      coverage: {
        retrievedCommentCount: graph.coverage.retrievedCommentCount,
        includedCommentCount: comments.length,
        completeness: graph.coverage.completeness,
      },
    };
  });
  return { packet, analyzedCommentIds: packet.comments.map(c => c.id) };
}

/**
 * Rubric step 4: request histories for the subject's recommenders (the
 * co-recommenders), plus any other product recommenders, one anchor per author.
 * The root author is included only if they commented, because the contract
 * requires an anchor comment written by that author.
 */
export function selectEnrichmentPairs(graph: GraphEnvelope, triage: TriageOutput): AuthorAnchor[] {
  if (!HISTORY_PLATFORMS.includes(graph.platform)) return [];
  const index = new GraphIndex(graph);
  const byId = new Map(triage.comments.map(c => [c.commentId, c]));
  const picked = new Map<string, string>();
  const consider = (predicate: (commentId: string) => boolean) => {
    for (const c of index.comments) {
      if (picked.size >= MAX_ENRICHMENT_PAIRS) return;
      if (!c.authorId || picked.has(c.authorId) || c.contentStatus !== 'visible') continue;
      if (predicate(c.id)) picked.set(c.authorId, c.id);
    }
  };
  consider(id => byId.get(id)?.recommendsSubject === true);
  consider(id => !!byId.get(id)?.recommendsProduct);
  if (index.root.authorId) consider(id => index.comment(id)?.authorId === index.root.authorId);
  return Array.from(picked, ([authorId, anchorCommentId]) => ({ authorId, anchorCommentId }));
}

export interface AuthorEvidence {
  authorId: string;
  handle: string | null;
  anchorCommentId: string | null;
  historyStatus: HistoryResult['status'] | 'not_requested';
  strategy: HistoryResult['strategy'] | null;
  historyCount: number;
  profile: HistoryResult['profile'] | null;
  accountAgeDaysAtAnchor: number | null;
  subjectMentionCount: number;
  communities: string[];
  history: { id: string; createdAt: string | null; community: string | null; mentionsSubject: boolean; text: string }[];
  limitations: string[];
}

export interface ScoringPacket {
  stage: 'scoring';
  platform: Platform;
  subject: TriageOutput['subject'];
  root: ReturnType<typeof rootSummary>;
  comments: (PacketComment & { stance: string; recommendsProduct: string | null; recommendsSubject: boolean })[];
  targets: string[];
  /** Retrieved comments left out of this packet (not recommendations or their context). */
  omittedCommentCount: number;
  measurements: {
    recommendationTimeline: { commentId: string; authorHandle: string | null; minutesAfterRoot: number | null }[];
    largestRecommendationBurst30m: { commentIds: string[]; windowMinutes: number };
    similarPairs: { a: string; b: string; wordOverlap: number }[];
    links: { commentId: string; domains: string[]; trackingParams: string[]; shortened: boolean; discountCode: boolean; linkInBio: boolean }[];
  };
  authors: AuthorEvidence[];
  evidenceLevels: { discussion: true; authorHistory: boolean; coRecommenderHistory: boolean; note: string };
}

/** Results from every completed job; the first result per author wins. */
export function historyResults(jobs: EnrichmentJob[]): HistoryResult[] {
  const byAuthor = new Map<string, HistoryResult>();
  for (const job of jobs) {
    if (job.status !== 'completed') continue;
    for (const r of job.results ?? []) if (!byAuthor.has(r.authorId)) byAuthor.set(r.authorId, r);
  }
  return Array.from(byAuthor.values());
}

export const MAX_SPECULATIVE_PAIRS = 10;
const QUESTION = /\?\s*$/;

/**
 * Picks likely recommenders without a model so their histories can be requested
 * while triage runs. Signals: tracking links or codes, near-duplicate wording
 * shared with another author, a capitalized term (likely a product name) used by
 * several authors, and top-level answers. Questions are skipped. Triage later
 * adds any recommender this misses with a second request.
 */
export function speculativeEnrichmentPairs(graph: GraphEnvelope, max = MAX_SPECULATIVE_PAIRS): AuthorAnchor[] {
  if (!HISTORY_PLATFORMS.includes(graph.platform)) return [];
  const index = new GraphIndex(graph);
  const comments = index.comments.filter(c => c.authorId && c.contentStatus === 'visible' && c.text.trim() && !QUESTION.test(c.text));
  const terms = (text: string) =>
    new Set(Array.from(text.matchAll(/(?<![.!?]\s)(?<!^)\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z0-9][a-zA-Z0-9]*)*)\b/g), m => m[1].toLowerCase()));
  const termAuthors = new Map<string, Set<string>>();
  for (const c of comments) for (const t of terms(c.text)) {
    if (!termAuthors.has(t)) termAuthors.set(t, new Set());
    termAuthors.get(t)!.add(c.authorId!);
  }
  const scored = comments.map(c => {
    let score = 0;
    const links = linkFacts(c.text);
    if (links.trackingParams.length || links.shortened || links.discountCode || links.linkInBio) score += 3;
    if (comments.some(o => o.authorId !== c.authorId && wordJaccard(o.text, c.text) >= 0.3)) score += 3;
    if (Array.from(terms(c.text)).some(t => (termAuthors.get(t)?.size ?? 0) >= 2)) score += 2;
    if (c.parentId === graph.rootId) score += 1;
    return { c, score };
  });
  const best = new Map<string, { anchor: string; score: number; at: string }>();
  for (const { c, score } of scored) {
    if (score < 2) continue;
    const prev = best.get(c.authorId!);
    if (!prev || score > prev.score) best.set(c.authorId!, { anchor: c.id, score, at: c.createdAt ?? '' });
  }
  return Array.from(best, ([authorId, v]) => ({ authorId, anchorCommentId: v.anchor, score: v.score, at: v.at }))
    .sort((a, b) => b.score - a.score || a.at.localeCompare(b.at))
    .slice(0, max)
    .map(({ authorId, anchorCommentId }) => ({ authorId, anchorCommentId }));
}

/** Comments the scoring stage needs: recommendations, their parents, replies to them, and the most-engaged others. */
export function scoringContext(index: GraphIndex, targets: ReadonlySet<string>, extra = 15): Set<string> {
  const keep = new Set<string>(targets);
  const targetAuthors = new Set(index.comments.filter(c => targets.has(c.id)).map(c => c.authorId));
  for (const c of index.comments) {
    if (targets.has(c.id) && c.parentId && index.comment(c.parentId)) keep.add(c.parentId);
    if (c.parentId && targets.has(c.parentId)) keep.add(c.id);
    if (c.authorId && targetAuthors.has(c.authorId)) keep.add(c.id);
  }
  const engagement = (c: CommentNode) => c.metrics.score ?? c.metrics.likeCount ?? 0;
  index.comments
    .filter(c => !keep.has(c.id))
    .sort((a, b) => engagement(b) - engagement(a))
    .slice(0, extra)
    .forEach(c => keep.add(c.id));
  return keep;
}

export function buildScoringPacket(graph: GraphEnvelope, triage: TriageOutput, jobs: EnrichmentJob[]): ScoringPacket {
  const index = new GraphIndex(graph);
  const triageById = new Map(triage.comments.map(c => [c.commentId, c]));
  const label = triage.subject.label;
  const results = historyResults(jobs);
  const resultByAuthor = new Map(results.map(r => [r.authorId, r]));
  const targets = index.comments.filter(c => triageById.get(c.id)?.recommendsProduct).map(c => c.id);
  const subjectRecs = index.comments.filter(c => triageById.get(c.id)?.recommendsSubject);

  const timeline = subjectRecs.map(c => ({
    commentId: c.id,
    authorHandle: index.handle(c.authorId),
    minutesAfterRoot: minutesBetween(index.root.createdAt, c.createdAt),
  }));
  const similarPairs: ScoringPacket['measurements']['similarPairs'] = [];
  const recTargets = index.comments.filter(c => targets.includes(c.id));
  for (let i = 0; i < recTargets.length; i++) {
    for (let j = i + 1; j < recTargets.length; j++) {
      const overlap = round2(wordJaccard(recTargets[i].text, recTargets[j].text));
      if (overlap >= 0.2) similarPairs.push({ a: recTargets[i].id, b: recTargets[j].id, wordOverlap: overlap });
    }
  }
  similarPairs.sort((x, y) => y.wordOverlap - x.wordOverlap);

  const authorIds = Array.from(new Set(recTargets.map(c => c.authorId).filter((a): a is string => !!a)));
  if (index.root.authorId && !authorIds.includes(index.root.authorId)) authorIds.push(index.root.authorId);
  const authors: AuthorEvidence[] = authorIds.map(authorId => {
    const result = resultByAuthor.get(authorId);
    const anchor = result ? index.comment(result.anchorCommentId) : undefined;
    const history = (result?.comments ?? []).map(h => ({
      id: h.id,
      createdAt: h.createdAt,
      community: communityFromUrl(h.url),
      mentionsSubject: mentions(h.text, label),
      text: h.text.length > 600 ? `${h.text.slice(0, 600)}…[truncated]` : h.text,
    }));
    const profile = result?.profile ?? index.authors.get(authorId)?.profile ?? null;
    const limitations = [...(result?.coverage.limitations ?? [])];
    if (!result) limitations.push(authorId === index.root.authorId && !anchor ? 'Root author has no comment in this discussion to anchor a history request.' : 'History was not requested or not available.');
    return {
      authorId,
      handle: index.handle(authorId),
      anchorCommentId: result?.anchorCommentId ?? null,
      historyStatus: result?.status ?? 'not_requested',
      strategy: result?.strategy ?? null,
      historyCount: history.length,
      profile,
      accountAgeDaysAtAnchor: daysBetween(profile?.accountCreatedAt, anchor?.createdAt ?? index.root.createdAt),
      subjectMentionCount: history.filter(h => h.mentionsSubject).length,
      communities: Array.from(new Set(history.map(h => h.community).filter((c): c is string => !!c))),
      history,
      limitations,
    };
  });

  const withHistory = authors.filter(a => a.historyCount > 0);
  // Only recommendations and their surroundings are sent; measurements above still use every comment.
  const context = scoringContext(index, new Set(targets));
  const { packet } = fit((chars, count) => ({
    stage: 'scoring' as const,
    platform: graph.platform,
    subject: triage.subject,
    root: rootSummary(index),
    comments: packetComments(index, chars, count, context).map(c => ({
      ...c,
      stance: triageById.get(c.id)?.stance ?? 'unclear',
      recommendsProduct: triageById.get(c.id)?.recommendsProduct ?? null,
      recommendsSubject: triageById.get(c.id)?.recommendsSubject ?? false,
    })),
    targets,
    omittedCommentCount: index.comments.length - context.size,
    measurements: {
      recommendationTimeline: timeline,
      largestRecommendationBurst30m: largestBurst(subjectRecs, 30),
      similarPairs: similarPairs.slice(0, 50),
      links: recTargets.map(c => ({ commentId: c.id, ...linkFacts(c.text) })),
    },
    authors,
    evidenceLevels: {
      discussion: true as const,
      authorHistory: withHistory.length > 0,
      coRecommenderHistory: withHistory.length > 1,
      note: HISTORY_PLATFORMS.includes(graph.platform)
        ? 'Rules needing history (levels A and C) are unknown for authors without history.'
        : 'Commenter history is not modelled on this platform; every level A or C rule is unknown.',
    },
  }));
  return packet;
}
