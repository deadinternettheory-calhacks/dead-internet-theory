import {
  internalMutationGeneric as mutation,
  internalQueryGeneric as query,
} from "convex/server";
import { v } from "convex/values";
import { get, put, deadline, type ReadCtx } from "./db";
import {
  ApiFault,
  limits,
  providerMode,
  sha,
  validateOutput,
  type Model,
} from "../src/core";
import { source } from "../src/url";
import { actorBuilds } from "../src/actors";
import { fingerprint } from "../src/graph";
import { checkAnalysis, checkGraph } from "../src/invariants";

export async function sourceCacheKey(url: string, mode: string) {
  const s = source(url);
  const l = limits();
  return `source:${await sha([process.env.RESULT_CACHE_VERSION || "1", mode, s.platform, s.nativeId, l.comments, l.graphBytes, l.historyCandidates, actorBuilds])}`;
}
export const ownerCacheKey = async (key: string, owner: string) =>
  `${key}:owner:${await sha(owner)}`;
const viewId = async (
  kind: string,
  investigationId: string,
  original: string,
) => `${kind}_${await sha([investigationId, original])}`;

/** Owner checks always use the caller's investigation, never this backing ID. */
export async function backing(ctx: ReadCtx, inv: any, id: string) {
  if (!inv.reusedFrom) return { id, inv };
  const original = await get(ctx, "investigations", inv.reusedFrom);
  if (!original || original.reusedFrom)
    throw new ApiFault(
      404,
      "INVESTIGATION_NOT_FOUND",
      "Stored investigation has expired or was removed",
    );
  return { id: inv.reusedFrom as string, inv: original };
}

export async function graphView(ctx: ReadCtx, originalId: string, id: string) {
  const graph = await get(ctx, "graphs", originalId);
  if (!graph) return undefined;
  if (originalId === id) return graph as Model<"GraphEnvelope">;
  const view = { ...graph, investigationId: id };
  view.graphFingerprint = await fingerprint(view);
  return validateOutput("GraphEnvelope", view);
}
export async function resourceView(
  ctx: ReadCtx,
  original: any,
  originalId: string,
  id: string,
) {
  if (originalId === id)
    return validateOutput("InvestigationResource", original.resource);
  const resource = { ...original.resource, investigationId: id };
  if (resource.graphRevision !== null)
    resource.graphFingerprint =
      (await graphView(ctx, originalId, id))?.graphFingerprint ?? null;
  return validateOutput("InvestigationResource", resource);
}
export async function analysisView(
  ctx: ReadCtx,
  originalId: string,
  id: string,
) {
  const analysis = await get(ctx, "analyses", originalId);
  if (!analysis || originalId === id) return analysis;
  const graph = await graphView(ctx, originalId, id);
  if (!graph) return undefined;
  return validateOutput("AnalysisResource", {
    ...analysis,
    investigationId: id,
    analysisId: await viewId("ana", id, analysis.analysisId),
    result: {
      ...analysis.result,
      graphFingerprint: graph.graphFingerprint,
      usedEnrichmentIds: await Promise.all(
        analysis.result.usedEnrichmentIds.map((key: string) =>
          viewId("enr", id, key),
        ),
      ),
    },
  });
}
export async function enrichmentView(
  ctx: ReadCtx,
  originalId: string,
  id: string,
  key: string,
) {
  const analysis = await get(ctx, "analyses", originalId);
  for (const originalKey of analysis?.result.usedEnrichmentIds ?? []) {
    if ((await viewId("enr", id, originalKey)) !== key) continue;
    const job = await get(ctx, "enrichments", originalKey);
    if (job?.resource.investigationId === originalId)
      return validateOutput("EnrichmentJob", {
        ...job.resource,
        investigationId: id,
        enrichmentId: key,
      });
  }
  return undefined;
}

