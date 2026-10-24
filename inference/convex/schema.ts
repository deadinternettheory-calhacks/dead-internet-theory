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
    /** Stage state JSON: run IDs, triage output, enrichment IDs, scoring output. */
    state: v.string(),
    stageStartedAt: v.number(),
    /** A step holds the job until this time, so a webhook and a poll never advance it twice. */
    leaseUntil: v.optional(v.number()),
    /** Token the next scheduled step must carry; changes on every save. */
    stepToken: v.optional(v.string()),
    /** CREAO run the job is waiting on, for webhook lookup. */
    activeRunId: v.optional(v.string()),
    error: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('by_investigation_revision', ['investigationId', 'graphRevision'])
    .index('by_active_run', ['activeRunId']),

  /**
   * Validated model replies keyed by stage + prompt version + exact evidence
   * packet, so re-analyzing unchanged content skips the model call.
   */
  modelCache: defineTable({
    key: v.string(),
    stage: v.string(),
    output: v.string(),
    createdAt: v.number(),
  }).index('by_key', ['key']),
});
