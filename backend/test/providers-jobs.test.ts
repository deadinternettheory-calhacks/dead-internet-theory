import { it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import schema from "../convex/schema";
import {
  Apify,
  plan,
  mapRecord,
  discussion,
  historySets,
  liveGate,
  advance,
  verification,
} from "../src/providers";
import { publicAddress } from "../src/outbound";
import { iso, limits } from "../src/core";
const modules = {
  ...import.meta.glob("../convex/**/*.ts"),
  "../convex/_generated/marker.ts": async () => ({}),
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it.each([
  "127.0.0.1",
  "10.0.0.1",
  "169.254.169.254",
  "172.16.0.1",
  "192.168.1.1",
  "0.0.0.0",
  "224.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
  "fc00::1",
  "fe80::1",
  "2001:db8::1",
])("blocks private/reserved SSRF address %s", (address) =>
  expect(publicAddress(address)).toBe(false),
);
it("permits public unicast addresses", () => {
  expect(publicAddress("8.8.8.8")).toBe(true);
  expect(publicAddress("2606:4700:4700::1111")).toBe(true);
});
it("starts Apify asynchronously with spend/time caps, polls persisted run IDs and pages bounded datasets without URL credentials", async () => {
  const mock = vi
    .fn()
    .mockResolvedValueOnce({
      status: 201,
      body: { data: { id: "run", status: "RUNNING" } },
    })
    .mockResolvedValueOnce({
      status: 200,
      body: {
        data: { id: "run", status: "SUCCEEDED", defaultDatasetId: "data" },
      },
    })
    .mockResolvedValueOnce({ status: 200, body: [{ id: "1" }] });
  const api = new Apify("server-only-test-token", mock);
  await api.start("clearpath/reddit-post-comments-bulk-scraper", {
    postUrl: "synthetic",
  });
  await api.poll("run");
  expect(await api.items("data", 100, 50)).toEqual([{ id: "1" }]);
  expect(mock.mock.calls[0][0]).toContain("waitForFinish=0");
  expect(mock.mock.calls[0][0]).toContain("maxTotalChargeUsd=0.25");
  expect(mock.mock.calls[0][0]).toContain("build=0.0.127");
  expect(mock.mock.calls[2][0]).toContain("offset=100&limit=50");
  expect(
    mock.mock.calls.every(([url]) => !url.includes("server-only-test-token")),
  ).toBe(true);
});
it("classifies retryable provider failures and inaccessible datasets", async () => {
  await expect(
    new Apify(
      "token",
      vi.fn().mockResolvedValue({ status: 429, body: {} }),
    ).poll("run"),
  ).rejects.toMatchObject({ retryable: true });
  await expect(
    new Apify(
      "token",
      vi.fn().mockResolvedValue({ status: 403, body: {} }),
    ).poll("run"),
  ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE", retryable: false });
});
it("fails closed without approved authorization, retention and runtime evidence", async () => {
  expect(() => liveGate("reddit")).toThrow();
  vi.stubEnv("PROVIDER_MODE", "live");
  vi.stubEnv("APIFY_TOKEN", "SYNTHETIC-MOCK-CREDENTIAL");
  vi.stubEnv("PROVIDER_AUTHORIZATION_APPROVED", "true");
  vi.stubEnv("RETENTION_POLICY_REF", "review-required");
  expect(() => liveGate("x")).toThrow("runtime evidence");
  expect(verification.reddit.runtimeVerified).toBe(true);
  expect(
    [verification.x, verification.youtube, verification.tiktok].every(
      (v) => !v.runtimeVerified,
    ),
  ).toBe(true);
});
it("batches Reddit repeated author lookup plans, separates X root and authored searches and never fetches video histories", () => {
  const authors = [
    {
      id: "reddit:author:a",
      type: "author",
      nativeId: "a",
      platform: "reddit",
      handle: "alice",
      displayName: null,
      identityQuality: "provider_id",
    },
    {
      id: "reddit:author:b",
      type: "author",
      nativeId: "b",
      platform: "reddit",
      handle: "ben",
      displayName: null,
      identityQuality: "provider_id",
    },
  ] as const;
  const reddit = plan("reddit", "history", undefined, [...authors]);
  expect(reddit).toHaveLength(1);
  expect(reddit[0].input).toMatchObject({
    usernames: ["alice", "ben"],
    contentType: "comments",
    maxItemsPerUser: 150,
  });
  const x = plan("x", "discussion", "https://x.com/synthetic/status/100");
  expect(x.map((t) => t.role)).toEqual(["root", "discussion"]);
  expect(plan("x", "history", undefined, [...authors])[0].input).toMatchObject({
    searchTerms: ["from:alice"],
  });
  expect(plan("youtube", "history")).toEqual([]);
  expect(plan("tiktok", "history")).toEqual([]);
});
it("maps candidate platform fields without precision loss, fabricated metrics or audiovisual claims", () => {
  const youtube = mapRecord("youtube", {
    commentId: "abc",
    authorChannelId: "channel",
    publishedAt: "2026-10-23T00:00:00Z",
    text: "metadata",
  });
  expect(youtube.estimated).toBe(true);
  expect(youtube.metrics).toEqual({});
  const x = mapRecord("x", {
    id: "9007199254740999999",
    author: { id: "10" },
    inReplyToId: "11",
    text: "reply",
  });
  expect(x.nativeId).toBe("9007199254740999999");
  expect(x.parentNativeId).toBe("11");
  const tiktok = mapRecord("tiktok", {
    commentId: "1",
    parentCommentId: "2",
    replyToCommentId: "3",
  });
  expect(tiktok.parentNativeId).toBe("3");
  expect(() =>
    discussion("x", "https://x.com/synthetic/status/100", [
      {
        actor: "test",
        input: {},
        role: "discussion",
        rows: [{ id: "reply", inReplyToId: "root", text: "reply" }],
        offset: 1,
        done: true,
        truncated: false,
      },
    ]),
  ).toThrow("original discussion root");
});
it("concurrency leases persist, stale results are ignored and recovery is bounded", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  vi.stubEnv("MAX_ACTIVE_JOBS", "1");
  const now = Date.now();
  await t.run(async (ctx) => {
    for (const key of ["one", "two"])
      await ctx.db.insert("jobs", {
        key,
        status: "queued",
        due: now,
        data: {
          kind: "test",
          target: key,
          payload: {},
          status: "queued",
          due: now,
          attempt: 0,
          lease: null,
        },
      });
  });
  const first = await t.mutation(anyApi.jobs.claim, { key: "one" });
  expect(first).not.toBeNull();
  expect(await t.mutation(anyApi.jobs.claim, { key: "two" })).toBeNull();
  await t.mutation(anyApi.jobs.settle, {
    key: "one",
    token: "wrong-token",
    outcome: { delivered: true },
  });
  expect(
    (
      await t.run(
        async (ctx) =>
          (await ctx.db
            .query("jobs")
            .withIndex("key", (q) => q.eq("key", "one"))
            .unique())!.data,
      )
    ).status,
  ).toBe("running");
  vi.setSystemTime(now + 62000);
  const recovered = await t.mutation(anyApi.jobs.claim, { key: "one" });
  expect(recovered.job.attempt).toBe(1);
  expect(recovered.job.token).not.toBe(first.job.token);
  await t.mutation(anyApi.jobs.settle, {
    key: "one",
    token: recovered.job.token,
    outcome: { delivered: true },
  });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
});
it("reserves run budgets atomically and refuses ambiguous duplicate starts", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  vi.stubEnv("APIFY_DAILY_BUDGET_CENTS", "25");
  await t.run((ctx) =>
    ctx.db.insert("jobs", {
      key: "job",
      status: "running",
      due: Date.now(),
      data: { status: "running", token: "token", lease: Date.now() + 60000 },
    }),
  );
  const args = { key: "job", token: "token", operation: "run:0" };
  expect(await t.mutation(anyApi.jobs.reserve, args)).toEqual({
    status: "reserved",
  });
  expect(await t.mutation(anyApi.jobs.reserve, args)).toEqual({
    status: "denied",
    reason: "ambiguous",
  });
  expect(
    await t.mutation(anyApi.jobs.reserve, { ...args, operation: "run:1" }),
  ).toEqual({ status: "denied", reason: "budget" });
});
it("can disable the daily reservation cap while preserving the per-run charge cap", async () => {
  vi.useFakeTimers();
  vi.stubEnv("APIFY_DAILY_BUDGET_CENTS", "0");
  vi.stubEnv("APIFY_RUN_BUDGET_CENTS", "100");
  const t = convexTest(schema, modules);
  const day = `budget:${new Date().toISOString().slice(0, 10)}`;
  await t.run(async (ctx) => {
    await ctx.db.insert("controls", { key: day, data: 999999 });
    await ctx.db.insert("jobs", {
      key: "uncapped",
      status: "running",
      due: Date.now(),
      data: { status: "running", token: "token", lease: Date.now() + 60000 },
    });
  });
  for (const operation of ["run:0", "run:1"])
    expect(
      await t.mutation(anyApi.jobs.reserve, {
        key: "uncapped",
        token: "token",
        operation,
      }),
    ).toEqual({ status: "reserved" });
  const request = vi.fn().mockResolvedValue({
    status: 201,
    body: { data: { id: "synthetic-run" } },
  });
  await new Apify("synthetic-token", request).start(
    "clearpath/reddit-post-comments-bulk-scraper",
    {},
  );
  expect(request.mock.calls[0][0]).toContain("maxTotalChargeUsd=1");
});
it("resumes provider run/pagination state without repeating a billable start and preserves partial output", async () => {
  vi.stubEnv("PROVIDER_MODE", "live");
  vi.stubEnv("APIFY_TOKEN", "SYNTHETIC-MOCK-CREDENTIAL");
  vi.stubEnv("PROVIDER_AUTHORIZATION_APPROVED", "true");
  vi.stubEnv("RETENTION_POLICY_REF", "synthetic-test-only");
  const old = { ...verification.reddit };
  verification.reddit = {
    runtimeVerified: true,
    evidence: "SYNTHETIC MOCK, not provider verification",
  };
  const start = vi.spyOn(Apify.prototype, "start").mockResolvedValue({
    id: "run1",
    status: "RUNNING",
    defaultDatasetId: "ds",
  });
  const poll = vi.spyOn(Apify.prototype, "poll").mockResolvedValue({
    id: "run1",
    status: "FAILED",
    defaultDatasetId: "ds",
    startedAt: "2026-10-23T00:00:00Z",
    finishedAt: "2026-10-23T00:01:00Z",
  });
  vi.spyOn(Apify.prototype, "items").mockResolvedValue([
    { id: "t3_demo", type: "post", text: "SYNTHETIC root" },
    { id: "t1_a", type: "comment", text: "SYNTHETIC reply", parentId: null },
  ]);
  const reserve = vi.fn().mockResolvedValue({ status: "reserved" });
  const observe = vi.fn().mockResolvedValue(true);
  try {
    const first = await advance({
      platform: "reddit",
      kind: "discussion",
      url: "https://www.reddit.com/r/example/comments/demo/",
      state: {},
      reserve,
      observe,
    });
    expect(first.done).toBe(false);
    const second = await advance({
      platform: "reddit",
      kind: "discussion",
      url: "https://www.reddit.com/r/example/comments/demo/",
      state: structuredClone(first.state!),
      reserve,
      observe,
    });
    expect(second.done).toBe(false);
    const third = await advance({
      platform: "reddit",
      kind: "discussion",
      url: "https://www.reddit.com/r/example/comments/demo/",
      state: structuredClone(second.state!),
      reserve,
      observe,
    });
    expect(third.done).toBe(true);
    expect(third.discussion?.truncated).toBe(true);
    expect(third.discussion?.comments).toHaveLength(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledTimes(1);
  } finally {
    verification.reddit = old;
    vi.restoreAllMocks();
  }
});
it("isolates X history run failures by requested author and excludes original authored tweets", () => {
  const authors = [
    {
      id: "x:author:a",
      type: "author",
      nativeId: "a",
      platform: "x",
      handle: "alice",
      displayName: null,
      identityQuality: "provider_id",
    },
    {
      id: "x:author:b",
      type: "author",
      nativeId: "b",
      platform: "x",
      handle: "ben",
      displayName: null,
      identityQuality: "provider_id",
    },
  ] as const;
  const tasks = plan("x", "history", undefined, [...authors]);
  tasks[0].run = { id: "run-a", status: "SUCCEEDED" };
  tasks[0].rows = [
    { id: "original", text: "SYNTHETIC tweet", author: { id: "a" } },
    {
      id: "reply",
      text: "SYNTHETIC reply",
      inReplyToId: "other",
      conversationId: "other",
      author: { id: "a" },
      createdAt: "2026-10-23T00:00:00Z",
    },
  ];
  tasks[1].run = { id: "run-b", status: "FAILED" };
  const sets = historySets(
    "x",
    authors.map((a) => a.id),
    tasks,
    "snapshot",
  );
  expect(sets.get("x:author:a")?.comments.map((c) => c.nativeId)).toEqual([
    "reply",
  ]);
  expect(sets.get("x:author:b")?.status).toBe("failed");
  expect(sets.get("x:author:a")?.coverage.actorRunIds).toEqual(["run-a"]);
});
it("holds provider capacity across worker ticks, only releasing a confirmed terminal run", async () => {
  vi.useFakeTimers();
  vi.stubEnv("MAX_ACTIVE_PROVIDER_RUNS", "1");
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const key of ["first", "second"])
      await ctx.db.insert("jobs", {
        key,
        status: "running",
        due: Date.now(),
        data: {
          kind: "test",
          target: key,
          status: "running",
          token: key,
          lease: Date.now() + 60000,
        },
      });
  });
  const first = { key: "first", token: "first", operation: "run:0" };
  const second = { key: "second", token: "second", operation: "run:0" };
  expect(await t.mutation(anyApi.jobs.reserve, first)).toEqual({
    status: "reserved",
  });
  expect(
    await t.mutation(anyApi.jobs.observeRun, {
      ...first,
      runId: "actor-1",
      status: "RUNNING",
    }),
  ).toBe(true);
  await t.run(async (ctx) => {
    const doc = await ctx.db
      .query("jobs")
      .withIndex("key", (q) => q.eq("key", "first"))
      .unique();
    await ctx.db.patch(doc!._id, {
      status: "queued",
      data: { ...doc!.data, status: "queued", lease: null },
    });
  });
  expect(await t.mutation(anyApi.jobs.reserve, second)).toEqual({
    status: "busy",
  });
  await t.run(async (ctx) => {
    const doc = await ctx.db
      .query("jobs")
      .withIndex("key", (q) => q.eq("key", "first"))
      .unique();
    await ctx.db.patch(doc!._id, {
      status: "running",
      data: { ...doc!.data, status: "running", lease: Date.now() + 60000 },
    });
  });
  expect(await t.mutation(anyApi.jobs.reserve, first)).toEqual({
    status: "resume",
    runId: "actor-1",
  });
  expect(
    await t.mutation(anyApi.jobs.observeRun, {
      ...first,
      runId: "other-run",
      status: "SUCCEEDED",
    }),
  ).toBe(false);
  expect(await t.mutation(anyApi.jobs.reserve, second)).toEqual({
    status: "busy",
  });
  expect(
    await t.mutation(anyApi.jobs.observeRun, {
      ...first,
      runId: "actor-1",
      status: "SUCCEEDED",
    }),
  ).toBe(true);
  expect(await t.mutation(anyApi.jobs.reserve, second)).toEqual({
    status: "reserved",
  });
});
it("does not release ambiguous provider capacity just because a worker lease expires", async () => {
  vi.useFakeTimers();
  vi.stubEnv("MAX_ACTIVE_PROVIDER_RUNS", "1");
  const t = convexTest(schema, modules);
  const now = Date.now();
  await t.run(async (ctx) => {
    for (const key of ["lost", "next"])
      await ctx.db.insert("jobs", {
        key,
        status: "running",
        due: now,
        data: { status: "running", token: key, lease: now + 60000 },
      });
  });
  expect(
    await t.mutation(anyApi.jobs.reserve, {
      key: "lost",
      token: "lost",
      operation: "run:0",
    }),
  ).toEqual({ status: "reserved" });
  vi.setSystemTime(now + 60001);
  expect(
    await t.mutation(anyApi.jobs.observeRun, {
      key: "lost",
      token: "lost",
      operation: "run:0",
      runId: "unknown",
      status: "SUCCEEDED",
    }),
  ).toBe(false);
  await t.run(async (ctx) => {
    const job = await ctx.db
      .query("jobs")
      .withIndex("key", (q) => q.eq("key", "next"))
      .unique();
    await ctx.db.patch(job!._id, {
      data: { ...job!.data, lease: Date.now() + 60000 },
    });
  });
  expect(
    await t.mutation(anyApi.jobs.reserve, {
      key: "next",
      token: "next",
      operation: "run:0",
    }),
  ).toEqual({ status: "busy" });
});
it("reuses a confirmed run after loss of the action's payload write", async () => {
  vi.stubEnv("PROVIDER_MODE", "live");
  vi.stubEnv("APIFY_TOKEN", "SYNTHETIC-MOCK-CREDENTIAL");
  vi.stubEnv("PROVIDER_AUTHORIZATION_APPROVED", "true");
  vi.stubEnv("RETENTION_POLICY_REF", "SYNTHETIC-TEST");
  const old = verification.reddit;
  verification.reddit = { runtimeVerified: true, evidence: "SYNTHETIC MOCK" };
  const start = vi.spyOn(Apify.prototype, "start");
  const poll = vi.spyOn(Apify.prototype, "poll").mockResolvedValue({
    id: "confirmed",
    status: "RUNNING",
    defaultDatasetId: "dataset",
  });
  try {
    const result = await advance({
      platform: "reddit",
      kind: "discussion",
      url: "https://www.reddit.com/r/example/comments/demo/",
      state: {},
      reserve: async () => ({ status: "resume", runId: "confirmed" }),
      observe: async () => true,
    });
    expect(result.done).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(poll).toHaveBeenCalledWith("confirmed");
  } finally {
    verification.reddit = old;
    vi.restoreAllMocks();
  }
});
it("bounds each X author's dataset independently from the total batch size", async () => {
  vi.stubEnv("PROVIDER_MODE", "live");
  vi.stubEnv("APIFY_TOKEN", "SYNTHETIC-MOCK-CREDENTIAL");
  vi.stubEnv("PROVIDER_AUTHORIZATION_APPROVED", "true");
  vi.stubEnv("RETENTION_POLICY_REF", "SYNTHETIC-TEST");
  const old = verification.x;
  verification.x = { runtimeVerified: true, evidence: "SYNTHETIC MOCK" };
  const authors = [
    {
      id: "x:author:a",
      type: "author",
      nativeId: "a",
      platform: "x",
      handle: "a",
      displayName: null,
      identityQuality: "provider_id",
    },
    {
      id: "x:author:b",
      type: "author",
      nativeId: "b",
      platform: "x",
      handle: "b",
      displayName: null,
      identityQuality: "provider_id",
    },
  ] as const;
  const tasks = plan("x", "history", undefined, [...authors]);
  tasks[0].run = {
    id: "run-a",
    status: "SUCCEEDED",
    defaultDatasetId: "dataset-a",
  };
  tasks[0].offset = 100;
  const items = vi
    .spyOn(Apify.prototype, "items")
    .mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({ id: String(i) })),
    );
  try {
    const result = await advance({
      platform: "x",
      kind: "history",
      authors: [...authors],
      state: { tasks, index: 0, began: Date.now() },
      reserve: async () => ({ status: "reserved" }),
      observe: async () => true,
    });
    expect(items).toHaveBeenCalledWith("dataset-a", 100, 50);
    expect(result.state?.index).toBe(1);
  } finally {
    verification.x = old;
    vi.restoreAllMocks();
  }
});
it("stores one protected snapshot for a batched history response shared by multiple authors", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const now = iso();
  await t.run(async (ctx) => {
    await ctx.db.insert("enrichments", {
      key: "enrichment",
      data: {
        request: {},
        resource: {
          schemaVersion: "1.0.0",
          enrichmentId: "enrichment",
          investigationId: "investigation",
          status: "running",
          createdAt: now,
          startedAt: now,
          completedAt: null,
        },
      },
    });
    await ctx.db.insert("jobs", {
      key: "job",
      status: "running",
      due: Date.now(),
      data: {
        kind: "enrich",
        due: Date.now(),
        target: "enrichment",
        status: "running",
        token: "token",
        lease: Date.now() + 60000,
      },
    });
  });
  const { emptySet } = await import("../src/fixture");
  const set = emptySet();
  set.coverage.sourceSnapshotRef = "shared-snapshot";
  await t.mutation(anyApi.jobs.settle, {
    key: "job",
    token: "token",
    outcome: {
      results: [],
      caches: [
        { key: "a", set },
        { key: "b", set },
      ],
      snapshots: [
        { key: "shared-snapshot", raw: { synthetic: true, rows: ["a", "b"] } },
      ],
    },
  });
  expect(
    await t.run((ctx) => ctx.db.query("snapshots").collect()),
  ).toHaveLength(1);
  expect(await t.run((ctx) => ctx.db.query("cache").collect())).toHaveLength(2);
});
it("does not duplicate an X original tweet returned in both root and replies datasets", () => {
  const tasks = plan("x", "discussion", "https://x.com/synthetic/status/100");
  tasks[0].rows = [{ id: "100", text: "SYNTHETIC root" }];
  tasks[1].rows = [
    { id: "100", text: "SYNTHETIC root again" },
    { id: "101", text: "SYNTHETIC reply", inReplyToId: "100" },
  ];
  for (const [i, task] of tasks.entries())
    task.run = {
      id: `run-${i}`,
      defaultDatasetId: `dataset-${i}`,
      status: "SUCCEEDED",
    };
  const data = discussion("x", "https://x.com/synthetic/status/100", tasks);
  expect(data.comments.map((c) => c.nativeId)).toEqual(["101"]);
});