export async function reusable(ctx: ReadCtx, key: string, mode: string) {
  const entry = await get(ctx, "cache", key);
  if (!entry || entry.expires <= Date.now()) return undefined;
  const original = await get(ctx, "investigations", entry.investigationId);
  if (
    !original ||
    original.reusedFrom ||
    original.providerMode !== mode ||
    ((original.resource.ingestionStatus === "failed" ||
      original.resource.analysisStatus === "failed") &&
      original.resource.error?.code !== "PROVIDER_START_AMBIGUOUS")
  )
    return undefined;
  if (key !== (await sourceCacheKey(original.resource.sourceUrl, mode)))
    return undefined;
  if (original.resource.ingestionStatus === "completed") {
    const graph = await get(ctx, "graphs", entry.investigationId);
    if (!graph) return undefined;
    if (original.resource.analysisStatus === "completed") {
      const analysis = await get(ctx, "analyses", entry.investigationId);
      if (!analysis) return undefined;
      for (const id of analysis.result.usedEnrichmentIds) {
        const job = await get(ctx, "enrichments", id);
        if (
          !job ||
          job.resource.investigationId !== entry.investigationId ||
          job.resource.status !== "completed"
        )
          return undefined;
      }
    }
  }
  return {
    id: entry.investigationId as string,
    inv: original,
    expires: entry.expires as number,
  };
}

/** One-time, paged seeding of compatible retained reports; never starts work. */
export const seed = mutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    versionPrefix: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.versionPrefix.trim())
      throw Error("An explicit compatible inference version is required");
    const page = await ctx.db
      .query("investigations")
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: 5 });
    let seeded = 0;
    for (const row of page.page) {
      const inv = row.data;
      if (
        inv.reusedFrom ||
        inv.providerMode !== providerMode() ||
        !row.expiresAt ||
        row.expiresAt <= Date.now() ||
        inv.resource?.analysisStatus !== "completed" ||
        inv.resource?.ingestionStatus !== "completed"
      )
        continue;
      const graph = await get(ctx, "graphs", row.key);
      const analysis = await get(ctx, "analyses", row.key);
      if (
        !graph ||
        !analysis?.result.inferenceVersion.startsWith(args.versionPrefix) ||
        graph.coverage.retrievedCommentCount > limits().comments
      )
        continue;
      try {
        validateOutput("GraphEnvelope", graph);
        validateOutput("AnalysisResource", analysis);
        checkGraph(graph);
        if ((await fingerprint(graph)) !== graph.graphFingerprint) continue;
        const jobs = [];
        for (const id of analysis.result.usedEnrichmentIds) {
          const job = await get(ctx, "enrichments", id);
          if (
            !job ||
            job.resource.investigationId !== row.key ||
            job.resource.status !== "completed" ||
            job.resource.results?.some((r: any) => r.status === "failed")
          )
            throw Error("Incomplete history");
          jobs.push(job.resource);
        }
        checkAnalysis(analysis.result, graph, jobs);
        const key = await sourceCacheKey(
          inv.resource.sourceUrl,
          inv.providerMode,
        );
        if (await reusable(ctx, key, inv.providerMode)) continue;
        await put(ctx, "cache", key, {
          investigationId: row.key,
          expires: await deadline(ctx, "investigations", row.key),
        });
        seeded++;
      } catch {
        /* Unusable old reports are left untouched and not cached. */
      }
    }
    return { seeded, cursor: page.continueCursor, isDone: page.isDone };
  },
});

export const peek = query({
  args: { sourceUrl: v.string() },
  handler: async (ctx, { sourceUrl }) => {
    const mode = providerMode();
    const hit = await reusable(
      ctx,
      await sourceCacheKey(sourceUrl, mode),
      mode,
    );
    return hit
      ? {
          hit: true,
          investigationId: hit.id,
          ingestionStatus: hit.inv.resource.ingestionStatus,
          analysisStatus: hit.inv.resource.analysisStatus,
          expiresAt: hit.expires,
        }
      : { hit: false };
  },
});
