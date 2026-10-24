import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  /**
   * Durable inbox for investigation.ready events from the ingestion backend.
   * One row per (investigationId, graphRevision): delivery is at least once, so
   * repeats are acknowledged without starting a second analysis.
   */
  jobs: defineTable({
    investigationId: v.string(),
    graphRevision: v.number(),
    graphFingerprint: v.string(),
    eventId: v.string(),
    deliveries: v.number(),
    stage: v.string(),
    /** Stage state JSON: CREAO run IDs, triage output, enrichment ID, scoring output. */
    state: v.string(),
    stageStartedAt: v.number(),
    error: v.optional(v.string()),
    updatedAt: v.number(),
    expiresAt: v.optional(v.number()),
  }).index('by_investigation_revision', ['investigationId', 'graphRevision']).index('expiry', ['expiresAt']),
});
