# Backend operations and implementation decisions

## Architecture and persistence

`convex/http.ts` exposes the eight REST operations. It bounds body reads, verifies
JWTs and calls private mutations. `api.ts` atomically enforces authorization,
idempotency, quotas and cross-record validation before creating jobs or storing
analysis. Unexpected mutation failures propagate so Convex rolls back writes.
Only internal functions are exported for storage, scheduling and worker access;
clients cannot bypass the HTTP boundary using public Convex function calls.

`jobs.ts` atomically claims jobs with a 60-second lease and schedules a watchdog
before the external action runs. `worker.ts` is a Node action that collects,
normalizes, samples or delivers one event. Retry state and provider run IDs persist
between actions; polling resumes the known run. Expired leases recover failed
processes, stale worker results cannot overwrite a newer lease, and configured
attempt limits lead to terminal failure. Temporary provider errors use exponential
backoff. Job capacity, active leases and UTC daily spend reservations are enforced
transactionally. Lease selection uses an indexed status/expiry range.

Storage tables: investigations (owner + independent state machines), graphs
(immutable revision 1), analyses (one final resource per investigation),
enrichments (request + job/results), jobs (execution and outbox state), snapshots
(protected raw records), cache (anchor-independent history candidates), idempotency
(original request/response and expiry), controls (rate/spend reservations), providerSlots (Actor capacity reservations).
No raw-snapshot public read route exists. Opaque snapshot references contain no
provider token or unrestricted dataset URL. Enrichment profiles do not update graphs.

Graph fingerprinting hashes UTF-8, recursively key-sorted JSON of the complete
GraphEnvelope **excluding `graphFingerprint`**, with nodes sorted by ID and edges
by canonical JSON. Array order is otherwise significant. SHA-256 is lowercase hex.
Collection metadata is part of the hash; independently recollected graphs may
have different fingerprints. Duplicate source records choose the lexically first
canonical record deterministically. Missing comment IDs receive content-derived,
explicitly synthetic IDs; deleted authors have null identity and are never merged.

The service never fetches submitted source URLs. It accepts exact supported HTTPS
hosts and discussion paths, canonicalizes aliases, discards tracking queries and
fragments, and rejects credentials, explicit ports, encodings and short links.
Only the YouTube `v` query is needed for supported identity. The frozen schema's
HTTPS requirement governs over the broader HTTP/HTTPS product wording. Redirect
resolution is excluded; short links must be expanded by the caller. External I/O
goes to a fixed Apify API origin or an operator-configured event URL, with public
DNS checks, pinned connections, no redirects, timeouts and byte limits.

Local testing has one narrow exception: `LOCAL_SYNTHETIC_EVENT_DELIVERY=true`,
`PROVIDER_MODE=fixture`, a loopback `CONVEX_CLOUD_URL`, and the exact URL
`http://127.0.0.1:4010/events` allow the local mock receiver. Other HTTP/private
destinations remain blocked. Remove this flag in hosted deployment.

## Server configuration

Copy `.env.example` to a private file, fill server-only values, and use
`npx convex env set --from-file <private-file>`. Do not commit real env files.

