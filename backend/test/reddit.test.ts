import { it, expect } from "vitest";
import { redditRecord, redditSourceUrl } from "../src/reddit";
import { discussion } from "../src/providers";
import { normalize } from "../src/graph";
import type { Model } from "../src/core";
const url = "https://www.reddit.com/r/synthetic/comments/abc123/";
const root = () => ({
  _type: "post",
  _post_id: "t3_abc123",
  _status: "found",
  id: "abc123",
  name: "t3_abc123",
  author: "synthetic_op",
  author_fullname: "t2_op",
  title: "SYNTHETIC test discussion",
  selftext: "SYNTHETIC body",
  created_utc: 1792800000,
  score: 4,
  upvote_ratio: 0.8,
  num_comments: 5,
  permalink: "/r/synthetic/comments/abc123/",
});
const comment = () => ({
  _type: "comment",
  _post_id: "t3_abc123",
  id: "t1_parent",
  author: "synthetic_author",
  authorId: "t2_author",
  body: "SYNTHETIC comment",
  parentId: null,
  depth: 0,
  createdAt: "2026-10-23T20:00:00+0000",
  childCount: 0,
  score: -1,
  isScoreHidden: false,
  isDeleted: false,
  isRemoved: false,
  permalink: "/r/synthetic/comments/abc123/comment/parent",
});
function tasks(rows: any[]) {
  return [
    {
      actor: "clearpath/reddit-post-comments-bulk-scraper",
      input: {},
      role: "discussion" as const,
      rows,
      offset: rows.length,
      done: true,
      truncated: true,
      run: {
        id: "synthetic-run",
        defaultDatasetId: "synthetic-dataset",
        status: "SUCCEEDED",
        startedAt: "2026-10-23T20:00:00Z",
        finishedAt: "2026-10-23T20:01:00Z",
      },
    },
  ];
}
it("maps the observed Clearpath post/comment shape into a valid graph without changing native identifiers", async () => {
  const rows = [
    root(),
    comment(),
    { ...comment(), id: "t1_child", parentId: "t1_parent", depth: 1 },
  ];
  const data = discussion("reddit", url, tasks(rows));
  data.sourceSnapshotRef = "synthetic-snapshot";
  const graph = await normalize("synthetic-inv", "reddit", url, data, 20);
  const discussionNode = graph.nodes.find(
    (n) => n.type === "discussion",
  ) as Model<"DiscussionNode">;
  expect(discussionNode.nativeId).toBe("abc123");
  expect(discussionNode.authorId).toBe("reddit:author:t2_op");
  expect(discussionNode.text).toBe("SYNTHETIC body");
  expect(discussionNode.metrics).toEqual({
    score: 4,
    replyCount: 5,
    upvoteRatio: 0.8,
  });
  const parent = graph.nodes.find(
    (n) => n.id === "reddit:comment:t1_parent",
  ) as Model<"CommentNode">;
  expect(parent.createdAt).toBe("2026-10-23T20:00:00.000Z");
  expect(parent.metrics).toEqual({ score: -1, replyCount: 0 });
  expect(parent.parentId).toBe(graph.rootId);
  const child = graph.nodes.find(
    (n) => n.id === "reddit:comment:t1_child",
  ) as Model<"CommentNode">;
  expect(child.parentId).toBe(parent.id);
  expect(child.authorId).toBe(parent.authorId);
  expect(graph.coverage.completeness).toBe("partial");
});
it("omits provider-hidden scores and preserves genuinely observed zero metrics", () => {
  const hidden = redditRecord({ ...comment(), score: 0, isScoreHidden: true });
  expect(hidden.metrics).toEqual({ replyCount: 0 });
  expect(redditRecord({ ...comment(), score: 0 }).metrics?.score).toBe(0);
  const missing = redditRecord({
    _type: "comment",
    id: "empty",
    body: "SYNTHETIC",
  });
  expect(missing.metrics).toEqual({});
});
it("maps deleted/removed content separately from an author's unavailable identity", () => {
  expect(
    redditRecord({
      ...comment(),
      body: "",
      isDeleted: true,
      author: "[deleted]",
      authorId: null,
    }).contentStatus,
  ).toBe("deleted");
  expect(
    redditRecord({ ...comment(), isDeleted: true, isRemoved: true })
      .contentStatus,
  ).toBe("removed");
  expect(
    redditRecord({ ...comment(), author: "[deleted]", authorId: null })
      .contentStatus,
  ).toBe("visible");
});
it("does not move a nested comment with an unavailable parent to the discussion root", async () => {
  const data = discussion(
    "reddit",
    url,
    tasks([root(), { ...comment(), depth: 2, parentId: null }]),
  );
  data.sourceSnapshotRef = "synthetic";
  const graph = await normalize("synthetic", "reddit", url, data, 20);
  const c = graph.nodes.find(
    (n) => n.type === "comment",
  ) as Model<"CommentNode">;
  expect(c.parentId).toBeNull();
});
it("derives relative Reddit permalinks safely and rejects unrelated or credential-bearing links", () => {
  expect(
    redditSourceUrl({
      permalink: "/r/synthetic/comments/abc123/comment/parent",
    }),
  ).toBe("https://www.reddit.com/r/synthetic/comments/abc123/comment/parent");
  for (const permalink of [
    "//internal.local/path",
    "https://user:secret@www.reddit.com/path",
    "https://evil.example/path",
    "http://www.reddit.com/path",
  ])
    expect(redditSourceUrl({ permalink })).toBeNull();
});
it("rejects unavailable roots and comments belonging to another discussion", () => {
  expect(() =>
    discussion("reddit", url, tasks([{ ...root(), _status: "unavailable" }])),
  ).toThrow("not available");
  expect(() =>
    discussion(
      "reddit",
      url,
      tasks([root(), { ...comment(), _post_id: "t3_other" }]),
    ),
  ).toThrow("different discussion");
});
it("does not interpret a linked image as post text", () => {
  const data = discussion(
    "reddit",
    url,
    tasks([
      {
        ...root(),
        selftext: "",
        post_hint: "image",
        url: "https://i.redd.it/synthetic.png",
      },
    ]),
  );
  expect(data.root.text).toBe("");
  expect(data.limitations.join(" ")).toContain(
    "image/video content is not collected or analyzed",
  );
});
