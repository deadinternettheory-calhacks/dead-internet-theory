import { internalMutationGeneric as mutation, anyApi } from "convex/server";
import { v } from "convex/values";
import {
  ApiFault,
  capabilities,
  providerMode,
  iso,
  limits,
  stable,
  sha,
  validate,
  validateOutput,
} from "../src/core";
import { authorize, type Principal } from "../src/auth";
import { source } from "../src/url";
import { get, put, immutable, type Ctx } from "./db";
import { checkAnchors, checkAnalysis } from "../src/invariants";
const id = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
export async function queue(
  ctx: Ctx,
  kind: string,
  target: string,
  payload: unknown = {},
) {
  const key = id("job");
  await put(ctx, "jobs", key, {
    kind,
    target,
    payload,
    status: "queued",
    due: Date.now(),
    attempt: 0,
    startedAt: null,
    lease: null,
  });
  await ctx.scheduler.runAfter(0, anyApi.worker.tick, { key });
}
export const execute = mutation({
  args: {
    method: v.string(),
    path: v.string(),
    body: v.any(),
    key: v.union(v.string(), v.null()),
    principal: v.any(),
    requestId: v.string(),
  },
  handler: async (ctx, a) => {
    try {
      return await dispatch(ctx, a);
    } catch (e) {
      if (!(e instanceof ApiFault)) throw e;
      const f = e;
      return {
        status: f.status,
        body: validate("ApiError", {
          error: {
            code: f.code,
            message: f.message,
            retryable: f.retryable,
            requestId: a.requestId,
          },
        }),
      };
    }
  },
});
async function dispatch(
  ctx: Ctx,
  a: {
    method: string;
    path: string;
    body: unknown;
    key: string | null;
    principal: Principal;
  },
) {
  const p = a.principal;
  const post = a.method === "POST";
  const now = Date.now();
  if (a.path === "/v1/capabilities" && !post)
    return { status: 200, body: capabilities() };
  const m = a.path.match(
    /^\/v1\/investigations(?:\/([^/]+)(?:\/(graph|analysis|enrichments)(?:\/([^/]+))?)?)?$/,
  );
  if (!m)
    throw new ApiFault(404, "INVESTIGATION_NOT_FOUND", "Unknown resource");
  const [, invId, part, enrId] = m;
  if (
    (enrId && part !== "enrichments") ||
    (post && invId && (enrId || !["enrichments", "analysis"].includes(part))) ||
    (!post && part === "enrichments" && !enrId)
  )
    throw new ApiFault(400, "INVALID_REQUEST", "Unknown operation");
  const op = invId ? `${part ?? "investigation"}:${invId}` : "create";
  let replayKey = "";
  if (post) {
    const role = invId ? "inference" : "frontend";
    if (p.role !== role)
      throw new ApiFault(403, "FORBIDDEN", `Operation requires ${role} role`);
    if (!a.key || !/^[\x20-\x7e]{8,128}$/.test(a.key))
      throw new ApiFault(
        400,
        "INVALID_REQUEST",
        "Idempotency-Key requires 8–128 printable ASCII characters",
      );
    replayKey = stable([p.sub, op, a.key]);
    // Authorization precedes replay, so scoped service credentials cannot replay a foreign result.
  }
  const replay = post ? await get(ctx, "idempotency", replayKey) : null;
  const inv = invId ? await get(ctx, "investigations", invId) : null;
  if (invId) {
    const owner =
      inv?.owner ?? (replay?.expires > now ? replay.owner : undefined);
    if (typeof owner !== "string")
      throw new ApiFault(
        404,
        "INVESTIGATION_NOT_FOUND",
        "Investigation not found",
      );
    authorize(p, owner, invId);
  }
  if (post) {
    if (replay && replay.expires > now) {
      const matches = replay.bodyHash
        ? replay.bodyHash === (await sha(a.body))
        : replay.body === stable(a.body);
      if (!matches)
        throw new ApiFault(
          409,
          "IDEMPOTENCY_CONFLICT",
          "Key already used with another body",
        );
      return replay.response;
    }
  }
  let result: { status: number; body: unknown };
  let commit: (() => Promise<void>) | undefined;
  if (!invId && post) {
    const req = validate("InvestigationCreateRequest", a.body);
    const resolved = source(req.sourceUrl);
    const mode = providerMode();
    const investigationId = id("inv");
    const resource = validateOutput("InvestigationResource", {
      schemaVersion: "1.0.0",
      investigationId,
      sourceUrl: resolved.url,
      platform: resolved.platform,
      ingestionStatus: "queued",
      analysisStatus: "waiting_for_graph",
      graphRevision: null,
      graphFingerprint: null,
      createdAt: iso(now),
      updatedAt: iso(now),
    });
    result = { status: 202, body: resource };
    commit = async () => {
      await put(ctx, "investigations", investigationId, {
        owner: p.sub,
        providerMode: mode,
        resource,
      });
      await queue(ctx, "ingest", investigationId);
    };
  } else if (invId && !post && !part) {
    result = {
      status: 200,
      body: validateOutput("InvestigationResource", inv.resource),
    };
  } else if (invId && part === "graph" && !enrId && !post) {
    const graph = await get(ctx, "graphs", invId);
    if (!graph) throw new ApiFault(409, "NOT_READY", "Graph is not ready");
    if (new TextEncoder().encode(stable(graph)).length > limits().graphBytes)
      throw new ApiFault(
        413,
        "DISCUSSION_TOO_LARGE",
        "Graph exceeds configured response limit",
      );
    result = { status: 200, body: validateOutput("GraphEnvelope", graph) };
  } else if (invId && part === "enrichments" && !enrId && post) {
    const req = validate("EnrichmentRequest", a.body);
    const graph = await get(ctx, "graphs", invId);
    if (!graph) throw new ApiFault(409, "NOT_READY", "Graph is not ready");
    checkAnchors(req, graph);
    const enrichmentId = id("enr");
    const resource = validateOutput("EnrichmentJob", {
      schemaVersion: "1.0.0",
      enrichmentId,
      investigationId: invId,
      status: "queued",
      createdAt: iso(now),
      startedAt: null,
      completedAt: null,
    });
    result = { status: 202, body: resource };
    commit = async () => {
      await put(ctx, "enrichments", enrichmentId, { request: req, resource });
      await queue(ctx, "enrich", enrichmentId);
    };
  } else if (invId && part === "enrichments" && enrId && !post) {
    const enr = await get(ctx, "enrichments", enrId);
    if (!enr || enr.resource.investigationId !== invId)
      throw new ApiFault(404, "ENRICHMENT_NOT_FOUND", "Enrichment not found");
    result = {
      status: 200,
      body: validateOutput("EnrichmentJob", enr.resource),
    };
  } else if (invId && part === "analysis" && !enrId && post) {
    const req = validate("AnalysisSubmission", a.body, 422);
    const graph = await get(ctx, "graphs", invId);
    if (!graph) throw new ApiFault(409, "NOT_READY", "Graph is not ready");
    if (
      req.graphRevision !== graph.graphRevision ||
      req.graphFingerprint !== graph.graphFingerprint
    )
      throw new ApiFault(
        409,
        "STALE_GRAPH_REVISION",
        "Graph revision or fingerprint does not match",
      );
    if (await get(ctx, "analyses", invId))
      throw new ApiFault(
        409,
        "ANALYSIS_ALREADY_SUBMITTED",
        "Final analysis already exists",
      );
    const enrichments = [];
    for (const key of req.usedEnrichmentIds) {
      const job = await get(ctx, "enrichments", key);
      if (
        !job ||
        job.resource.investigationId !== invId ||
        job.resource.status !== "completed"
      )
        throw new ApiFault(
          422,
          "INVALID_EVIDENCE_REF",
          "Referenced enrichment is not completed for this investigation",
        );
      enrichments.push(job.resource);
    }
    checkAnalysis(req, graph, enrichments);
    const resource = validateOutput("AnalysisResource", {
      schemaVersion: "1.0.0",
      analysisId: id("ana"),
      investigationId: invId,
      storedAt: iso(now),
      result: req,
    });
    const { result: _, ...receipt } = resource;
    result = { status: 201, body: validateOutput("AnalysisReceipt", receipt) };
    commit = async () => {
      await immutable(ctx, "analyses", invId, resource);
      inv.resource.analysisStatus = "completed";
      delete inv.resource.error;
      inv.resource.updatedAt = iso(now);
      await put(ctx, "investigations", invId, inv);
    };
  } else if (invId && part === "analysis" && !enrId && !post) {
    const analysis = await get(ctx, "analyses", invId);
    if (!analysis)
      throw new ApiFault(409, "ANALYSIS_NOT_READY", "Analysis is not ready");
    result = {
      status: 200,
      body: validateOutput("AnalysisResource", analysis),
    };
  } else throw new ApiFault(400, "INVALID_REQUEST", "Unknown operation");
  if (post) {
    const bucket = stable([p.sub, Math.floor(now / 3600000)]);
    const count = (await get(ctx, "controls", bucket)) ?? 0;
    if (count >= limits().rate)
      throw new ApiFault(
        429,
        "RATE_LIMITED",
        "Hourly submission limit reached",
        true,
      );
    if (result.status === 202) {
      const jobs = await ctx.db
        .query("jobs")
        .withIndex("status_due", (q) => q.eq("status", "queued"))
        .take(limits().queued);
      if (jobs.length >= limits().queued)
        throw new ApiFault(429, "RATE_LIMITED", "Job capacity reached", true);
    }
    // All validation is complete before committing transactional writes.
    await commit!();
    await put(ctx, "controls", bucket, count + 1);
    await put(ctx, "idempotency", replayKey, {
      expires: now + 86400000,
      bodyHash: await sha(a.body),
      owner: inv?.owner ?? p.sub,
      response: result,
    });
  }
  return result;
}
