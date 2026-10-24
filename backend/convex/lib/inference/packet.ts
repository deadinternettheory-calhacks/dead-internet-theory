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

function packetComments(index: GraphIndex, maxChars: number, maxComments: number): PacketComment[] {
  return index.comments.slice(0, maxComments).map(c => ({
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
  measurements: {
    recommendationTimeline: { commentId: string; authorHandle: string | null; minutesAfterRoot: number | null }[];
    largestRecommendationBurst30m: { commentIds: string[]; windowMinutes: number };
    similarPairs: { a: string; b: string; wordOverlap: number }[];
    links: { commentId: string; domains: string[]; trackingParams: string[]; shortened: boolean; discountCode: boolean; linkInBio: boolean }[];
  };
  authors: AuthorEvidence[];
  evidenceLevels: { discussion: true; authorHistory: boolean; coRecommenderHistory: boolean; note: string };
}

export function historyResults(job: EnrichmentJob | null): HistoryResult[] {
  return job && job.status === 'completed' ? job.results ?? [] : [];
}

export function buildScoringPacket(graph: GraphEnvelope, triage: TriageOutput, job: EnrichmentJob | null): ScoringPacket {
  const index = new GraphIndex(graph);
  const triageById = new Map(triage.comments.map(c => [c.commentId, c]));
  const label = triage.subject.label;
  const results = historyResults(job);
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
  const { packet } = fit((chars, count) => ({
    stage: 'scoring' as const,
    platform: graph.platform,
    subject: triage.subject,
    root: rootSummary(index),
    comments: packetComments(index, chars, count).map(c => ({
      ...c,
      stance: triageById.get(c.id)?.stance ?? 'unclear',
      recommendsProduct: triageById.get(c.id)?.recommendsProduct ?? null,
      recommendsSubject: triageById.get(c.id)?.recommendsSubject ?? false,
    })),
    targets,
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
