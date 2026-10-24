import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
// Internal storage envelopes. Wire objects are validated against canonical JSON Schema.
const keyed = () =>
  defineTable({
    key: v.string(),
    data: v.any(),
    expiresAt: v.optional(v.number()),
  })
    .index("key", ["key"])
    .index("expiry", ["expiresAt"]);
export default defineSchema({
  investigations: keyed(),
  graphs: keyed(),
  enrichments: keyed(),
  analyses: keyed(),
  idempotency: keyed(),
  jobs: defineTable({
    key: v.string(),
    data: v.any(),
    status: v.string(),
    due: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("key", ["key"])
    .index("status_due", ["status", "due"])
    .index("expiry", ["expiresAt"]),
  providerSlots: defineTable({
    key: v.string(),
    data: v.any(),
    status: v.string(),
    expiresAt: v.optional(v.number()),
  })
    .index("key", ["key"])
    .index("status", ["status"])
    .index("expiry", ["expiresAt"]),
  snapshots: keyed(),
  cache: keyed(),
  controls: keyed(),
  providerCleanup: defineTable({
    key: v.string(),
    expiresAt: v.number(),
    nextAttemptAt: v.number(),
    data: v.any(),
  })
    .index("key", ["key"])
    .index("due", ["nextAttemptAt"]),
});
