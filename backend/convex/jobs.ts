import { internalMutationGeneric as mutation, anyApi } from "convex/server";
import { v } from "convex/values";
import { get, put, immutable, type Ctx } from "./db";
import { queue } from "./api";
import { iso, limits, stable, validate } from "../src/core";
import { checkGraph } from "../src/invariants";
export const claim = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const job = await get(ctx, "jobs", key);
    if (!job || ["done", "failed"].includes(job.status)) return null;
    const now = Date.now();
    if (job.due > now) {
      await ctx.scheduler.runAfter(job.due - now, anyApi.worker.tick, { key });
      return null;
    }
    if (job.lease && job.lease > now) return null;
    const running = await (ctx as Ctx).db
      .query("jobs")
      .withIndex("status_due", (q) => q.eq("status", "running").gt("due", now))
      .take(limits().active + 1);
    if (
      running.filter((j) => j.key !== key && j.data.lease > now).length >=
      limits().active
    ) {
      await ctx.scheduler.runAfter(2000, anyApi.worker.tick, { key });
      return null;
    }
    // A lost action is retried, but its persisted provider run is reused.
    if (job.status === "running") job.attempt++;
    if (job.attempt >= limits().attempts) {
      await fail(ctx, job, key, {
        code: "JOB_RETRIES_EXHAUSTED",
        message: "Job recovery retry limit reached",
        retryable: false,
      });
      return null;
    }
    job.status = "running";
    job.lease = now + 60000;
    job.token = `${now}:${Math.random()}`;
    job.startedAt ??= iso(now);
    await put(ctx, "jobs", key, job);
    await ctx.scheduler.runAfter(61000, anyApi.worker.tick, { key });
    if (job.kind === "ingest") {
      const inv = await get(ctx, "investigations", job.target);
      inv.resource.ingestionStatus = "running";
      inv.resource.updatedAt = iso(now);
      await put(ctx, "investigations", job.target, inv);
      return { key, job, investigation: inv.resource };
    }
    if (job.kind === "enrich") {
      const e = await get(ctx, "enrichments", job.target);
      e.resource.status = "running";
      e.resource.startedAt ??= iso(now);
      await put(ctx, "enrichments", job.target, e);
      return {
        key,
        job,
        enrichment: e,
        graph: await get(ctx, "graphs", e.resource.investigationId),
      };
    }
    return { key, job };
  },
});
async function fail(
  ctx: Parameters<typeof get>[0],
  job: any,
  key: string,
  error: unknown,
) {
  job.status = "failed";
  job.lease = null;
  job.error = error;
  await put(ctx, "jobs", key, job);
  if (job.kind === "ingest") {
    const inv = await get(ctx, "investigations", job.target);
    inv.resource.ingestionStatus = "failed";
    inv.resource.error = error;
    inv.resource.updatedAt = iso();
    await put(ctx, "investigations", job.target, inv);
  }
  if (job.kind === "enrich") {
    const e = await get(ctx, "enrichments", job.target);
    e.resource.status = "failed";
    e.resource.completedAt = iso();
    e.resource.error = error;
    await put(ctx, "enrichments", job.target, e);
  }
  if (job.kind === "event") {
    const inv = await get(ctx, "investigations", job.target);
    if (inv.resource.analysisStatus !== "completed") {
      inv.resource.analysisStatus = "failed";
      inv.resource.error = error;
      inv.resource.updatedAt = iso();
      await put(ctx, "investigations", job.target, inv);
    }
  }
}
export const settle = mutation({
  args: { key: v.string(), token: v.string(), outcome: v.any() },
  handler: async (ctx, { key, token, outcome: o }) => {
    const job = await get(ctx, "jobs", key);
    if (!job || job.token !== token || job.status !== "running") return;
    if (o.error) {
      if (o.error.retryable && job.attempt + 1 < limits().attempts) {
        job.attempt++;
        job.status = "queued";
        job.lease = null;
        job.due = Date.now() + 1000 * 2 ** job.attempt;
        await put(ctx, "jobs", key, job);
        await ctx.scheduler.runAfter(job.due - Date.now(), anyApi.worker.tick, {
          key,
        });
        return;
      }
      await fail(ctx, job, key, o.error);
      return;
    }
    if (o.state) {
      job.payload = o.state;
      job.status = "queued";
      job.lease = null;
      job.due = Date.now() + (o.wait ?? 0);
      await put(ctx, "jobs", key, job);
      await ctx.scheduler.runAfter(o.wait ?? 0, anyApi.worker.tick, { key });
      return;
    }
    if (job.kind === "ingest") {
      const graph = validate("GraphEnvelope", o.graph);
      checkGraph(graph);
      if (
        graph.investigationId !== job.target ||
        new TextEncoder().encode(stable(graph)).length > limits().graphBytes
      ) {
        await fail(ctx, job, key, {
          code: "DISCUSSION_TOO_LARGE",
          message: "Graph exceeds configured storage/response bound",
          retryable: false,
        });
        return;
      }
      if (!(await get(ctx, "graphs", job.target))) {
        await immutable(ctx, "graphs", job.target, graph);
        await put(ctx, "snapshots", graph.coverage.sourceSnapshotRef, {
          raw: o.raw,
          createdAt: iso(),
          investigationId: job.target,
        });
        const inv = await get(ctx, "investigations", job.target);
        Object.assign(inv.resource, {
          ingestionStatus: "completed",
          analysisStatus: "queued",
          graphRevision: graph.graphRevision,
          graphFingerprint: graph.graphFingerprint,
          updatedAt: iso(),
        });
        await put(ctx, "investigations", job.target, inv);
        const event = validate("InvestigationReadyEvent", {
          eventVersion: "1.0.0",
          eventId: `ready:${job.target}:${graph.graphRevision}`,
          eventType: "investigation.ready",
          investigationId: job.target,
          graphRevision: graph.graphRevision,
          graphFingerprint: graph.graphFingerprint,
          occurredAt: iso(),
        });
        await queue(ctx, "event", job.target, { event });
      }
    } else if (job.kind === "enrich") {
      const enr = await get(ctx, "enrichments", job.target);
      enr.resource.results = o.results;
      enr.resource.status = "completed";
      enr.resource.completedAt = iso();
      validate("EnrichmentJob", enr.resource);
      await put(ctx, "enrichments", job.target, enr);
      for (const cached of o.caches ?? []) {
        await put(ctx, "cache", cached.key, {
          set: cached.set,
          expires: Date.now() + limits().cacheMs,
        });
        if (cached.set.coverage.sourceSnapshotRef)
          await put(ctx, "snapshots", cached.set.coverage.sourceSnapshotRef, {
            raw: cached.raw,
            createdAt: iso(),
            investigationId: enr.resource.investigationId,
          });
      }
    } else if (job.kind === "event") {
      const inv = await get(ctx, "investigations", job.target);
      if (inv.resource.analysisStatus === "queued") {
        inv.resource.analysisStatus = "running";
        inv.resource.updatedAt = iso();
        await put(ctx, "investigations", job.target, inv);
      }
    }
    job.status = "done";
    job.lease = null;
    await put(ctx, "jobs", key, job);
  },
});
export const cached = mutation({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, { keys }) => {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const cached = await get(ctx, "cache", key);
      if (cached?.expires > Date.now()) result[key] = cached.set;
    }
    return result;
  },
});
// Reserve the maximum run cost before starting a billable operation. Never refund
// ambiguous starts: a lost provider response may still have created a charged run.
export const reserve = mutation({
  args: { key: v.string(), token: v.string(), operation: v.string() },
  handler: async (ctx, a) => {
    const job = await get(ctx, "jobs", a.key);
    if (!job || job.token !== a.token) return false;
    const reservation = `reservation:${a.key}:${a.operation}`;
    if (await get(ctx, "controls", reservation)) return false;
    const day = `budget:${iso().slice(0, 10)}`;
    const used = (await get(ctx, "controls", day)) ?? 0;
    if (used + limits().cents > limits().dailyCents) return false;
    await put(ctx, "controls", day, used + limits().cents);
    await put(ctx, "controls", reservation, true);
    return true;
  },
});
