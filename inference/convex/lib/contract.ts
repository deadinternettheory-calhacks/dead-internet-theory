// TypeScript views of the v1 wire models used by this backend.
// The canonical definitions are contracts/models.schema.json and
// contracts/openapi.yaml; payloads are validated against that schema at runtime
// (see ./schema.ts). Keep these types aligned with it and do not add fields here
// that the schema does not define.

export const SCHEMA_VERSION = '1.0.0' as const;

export type Platform = 'reddit' | 'x' | 'youtube' | 'tiktok';
export type TimestampPrecision = 'exact' | 'estimated' | 'unknown';
export type Engagement = Record<string, number | undefined>;

export interface AuthorProfile {
  accountCreatedAt?: string;
  postKarma?: number;
  commentKarma?: number;
  fetchedAt?: string;
}

export interface DiscussionNode {
  id: string;
  type: 'discussion';
  nativeId: string;
  platform: Platform;
  kind: 'post' | 'tweet' | 'video';
  url: string;
  title?: string | null;
  text: string;
  contentScope: 'post_text' | 'metadata_text_only' | 'unknown';
  authorId: string | null;
  createdAt: string | null;
  timestampPrecision: TimestampPrecision;
  metrics: Engagement;
}

export interface AuthorNode {
  id: string;
  type: 'author';
  nativeId: string | null;
  platform: Platform;
  handle: string | null;
  displayName: string | null;
  identityQuality: 'provider_id' | 'handle' | 'synthetic';
  profile?: AuthorProfile;
}

export interface CommentNode {
  id: string;
  type: 'comment';
  nativeId: string | null;
  idQuality: 'provider_id' | 'synthetic';
  platform: Platform;
  authorId: string | null;
  parentId: string | null;
  nativeParentId: string | null;
  text: string;
  createdAt: string | null;
  timestampPrecision: TimestampPrecision;
  sourceTimestamp: string | null;
  url: string | null;
  metrics: Engagement;
  contentStatus: 'visible' | 'deleted' | 'removed' | 'unknown';
}

export type GraphNode = DiscussionNode | AuthorNode | CommentNode;

export interface GraphEdge {
  from: string;
  to: string;
  type: 'REPLIES_TO' | 'AUTHORED';
}

export interface ActorRun {
  actorId: string;
  runId: string;
  datasetId: string;
  status: 'SUCCEEDED' | 'FAILED' | 'ABORTED' | 'TIMED-OUT' | 'PARTIAL' | 'UNKNOWN';
  startedAt: string | null;
  completedAt: string | null;
}

export interface Coverage {
  retrievedCommentCount: number;
  reportedCommentCount: number | null;
  truncated: boolean | null;
  completeness: 'complete' | 'partial' | 'unknown';
  sortOrder: string;
  collectedAt: string;
  sourceSnapshotRef: string;
  actorRuns: ActorRun[];
  limitations: string[];
}

export interface GraphEnvelope {
  schemaVersion: typeof SCHEMA_VERSION;
  investigationId: string;
  graphRevision: number;
  graphFingerprint: string;
  platform: Platform;
  rootId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  coverage: Coverage;
}

