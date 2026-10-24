import { outbound } from "./outbound";

type Request = typeof outbound;
export interface ProviderResources {
  dataset?: string;
  keyValueStore?: string;
  requestQueue?: string;
}
const terminal = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);
export async function inspectForDeletion(
  runId: string,
  token: string,
  request: Request = outbound,
) {
  const headers = { authorization: `Bearer ${token}` };
  const endpoint = `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}`;
  const response = await request(endpoint, { headers });
  if (response.status === 404)
    return { terminal: true, resources: {} as ProviderResources };
  if (response.status !== 200) throw Error("Provider cleanup lookup failed");
  const run = (response.body as any)?.data;
  if (!run || run.id !== runId || typeof run.status !== "string")
    throw Error("Invalid cleanup run metadata");
  const resources: ProviderResources = {};
  for (const [key, field] of [
    ["dataset", "defaultDatasetId"],
    ["keyValueStore", "defaultKeyValueStoreId"],
    ["requestQueue", "defaultRequestQueueId"],
  ] as const) {
    if (typeof run[field] === "string") resources[key] = run[field];
  }
  if (!terminal.has(run.status)) {
    const abort = await request(endpoint + "/abort", {
      method: "POST",
      headers,
    });
    if (abort.status !== 200 && abort.status !== 404)
      throw Error("Provider cleanup abort failed");
    return { terminal: false, resources };
  }
  return { terminal: true, resources };
}
export async function deleteProviderRun(
  runId: string,
  resources: ProviderResources,
  token: string,
  request: Request = outbound,
) {
  const headers = { authorization: `Bearer ${token}` };
  const paths = [
    resources.dataset && `datasets/${encodeURIComponent(resources.dataset)}`,
    resources.keyValueStore &&
      `key-value-stores/${encodeURIComponent(resources.keyValueStore)}`,
    resources.requestQueue &&
      `request-queues/${encodeURIComponent(resources.requestQueue)}`,
    `actor-runs/${encodeURIComponent(runId)}`,
  ].filter((p): p is string => !!p);
  for (const path of paths) {
    const url = `https://api.apify.com/v2/${path}`;
    const deleted = await request(url, { method: "DELETE", headers });
    if (![204, 404].includes(deleted.status))
      throw Error("Provider deletion failed");
    const checked = await request(url, { headers });
    if (checked.status !== 404) throw Error("Provider deletion not confirmed");
  }
}
