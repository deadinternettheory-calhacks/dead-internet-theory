import { availability } from "./provider-policy";
import * as validators from "./generated/validators.js";
import type { DiscussionInvestigationAPIV100CanonicalModels as Models } from "./generated/models";
export type Model<N extends keyof Models> = NonNullable<Models[N]>;
export type Platform = Model<"Platform">;
export class ApiFault extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
export function validate<N extends keyof Models>(
  name: N,
  value: unknown,
  status = 400,
): Model<N> {
  const check = validators[name];
  if (!check(value))
    throw new ApiFault(
      status,
      status >= 500
        ? "INTERNAL_ERROR"
        : status === 422
          ? "INVALID_ANALYSIS"
          : "INVALID_REQUEST",
      `Invalid ${name}`,
    );
  return value as Model<N>;
}
export function validateOutput<N extends keyof Models>(
  name: N,
  value: unknown,
): Model<N> {
  return validate(name, value, 500);
}
export const iso = (ms = Date.now()) => new Date(ms).toISOString();
export function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + stable(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function sha(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stable(value)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export type ProviderMode = "fixture" | "live";
export function providerMode(): ProviderMode {
  const mode = process.env.PROVIDER_MODE ?? "fixture";
  if (mode !== "fixture" && mode !== "live")
    throw new ApiFault(
      500,
      "INTERNAL_ERROR",
      "Invalid provider mode configuration",
    );
  return mode;
}
export const platforms: Platform[] = ["reddit", "x", "youtube", "tiktok"];
export function integer(
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new Error(`Invalid configuration: ${name}`);
  return n;
}
export const limits = () => ({
  graphBytes: integer("MAX_GRAPH_BYTES", 500_000, 1000, 700_000),
  comments: integer("MAX_COMMENTS", 1000, 1, 3000),
  bodyBytes: integer("MAX_REQUEST_BYTES", 500_000, 1000, 700_000),
  active: integer("MAX_ACTIVE_JOBS", 4, 1, 16),
  providerActive: integer("MAX_ACTIVE_PROVIDER_RUNS", 4, 1, 16),
  queued: integer("MAX_QUEUED_JOBS", 100, 1, 1000),
  rate: integer("POSTS_PER_HOUR", 30, 1, 10000),
  attempts: integer("MAX_JOB_ATTEMPTS", 3, 1, 5),
  runSeconds: integer("APIFY_TIMEOUT_SECONDS", 180, 30, 600),
  cacheMs: integer("HISTORY_CACHE_SECONDS", 3600, 1, 86400) * 1000,
  // Authored-comment candidates fetched per history author (10 are returned).
  historyCandidates: integer("HISTORY_CANDIDATES_PER_AUTHOR", 40, 10, 150),
  cents: integer("APIFY_RUN_BUDGET_CENTS", 25, 1, 1000),
  dailyCents: integer("APIFY_DAILY_BUDGET_CENTS", 500, 0, 100000),
});
export function capabilities() {
  return validate("CapabilityResponse", {
    schemaVersion: "1.0.0",
    platforms: platforms.map((platform) => ({
      platform,
      discussion: "supported_best_effort",
      authorHistory: ["reddit", "x"].includes(platform)
        ? "supported_best_effort"
        : "unsupported",
      profileEnrichment:
        platform === "reddit" ? "reddit_only_optional" : "not_supported",
      ...availability(platform),
      mode: providerMode(),
      limitations: availability(platform).liveEnabled
        ? [
            "Authorized, reviewed provider configuration; individual collection remains best effort.",
          ]
        : [
            "Live collection is disabled until provider mode, authorization, retention, server credentials and reviewed runtime evidence are all configured.",
          ],
    })),
  });
}
