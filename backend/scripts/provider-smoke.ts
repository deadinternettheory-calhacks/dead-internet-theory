/** Explicitly authorized, potentially billable smoke utility. Disabled by default. */
import fs from "node:fs/promises";
import { Apify, plan, discussion, historySets } from "../src/providers";
import { source } from "../src/url";
import { normalize } from "../src/graph";
import { iso, type Model } from "../src/core";
const url = process.argv[2],
  output = process.argv[3];
if (
  process.env.PROVIDER_SMOKE_AUTHORIZED !== "true" ||
  !process.env.RETENTION_POLICY_REF ||
  !url ||
  !output
)
  throw Error(
    "Usage: PROVIDER_SMOKE_AUTHORIZED=true RETENTION_POLICY_REF=<review> APIFY_TOKEN=<server secret> npm run smoke -- <authorized URL> <private output directory>",
  );
const resolved = source(url);
const provider = new Apify();
await fs.mkdir(output, { recursive: true, mode: 0o700 });
const authorFile = process.env.SMOKE_AUTHORS_FILE;
const authors = authorFile
  ? (JSON.parse(await fs.readFile(authorFile, "utf8")) as Model<"AuthorNode">[])
  : [];
if (
  authors.length > 25 ||
  authors.some((a) => a.platform !== resolved.platform)
)
  throw Error("Select at most 25 authors on the source platform");
const tasks = plan(
  resolved.platform,
  authorFile ? "history" : "discussion",
  resolved.url,
  authors,
);
if (!tasks.length) throw Error("History unsupported; no provider request made");
let total = 0;
for (const task of tasks) {
  // This utility deliberately has no automatic start retries. A lost response
  // requires inspection in Apify Console before the operator starts another run.
  task.run = await provider.start(task.actor, task.input);
  await fs.writeFile(
    output + "/raw.json",
    JSON.stringify({ collectedAt: iso(), synthetic: false, tasks }, null, 2),
    { mode: 0o600 },
  );
  const deadline = Date.now() + 300000;
  while (
    !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(task.run.status)
  ) {
    if (Date.now() > deadline)
      throw Error(
        "Polling deadline expired; inspect the known run in Apify Console before retrying",
      );
    await new Promise((resolve) => setTimeout(resolve, 2000));
    task.run = await provider.poll(task.run.id);
  }
  const max = authorFile ? 150 * authors.length : 1001;
  while (task.offset < max) {
    const rows = await provider.items(
      task.run.defaultDatasetId,
      task.offset,
      Math.min(100, max - task.offset),
    );
    task.rows.push(...rows);
    task.offset += rows.length;
    total += rows.length;
    if (JSON.stringify(tasks).length > 650000)
      throw Error("Smoke snapshot byte budget exceeded");
    if (rows.length < 100) break;
  }
  task.done = true;
  task.truncated = task.offset >= max;
  await fs.writeFile(
    output + "/raw.json",
    JSON.stringify({ collectedAt: iso(), synthetic: false, tasks }, null, 2),
    { mode: 0o600 },
  );
}
if (authorFile) {
  const sets = Object.fromEntries(
    historySets(
      resolved.platform,
      authors.map((a) => a.id),
      tasks,
      "protected-smoke",
    ),
  );
  await fs.writeFile(output + "/history.json", JSON.stringify(sets, null, 2), {
    mode: 0o600,
  });
} else {
  const data = discussion(resolved.platform, resolved.url, tasks);
  data.sourceSnapshotRef = "protected-smoke";
  await fs.writeFile(
    output + "/graph.json",
    JSON.stringify(
      await normalize(
        "authorized-smoke",
        resolved.platform,
        resolved.url,
        data,
        1000,
      ),
      null,
      2,
    ),
    { mode: 0o600 },
  );
}
console.log(
  `Smoke completed: ${resolved.platform}, ${tasks.length} runs, ${total} rows. Protected evidence written to ${output}. Review input/output, root, paging, timestamps, cost and permissions before changing verification state.`,
);
