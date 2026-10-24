import graphFixture from "../../contracts/examples/graph.json";
import historyFixture from "../../contracts/examples/enrichment-completed.json";
import { ApiFault, iso, type Model, type Platform } from "./core";
import type { DiscussionData, RecordItem, Person } from "./graph";
import type { CandidateSet } from "./history";
export const fixtureUrls = {
  reddit: "https://www.reddit.com/r/example/comments/demo/",
  x: "https://x.com/synthetic/status/100",
  youtube: "https://www.youtube.com/watch?v=synthetic01",
  tiktok: "https://www.tiktok.com/@synthetic/video/100",
};
export function fixtureDiscussion(
  platform: Platform,
  url: string,
  snapshot: string,
): DiscussionData {
  if (url !== fixtureUrls[platform])
    throw new ApiFault(
      500,
      "FIXTURE_SOURCE_NOT_FOUND",
      "Fixture mode accepts only documented synthetic discussion URLs",
    );
  const g = graphFixture as Model<"GraphEnvelope">;
  const people = new Map(
    g.nodes
      .filter((n) => n.type === "author")
      .map((n) => [
        n.id,
        {
          nativeId: n.nativeId,
          handle: n.handle,
          displayName: n.displayName,
        } as Person,
      ]),
  );
  const convert = (
    n: Model<"CommentNode"> | Model<"DiscussionNode">,
  ): RecordItem => ({
    nativeId: n.nativeId,
    text: n.text,
    author: n.authorId ? people.get(n.authorId) : null,
    timestamp: n.createdAt,
    metrics: n.metrics,
    ...(n.type === "comment"
      ? {
          parentNativeId: n.nativeParentId,
          topLevel: n.parentId === g.rootId,
          contentStatus: n.contentStatus,
          url: n.url,
        }
      : { url }),
  });
  const root = g.nodes.find(
    (n) => n.type === "discussion",
  ) as Model<"DiscussionNode">;
  return {
    root: { ...convert(root), nativeId: root.nativeId, title: root.title },
    comments: g.nodes
      .filter((n): n is Model<"CommentNode"> => n.type === "comment")
      .map(convert),
    reportedCount: 3,
    truncated: false,
    exhaustive: true,
    limitations: ["SYNTHETIC fixture. No public-user content was collected."],
    sortOrder: "fixture",
    actorRuns: [],
    collectedAt: iso(),
    sourceSnapshotRef: snapshot,
  };
}
export function emptySet(
  status?: CandidateSet["status"],
  error?: Model<"ErrorDetail">,
): CandidateSet {
  return {
    comments: [],
    ...(status ? { status } : {}),
    ...(error ? { error } : {}),
    coverage: {
      candidateFetchedCount: 0,
      providerTruncated: null,
      oldestFetchedAt: null,
      newestFetchedAt: null,
      collectedAt: null,
      sourceSnapshotRef: null,
      actorRunIds: [],
      limitations:
        status === "unsupported"
          ? [
              "Arbitrary authored-comment history is unsupported for this platform in v1.",
            ]
          : [],
    },
  };
}
export function fixtureHistory(
  authorId: string,
  snapshot: string,
): CandidateSet {
  const platform = authorId.split(":")[0];
  if (["youtube", "tiktok"].includes(platform)) return emptySet("unsupported");
  const source = historyFixture.results.find(
    (r) =>
      r.authorId.split(":").slice(2).join(":") ===
      authorId.split(":").slice(2).join(":"),
  );
  if (!source)
    return {
      ...emptySet(),
      coverage: {
        ...emptySet().coverage,
        collectedAt: iso(),
        sourceSnapshotRef: snapshot,
        limitations: [
          "SYNTHETIC empty candidate set; not lifetime-history evidence.",
        ],
      },
    };
  const comments = source.comments.map((c) => ({
    ...c,
    id: c.id.replace(/^reddit:/, platform + ":"),
    authorId,
  })) as Model<"HistoryComment">[];
  return {
    comments,
    coverage: {
      ...source.coverage,
      actorRunIds: [],
      sourceSnapshotRef: snapshot,
      collectedAt: iso(),
      limitations: ["SYNTHETIC history candidates. No live author lookup."],
    },
  };
}
