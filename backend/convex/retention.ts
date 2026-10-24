import {
  internalMutationGeneric as mutation,
  internalQueryGeneric as query,
  anyApi,
} from "convex/server";
import { v } from "convex/values";
import { RETENTION_MS, type Table } from "./db";

const tables: Table[] = [
  "investigations",
  "graphs",
  "analyses",
  "enrichments",
  "snapshots",
  "jobs",
  "cache",
  "idempotency",
  "controls",
  "providerSlots",
];
export const sweep = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let deleted = 0;
    let more = false;
    for (const table of tables) {
      const rows = await ctx.db
        .query(table)
        .withIndex("expiry", (q) => q.gte("expiresAt", 0).lte("expiresAt", now))
        .take(100);
      for (const row of rows) {
        await ctx.db.delete(row._id);
        deleted++;
      }
      more ||= rows.length === 100;
    }
    if (more) await ctx.scheduler.runAfter(0, anyApi.retention.sweep, {});
    return { deleted };
  },
});
// Run once after rollout, and on the periodic sweep until older records have TTLs.
export const backfill = mutation({
  args: {},
  handler: async (ctx) => {
    let more = false;
    let updated = 0;
    for (const table of tables.filter((t) => t !== "providerSlots")) {
      const rows = await ctx.db
        .query(table)
        .withIndex("expiry", (q) => q.eq("expiresAt", undefined))
        .take(100);
      for (const row of rows) {
        await ctx.db.patch(row._id, {
          expiresAt: row._creationTime + RETENTION_MS,
        });
        updated++;
      }
      more ||= rows.length === 100;
    }
    if (more) await ctx.scheduler.runAfter(0, anyApi.retention.backfill, {});
    return { updated };
  },
});
export const claimProvider = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("providerCleanup")
      .withIndex("due", (q) => q.lte("nextAttemptAt", now))
      .take(1);
    for (const row of rows)
      await ctx.db.patch(row._id, { nextAttemptAt: now + 600000 });
    return rows.map((r) => ({ key: r.key, ...r.data }));
  },
});
export const finishProvider = mutation({
  args: { key: v.string(), resources: v.optional(v.any()), done: v.boolean() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("providerCleanup")
      .withIndex("key", (q) => q.eq("key", args.key))
      .unique();
    if (!row) return;
    if (args.done) {
      await ctx.db.delete(row._id);
      const active = await ctx.db
        .query("providerSlots")
        .withIndex("status", (q) => q.eq("status", "active"))
        .take(16);
      for (const slot of active)
        if (slot.data.runId === args.key)
          await ctx.db.patch(slot._id, {
            status: "released",
            data: { ...slot.data, status: "released" },
            expiresAt: Date.now() + RETENTION_MS,
          });
    } else if (args.resources)
      await ctx.db.patch(row._id, {
        data: { ...row.data, resources: args.resources },
      });
  },
});
export const pendingProviderCount = query({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("providerCleanup").take(1000)).length,
});
