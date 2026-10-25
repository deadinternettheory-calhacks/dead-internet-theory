import { afterEach, expect, it, vi } from "vitest";
import { historySets, plan } from "../src/providers";
import { sample } from "../src/history";
import { normalize } from "../src/graph";
import { fixtureDiscussion, fixtureUrls } from "../src/fixture";
import type { Model } from "../src/core";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

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

it("accepts Reddit native-ID prefixes and resolves requested handle-only graph identities without overriding conflicting IDs", () => {
  const bare = { ...author, id: "reddit:author:alex", nativeId: "alex" };
  const byHandle = {
    ...author,
    id: "reddit:author:handle:synthetic_alex",
    nativeId: null,
    identityQuality: "handle" as const,
  };
  expect(collect([row()], [bare]).get(bare.id)!.comments).toHaveLength(1);
  expect(collect([row()], [byHandle]).get(byHandle.id)!.comments).toHaveLength(
    1,
  );
  expect(
    collect([{ ...row(), author_fullname: "t2_someone_else" }], [bare]).get(
      bare.id,
    )!.comments,
  ).toHaveLength(0);
});

it("marks a capped author's candidate pool truncated independently of another author", () => {
  vi.stubEnv("HISTORY_CANDIDATES_PER_AUTHOR", "150");
  const sets = collect(
    Array.from({ length: 151 }, (_, i) => row(`history${i}`)),
  );
  expect(sets.get(author.id)!.coverage.candidateFetchedCount).toBe(150);
  expect(sets.get(author.id)!.comments.length).toBeGreaterThanOrEqual(10);
  expect(JSON.stringify(sets.get(author.id)!.comments).length).toBeLessThan(
    18000,
  );
  expect(sets.get(author.id)!.coverage.providerTruncated).toBe(true);
  expect(sets.get(other.id)!.coverage.candidateFetchedCount).toBe(0);
});

it("retains evidence for all 25 authors within the job budget even with large Unicode comments", async () => {
  const { retainHistoryRows, slimRedditHistoryRow } =
    await import("../src/providers");
  vi.stubEnv("HISTORY_CANDIDATES_PER_AUTHOR", "150");
  const authors = Array.from({ length: 25 }, (_, i) => ({
    ...author,
    id: `reddit:author:t2_user${i}`,
    nativeId: `t2_user${i}`,
    handle: `user${i}`,
  }));
  const task = plan("reddit", "history", undefined, authors)[0];
  for (const a of authors)
    retainHistoryRows(
      "reddit",
      task,
      Array.from({ length: 150 }, (_, i) =>
        slimRedditHistoryRow({
          ...row(`${a.handle}_${i}`),
          author: a.handle,
          author_fullname: a.nativeId,
          body: "語".repeat(2000),
        }),
      ),
    );
  expect(new TextEncoder().encode(JSON.stringify(task)).length).toBeLessThan(
    450000,
  );
  Object.assign(task, {
    run: { id: "SYNTHETIC", status: "SUCCEEDED" },
    done: true,
  });
  const sets = historySets(
    "reddit",
    authors.map((a) => a.id),
    [task],
    "synthetic-snapshot",
  );
  for (const a of authors) {
    const set = sets.get(a.id)!;
    expect(set.comments.length).toBeGreaterThan(0);
    expect(set.coverage.candidateFetchedCount).toBe(150);
    expect(set.coverage.providerTruncated).toBe(true);
    expect(set.status).toBeUndefined();
  }
  expect(
    new TextEncoder().encode(JSON.stringify([...sets])).length,
  ).toBeLessThan(500000);
});

