import { it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import schema from "../convex/schema";
import { advance } from "../src/providers";
import { normalize } from "../src/graph";
import { fixtureDiscussion, fixtureUrls } from "../src/fixture";
import { ApiFault, iso } from "../src/core";
vi.mock("../src/providers", async (original) => ({
  ...(await original<typeof import("../src/providers")>()),
  advance: vi.fn(),
}));
const modules = {
  ...import.meta.glob("../convex/**/*.ts"),
  "../convex/_generated/marker.ts": async () => ({}),
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
it("retains an earlier author's evidence when a later history task exhausts retries", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T00:00:00Z"));
  vi.stubEnv("PROVIDER_MODE", "live");
  vi.mocked(advance).mockRejectedValue(
    new ApiFault(500, "PROVIDER_TIMEOUT", "Synthetic provider timeout", true),
  );
  const t = convexTest(schema, modules);
  const graph = await normalize(
    "investigation",
    "reddit",
    fixtureUrls.reddit,
    fixtureDiscussion("reddit", fixtureUrls.reddit, "source-snapshot"),
    100,
  );
  const authors = [
    {
      authorId: "reddit:author:t2_alex",
      anchorCommentId: "reddit:comment:t1_a",
    },
    {
      authorId: "reddit:author:t2_ben",
      anchorCommentId: "reddit:comment:t1_b",
    },
  ];
  const tasks = [
    {
      authorIds: [authors[0].authorId],
      actor: "SYNTHETIC",
      input: {},
      role: "history",
      run: { id: "done-run", status: "SUCCEEDED" },
      rows: [
        {
          id: "t1_history1",
          text: "SYNTHETIC collected evidence",
          authorId: "t2_alex",
          createdAt: "2026-10-22T12:00:00Z",
          postId: "t3_other",
        },
      ],
      offset: 1,
      done: true,
      truncated: false,
    },
    {
      authorIds: [authors[1].authorId],
      actor: "SYNTHETIC",
      input: {},
      role: "history",
      run: { id: "failed-run", status: "RUNNING" },
      rows: [],
      offset: 0,
      done: false,
      truncated: false,
    },
  ];
  await t.run(async (ctx) => {
    await ctx.db.insert("investigations", {
      key: "investigation",
      data: { providerMode: "live", owner: "synthetic", resource: {} },
    });
    await ctx.db.insert("graphs", { key: "investigation", data: graph });
    await ctx.db.insert("enrichments", {
      key: "enrichment",
      data: {
        request: {
          authors,
          limit: 10,
          windowDays: 14,
          fallback: "most_recent",
        },
        resource: {
          schemaVersion: "1.0.0",
          enrichmentId: "enrichment",
          investigationId: "investigation",
          status: "queued",
          createdAt: iso(),
          startedAt: null,
          completedAt: null,
        },
      },
    });
    await ctx.db.insert("jobs", {
      key: "job",
      status: "queued",
      due: Date.now(),
      data: {
        kind: "enrich",
        target: "enrichment",
        status: "queued",
        due: Date.now(),
        attempt: 2,
        lease: null,
        payload: {
          tasks,
          index: 1,
          began: Date.now(),
          historyContext: {
            mode: "live",
            missing: authors.map((a) => a.authorId),
            sets: {},
          },
        },
      },
    });
  });
  await t.action(anyApi.worker.tick, { key: "job" });
  const result = await t.run((ctx) =>
    ctx.db
      .query("enrichments")
      .withIndex("key", (q) => q.eq("key", "enrichment"))
      .unique(),
  );
  expect(result!.data.resource.status).toBe("completed");
  expect(result!.data.resource.results[0].status).toBe("partial");
  expect(result!.data.resource.results[0].comments[0].nativeId).toBe(
    "t1_history1",
  );
  expect(result!.data.resource.results[1].status).toBe("failed");
  expect(result!.data.resource.results[1].coverage.actorRunIds).toEqual([
    "failed-run",
  ]);
  expect(
    await t.run((ctx) => ctx.db.query("snapshots").collect()),
  ).toHaveLength(1);
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
});