| Variable                          | Purpose/default                                                             |
| --------------------------------- | --------------------------------------------------------------------------- |
| `AUTH_JWT_SECRET`                 | Required, at least 32 characters of high-entropy secret; HS256 verification |
| `PROVIDER_MODE`                   | `fixture` by default; `live` additionally requires review gates             |
| `INFERENCE_EVENT_URL`             | Public HTTPS event receiver; none by default                                |
| `INFERENCE_EVENT_TOKEN`           | Server-only bearer credential to receiver                                   |
| `APIFY_TOKEN`                     | Server-only Apify credential; unnecessary in fixture mode                   |
| `PROVIDER_AUTHORIZATION_APPROVED` | Must equal `true` before live work                                          |
| `RETENTION_POLICY_REF`            | Required documented retention/deletion approval reference for live work     |
| `MAX_GRAPH_BYTES`                 | 500000 UTF-8 uncompressed bytes; maximum accepted setting 700000            |
| `MAX_COMMENTS`                    | 1000 retained comments; configurable 1–3000                                 |
| `MAX_REQUEST_BYTES`               | 500000; configurable up to 700000                                           |
| `MAX_ACTIVE_JOBS`                 | 4 leased worker actions; maximum 16                                         |
| `MAX_ACTIVE_PROVIDER_RUNS`        | 4 reserved/running Actors across polling ticks; maximum 16                  |
| `MAX_QUEUED_JOBS`                 | 100 waiting jobs; maximum 1000                                              |
| `POSTS_PER_HOUR`                  | 30 accepted POSTs per principal per UTC hour; successful replays exempt     |
| `MAX_JOB_ATTEMPTS`                | 3 including the initial attempt; maximum 5                                  |
| `APIFY_TIMEOUT_SECONDS`           | 180 per run; 30–600 supported                                               |
| `HISTORY_CACHE_SECONDS`           | 3600, maximum 86400; expiry checked before reuse                            |
| `APIFY_RUN_BUDGET_CENTS`          | 25 maximum charged USD cents per Actor run                                  |
| `APIFY_DAILY_BUDGET_CENTS`        | 500 maximum reserved USD cents per UTC day                                  |
| `LOCAL_SYNTHETIC_EVENT_DELIVERY`  | `false`; exact local-only test exception above                              |

Convex CLI sets `CONVEX_DEPLOYMENT`, `CONVEX_URL`, `CONVEX_SITE_URL` in its ignored
local file; runtime supplies `CONVEX_CLOUD_URL`. Production CLI deploy credentials
use `CONVEX_DEPLOY_KEY` in CI secret storage when a cloud project is approved.

Mock/test scripts additionally use `BACKEND_BASE_URL`, `FRONTEND_API_TOKEN`,
`INFERENCE_API_TOKEN`, `MOCK_INBOX_DIR` (default `/tmp/dit-mock-inbox`) and
`MOCK_PORT` (4010). These are server/test process values, never `VITE_*` settings.

## Collection and evidence limits

Full graphs fit one Convex document and one v1 response. The configured hard byte
ceiling stays below Convex's 1 MiB document bound; no pagination or compression is
required at the default. A graph over budget fails with `DISCUSSION_TOO_LARGE` in
the investigation. GET also returns 413 if the configured ceiling is subsequently
lowered. Comment caps produce an explicit partial graph; an Actor's success is
never proof of complete coverage. Raw provider state/snapshots are bounded to
650000 bytes. Larger raw collections fail honestly instead of silently losing data.

History candidates target 150 per author, with cache keys including mode,
platform, author and collection policy. One batch deduplicates repeated authors;
Reddit uses a single bulk run, X uses authored-search plans. Independent concurrent
jobs can miss the same cache and make separate bounded runs. Final samples remain
anchor-specific and are not cached as candidate pools. Cache TTL is freshness,
not a deletion policy. Future, invalid, unknown-time and focal-discussion records
are excluded. Unknown source-discussion IDs are excluded because focal exclusion
cannot be established. Estimated dates force recent fallback for temporal purposes.
Fewer than ten in the exact anchor window cause full replacement with the ten
most recent usable candidates, never a blend. Status `complete` means ten returned
items, not exhaustive history. Unsupported YouTube/TikTok history invokes no provider.

## Provider verification and smoke checks

`src/providers.ts` contains asynchronous run start/poll/paged-dataset transport,
candidate plans and conservative field mappings for all four platforms. X plans
include a separate original-tweet lookup and `from:handle` authored history;
original tweets are excluded from authored-comment candidates. Original root ID
must match the requested discussion. No missing root is promoted from a reply.
YouTube dates are estimated unless explicitly attested exact; video roots are text
metadata only. No account creation or karma value is fabricated; absent profile
metadata remains absent.

All four `verification` entries have `runtimeVerified:false` and no evidence.
Capabilities report the required contract support classes alongside
`actorRuntimeVerified:false`, `liveEnabled:false` and explicit limitations. These
classes describe operation intent, not live availability. Even setting an Apify
token and authorization flags cannot enable an unverified adapter.

