import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import fixture from "../../contracts/examples/analysis-submission.json";
import { deliver } from "../src/outbound";
import { fingerprint } from "../src/graph";
import { checkAnalysis } from "../src/invariants";
import { sourceCacheKey } from "../convex/reuse";
import { RETENTION_MS } from "../convex/db";
import type { Model } from "../src/core";
vi.mock("../src/outbound", async (original) => ({
  ...(await original<typeof import("../src/outbound")>()),
  deliver: vi.fn().mockResolvedValue(undefined),
}));
const modules = {
  ...import.meta.glob("../convex/**/*.ts"),
  "../convex/_generated/marker.ts": async () => ({}),
};
let t: ReturnType<typeof convexTest<typeof schema.tables>>;
const url = "https://www.reddit.com/r/example/comments/demo/";
const principal = (sub: string, role = "frontend") => ({
  sub,
  role,
  investigations: role === "inference" ? ["*"] : [],
});
const call = (
  method: string,
  path: string,
  body: unknown = null,
  sub = "alice",
  key = "synthetic-key",
  role = "frontend",
) =>
  t.mutation(anyApi.api.execute, {
    method,
    path,
    body,
    key,
    principal: principal(sub, role),
    requestId: "synthetic",
  });
const create = (sub = "alice", key = "synthetic-create", sourceUrl = url) =>
  call("POST", "/v1/investigations", { sourceUrl }, sub, key);
