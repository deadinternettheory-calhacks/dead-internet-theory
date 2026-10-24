import { it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import schema from "../convex/schema";
import { put, get, RETENTION_MS } from "../convex/db";
import { inspectForDeletion, deleteProviderRun } from "../src/provider-cleanup";
const modules = {
  ...import.meta.glob("../convex/**/*.ts"),
  "../convex/_generated/marker.ts": async () => ({}),
};
afterEach(() => vi.useRealTimers());

it("expires an investigation and related evidence together and hides expired records before the sweep", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const began = Date.now();
  await t.run((ctx) =>
    put(ctx, "investigations", "inv", { resource: { investigationId: "inv" } }),
  );
  vi.setSystemTime(began + 3600000);
  await t.run(async (ctx) => {
    await put(ctx, "graphs", "inv", { investigationId: "inv" });
    await put(ctx, "snapshots", "snapshot", {
      investigationId: "inv",
      raw: "SYNTHETIC",
    });
    await put(ctx, "enrichments", "enr", {
      resource: { investigationId: "inv" },
    });
    await put(ctx, "jobs", "job", {
      kind: "enrich",
      target: "enr",
      status: "queued",
      due: Date.now(),
    });
  });
  vi.setSystemTime(began + RETENTION_MS);
  expect(await t.run((ctx) => get(ctx, "graphs", "inv"))).toBeFalsy();
  expect(await t.mutation(anyApi.retention.sweep, {})).toEqual({ deleted: 5 });
  expect(await t.run((ctx) => ctx.db.query("snapshots").collect())).toEqual([]);
});
it("does not extend retention when a resource is updated", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const began = Date.now();
  await t.run((ctx) =>
    put(ctx, "investigations", "inv", { resource: { status: "queued" } }),
  );
  vi.setSystemTime(began + 3600000);
  await t.run((ctx) =>
    put(ctx, "investigations", "inv", { resource: { status: "completed" } }),
  );
  const doc = await t.run((ctx) => ctx.db.query("investigations").first());
  expect(doc!.expiresAt).toBe(began + RETENTION_MS);
});
it("refreshes an expired cache entry instead of inheriting its old deletion deadline", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const now = Date.now();
  await t.run((ctx) =>
    put(ctx, "cache", "pool", { set: { comments: [] }, expires: now + 1000 }),
  );
  vi.setSystemTime(now + 2000);
  await t.run((ctx) =>
    put(ctx, "cache", "pool", {
      set: { comments: ["SYNTHETIC fresh"] },
      expires: now + 5000,
    }),
  );
  await t.mutation(anyApi.retention.sweep, {});
  const doc = await t.run((ctx) => ctx.db.query("cache").first());
  expect(doc!.expiresAt).toBe(now + 5000);
  expect(doc!.data.set.comments).toEqual(["SYNTHETIC fresh"]);
});
it("expires cached content at cache expiry and preserves unresolved provider capacity metadata", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const began = Date.now();
  await t.run(async (ctx) => {
    await put(ctx, "cache", "pool", {
      set: { comments: ["SYNTHETIC"] },
      expires: began + 1000,
    });
    await put(ctx, "providerSlots", "active", { status: "active" });
    await put(ctx, "providerSlots", "released", { status: "released" });
  });
  vi.setSystemTime(began + RETENTION_MS);
  await t.mutation(anyApi.retention.sweep, {});
  expect(await t.run((ctx) => ctx.db.query("cache").collect())).toEqual([]);
  const slots = await t.run((ctx) => ctx.db.query("providerSlots").collect());
  expect(slots.map((s) => s.key)).toEqual(["active"]);
});
it("backfills pre-rollout records from their original creation time", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const began = Date.now();
  await t.run((ctx) =>
    ctx.db.insert("graphs", { key: "old", data: { text: "SYNTHETIC" } }),
  );
  vi.setSystemTime(began + RETENTION_MS + 1);
  await t.mutation(anyApi.retention.backfill, {});
  await t.mutation(anyApi.retention.sweep, {});
  expect(await t.run((ctx) => ctx.db.query("graphs").collect())).toEqual([]);
});
it("leases due provider cleanup work and keeps its metadata after source records expire", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const now = Date.now();
  await t.run((ctx) =>
    ctx.db.insert("providerCleanup", {
      key: "synthetic-run",
      expiresAt: now,
      nextAttemptAt: now,
      data: {},
    }),
  );
  expect(await t.mutation(anyApi.retention.claimProvider, {})).toEqual([
    { key: "synthetic-run" },
  ]);
  expect(await t.mutation(anyApi.retention.claimProvider, {})).toEqual([]);
  await t.mutation(anyApi.retention.sweep, {});
  expect(await t.query(anyApi.retention.pendingProviderCount, {})).toBe(1);
  await t.mutation(anyApi.retention.finishProvider, {
    key: "synthetic-run",
    done: true,
  });
  expect(await t.query(anyApi.retention.pendingProviderCount, {})).toBe(0);
});
it("deletes all owned default storages before the terminal run and confirms every deletion", async () => {
  const request = vi
    .fn()
    .mockImplementation(async (_url: string, options: any) => ({
      status: options?.method === "DELETE" ? 204 : 404,
      body: null,
    }));
  await deleteProviderRun(
    "run",
    { dataset: "dataset", keyValueStore: "kv", requestQueue: "queue" },
    "synthetic-token",
    request,
  );
  expect(
    request.mock.calls
      .filter(([, o]) => o.method === "DELETE")
      .map(([url]) => url),
  ).toEqual([
    "https://api.apify.com/v2/datasets/dataset",
    "https://api.apify.com/v2/key-value-stores/kv",
    "https://api.apify.com/v2/request-queues/queue",
    "https://api.apify.com/v2/actor-runs/run",
  ]);
  expect(request).toHaveBeenCalledTimes(8);
});
it("aborts an expired active run and waits for terminal confirmation before deletion", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      status: 200,
      body: {
        data: { id: "run", status: "RUNNING", defaultDatasetId: "dataset" },
      },
    })
    .mockResolvedValueOnce({ status: 200, body: {} });
  expect(await inspectForDeletion("run", "synthetic-token", request)).toEqual({
    terminal: false,
    resources: { dataset: "dataset" },
  });
  expect(request.mock.calls[1][0]).toBe(
    "https://api.apify.com/v2/actor-runs/run/abort",
  );
  expect(request.mock.calls[1][1]?.method).toBe("POST");
});
it("retries failed or unconfirmed deletions instead of declaring cleanup complete", async () => {
  const request = vi.fn().mockResolvedValue({ status: 200, body: {} });
  await expect(
    deleteProviderRun("run", {}, "synthetic-token", request),
  ).rejects.toThrow("deletion failed");
  const unconfirmed = vi
    .fn()
    .mockResolvedValueOnce({ status: 204, body: null })
    .mockResolvedValue({ status: 200, body: {} });
  await expect(
    deleteProviderRun("run", {}, "synthetic-token", unconfirmed),
  ).rejects.toThrow("not confirmed");
});
