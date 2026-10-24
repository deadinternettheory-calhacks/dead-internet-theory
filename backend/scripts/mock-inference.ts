/** SYNTHETIC protocol consumer. No inference or scoring is implemented here. */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";
import { validate, type Model } from "../src/core";
import example from "../../contracts/examples/analysis-submission.json";
const base = process.env.BACKEND_BASE_URL;
const credential = process.env.INFERENCE_API_TOKEN;
const receiverToken = process.env.INFERENCE_EVENT_TOKEN;
if (!base || !credential || !receiverToken)
  throw new Error(
    "Configure BACKEND_BASE_URL, INFERENCE_API_TOKEN and INFERENCE_EVENT_TOKEN",
  );
const inbox = process.env.MOCK_INBOX_DIR ?? "/tmp/dit-mock-inbox";
await fs.mkdir(inbox, { recursive: true, mode: 0o700 });
const active = new Set<string>();
interface Entry {
  event: Model<"InvestigationReadyEvent">;
  status: "pending" | "done";
  attempts: number;
  error?: string;
}
async function api(
  method: string,
  route: string,
  body?: unknown,
  key?: string,
) {
  const response = await fetch(base + route, {
    method,
    headers: {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json",
      ...(key ? { "idempotency-key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error?.code ?? "BACKEND_FAILED");
  return result;
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 200));
async function processEntry(file: string) {
  if (active.has(file)) return;
  active.add(file);
  try {
    const entry = JSON.parse(await fs.readFile(file, "utf8")) as Entry;
    if (entry.status === "done" || entry.attempts >= 3) return;
    entry.attempts++;
    await fs.writeFile(file, JSON.stringify(entry), { mode: 0o600 });
    const event = entry.event;
    const route = `/v1/investigations/${event.investigationId}`;
    const graph = validate("GraphEnvelope", await api("GET", route + "/graph"));
    if (
      !graph.coverage.limitations.some((l) => l.includes("SYNTHETIC")) ||
      graph.platform !== "reddit"
    )
      throw Error("MOCK_REQUIRES_SYNTHETIC_REDDIT");
    if (
      graph.graphFingerprint !== event.graphFingerprint ||
      graph.graphRevision !== event.graphRevision
    )
      throw Error("STALE_EVENT");
    const authors = [
      {
        authorId: "reddit:author:t2_alex",
        anchorCommentId: "reddit:comment:t1_a",
      },
      {
        authorId: "reddit:author:t2_ben",
        anchorCommentId: "reddit:comment:t1_b",
      },
    ];
    const job = validate(
      "EnrichmentJob",
      await api(
        "POST",
        route + "/enrichments",
        { authors, limit: 10, windowDays: 14, fallback: "most_recent" },
        `mock-enrich:${event.investigationId}:${event.graphRevision}`,
      ),
    );
    let finished = false;
    for (let poll = 0; poll < 150; poll++) {
      const current = validate(
        "EnrichmentJob",
        await api("GET", route + "/enrichments/" + job.enrichmentId),
      );
      if (current.status === "completed") {
        finished = true;
        break;
      }
      if (current.status === "failed") throw Error("ENRICHMENT_FAILED");
      await pause();
    }
    if (!finished) throw Error("ENRICHMENT_TIMEOUT");
    const submission = {
      ...example,
      graphRevision: graph.graphRevision,
      graphFingerprint: graph.graphFingerprint,
      usedEnrichmentIds: [job.enrichmentId],
    };
    validate(
      "AnalysisReceipt",
      await api(
        "POST",
        route + "/analysis",
        submission,
        `mock-analysis:${event.investigationId}:${event.graphRevision}`,
      ),
    );
    entry.status = "done";
    delete entry.error;
    await fs.writeFile(file, JSON.stringify(entry), { mode: 0o600 });
    console.log(`Synthetic workflow completed: ${event.investigationId}`);
  } catch (e) {
    const entry = JSON.parse(await fs.readFile(file, "utf8")) as Entry;
    entry.error = e instanceof Error ? e.message : "MOCK_FAILED";
    await fs.writeFile(file, JSON.stringify(entry), { mode: 0o600 });
    console.error(`Synthetic workflow failed: ${entry.error}`);
  } finally {
    active.delete(file);
  }
}
const digest = (s: string) => createHash("sha256").update(s).digest();
const server = http.createServer(async (req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.method !== "POST" || req.url !== "/events") {
    res.writeHead(404).end("{}");
    return;
  }
  if (
    !timingSafeEqual(
      digest(req.headers.authorization ?? ""),
      digest(`Bearer ${receiverToken}`),
    )
  ) {
    res.writeHead(401).end("{}");
    return;
  }
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 64000) {
        res.writeHead(413).end("{}");
        return;
      }
      chunks.push(chunk);
    }
    const event = validate(
      "InvestigationReadyEvent",
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    const key = createHash("sha256")
      .update(JSON.stringify([event.investigationId, event.graphRevision]))
      .digest("hex");
    const file = path.join(inbox, key + ".json");
    try {
      await fs.writeFile(
        file,
        JSON.stringify({ event, status: "pending", attempts: 0 }),
        { flag: "wx", mode: 0o600 },
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const previous = JSON.parse(await fs.readFile(file, "utf8")) as Entry;
      if (previous.event.graphFingerprint !== event.graphFingerprint) {
        res.writeHead(409).end("{}");
        return;
      }
    }
    // Persisted inbox precedes acknowledgement. Duplicate deliveries reuse the
    // same entry, active task and backend idempotency keys; restart resumes it.
    res.writeHead(202).end('{"accepted":true}');
    void processEntry(file);
  } catch {
    res.writeHead(400).end("{}");
  }
});
server.listen(Number(process.env.MOCK_PORT ?? 4010), "127.0.0.1", () =>
  console.log(
    "Synthetic inference consumer listening on loopback; /events requires bearer auth",
  ),
);
const timer = setInterval(async () => {
  for (const name of await fs.readdir(inbox))
    if (name.endsWith(".json")) void processEntry(path.join(inbox, name));
}, 1000);
timer.unref();