export interface ErrorDetail {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export type IngestionStatus = 'queued' | 'running' | 'completed' | 'failed';
export type AnalysisStatus = 'waiting_for_graph' | 'queued' | 'running' | 'completed' | 'failed';

export interface InvestigationResource {
  schemaVersion: typeof SCHEMA_VERSION;
  investigationId: string;
  sourceUrl: string;
  platform: Platform;
  ingestionStatus: IngestionStatus;
  analysisStatus: AnalysisStatus;
  graphRevision: number | null;
  graphFingerprint: string | null;
  createdAt: string;
  updatedAt: string;
  error?: ErrorDetail;
}

export interface AuthorAnchor {
  authorId: string;
  anchorCommentId: string;
}

export interface EnrichmentRequest {
  authors: AuthorAnchor[];
  limit: 10;
  windowDays: number;
  fallback: 'most_recent';
}

export interface HistoryComment {
  id: string;
  nativeId: string | null;
  authorId: string;
  text: string;
  createdAt: string | null;
  timestampPrecision: TimestampPrecision;
  url: string | null;
  sourceDiscussionNativeId: string | null;
  metrics: Engagement;
}

export interface HistoryCoverage {
  requestedCount: 10;
  returnedCount: number;
  candidateFetchedCount: number;
  providerTruncated: boolean | null;
  reachedAnchorWindow: boolean | null;
  oldestFetchedAt: string | null;
  newestFetchedAt: string | null;
  collectedAt: string | null;
  sourceSnapshotRef: string | null;
  actorRunIds: string[];
  limitations: string[];
}

export type HistoryStatus = 'complete' | 'partial' | 'unavailable' | 'unsupported' | 'failed';

export interface HistoryResult {
  authorId: string;
  anchorCommentId: string;
  status: HistoryStatus;
  strategy: 'temporal_nearest' | 'recent_fallback' | 'none';
  comments: HistoryComment[];
  profile?: AuthorProfile;
  coverage: HistoryCoverage;
  error?: ErrorDetail;
}

export interface EnrichmentJob {
  schemaVersion: typeof SCHEMA_VERSION;
  enrichmentId: string;
  investigationId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  results?: HistoryResult[];
  error?: ErrorDetail;
}

export type Stance = 'supportive' | 'critical' | 'neutral' | 'mixed' | 'unclear';
export type AxisName =
  | 'promotional_intent'
  | 'semantic_coordination'
  | 'temporal_coordination'
  | 'account_anomalies'
  | 'engagement_anomalies'
  | 'disclosure_concerns';

export interface Subject {
  label: string;
  kind: 'product' | 'service' | 'idea' | 'brand' | 'other' | 'unknown';
  confidence: number;
  evidenceRefs: string[];
}

export interface SentimentDistribution {
  population: 'retrieved_comments' | 'analyzed_sample';
  method: 'census_of_retrieved' | 'probability_sample' | 'nonprobability_sample';
  analyzedCommentCount: number;
  counts: Record<Stance, number>;
  weighted: boolean;
  limitations: string[];
}

export interface Score {
  score: number | null;
  confidence: number | null;
  explanation: string;
  evidenceRefs: string[];
}

export interface AxisAssessment extends Score {
  axis: AxisName;
  assessedCommentCount: number;
}

/** Automation-signal index for a sampled author (optional, rubric family B). Not a probability. */
export interface AccountSignals {
  authorId: string;
  score: number | null;
  historyCount: number;
  signals: { ruleId: string; points: number; evidence: string; evidenceRefs: string[] }[];
  /** Evidence of an ordinary human user; when present, signals is empty and score is 0. */
  humanSignals?: { ruleId: string; evidence: string; evidenceRefs: string[] }[];
  unknown: string[];
}

export interface CommentAssessment {
  commentId: string;
  stance: Stance;
  promotionalIntentScore: number | null;
  rationale: string;
  evidenceRefs: string[];
  accountSignals?: AccountSignals;
}

export interface ClusterAssessment {
  clusterId: string;
  commentIds: string[];
  coordinationScore: number | null;
  explanation: string;
  evidenceRefs: string[];
}

export interface InferredEdge {
  from: string;
  to: string;
  type: 'SEMANTICALLY_SIMILAR' | 'POTENTIALLY_COORDINATED';
  strength: number;
  explanation: string;
  evidenceRefs: string[];
}

export interface AnalysisSubmission {
  schemaVersion: typeof SCHEMA_VERSION;
  graphRevision: number;
  graphFingerprint: string;
  inferenceVersion: string;
  inferredAt: string;
  subject: Subject;
  sentiment: SentimentDistribution;
  overallCoordinationRisk: Score;
  axes: AxisAssessment[];
  commentAssessments: CommentAssessment[];
  clusters: ClusterAssessment[];
  inferredEdges: InferredEdge[];
  usedEnrichmentIds: string[];
  limitations: string[];
}

export interface AnalysisResource {
  schemaVersion: typeof SCHEMA_VERSION;
  analysisId: string;
  investigationId: string;
  storedAt: string;
  result: AnalysisSubmission;
}

export interface AnalysisReceipt {
  schemaVersion: typeof SCHEMA_VERSION;
  analysisId: string;
  investigationId: string;
  storedAt: string;
}

export interface InvestigationReadyEvent {
  eventVersion: '1.0.0';
  eventId: string;
  eventType: 'investigation.ready';
  investigationId: string;
  graphRevision: number;
  graphFingerprint: string;
  occurredAt: string;
}

export function isComment(node: GraphNode): node is CommentNode {
  return node.type === 'comment';
}
export function isAuthor(node: GraphNode): node is AuthorNode {
  return node.type === 'author';
}
export function isDiscussion(node: GraphNode): node is DiscussionNode {
  return node.type === 'discussion';
}
