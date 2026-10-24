/** Real local HTTP verification with an independent synthetic mock consumer. */
import fs from "node:fs/promises";
import { validate } from "../src/core";
import { fixtureUrls } from "../src/fixture";
const base = process.env.BACKEND_BASE_URL;
const token = process.env.FRONTEND_API_TOKEN;
if (!base || !token)
  throw Error("BACKEND_BASE_URL and FRONTEND_API_TOKEN are required");
async function api(method: string, route: string, body?: unknown) {
  const response = await fetch(base + route, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "idempotency-key": `http-e2e-${Date.now()}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok)
    throw Error(`${route}: ${response.status} ${result.error?.code}`);
  return result;
}
const resource = validate(
  "InvestigationResource",
  await api("POST", "/v1/investigations", { sourceUrl: fixtureUrls.reddit }),
);
const route = `/v1/investigations/${resource.investigationId}`;
for (let i = 0; i < 150; i++) {
  const state = validate("InvestigationResource", await api("GET", route));
  if (state.ingestionStatus === "failed" || state.analysisStatus === "failed")
    throw Error(`Workflow failed: ${state.error?.code}`);
  if (state.analysisStatus === "completed") {
    const graph = validate("GraphEnvelope", await api("GET", route + "/graph"));
    const analysis = validate(
      "AnalysisResource",
      await api("GET", route + "/analysis"),
    );
    if (
      analysis.result.usedEnrichmentIds.length !== 1 ||
      graph.graphFingerprint !== analysis.result.graphFingerprint
    )
      throw Error("Stored analysis does not match workflow");
    const job = validate(
      "EnrichmentJob",
      await api(
        "GET",
        route + "/enrichments/" + analysis.result.usedEnrichmentIds[0],
      ),
    );
    if (job.status !== "completed" || job.results?.length !== 2)
      throw Error("Expected two completed author/anchor results");
    if (process.env.MOCK_INBOX_DIR && process.env.INFERENCE_EVENT_TOKEN) {
      const entries = await fs.readdir(process.env.MOCK_INBOX_DIR);
      for (const name of entries) {
        const file = process.env.MOCK_INBOX_DIR + "/" + name;
        const entry = JSON.parse(await fs.readFile(file, "utf8"));
        if (entry.event.investigationId !== resource.investigationId) continue;
        for (let replay = 0; replay < 2; replay++) {
          const response = await fetch("http://127.0.0.1:4010/events", {
            method: "POST",
            headers: {
              authorization: `Bearer ${process.env.INFERENCE_EVENT_TOKEN}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(entry.event),
          });
          if (response.status !== 202)
            throw Error("Duplicate event was not acknowledged");
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
        const after = JSON.parse(await fs.readFile(file, "utf8"));
        if (after.attempts !== 1)
          throw Error("Duplicate event triggered another effective workflow");
      }
    }
    console.log(
      `PASS real HTTP synthetic workflow: ${resource.investigationId}; graph comments=${graph.coverage.retrievedCommentCount}; history pairs=${job.results.length}; analysis=${analysis.analysisId}`,
    );
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
throw Error("Workflow did not complete within 30 seconds");
