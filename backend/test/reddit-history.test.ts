import { expect, it } from "vitest";
import { historySets, plan } from "../src/providers";
import { sample } from "../src/history";
import { normalize } from "../src/graph";
import { fixtureDiscussion, fixtureUrls } from "../src/fixture";
import type { Model } from "../src/core";

const author: Model<"AuthorNode"> = {
  id: "reddit:author:t2_alex",
  type: "author",
  nativeId: "t2_alex",
  platform: "reddit",
  handle: "synthetic_alex",
  displayName: null,
  identityQuality: "provider_id",
};
const other: Model<"AuthorNode"> = {
  ...author,
  id: "reddit:author:t2_ben",
  nativeId: "t2_ben",
  handle: "synthetic_ben",
};
const row = (id = "history") => ({
  _content_type: "comment",
  _status: "found",
  _username: "synthetic_alex",
  author: "synthetic_alex",
  author_fullname: "t2_alex",
  id,
  name: `t1_${id}`,
  body: "SYNTHETIC authored comment",
  link_id: "t3_other",
  parent_id: "t1_parent",
  createdAt: "2026-10-22T12:00:00+0000",
  score: 0,
  score_hidden: false,
  permalink: `/r/synthetic/comments/other/title/${id}/`,
});
function collect(rows: any[], authors = [author, other]) {
  const task = plan("reddit", "history", undefined, authors)[0];
  Object.assign(task, {
    run: { id: "synthetic-history-run", status: "SUCCEEDED" },
    rows,
    done: true,
  });
  return historySets(
    "reddit",
    authors.map((a) => a.id),
    [task],
    "synthetic-snapshot",
  );
}
async function anchor() {
  const graph = await normalize(
    "synthetic-investigation",
    "reddit",
    fixtureUrls.reddit,
    fixtureDiscussion("reddit", fixtureUrls.reddit, "synthetic"),
    100,
  );
  return graph.nodes.find(
    (n) => n.id === "reddit:comment:t1_a",
  ) as Model<"CommentNode">;
}

it("maps native author and source-discussion fields without replacing native comment IDs", () => {
  const set = collect([row()]).get(author.id)!;
  expect(set.comments).toHaveLength(1);
  expect(set.comments[0]).toMatchObject({
    id: "reddit:comment:history",
    nativeId: "history",
    authorId: author.id,
    text: "SYNTHETIC authored comment",
    sourceDiscussionNativeId: "t3_other",
    createdAt: "2026-10-22T12:00:00.000Z",
    timestampPrecision: "exact",
    url: "https://www.reddit.com/r/synthetic/comments/other/title/history/",
    metrics: { score: 0 },
  });
  expect(set.profile).toBeUndefined();
  expect(set.coverage.actorRunIds).toEqual(["synthetic-history-run"]);
});

it("returns ten valid historical comments while excluding the anchor and focal discussion", async () => {
  const a = await anchor();
  const set = collect([
    ...Array.from({ length: 10 }, (_, i) => row(`history${i}`)),
    { ...row("a"), link_id: "t3_other" },
    { ...row("focal"), link_id: "t3_demo" },
    row("history0"),
  ]).get(author.id)!;
  const result = sample(
    { authorId: author.id, anchorCommentId: a.id },
    a,
    "demo",
    set,
    14,
    Date.parse("2026-10-24T00:00:00Z"),
  );
  expect(result.status).toBe("complete");
  expect(result.strategy).toBe("temporal_nearest");
  expect(result.comments.map((c) => c.nativeId)).toEqual(
    Array.from({ length: 10 }, (_, i) => `history${i}`),
  );
});

it("keeps an absent author's result partial without asserting an empty lifetime history", async () => {
  const sets = collect([row()]);
  expect(sets.get(other.id)!.comments).toEqual([]);
  expect(sets.get(other.id)!.status).toBeUndefined();
  expect(sets.get(other.id)!.coverage.limitations.join(" ")).toContain(
    "availability and lifetime history are unknown",
  );
  const a = { ...(await anchor()), authorId: other.id };
  const result = sample(
    { authorId: other.id, anchorCommentId: a.id },
    a,
    "demo",
    sets.get(other.id)!,
    14,
  );
  expect(result.status).toBe("partial");
  expect(result.strategy).toBe("none");
  expect(result.comments).toEqual([]);
});

it("uses an explicitly requested handle for status rows and rows lacking native author IDs", () => {
  const rows = [
    { ...row(), author_fullname: null, author: "SYNTHETIC_ALEX" },
    { _username: "synthetic_ben", _status: "suspended" },
  ];
  const sets = collect(rows);
  expect(sets.get(author.id)!.comments).toHaveLength(1);
  expect(sets.get(other.id)!.status).toBe("unavailable");
  expect(sets.get(other.id)!.comments).toEqual([]);
  expect(sets.get(other.id)!.error).toMatchObject({
    code: "PROVIDER_UNAVAILABLE",
    retryable: false,
  });
});

it("does not associate mismatched native authors or explicit post rows with comment history", () => {
  const set = collect([
    { ...row(), author_fullname: "t2_someone_else" },
    { ...row("post"), _content_type: "post" },
    { ...row("foreign"), author_fullname: null, author: "synthetic_stranger" },
    { ...row("hidden"), _status: "unavailable" },
  ]).get(author.id)!;
  expect(set.comments).toEqual([]);
});

it("marks a capped author's candidate pool truncated independently of another author", () => {
  const sets = collect(
    Array.from({ length: 151 }, (_, i) => row(`history${i}`)),
  );
  expect(sets.get(author.id)!.comments).toHaveLength(150);
  expect(sets.get(author.id)!.coverage.providerTruncated).toBe(true);
  expect(sets.get(other.id)!.coverage.candidateFetchedCount).toBe(0);
});

it("omits hidden scores and still accepts untyped comments from older persisted plans", () => {
  const legacy = {
    id: "legacy",
    authorId: "t2_alex",
    text: "SYNTHETIC retained evidence",
    postId: "t3_other",
    createdAt: "2026-10-22T12:00:00Z",
  };
  const set = collect([{ ...row(), score_hidden: true }, legacy]).get(
    author.id,
  )!;
  expect(set.comments[0].metrics).toEqual({});
  expect(set.comments[1].nativeId).toBe("legacy");
  expect(set.comments[1].sourceDiscussionNativeId).toBe("t3_other");
});
