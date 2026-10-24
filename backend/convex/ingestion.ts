// Ingestion stand-in. The ingestion owner replaces this with the Apify
// adapters in contracts/provider-adapters.md. Until then, only the labeled
// synthetic fixture URL is "collected"; every other link fails honestly with
// INGESTION_NOT_CONNECTED instead of receiving fabricated data.
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import type { GraphEnvelope } from './lib/contract';
import { isSyntheticSourceUrl, SYNTHETIC_GRAPH } from './lib/fixtures';

/** Convex documents are capped at 1 MB; keep headroom for the other fields. */
const MAX_GRAPH_BYTES = 900_000;

export const run = internalAction({
  args: { investigationId: v.string() },
  returns: v.null(),
  handler: async (ctx, { investigationId }) => {
    const job = await ctx.runMutation(internal.store.markIngestionRunning, { investigationId });
    if (!job) return null;

    if (!isSyntheticSourceUrl(job.sourceUrl)) {
      await ctx.runMutation(internal.store.failIngestion, {
        investigationId,
        code: 'INGESTION_NOT_CONNECTED',
        message: 'Live collection for this platform is not connected yet.',
        retryable: false,
      });
      return null;
    }

    const graph: GraphEnvelope = { ...SYNTHETIC_GRAPH, investigationId };
    const serialized = JSON.stringify(graph);
    if (new TextEncoder().encode(serialized).length > MAX_GRAPH_BYTES) {
      await ctx.runMutation(internal.store.failIngestion, {
        investigationId,
        code: 'DISCUSSION_TOO_LARGE',
        message: 'This discussion is larger than the configured graph-size limit.',
        retryable: false,
      });
      return null;
    }
    await ctx.runMutation(internal.store.storeGraph, { investigationId, graph: serialized });
    return null;
  },
});
