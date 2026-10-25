// Read-only views of the v1 response models this frontend renders. The
// canonical definitions are contracts/models.schema.json; these types cover
// only the fields the UI reads. Unknown optional fields are ignored.

export type Platform = 'reddit' | 'x' | 'youtube' | 'tiktok';
/** Read-only subset of CapabilityResponse, including its backend availability extensions. */
export interface CapabilityResponse {
  platforms: { platform: Platform; actorRuntimeVerified: boolean; liveEnabled?: boolean; demoLimited?: boolean }[];
}
export type Stance = 'supportive' | 'critical' | 'neutral' | 'mixed' | 'unclear';
export type AxisName = 'promotional_intent' | 'semantic_coordination' | 'temporal_coordination' | 'account_anomalies' | 'engagement_anomalies' | 'disclosure_concerns';

/** Optional automation-signal index for a sampled author (rubric family B); not a probability. */
export interface AccountSignals {
  authorId: string;
  score: number | null;
  historyCount: number;
  signals: { ruleId: string; points: number; evidence: string; evidenceRefs: string[] }[];
  /** Evidence of an ordinary human user; when present there are no signals and the score is 0. */
  humanSignals?: { ruleId: string; evidence: string; evidenceRefs: string[] }[];
  unknown: string[];
}

export interface ErrorDetail { code: string; message: string; retryable: boolean }
export interface ApiErrorBody { error: ErrorDetail & { requestId: string } }

export interface InvestigationResource {
  investigationId: string;
  sourceUrl: string;
  platform: Platform;
  ingestionStatus: 'queued' | 'running' | 'completed' | 'failed';
  analysisStatus: 'waiting_for_graph' | 'queued' | 'running' | 'completed' | 'failed';
  graphRevision: number | null;
  graphFingerprint?: string | null;
  error?: ErrorDetail;
}

export interface DiscussionNode {
  id: string; type: 'discussion'; platform: Platform; kind: 'post' | 'tweet' | 'video';
  url: string; title?: string | null; text: string; authorId: string | null; createdAt: string | null;
  metrics: Record<string, number>;
}
export interface AuthorNode { id: string; type: 'author'; handle: string | null; displayName: string | null }
export interface CommentNode {
  id: string; type: 'comment'; authorId: string | null; parentId: string | null; text: string;
  createdAt: string | null; url: string | null; metrics: Record<string, number>;
  contentStatus: 'visible' | 'deleted' | 'removed' | 'unknown';
}
export type GraphNode = DiscussionNode | AuthorNode | CommentNode;

export interface GraphEnvelope {
  investigationId: string;
  /** Canonical identity fields used when reusing a previously read graph. */
  graphRevision?: number;
  graphFingerprint?: string;
  platform: Platform;
  rootId: string;
  nodes: GraphNode[];
  coverage: {
    collectedAt?: string;
    retrievedCommentCount: number;
    reportedCommentCount: number | null;
    completeness: 'complete' | 'partial' | 'unknown';
    limitations: string[];
  };
}

export interface HistoryComment { id: string; authorId: string; text: string; createdAt: string | null; url: string | null }
export interface HistoryResult {
  authorId: string;
  status: 'complete' | 'partial' | 'unavailable' | 'unsupported' | 'failed';
  comments: HistoryComment[];
}
export interface EnrichmentJob {
  enrichmentId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  results?: HistoryResult[];
}

export interface Score { score: number | null; confidence: number | null; explanation: string; evidenceRefs: string[] }
export interface AxisAssessment extends Score { axis: AxisName; assessedCommentCount: number }

export interface AnalysisSubmission {
  inferenceVersion: string;
  inferredAt: string;
  subject: { label: string; kind: string; confidence: number; evidenceRefs: string[] };
  sentiment: {
    population: 'retrieved_comments' | 'analyzed_sample';
    analyzedCommentCount: number;
    counts: Record<Stance, number>;
    limitations: string[];
  };
  overallCoordinationRisk: Score;
  axes: AxisAssessment[];
  commentAssessments: { commentId: string; stance: Stance; promotionalIntentScore: number | null; rationale: string; evidenceRefs: string[]; accountSignals?: AccountSignals; astroturfEstimate?: { score: number; reasons: string[] } }[];
  clusters: { clusterId: string; commentIds: string[]; coordinationScore: number | null; explanation: string; evidenceRefs: string[] }[];
  usedEnrichmentIds: string[];
  limitations: string[];
}

export interface AnalysisResource {
  analysisId: string;
  investigationId: string;
  storedAt: string;
  result: AnalysisSubmission;
}