const drain = () => t.finishAllScheduledFunctions(() => vi.runAllTimers());
async function finish(id: string) {
  await drain();
  const graph = (await call("GET", `/v1/investigations/${id}/graph`)).body;
  const request = {
    authors: [
      {
        authorId: "reddit:author:t2_alex",
        anchorCommentId: "reddit:comment:t1_a",
      },
      {
        authorId: "reddit:author:t2_ben",
        anchorCommentId: "reddit:comment:t1_b",
      },
    ],
    limit: 10,
    windowDays: 14,
    fallback: "most_recent",
  };
  const enr = await call(
    "POST",
    `/v1/investigations/${id}/enrichments`,
    request,
    "worker",
    "synthetic-history",
    "inference",
  );
  expect(enr.status).toBe(202);
  await drain();
  const a = await call(
    "POST",
    `/v1/investigations/${id}/analysis`,
    {
      ...fixture,
      graphFingerprint: graph.graphFingerprint,
      usedEnrichmentIds: [enr.body.enrichmentId],
    },
    "worker",
    "synthetic-analysis",
    "inference",
  );
  expect(a.status).toBe(201);
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T00:00:00Z"));
  vi.stubEnv("PROVIDER_MODE", "fixture");
  vi.mocked(deliver).mockClear();
  t = convexTest(schema, modules) as typeof t;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("reuses a finished result across fresh idempotency keys and URL aliases without new work", async () => {
  const first = await create();
  const id = first.body.investigationId;
  await finish(id);
  const jobsBefore = await t.run((ctx) => ctx.db.query("jobs").collect());
  const again = await create(
    "alice",
    "new-tab-key",
    "https://old.reddit.com/r/example/comments/demo/title/?tracking=1",
  );
  expect(again.body).toMatchObject({
    investigationId: id,
    analysisStatus: "completed",
  });
  expect(await t.run((ctx) => ctx.db.query("jobs").collect())).toHaveLength(
    jobsBefore.length,
  );
  expect(deliver).toHaveBeenCalledTimes(1);
  expect(await create()).toEqual(first); // Original idempotent receipt stays immutable.
  expect(
    (
      await create(
        "alice",
        "synthetic-create",
        "https://x.com/example/status/1",
      )
    ).status,
  ).toBe(409);
});

it("gives another browser an owner-scoped view with valid remapped graph, analysis and histories", async () => {
  const id = (await create()).body.investigationId;
  await finish(id);
  const originalGraph = (await call("GET", `/v1/investigations/${id}/graph`))
    .body;
  expect(
    (await call("GET", `/v1/investigations/${id}`, null, "bob")).status,
  ).toBe(403);
  const cached = await create("bob");
  const alias = cached.body.investigationId;
  expect(alias).not.toBe(id);
  expect(cached.body.analysisStatus).toBe("completed");
  expect((await call("GET", `/v1/investigations/${alias}`)).status).toBe(403);
  expect(
    (await call("GET", `/v1/investigations/${id}`, null, "bob")).status,
  ).toBe(403);
  const graph = (
    await call("GET", `/v1/investigations/${alias}/graph`, null, "bob")
  ).body;
  const analysis = (
    await call("GET", `/v1/investigations/${alias}/analysis`, null, "bob")
  ).body;
  const histories: Model<"EnrichmentJob">[] = [];
  for (const key of analysis.result.usedEnrichmentIds) {
    const r = await call(
      "GET",
      `/v1/investigations/${alias}/enrichments/${key}`,
      null,
      "bob",
    );
    expect(r.status).toBe(200);
    expect(r.body.investigationId).toBe(alias);
    histories.push(r.body);
  }
  expect(graph.investigationId).toBe(alias);
  expect(graph.graphFingerprint).toBe(await fingerprint(graph));
  expect(analysis.investigationId).toBe(alias);
  expect(analysis.result.graphFingerprint).toBe(graph.graphFingerprint);
  expect(() => checkAnalysis(analysis.result, graph, histories)).not.toThrow();
  expect((await call("GET", `/v1/investigations/${id}/graph`)).body).toEqual(
    originalGraph,
  );
  expect(await t.run((ctx) => ctx.db.query("graphs").collect())).toHaveLength(
    1,
  );
  expect((await create("bob", "another-tab")).body.investigationId).toBe(alias);
  expect(
    (
      await call(
        "POST",
        `/v1/investigations/${alias}/enrichments`,
        {},
        "worker",
        "alias-write",
        "inference",
      )
    ).status,
  ).toBe(409);
});

it("coalesces simultaneous submissions and lets private views follow the one running investigation", async () => {
  const [a, b, c] = await Promise.all([
    create("alice"),
    create("bob"),
    create("carol"),
  ]);
  expect(
    new Set([
      a.body.investigationId,
      b.body.investigationId,
      c.body.investigationId,
    ]).size,
  ).toBe(3);
  const rows = await t.run((ctx) => ctx.db.query("investigations").collect());
  const root = rows.find((row) => !row.data.reusedFrom)!;
  expect(await t.run((ctx) => ctx.db.query("jobs").collect())).toHaveLength(1);
  // Complete the root under its actual owner, without issuing another create.
  await drain();
  expect(deliver).toHaveBeenCalledTimes(1);
  for (const [result, user] of [
    [a, "alice"],
    [b, "bob"],
    [c, "carol"],
  ] as const) {
    const r = await call(
      "GET",
      `/v1/investigations/${result.body.investigationId}`,
      null,
      user,
    );
    expect(r.body.ingestionStatus).toBe("completed");
    expect(
      (
        await call(
          "GET",
          `/v1/investigations/${result.body.investigationId}/graph`,
          null,
          user,
        )
      ).status,
    ).toBe(200);
  }
  expect(root.data.owner).toBeTruthy();
});

it("inherits the original fixed expiry and rejects deleted or expired backing data", async () => {
  const began = Date.now();
  const id = (await create()).body.investigationId;
  await finish(id);
  vi.setSystemTime(began + 23 * 3600000);
  const alias = (await create("bob")).body.investigationId;
  const view = await t.run((ctx) =>
    ctx.db
      .query("investigations")
      .withIndex("key", (q) => q.eq("key", alias))
      .unique(),
  );
  expect(view!.expiresAt).toBe(began + RETENTION_MS);
  vi.setSystemTime(began + RETENTION_MS + 1);
  expect(
    (await call("GET", `/v1/investigations/${alias}/analysis`, null, "bob"))
      .status,
  ).toBe(404);
  const fresh = await create("bob", "after-expiry");
  expect(fresh.body.investigationId).not.toBe(alias);
  expect(fresh.body.analysisStatus).toBe("waiting_for_graph");
  await t.mutation(anyApi.retention.sweep, {});
  await drain();
});

it("does not reuse failed work or completed reports missing required history evidence", async () => {
  const id = (await create()).body.investigationId;
  await finish(id);
  await t.run(async (ctx) => {
    const row = await ctx.db.query("enrichments").first();
    await ctx.db.delete(row!._id);
  });
  const fresh = await create("bob");
  expect(fresh.body.investigationId).not.toBe(id);
  expect(fresh.body.ingestionStatus).toBe("queued");
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("investigations")
      .withIndex("key", (q) => q.eq("key", fresh.body.investigationId))
      .unique();
    await ctx.db.patch(row!._id, {
      data: {
        ...row!.data,
        resource: { ...row!.data.resource, analysisStatus: "failed" },
      },
    });
  });
  const retry = await create("carol");
  expect(retry.body.ingestionStatus).toBe("queued");
  expect(retry.body.investigationId).not.toBe(fresh.body.investigationId);
  await drain();
});

