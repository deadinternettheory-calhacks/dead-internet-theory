import type { Platform } from "./generated/models";
export const verification: Record<
  Platform,
  { runtimeVerified: boolean; evidence: string | null }
> = {
  reddit: {
    runtimeVerified: true,
    evidence:
      "backend/verification/2026-10-24-reddit-history.md; backend/verification/2026-10-24-reddit-discussion.md; backend/verification/2026-10-24-reddit-build-recovery.md",
  },
  x: {
    runtimeVerified: true,
    evidence: "backend/verification/2026-10-24-x-discussion-history.md",
  },
  youtube: {
    runtimeVerified: true,
    evidence: "backend/verification/2026-10-24-youtube-discussion.md",
  },
  tiktok: {
    runtimeVerified: true,
    evidence: "backend/verification/2026-10-24-tiktok-discussion.md",
  },
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
  return {
    actorRuntimeVerified: reviewed,
    liveEnabled,
    demoLimited: platform === "x" && process.env.APIFY_X_DEMO_ONLY === "true",
  };
}
