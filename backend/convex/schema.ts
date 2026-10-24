import {defineSchema,defineTable} from 'convex/server';
import {v} from 'convex/values';
// Internal storage envelopes. Wire objects are validated against canonical JSON Schema.
const keyed=()=>defineTable({key:v.string(),data:v.any()}).index('key',['key']);
export default defineSchema({investigations:keyed(),graphs:keyed(),enrichments:keyed(),analyses:keyed(),idempotency:keyed(),jobs:defineTable({key:v.string(),data:v.any(),status:v.string(),due:v.number()}).index('key',['key']).index('status_due',['status','due']),snapshots:keyed(),cache:keyed(),controls:keyed()});
