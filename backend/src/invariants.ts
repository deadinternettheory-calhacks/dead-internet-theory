import { ApiFault, type Model, stable } from "./core";
export function checkAnchors(
  req: Model<"EnrichmentRequest">,
  graph: Model<"GraphEnvelope">,
) {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  for (const pair of req.authors) {
    const key = stable(pair);
    if (seen.has(key))
      throw new ApiFault(
        422,
        "DUPLICATE_AUTHOR_ANCHOR",
        "Duplicate author and anchor",
      );
    seen.add(key);
    if (nodes.get(pair.authorId)?.type !== "author")
      throw new ApiFault(422, "UNKNOWN_AUTHOR", "Author is not in graph");
    const comment = nodes.get(pair.anchorCommentId);
    if (comment?.type !== "comment")
      throw new ApiFault(
        422,
        "UNKNOWN_ANCHOR",
        "Anchor is not a graph comment",
      );
    if (comment.authorId !== pair.authorId)
      throw new ApiFault(
        422,
        "ANCHOR_AUTHOR_MISMATCH",
        "Anchor belongs to another author",
      );
  }
}
export function checkGraph(g: Model<"GraphEnvelope">) {
  const fail = (message: string) => {
    throw new ApiFault(500, "INVALID_GRAPH", message);
  };
  const nodes = new Map(g.nodes.map((n) => [n.id, n]));
  if (
    nodes.size !== g.nodes.length ||
    g.nodes.filter((n) => n.type === "discussion").length !== 1 ||
    nodes.get(g.rootId)?.type !== "discussion"
  )
    fail("Graph requires unique nodes and one root");
  if (
    g.nodes.some(
      (n) =>
        n.platform !== g.platform ||
        !n.id.startsWith(`${g.platform}:${n.type}:`),
    )
  )
    fail("Graph identity mismatch");
  const edges = new Set(g.edges.map(stable));
  if (edges.size !== g.edges.length) fail("Duplicate edges");
  for (const e of g.edges) {
    const from = nodes.get(e.from);
    const to = nodes.get(e.to);
    if (!from || !to) fail("Dangling edge");
    if (
      e.type === "AUTHORED"
        ? from?.type !== "author" ||
          to?.type !== "comment" ||
          to.authorId !== from.id
        : from?.type !== "comment" ||
          !["discussion", "comment"].includes(to!.type) ||
          from.parentId !== to!.id
    )
      fail("Edge type mismatch");
  }
  const has = (from: string, to: string, type: string) =>
    g.edges.some((e) => e.from === from && e.to === to && e.type === type);
  for (const n of g.nodes) {
    if (n.type === "author") continue;
    if (n.authorId !== null && nodes.get(n.authorId)?.type !== "author")
      fail("Invalid author");
    if (n.type === "comment") {
      if (n.authorId && !has(n.authorId, n.id, "AUTHORED"))
        fail("Missing authorship");
      if (
        n.parentId &&
        (!has(n.id, n.parentId, "REPLIES_TO") || n.parentId === n.id)
      )
        fail("Invalid parent");
      const seen = new Set([n.id]);
      let parent = n.parentId;
      while (parent && parent !== g.rootId) {
        if (seen.has(parent)) fail("Reply cycle");
        seen.add(parent);
        const p = nodes.get(parent);
        parent = p?.type === "comment" ? p.parentId : null;
      }
    }
  }
  if (
    g.nodes.filter((n) => n.type === "comment").length !==
    g.coverage.retrievedCommentCount
  )
    fail("Coverage count mismatch");
}
export function checkAnalysis(
  a: Model<"AnalysisSubmission">,
  g: Model<"GraphEnvelope">,
  jobs: Model<"EnrichmentJob">[],
) {
  const bad = (message: string) => {
    throw new ApiFault(422, "INVALID_ANALYSIS", message);
  };
  const nodes = new Map(g.nodes.map((n) => [n.id, n]));
  const known = new Set(nodes.keys());
  for (const j of jobs)
    for (const r of j.results ?? [])
      for (const c of r.comments) known.add(c.id);
  const evidence = (refs: string[]) => {
    if (refs.some((r) => !known.has(r)))
      throw new ApiFault(
        422,
        "INVALID_EVIDENCE_REF",
        "Evidence does not resolve to graph or referenced histories",
      );
  };
  const comment = (id: string) => {
    if (nodes.get(id)?.type !== "comment")
      bad("Analysis target must be a graph comment");
  };
  const unique = (xs: string[], message: string) => {
    if (new Set(xs).size !== xs.length) bad(message);
  };
  evidence(a.subject.evidenceRefs);
  evidence(a.overallCoordinationRisk.evidenceRefs);
  unique(a.usedEnrichmentIds, "Duplicate enrichment");
  unique(
    a.axes.map((x) => x.axis),
    "Duplicate axis",
  );
  unique(
    a.clusters.map((x) => x.clusterId),
    "Duplicate cluster",
  );
  unique(
    a.commentAssessments.map((x) => x.commentId),
    "Duplicate comment assessment",
  );
  for (const score of [a.overallCoordinationRisk, ...a.axes]) {
    evidence(score.evidenceRefs);
    if (score.score === null && score.confidence !== null)
      bad("Unmeasured score requires null confidence");
  }
  for (const axis of a.axes)
    if (axis.assessedCommentCount > g.coverage.retrievedCommentCount)
      bad("Axis exceeds retrieved population");
  for (const c of a.commentAssessments) {
    comment(c.commentId);
    evidence(c.evidenceRefs);
  }
  for (const c of a.clusters) {
    unique(c.commentIds, "Duplicate cluster member");
    for (const id of c.commentIds) comment(id);
    evidence(c.evidenceRefs);
  }
  unique(
    a.inferredEdges.map((e) => stable([e.from, e.to, e.type])),
    "Duplicate inferred edge",
  );
  for (const e of a.inferredEdges) {
    comment(e.from);
    comment(e.to);
    if (e.from === e.to) bad("Self inferred edge");
    evidence(e.evidenceRefs);
  }
  const s = a.sentiment;
  const sum = ["supportive", "critical", "neutral", "mixed", "unclear"].reduce(
    (n, k) => n + (s.counts[k] as number),
    0,
  );
  if (
    sum !== s.analyzedCommentCount ||
    s.analyzedCommentCount > g.coverage.retrievedCommentCount
  )
    bad("Sentiment population/count mismatch");
  if (
    s.population === "retrieved_comments" &&
    (s.analyzedCommentCount !== g.coverage.retrievedCommentCount ||
      s.method !== "census_of_retrieved")
  )
    bad("Retrieved census is incomplete");
  if (s.method !== "census_of_retrieved" && s.population !== "analyzed_sample")
    bad("Sample population mismatch");
}
