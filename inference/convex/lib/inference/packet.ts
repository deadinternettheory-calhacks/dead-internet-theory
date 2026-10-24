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
  /** For replies: the comment being answered, so stance can be read in context. */
  replyTo?: { authorHandle: string | null; excerpt: string };
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
    ...(c.parentId && c.parentId !== index.root.id && index.comment(c.parentId)
      ? { replyTo: { authorHandle: index.handle(index.comment(c.parentId)!.authorId), excerpt: clip(index.comment(c.parentId)!.text, Math.min(240, maxChars)) } }
      : {}),
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

/** Users sampled per group (supportive, unsupportive) for history requests. */
export const HISTORY_SAMPLE_PER_GROUP = 6;

export interface HistorySample {
  pairs: AuthorAnchor[];
  supportive: { population: number; sampled: string[] };
  unsupportive: { population: number; sampled: string[] };
  /** The post author, added because seeding rules (T2, C5) need their history. */
  rootAuthorIncluded: boolean;
}

/** FNV-1a hash and mulberry32 PRNG: a reproducible random sequence from a seed string. */
function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: T[], n: number, random: () => number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/**
 * Randomly picks which users' comment histories to request, instead of
 * requesting everyone's. Users are split into two groups from triage:
 * supportive (any supportive comment, or any product recommendation, which
 * covers "what should I buy?" threads where the subject is a category) and
 * unsupportive (critical or mixed; users who recommend nothing fill the group
 * if there are too few). Up to `perGroup` users are drawn from each group with a seeded
 * shuffle, so the same graph always gives the same sample. The unsupportive
 * group is a baseline for the supportive group's histories. Each user's anchor
 * is their first comment matching the group.
 */
export function sampleHistoryAuthors(graph: GraphEnvelope, triage: TriageOutput, perGroup = HISTORY_SAMPLE_PER_GROUP): HistorySample {
  const empty: HistorySample = { pairs: [], supportive: { population: 0, sampled: [] }, unsupportive: { population: 0, sampled: [] }, rootAuthorIncluded: false };
  if (!HISTORY_PLATFORMS.includes(graph.platform)) return empty;
  const index = new GraphIndex(graph);
  const byId = new Map(triage.comments.map(c => [c.commentId, c]));
  const supportiveAnchor = new Map<string, string>();
  const unsupportiveAnchor = new Map<string, string>();
  const neutralAnchor = new Map<string, string>();
  for (const c of index.comments) {
    const t = byId.get(c.id);
    if (!t || !c.authorId || c.contentStatus !== 'visible' || c.authorId === index.root.authorId) continue;
    if (t.stance === 'supportive' || t.recommendsSubject || t.recommendsProduct) {
      if (!supportiveAnchor.has(c.authorId)) supportiveAnchor.set(c.authorId, c.id);
    } else if (t.stance === 'critical' || t.stance === 'mixed') {
      if (!unsupportiveAnchor.has(c.authorId)) unsupportiveAnchor.set(c.authorId, c.id);
    } else if (!neutralAnchor.has(c.authorId)) neutralAnchor.set(c.authorId, c.id);
  }
  // Someone with any supportive comment counts as supportive only.
  for (const a of supportiveAnchor.keys()) {
    unsupportiveAnchor.delete(a);
    neutralAnchor.delete(a);
  }
  for (const a of unsupportiveAnchor.keys()) neutralAnchor.delete(a);

  const random = seededRandom(`${graph.investigationId}:${graph.graphRevision}`);
  const sorted = (m: Map<string, string>) => Array.from(m.keys()).sort();
  const supportive = pick(sorted(supportiveAnchor), perGroup, random);
  let unsupportive = pick(sorted(unsupportiveAnchor), perGroup, random);
  const fill = pick(sorted(neutralAnchor), Math.max(0, perGroup - unsupportive.length), random);
  unsupportive = [...unsupportive, ...fill];

  const pairs: AuthorAnchor[] = [
    ...supportive.map(authorId => ({ authorId, anchorCommentId: supportiveAnchor.get(authorId)! })),
    ...unsupportive.map(authorId => ({ authorId, anchorCommentId: unsupportiveAnchor.get(authorId) ?? neutralAnchor.get(authorId)! })),
  ];
  const rootComment = index.root.authorId ? index.comments.find(c => c.authorId === index.root.authorId && c.contentStatus === 'visible') : undefined;
  if (rootComment && pairs.length < MAX_ENRICHMENT_PAIRS) pairs.push({ authorId: rootComment.authorId!, anchorCommentId: rootComment.id });
  return {
    pairs: pairs.slice(0, MAX_ENRICHMENT_PAIRS),
    supportive: { population: supportiveAnchor.size, sampled: supportive },
    unsupportive: { population: unsupportiveAnchor.size + (fill.length ? neutralAnchor.size : 0), sampled: unsupportive },
    rootAuthorIncluded: !!rootComment,
  };
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
  comments: (PacketComment & { stance: string; aboutProduct: string | null; recommendsProduct: string | null; recommendsSubject: boolean })[];
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
  // Every sampled user with a history, so account signals can be judged for both groups.
  for (const r of results) if (r.comments.length && !authorIds.includes(r.authorId)) authorIds.push(r.authorId);
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
      aboutProduct: triageById.get(c.id)?.aboutProduct ?? null,
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