it("shrinks oversized history pages and skips one unreadable row without restarting the paid run or losing later authors", async () => {
  const { advance, Apify } = await import("../src/providers");
  const { ApiFault } = await import("../src/core");
  vi.stubEnv("PROVIDER_MODE", "live");
  vi.stubEnv("PROVIDER_AUTHORIZATION_APPROVED", "true");
  vi.stubEnv("RETENTION_POLICY_REF", "SYNTHETIC");
  vi.stubEnv("APIFY_TOKEN", "SYNTHETIC");
  const task = plan("reddit", "history", undefined, [author, other])[0];
  Object.assign(task, {
    run: {
      id: "SYNTHETIC",
      status: "SUCCEEDED",
      defaultDatasetId: "synthetic-dataset",
    },
  });
  const start = vi.spyOn(Apify.prototype, "start");
  const items = vi
    .spyOn(Apify.prototype, "items")
    .mockImplementation(async (_dataset, offset, limit) => {
      if (offset === 0 || limit > 2)
        throw new ApiFault(
          500,
          "PROVIDER_SIZE_LIMIT",
          "SYNTHETIC oversized page",
        );
      return offset === 1
        ? [
            {
              ...row("ben-history"),
              author: other.handle,
              author_fullname: other.nativeId,
            },
          ]
        : offset === 2
          ? [row("alex-history")]
          : [];
    });
  let state = { tasks: [task], index: 0, began: Date.now() };
  let result;
  for (let n = 0; n < 5; n++) {
    result = await advance({
      platform: "reddit",
      kind: "history",
      state,
      reserve: vi.fn(),
      observe: vi.fn().mockResolvedValue(true),
    });
    if (result.done) break;
    state = result.state;
  }
  expect(result?.done).toBe(true);
  expect(start).not.toHaveBeenCalled();
  expect(items.mock.calls.some(([, offset]) => offset === 2)).toBe(true);
  const sets = historySets(
    "reddit",
    [author.id, other.id],
    [task],
    "synthetic-snapshot",
  );
  expect(sets.get(author.id)!.comments).toHaveLength(1);
  expect(sets.get(other.id)!.comments).toHaveLength(1);
  expect(sets.get(author.id)!.coverage.limitations.join(" ")).toContain(
    "Oversized provider rows",
  );
});

it("keeps valid returned comments from an interrupted provider run and derives observed source IDs from permalinks", async () => {
  const task = plan("reddit", "history", undefined, [author])[0];
  Object.assign(task, {
    rows: [{ ...row("usable"), link_id: null }],
    run: { id: "SYNTHETIC", status: "TIMED-OUT" },
    done: true,
    truncated: true,
  });
  const set = historySets(
    "reddit",
    [author.id],
    [task],
    "synthetic-snapshot",
  ).get(author.id)!;
  const a = await anchor();
  const result = sample(
    { authorId: author.id, anchorCommentId: a.id },
    a,
    "demo",
    set,
    14,
    Date.parse("2026-10-24T00:00:00Z"),
  );
  expect(result.status).toBe("partial");
  expect(result.comments).toHaveLength(1);
  expect(result.comments[0]?.sourceDiscussionNativeId).toBe("other");
  expect(result.coverage.limitations.join(" ")).toContain(
    "valid returned comments were retained",
  );
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
it("slims Reddit history rows so many authors fit in the snapshot budget", async () => {
  const { slimRedditHistoryRow } = await import("../src/providers");
  const row = {
    _status: "found",
    _content_type: "comment",
    _username: "alice",
    id: "abc",
    name: "t1_abc",
    author: "alice",
    author_fullname: "t2_alice",
    body: "x".repeat(5000),
    created_utc: 1700000000,
    permalink: "/r/test/comments/p/t/abc/",
    link_id: "t3_p",
    score: 3,
    all_awardings: [{ big: "y".repeat(2000) }],
    media_metadata: { huge: "z".repeat(3000) },
  };
  const slim = slimRedditHistoryRow(row);
  expect(slim).not.toHaveProperty("all_awardings");
  expect(slim).not.toHaveProperty("media_metadata");
  expect(slim.body).toHaveLength(2000);
  expect(slim).toMatchObject({
    author: "alice",
    author_fullname: "t2_alice",
    link_id: "t3_p",
    score: 3,
  });
  // 25 authors x 40 candidates of typical slimmed rows stay well under the 650 KB budget.
  const typical = JSON.stringify(
    slimRedditHistoryRow({ ...row, body: "y".repeat(300) }),
  ).length;
  expect(typical * 25 * 40).toBeLessThan(650_000);
});
