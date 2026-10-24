import type { Platform } from "./generated/models";
export const verification: Record<
  Platform,
  { runtimeVerified: boolean; evidence: string | null }
> = {
  reddit: { runtimeVerified: false, evidence: null },
  x: { runtimeVerified: false, evidence: null },
  youtube: { runtimeVerified: false, evidence: null },
  tiktok: { runtimeVerified: false, evidence: null },
};

export function availability(platform: Platform) {
  const reviewed =
    verification[platform].runtimeVerified &&
    Boolean(verification[platform].evidence?.trim());
  const liveEnabled =
    reviewed &&
    process.env.PROVIDER_MODE === "live" &&
    process.env.PROVIDER_AUTHORIZATION_APPROVED === "true" &&
    Boolean(process.env.RETENTION_POLICY_REF?.trim()) &&
    Boolean(process.env.APIFY_TOKEN?.trim());
  return { actorRuntimeVerified: reviewed, liveEnabled };
}
