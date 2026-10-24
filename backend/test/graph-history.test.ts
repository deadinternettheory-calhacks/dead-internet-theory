import { it, expect } from "vitest";
import {
  normalize,
  fingerprint,
  timestamp,
  nativeString,
  type DiscussionData,
} from "../src/graph";
import {
  fixtureDiscussion,
  fixtureUrls,
  fixtureHistory,
  emptySet,
} from "../src/fixture";
import { sample } from "../src/history";
import { checkGraph, checkAnalysis } from "../src/invariants";
import { validate, type Model } from "../src/core";
const base = () =>
  fixtureDiscussion("reddit", fixtureUrls.reddit, "protected-snapshot");
it("normalizes original text, topology, repeated authors, missing parents, null identities, observed metrics and duplicate records", async () => {
  const data = base();
  const a = data.comments[0];
  data.comments.push(
    { ...a },
    {
      ...a,
      nativeId: "unknown-parent",
      parentNativeId: "missing",
      topLevel: false,
      author: { nativeId: null, handle: "[deleted]" },
      metrics: {},
    },
    { ...a, nativeId: "anonymous2", author: null, timestamp: null },
  );
  const g = await normalize("inv", "reddit", fixtureUrls.reddit, data, 100);
  validate("GraphEnvelope", g);
  checkGraph(g);
  expect(g.coverage.retrievedCommentCount).toBe(5);
  expect(
    g.nodes.filter((n) => n.type === "author" && n.handle === "[deleted]"),
  ).toHaveLength(0);
  const missing = g.nodes.find(
    (n) => n.id === "reddit:comment:unknown-parent",
  ) as Model<"CommentNode">;
  expect(missing.parentId).toBeNull();
  expect(missing.nativeParentId).toBe("missing");
  expect(missing.metrics).toEqual({});
  const anon = g.nodes.find(
    (n) => n.id === "reddit:comment:anonymous2",
  ) as Model<"CommentNode">;
  expect(anon.authorId).toBeNull();
  expect(anon.timestampPrecision).toBe("unknown");
  expect(
    g.nodes.filter(
      (n) => n.type === "author" && n.id === "reddit:author:t2_alex",
    ),
  ).toHaveLength(1);
});
it("has deterministic serialization and SHA-256 fingerprint independent of provider order", async () => {
  const data = base();
  data.comments.push({ ...data.comments[0], text: "different duplicate" });
  const g = await normalize("inv", "reddit", fixtureUrls.reddit, data, 100);
  const reordered = await normalize(
    "inv",
    "reddit",
    fixtureUrls.reddit,
    { ...data, comments: [...data.comments].reverse() },
    100,
  );
  expect(reordered).toEqual(g);
  expect(g.graphFingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(await fingerprint(g)).toBe(g.graphFingerprint);
  const changed = structuredClone(g);
  changed.nodes[0].text = "changed";
  expect(await fingerprint(changed)).not.toBe(g.graphFingerprint);
});
it("does not imply completeness from provider success and labels a configured cap partial", async () => {
  const data = base();
  data.exhaustive = false;
  const g = await normalize("inv", "reddit", fixtureUrls.reddit, data, 1);
  expect(g.coverage.truncated).toBe(true);
  expect(g.coverage.completeness).toBe("partial");
  expect(g.coverage.retrievedCommentCount).toBe(1);
  data.truncated = null;
  const all = await normalize("inv", "reddit", fixtureUrls.reddit, data, 100);
  expect(all.coverage.completeness).toBe("unknown");
});
it("preserves unavailable provider IDs as null and creates distinct deterministic synthetic comment IDs", async () => {
  const data = base();
  data.comments = [
    { nativeId: null, text: "a", topLevel: true },
    { nativeId: null, text: "b", topLevel: true },
  ];
  const g = await normalize("inv", "reddit", fixtureUrls.reddit, data, 100);
  expect(
    g.nodes
      .filter((n) => n.type === "comment")
      .every((n) => n.id.includes(":synthetic:") && n.nativeId === null),
  ).toBe(true);
  expect(nativeString(123)).toBe("123");
  expect(() => nativeString(Number.MAX_SAFE_INTEGER + 1)).toThrow();
});
it("normalizes timezone offsets/epoch seconds, preserves estimated times and rejects ambiguous relative/local times", () => {
  expect(timestamp("2026-10-01T12:00:00+02:00").createdAt).toBe(
    "2026-10-01T10:00:00.000Z",
  );
  expect(timestamp(0).createdAt).toBe("1970-01-01T00:00:00.000Z");
  expect(timestamp("2026-10-01T12:00:00Z", true).timestampPrecision).toBe(
    "estimated",
  );
  expect(timestamp("2 days ago").createdAt).toBeNull();
  expect(timestamp("2026-10-01 10:00:00").createdAt).toBeNull();
  expect(timestamp("Thu Oct 01 12:00:00 +0000 2026").createdAt).toBe(
    "2026-10-01T12:00:00.000Z",
  );
});
async function context() {
  const graph = await normalize(
    "inv",
    "reddit",
    fixtureUrls.reddit,
    base(),
    100,
  );
  const anchor = graph.nodes.find(
    (n) => n.id === "reddit:comment:t1_a",
  ) as Model<"CommentNode">;
  return {
    anchor,
    pair: { authorId: anchor.authorId!, anchorCommentId: anchor.id },
  };
}
function history(
  authorId: string,
  days: number,
  id: string,
): Model<"HistoryComment"> {
  return {
    id: `reddit:comment:${id}`,
    nativeId: id,
    authorId,
    text: "SYNTHETIC candidate",
    createdAt: new Date(
      Date.parse("2026-10-23T20:00:00Z") + days * 86400000,
    ).toISOString(),
    timestampPrecision: "exact",
    url: null,
    sourceDiscussionNativeId: "other",
    metrics: {},
  };
}
it("selects exact ten nearest with newer timestamp then ID tie-breaking", async () => {
  const { anchor, pair } = await context();
  anchor.createdAt = "2026-10-23T20:00:00Z";
  const comments = Array.from({ length: 11 }, (_, i) =>
    history(
      pair.authorId,
      i < 2 ? 1 : i < 4 ? -1 : 2,
      `id${i.toString().padStart(2, "0")}`,
    ),
  );
  const result = sample(
    pair,
    anchor,
    "t3_demo",
    { ...emptySet(), comments },
    14,
    Date.parse("2026-12-01T00:00:00Z"),
  );
  expect(result.status).toBe("complete");
  expect(result.strategy).toBe("temporal_nearest");
  expect(result.comments.slice(0, 4).map((c) => c.nativeId)).toEqual([
    "id00",
    "id01",
    "id02",
    "id03",
  ]);
  expect(result.comments).toHaveLength(10);
});
it("replaces the temporal selection entirely with the ten most recent available candidates", async () => {
  const { anchor, pair } = await context();
  anchor.createdAt = "2026-10-23T20:00:00Z";
  const comments = [
    history(pair.authorId, 0, "near"),
    ...Array.from({ length: 10 }, (_, i) =>
      history(pair.authorId, 20 + i, `recent${i}`),
    ),
  ];
  const result = sample(
    pair,
    anchor,
    "t3_demo",
    { ...emptySet(), comments },
    14,
    Date.parse("2026-12-01T00:00:00Z"),
  );
  expect(result.strategy).toBe("recent_fallback");
  expect(result.comments).toHaveLength(10);
  expect(result.comments.some((c) => c.nativeId === "near")).toBe(false);
});
it("excludes focal discussion, anchors, duplicates, future/invalid/unknown timestamps and unknown discussion IDs", async () => {
  const { anchor, pair } = await context();
  const good = history(pair.authorId, -1, "good");
  const comments = [
    good,
    good,
    { ...good, nativeId: "focal", sourceDiscussionNativeId: "t3_demo" },
    { ...good, id: anchor.id, nativeId: "anchor" },
    { ...good, nativeId: "unknown", createdAt: null },
    { ...good, nativeId: "future", createdAt: "2099-01-01T00:00:00Z" },
    { ...good, nativeId: "bad", createdAt: "bad" },
    { ...good, nativeId: "noDiscussion", sourceDiscussionNativeId: null },
  ];
  const result = sample(
    pair,
    anchor,
    "t3_demo",
    { ...emptySet(), comments },
    14,
    Date.parse("2026-10-24T00:00:00Z"),
  );
  expect(result.comments.map((c) => c.nativeId)).toEqual(["good"]);
  expect(result.status).toBe("partial");
});
it.each(["failed", "unavailable", "unsupported"] as const)(
  "preserves %s history outcomes without samples",
  async (status) => {
    const { anchor, pair } = await context();
    const result = sample(pair, anchor, "t3_demo", emptySet(status), 14);
    expect(result.status).toBe(status);
    expect(result.strategy).toBe("none");
    expect(result.comments).toEqual([]);
  },
);
it("estimated anchor times force fallback and empty history is partial with missingness", async () => {
  const { anchor, pair } = await context();
  anchor.timestampPrecision = "estimated";
  const set = fixtureHistory(pair.authorId, "snap");
  expect(sample(pair, anchor, "t3_demo", set, 14).strategy).toBe(
    "recent_fallback",
  );
  const empty = sample(pair, anchor, "t3_demo", emptySet(), 14);
  expect(empty.status).toBe("partial");
  expect(empty.coverage.limitations.join(" ")).toContain(
    "does not establish empty lifetime history",
  );
});
it("resolves Reddit parent fullnames against bare IDs without rewriting native evidence", async () => {
  const data = base();
  data.root.nativeId = "demo";
  data.comments = [
    { nativeId: "abc", text: "SYNTHETIC parent", parentNativeId: "t3_demo" },
    { nativeId: "def", text: "SYNTHETIC reply", parentNativeId: "t1_abc" },
  ];
  data.reportedCount = 2;
  const graph = await normalize("inv", "reddit", fixtureUrls.reddit, data, 100);
  const root = graph.nodes.find(
    (n) => n.id === graph.rootId,
  ) as Model<"DiscussionNode">;
  expect(root.nativeId).toBe("demo");
  const reply = graph.nodes.find(
    (n) => n.id === "reddit:comment:def",
  ) as Model<"CommentNode">;
  expect(reply.parentId).toBe("reddit:comment:abc");
  expect(reply.nativeParentId).toBe("t1_abc");
  expect(graph.edges).toContainEqual({
    from: "reddit:comment:abc",
    to: graph.rootId,
    type: "REPLIES_TO",
  });
});
it("excludes focal and anchor records across bare/fullname Reddit ID forms", async () => {
  const { anchor, pair } = await context();
  anchor.nativeId = "a";
  const comments = [
    {
      ...history(pair.authorId, -1, "focal"),
      sourceDiscussionNativeId: "demo",
    },
    {
      ...history(pair.authorId, -1, "a"),
      id: "reddit:comment:t1_a",
      nativeId: "t1_a",
    },
    history(pair.authorId, -1, "valid"),
  ];
  const result = sample(
    pair,
    anchor,
    "t3_demo",
    { ...emptySet(), comments },
    14,
    Date.parse("2026-10-24T00:00:00Z"),
  );
  expect(result.comments.map((c) => c.nativeId)).toEqual(["valid"]);
});
it("does not compare Reddit fullname aliases across other platforms", async () => {
  const data = base();
  data.root.nativeId = "t3_demo";
  data.comments = [
    { nativeId: "abc", text: "SYNTHETIC comment", parentNativeId: "demo" },
  ];
  data.reportedCount = 1;
  const graph = await normalize("inv", "x", fixtureUrls.x, data, 100);
  const comment = graph.nodes.find(
    (n) => n.type === "comment",
  ) as Model<"CommentNode">;
  expect(comment.parentId).toBeNull();
});
it("does not call collection complete when the retained count is below the reported count", async () => {
  const data = base();
  data.reportedCount = 10;
  data.exhaustive = true;
  const graph = await normalize("inv", "reddit", fixtureUrls.reddit, data, 100);
  expect(graph.coverage.retrievedCommentCount).toBe(3);
  expect(graph.coverage.reportedCommentCount).toBe(10);
  expect(graph.coverage.completeness).toBe("partial");
});
