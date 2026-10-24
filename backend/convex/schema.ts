import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Contract payloads are stored as JSON strings: they are validated against
// contracts/models.schema.json before storage, and storing them verbatim
// avoids Convex field-name restrictions. Convex documents are limited to 1 MB,
// so ingestion rejects larger graphs with DISCUSSION_TOO_LARGE.
export default defineSchema({
  investigations: defineTable({
    investigationId: v.string(),
    /** InvestigationResource JSON. */
    resource: v.string(),
  }).index('by_investigationId', ['investigationId']),

  graphs: defineTable({
    investigationId: v.string(),
    graphRevision: v.number(),
    graphFingerprint: v.string(),
    /** GraphEnvelope JSON. */
    graph: v.string(),
  }).index('by_investigation_revision', ['investigationId', 'graphRevision']),

  enrichments: defineTable({
    enrichmentId: v.string(),
    investigationId: v.string(),
    /** EnrichmentRequest JSON. */
    request: v.string(),
    /** EnrichmentJob JSON. */
    job: v.string(),
  })
    .index('by_enrichmentId', ['enrichmentId'])
    .index('by_investigationId', ['investigationId']),

  analyses: defineTable({
    analysisId: v.string(),
    investigationId: v.string(),
    graphRevision: v.number(),
    /** AnalysisResource JSON. */
    analysis: v.string(),
  }).index('by_investigation_revision', ['investigationId', 'graphRevision']),

  idempotency: defineTable({
    principal: v.string(),
    route: v.string(),
    key: v.string(),
    requestHash: v.string(),
    status: v.number(),
    /** Response body JSON to replay. */
    response: v.string(),
    createdAt: v.number(),
  }).index('by_scope', ['principal', 'route', 'key']),

  /** One inference run per (investigationId, graphRevision); also dedupes investigation.ready. */
  inferenceJobs: defineTable({
    investigationId: v.string(),
    graphRevision: v.number(),
    eventId: v.string(),
    stage: v.string(),
    /** Stage state JSON: CREAO run IDs, triage output, enrichment ID, scoring output. */
    state: v.string(),
    polls: v.number(),
    stageStartedAt: v.number(),
    error: v.optional(v.string()),
    updatedAt: v.number(),
  }).index('by_investigation_revision', ['investigationId', 'graphRevision']),
});