it("shares an unconfirmed-start failure instead of risking another paid run", async () => {
  const id = (await create()).body.investigationId;
  await drain();
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("investigations")
      .withIndex("key", (q) => q.eq("key", id))
      .unique();
    await ctx.db.patch(row!._id, {
      data: {
        ...row!.data,
        resource: {
          ...row!.data.resource,
          ingestionStatus: "failed",
          error: {
            code: "PROVIDER_START_AMBIGUOUS",
            message: "SYNTHETIC unconfirmed start",
            retryable: false,
          },
        },
      },
    });
  });
  const before = await t.run((ctx) => ctx.db.query("jobs").collect());
  const reused = await create("bob");
  expect(reused.body.error.code).toBe("PROVIDER_START_AMBIGUOUS");
  expect(await t.run((ctx) => ctx.db.query("jobs").collect())).toHaveLength(
    before.length,
  );
});

it("separates provider modes, collection limits and cache versions while treating video and X aliases as one source", async () => {
  const a = await sourceCacheKey(
    "https://youtu.be/jDtG_pwIIv0?si=share",
    "live",
  );
  expect(
    await sourceCacheKey("https://www.youtube.com/shorts/jDtG_pwIIv0", "live"),
  ).toBe(a);
  expect(
    await sourceCacheKey("https://youtu.be/jDtG_pwIIv0", "fixture"),
  ).not.toBe(a);
  vi.stubEnv("MAX_COMMENTS", "20");
  expect(await sourceCacheKey("https://youtu.be/jDtG_pwIIv0", "live")).not.toBe(
    a,
  );
  vi.stubEnv("RESULT_CACHE_VERSION", "next");
  const changed = await sourceCacheKey(url, "fixture");
  vi.stubEnv("RESULT_CACHE_VERSION", "previous");
  expect(await sourceCacheKey(url, "fixture")).not.toBe(changed);
  expect(await sourceCacheKey("https://x.com/first/status/123", "live")).toBe(
    await sourceCacheKey("https://twitter.com/second/status/123?s=20", "live"),
  );
});

it("seeds retained compatible results without starting work, and serves cached reports even when the work queue is full", async () => {
  const id = (await create()).body.investigationId;
  await finish(id);
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("cache").collect())
      if (row.key.startsWith("source:")) await ctx.db.delete(row._id);
  });
  const seeded = await t.mutation(anyApi.reuse.seed, {
    versionPrefix: fixture.inferenceVersion,
  });
  expect(seeded.seeded).toBe(1);
  vi.stubEnv("MAX_QUEUED_JOBS", "1");
  await t.run((ctx) =>
    ctx.db.insert("jobs", {
      key: "SYNTHETIC full queue",
      status: "queued",
      due: Date.now(),
      data: {},
    }),
  );
  const cached = await create("bob");
  expect(cached.status).toBe(202);
  expect(cached.body.analysisStatus).toBe("completed");
  vi.stubEnv("POSTS_PER_HOUR", "1");
  expect((await create("bob", "rate-check")).status).toBe(429);
});
