// GET /v1/capabilities. Hints only (contract section 3); no provider Actor
// runs are verified, so actorRuntimeVerified is false everywhere.
import { SCHEMA_VERSION } from './contract';

export interface CapabilityResponseLike {
  schemaVersion: typeof SCHEMA_VERSION;
  platforms: {
    platform: 'reddit' | 'x' | 'youtube' | 'tiktok';
    discussion: 'supported_best_effort';
    authorHistory: 'supported_best_effort' | 'unsupported';
    profileEnrichment: 'reddit_only_optional' | 'not_supported';
    actorRuntimeVerified: boolean;
  }[];
}

export function capabilities(): CapabilityResponseLike {
  return {
    schemaVersion: SCHEMA_VERSION,
    platforms: [
      { platform: 'reddit', discussion: 'supported_best_effort', authorHistory: 'supported_best_effort', profileEnrichment: 'reddit_only_optional', actorRuntimeVerified: false },
      { platform: 'x', discussion: 'supported_best_effort', authorHistory: 'supported_best_effort', profileEnrichment: 'not_supported', actorRuntimeVerified: false },
      { platform: 'youtube', discussion: 'supported_best_effort', authorHistory: 'unsupported', profileEnrichment: 'not_supported', actorRuntimeVerified: false },
      { platform: 'tiktok', discussion: 'supported_best_effort', authorHistory: 'unsupported', profileEnrichment: 'not_supported', actorRuntimeVerified: false },
    ],
  };
}
