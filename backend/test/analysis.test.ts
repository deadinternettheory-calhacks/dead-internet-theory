import { it, expect } from "vitest";
import { checkAnalysis, checkGraph } from "../src/invariants";
import { validate, type Model } from "../src/core";
import aFixture from "../../contracts/examples/analysis-submission.json";
import gFixture from "../../contracts/examples/graph.json";
import eFixture from "../../contracts/examples/enrichment-completed.json";
const a = () => structuredClone(aFixture) as Model<"AnalysisSubmission">;
const g = () => structuredClone(gFixture) as Model<"GraphEnvelope">;
const jobs = [eFixture as Model<"EnrichmentJob">];
it("accepts the complete synthetic submission without calculating or replacing any scoring fields", () =>
  expect(() =>
    checkAnalysis(validate("AnalysisSubmission", a()), g(), jobs),
  ).not.toThrow());
it.each([
  "cluster",
  "edge",
  "count",
  "axis",
  "assessment",
  "nullConfidence",
  "duplicateClusterMember",
  "duplicateAxis",
  "population",
] as const)("rejects invalid %s cross-record analysis", (kind) => {
  const analysis = a();
  if (kind === "cluster")
    analysis.clusters[0].commentIds[0] = "reddit:author:t2_alex";
  if (kind === "edge") analysis.inferredEdges[0].from = "reddit:author:t2_alex";
  if (kind === "count") analysis.sentiment.counts.supportive++;
  if (kind === "axis") analysis.axes[0].assessedCommentCount = 100;
  if (kind === "assessment")
    analysis.commentAssessments[0].commentId = "reddit:comment:invented";
  if (kind === "nullConfidence") {
    analysis.axes[0].score = null;
    analysis.axes[0].confidence = 0.5;
  }
  if (kind === "duplicateClusterMember")
    analysis.clusters[0].commentIds = [
      "reddit:comment:t1_a",
      "reddit:comment:t1_a",
    ];
  if (kind === "duplicateAxis") analysis.axes.push(analysis.axes[0]);
  if (kind === "population")
    analysis.sentiment.method = "nonprobability_sample";
  expect(() => checkAnalysis(analysis, g(), jobs)).toThrow();
});
it("rejects evidence from histories absent from the selected enrichment jobs", () =>
  expect(() => checkAnalysis(a(), g(), [])).toThrow("Evidence"));
it.each([-1, 101, 0.5])(
  "rejects out-of-bounds or non-integer index %s",
  (score) => {
    const analysis = a();
    analysis.overallCoordinationRisk.score = score;
    expect(() => validate("AnalysisSubmission", analysis, 422)).toThrow();
  },
);
it("rejects graph cycles, duplicate IDs, dangling authors and inferred graph edges", () => {
  for (const change of [
    (graph: Model<"GraphEnvelope">) => graph.nodes.push(graph.nodes[0]),
    (graph: Model<"GraphEnvelope">) => {
      (
        graph.nodes.find((n) => n.type === "comment") as Model<"CommentNode">
      ).authorId = "reddit:author:invented";
    },
    (graph: Model<"GraphEnvelope">) =>
      graph.edges.push({
        from: "reddit:comment:t1_a",
        to: "reddit:comment:t1_b",
        type: "SEMANTICALLY_SIMILAR",
      } as never),
  ]) {
    const graph = g();
    change(graph);
    expect(() => {
      validate("GraphEnvelope", graph);
      checkGraph(graph);
    }).toThrow();
  }
});