Actor input pages were consulted during implementation, but no authenticated run,
actual output/paging/cost validation or provider permission was available. This
is **documentation inspection only**. Candidate field mappings are exercised with
synthetic records; they may require correction against authorized provider output.
Review sources: [Reddit discussion](https://apify.com/clearpath/reddit-post-comments-bulk-scraper/input-schema),
[Reddit history](https://apify.com/clearpath/reddit-user-content-scraper/input-schema),
[X authored search](https://apify.com/apidojo/tweet-scraper/input-schema),
[TikTok](https://apify.com/deepmine/tiktok-comments-scraper/input-schema).
X replies and YouTube input pages were unavailable through the browsing tool;
use the [candidate notes](../contracts/provider-adapters.md) until reviewed.

After the owner supplies permitted targets, an approved retention policy and
server-side Apify credentials, use the explicitly billable smoke utility:

```sh
# Set secret variables in the shell/secret manager, without writing them to Git.
# PROVIDER_SMOKE_AUTHORIZED=true, RETENTION_POLICY_REF=<approved reference>, APIFY_TOKEN=<secret>
npm run smoke -- <authorized-discussion-URL> /tmp/dit-authorized-smoke
```

Optional `SMOKE_AUTHORS_FILE` selects history mode with a private JSON array of
canonical AuthorNode records, at most 25; video history exits without a call.
The utility bypasses only the runtime-verification gate to gather the evidence
needed for review. It still requires explicit authorization/retention and applies
per-run cost/time/volume caps. It does not share the service's daily budget ledger;
operators must approve the aggregate plan cost (up to one run per selected X
author, two runs for an X discussion). It does not retry starts after an ambiguous
response. Raw run IDs are written immediately to protected local output for recovery.

Inspect actual input schemas, costs, root ID/text, comment/author/native parent IDs,
reply paging, null/deleted authors, timestamps and approximation, returned metrics,
Reddit profile metadata and authored-versus-received replies. Record permitted
source, run/build IDs, output evidence, costs, timestamp findings, limitations and
reviewer in a private verification record. Then change the implementation's
verification entry/mappings/capability state in a reviewed commit with tests.
Do not edit frozen contracts to match a provider's output. No smoke test was run
as part of this change.

## Failure recovery and deployment

Inspect jobs and resources in the Convex dashboard using privileged operator
access. Public errors are sanitized and never include credentials or raw provider
messages. Do not log raw source bodies or secret headers. The automatic retries
cover known transient failures and expired leases. An ambiguous provider start
retains its maximum spend reservation and fails closed instead of risking a
second charge. An Actor keeps its capacity slot until a terminal provider status is confirmed, including while the worker waits between polls. A confirmed run ID is recorded before the next payload update so recovery can resume it without another charge. An ambiguous start retains its slot indefinitely; a timeout or expired worker lease alone does not prove a queued remote Actor stopped. After inspecting Apify run history, an operator can mark the corresponding `providerSlots` record released in the dashboard only when the run is terminal or the start is confirmed not accepted.

Inspect Apify run history before an operator initiates another
investigation; no v1 recollect/restart route exists. Terminal job errors retain
the graph if one was completed. Independent inference may still submit a valid
final analysis after a delivery failure.

Before cloud deployment, approve: provider access/terms and runtime evidence;
public-client issuer/BFF and key rotation; actual retention duration, deletion,
correction and takedown procedure (including snapshots, jobs, cache, idempotency
and Convex backups); per-deployment budget/capacity; HTTPS inference inbox and
restart/deduplication behavior; operational ownership and alerting. The current
code enforces expiry for reuse but does not physically delete expired records.
No approved retention duration or public deletion endpoint is invented here.
Keep production on synthetic data until those prerequisites are resolved.

Configure a Convex project, set reviewed server env, then `npm run deploy`.
Deploying externally and merging the PR require the owner's authorization.
Check the HTTP site URL with authenticated capabilities, then perform an approved
synthetic smoke before permitted provider runs. Roll back to the last reviewed
Convex deployment; do not rewrite immutable source graphs or silently reanalyze a
revision. Monitor failed jobs and exhausted event delivery through the dashboard.
