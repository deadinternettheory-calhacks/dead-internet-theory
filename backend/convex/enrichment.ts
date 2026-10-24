// Author-history fulfilment stand-in (ingestion side of the contract). The
// ingestion owner replaces the body with the Apify history adapter and the
// sampling algorithm in contracts/discussion-graph-api.md section 5.
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import type { EnrichmentJob, EnrichmentRequest, GraphEnvelope, HistoryResult } from './lib/contract';
import { isSyntheticSourceUrl, SYNTHETIC_GRAPH, syntheticHistory } from './lib/fixtures';
import { utcNow } from './lib/util';

function emptyResult(authorId: string, anchorCommentId: string, status: HistoryResult['status'], code: string, message: string, limitation: string): HistoryResult {
  return {
    authorId,
    anchorCommentId,
    status,
    strategy: 'none',
    comments: [],
    coverage: {
      requestedCount: 10,
      returnedCount: 0,
      candidateFetchedCount: 0,
      providerTruncated: null,
      reachedAnchorWindow: null,
      oldestFetchedAt: null,
      newestFetchedAt: null,
      collectedAt: null,
      sourceSnapshotRef: null,
      actorRunIds: [],
      limitations: [limitation],
    },
    error: { code, message, retryable: false },
  };
}

export const fulfil = internalAction({
  args: { enrichmentId: v.string() },
  returns: v.null(),
  handler: async (ctx, { enrichmentId }) => {
    const work = await ctx.runQuery(internal.store.enrichmentWork, { enrichmentId });
    if (!work) return null;
    const job = JSON.parse(work.job) as EnrichmentJob;
    if (job.status !== 'queued') return null;
    const request = JSON.parse(work.request) as EnrichmentRequest;
    const graph = JSON.parse(work.graph) as GraphEnvelope;
    const startedAt = utcNow();
    const root = graph.nodes.find(n => n.id === graph.rootId) as { url: string } | undefined;
    const synthetic = graph.graphFingerprint === SYNTHETIC_GRAPH.graphFingerprint && !!root && isSyntheticSourceUrl(root.url);

    const results: HistoryResult[] = request.authors.map(({ authorId, anchorCommentId }) => {
      if (graph.platform === 'youtube' || graph.platform === 'tiktok') {
        return emptyResult(authorId, anchorCommentId, 'unsupported', 'HISTORY_UNSUPPORTED', 'This platform does not support arbitrary authored-comment history enrichment in v1.', 'Author history is not supported on this platform.');
      }
      if (synthetic) {
        const fixture = syntheticHistory(authorId);
        if (fixture) return { ...fixture, anchorCommentId };
        return emptyResult(authorId, anchorCommentId, 'unavailable', 'HISTORY_UNAVAILABLE', 'No history exists for this author in the synthetic fixture.', 'Synthetic fixture has no history for this author.');
      }
      return emptyResult(authorId, anchorCommentId, 'failed', 'PROVIDER_NOT_CONNECTED', 'Live author-history collection is not connected yet.', 'History provider not connected; no claim about this author’s history.');
    });

    const completed: EnrichmentJob = { ...job, status: 'completed', startedAt, completedAt: utcNow(), results };
    await ctx.runMutation(internal.store.saveEnrichmentJob, { job: JSON.stringify(completed) });
    return null;
  },
});
