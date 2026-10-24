import { it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import schema from "../convex/schema";
import { discussion, mapRecord, plan, Apify } from "../src/providers";
import { actors, actorBuilds } from "../src/actors";
import { normalize } from "../src/graph";
import { slimSocialRow } from "../src/video";

const modules = {
  ...import.meta.glob("../convex/**/*.ts"),
  "../convex/_generated/marker.ts": async () => ({}),
};
afterEach(() => vi.unstubAllEnvs());
const task = (rows: any[]) => ({
  actor: actors.youtube,
  input: {},
  role: "discussion" as const,
  rows,
  offset: rows.length,
  done: true,
  truncated: false,
  run: {
    id: "synthetic-run",
    defaultDatasetId: "synthetic-data",
    status: "SUCCEEDED",
    startedAt: "2026-10-24T00:00:00Z",
    finishedAt: "2026-10-24T00:00:01Z",
  },
});
const youtube = (overrides = {}) => ({
  videoId: "jDtG_pwIIv0",
  videoTitle: "SYNTHETIC video title",
  videoCommentCount: 10,
  commentId: "parent",
  text: "SYNTHETIC comment text",
  authorChannelId: "synthetic-channel",
  authorName: "Display name",
  authorHandle: "@synthetic",
  isReply: false,
  parentId: null,
  publishedAt: "2026-10-24",
  publishedApprox: true,
  commentUrl: "https://www.youtube.com/watch?v=jDtG_pwIIv0&lc=parent",
  likeCount: 2,
  ...overrides,
});

it("builds an observed YouTube metadata root and preserves comments, authors and reply topology", async () => {
  const url = "https://www.youtube.com/watch?v=jDtG_pwIIv0";
  const data = discussion("youtube", url, [
    task([
      youtube(),
      youtube({
        commentId: "reply",
        text: "SYNTHETIC reply",
        isReply: true,
        parentId: "parent",
      }),
    ]),
  ]);
  expect(data.root.nativeId).toBe("jDtG_pwIIv0");
  expect(data.root.text).toBe("SYNTHETIC video title");
  expect(data.root.author).toBeNull();
  expect(data.root.timestamp).toBeNull();
  expect(data.reportedCount).toBe(10);
  const graph = await normalize("synthetic-youtube", "youtube", url, data, 20);
  const comments = graph.nodes.filter((node) => node.type === "comment");
  expect(comments).toHaveLength(2);
  expect(comments.find((node) => node.nativeId === "parent")?.parentId).toBe(
    graph.rootId,
  );
  expect(comments.find((node) => node.nativeId === "reply")?.parentId).toBe(
    "youtube:comment:parent",
  );
  expect(
    comments.every(
      (node) =>
        node.createdAt === null && node.sourceTimestamp === "2026-10-24",
    ),
  ).toBe(true);
  expect(graph.nodes.find((node) => node.type === "author")).toMatchObject({
    handle: "@synthetic",
    displayName: "Display name",
  });
  expect(comments[0].url).toContain("&lc=");
});

it("uses a later TikTok caption without borrowing a comment as the root or collecting profile fields", () => {
  const row = {
    videoId: "7653941272524115231",
    commentId: "one",
    text: "SYNTHETIC comment",
    commenterId: "90071992547409999",
    commenterUsername: "synthetic_user",
    commenterName: "Synthetic name",
    isReply: false,
    likes: 3,
    replies: 2,
    postedAt: "2026-10-24T12:00:00Z",
    commentUrl:
      "https://www.tiktok.com/@synthetic/video/7653941272524115231?share_comment_id=one",
    commenterAvatar: "private-unused-image",
    commenterBio: "unused",
  };
  const rows = [
    row,
    { ...row, commentId: "two", videoCaption: "SYNTHETIC actual caption" },
  ].map(slimSocialRow);
  const data = discussion(
    "tiktok",
    "https://www.tiktok.com/@synthetic/video/7653941272524115231",
    [task(rows)],
  );
  expect(data.root.text).toBe("SYNTHETIC actual caption");
  expect(data.root.author).toBeNull();
  expect(data.comments[0]).toMatchObject({
    topLevel: true,
    author: {
      nativeId: "90071992547409999",
      handle: "synthetic_user",
      displayName: "Synthetic name",
    },
    metrics: { likeCount: 3, replyCount: 2 },
  });
  expect(rows[0]).not.toHaveProperty("commenterAvatar");
  expect(rows[0]).not.toHaveProperty("commenterBio");
});

it.each(["youtube", "tiktok"] as const)(
  "rejects a %s dataset containing another video's comments",
  (platform) => {
    const url =
      platform === "youtube"
        ? "https://www.youtube.com/watch?v=jDtG_pwIIv0"
        : "https://www.tiktok.com/@synthetic/video/7653941272524115231";
    expect(() =>
      discussion(platform, url, [task([youtube({ videoId: "foreign" })])]),
    ).toThrow("different video");
    expect(() =>
      discussion(platform, url, [
        task([{ commentId: "one", text: "SYNTHETIC no video metadata" }]),
      ]),
    ).toThrow("original discussion root");
  },
);

it.each(["youtube", "tiktok"] as const)(
  "reports empty %s collections without inventing a video or comments",
  (platform) => {
    const url =
      platform === "youtube"
        ? "https://www.youtube.com/watch?v=jDtG_pwIIv0"
        : "https://www.tiktok.com/@synthetic/video/7653941272524115231";
    expect(() => discussion(platform, url, [task([])])).toThrow(
      "No accessible public video comments",
    );
  },
);

it("uses a single-post capable X lookup, authored replies and pinned builds", async () => {
  const tasks = plan("x", "discussion", "https://x.com/synthetic/status/100");
  expect(tasks[0].actor).toBe("apidojo/twitter-scraper-lite");
  expect(tasks[0].input).toMatchObject({ maxItems: 1 });
  const request = vi.fn().mockResolvedValue({
    status: 201,
    body: { data: { id: "run", status: "RUNNING" } },
  });
  const api = new Apify("synthetic-token", request);
  for (const actor of [actors.xRoot, actors.x, actors.youtube, actors.tiktok])
    await api.start(actor, {});
  for (const [index, actor] of [
    actors.xRoot,
    actors.x,
    actors.youtube,
    actors.tiktok,
  ].entries())
    expect(request.mock.calls[index][0]).toContain(
      `build=${actorBuilds[actor]}`,
    );
  expect(
    mapRecord("x", {
      id: "101",
      author: { id: "1", userName: "synthetic" },
      inReplyToId: "100",
      retweetCount: 3,
    }).metrics,
  ).toEqual({ repostCount: 3 });
});

it("queues concurrent runs of the same X Actor while allowing another platform", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  await t.run(async (ctx) => {
    for (const key of ["first", "second", "video"])
      await ctx.db.insert("jobs", {
        key,
        status: "running",
        due: now + 60000,
        data: {
          kind: "test",
          target: key,
          payload: {},
          status: "running",
          due: now,
          lease: now + 60000,
          token: key,
        },
      });
  });
  const reserve = (key: string, actor: string) =>
    t.mutation(anyApi.jobs.reserve, {
      key,
      token: key,
      operation: "run:0",
      actor,
    });
  expect(await reserve("first", actors.xRoot)).toEqual({ status: "reserved" });
  expect(await reserve("second", actors.xRoot)).toEqual({ status: "busy" });
  expect(await reserve("second", actors.x)).toEqual({ status: "busy" });
  expect(await reserve("video", actors.youtube)).toEqual({
    status: "reserved",
  });
  await t.mutation(anyApi.jobs.releaseRejected, {
    key: "first",
    token: "first",
    operation: "run:0",
  });
  expect(await reserve("second", actors.xRoot)).toEqual({ status: "reserved" });
});
