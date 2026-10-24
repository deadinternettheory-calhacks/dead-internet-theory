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

Batched history snapshots are stored once and shared through opaque references, rather than duplicated in every author result. Persistent job payloads are capped at 700000 bytes; an oversized plan fails explicitly with `JOB_STATE_TOO_LARGE` before reaching the document limit.

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

## Hosted development deployment

On 2026-10-24 the merged backend (repository revision `de3b709`, including backend
merge `d196cf7`) was deployed to the existing development deployment
`impartial-sheep-516`. Its API base is `https://impartial-sheep-516.convex.site`.
The target was confirmed empty of functions and environment variables before
setup; no production deployment was changed.

Authenticated cloud checks passed for all eight REST operations, create/analysis
replays, owner isolation, synthetic graph provenance, two history results and
analysis persistence. The canonical ready event was observed in its durable
outbox. At that initial stage no external inference receiver was configured.
The subsequent live deployment is recorded below.

All four external credentials passed read-only authentication checks. Apify user
access and Anthropic model listing returned 200. The CREAO key is recognized by
its legacy `https://agent.creao.ai/api/v1` API (run listing 200), while the v2
project-key endpoint rejected it. No billable Actor or model runs were started.
These credential checks do not establish provider source permissions, Actor
mappings or message-generation access/balance. A separate CREAO/Claude worker now
exists in `inference/`; see its own verification limits. The later scoped Reddit
Actor check is recorded below.

The private `.env.server.local` setup inventory contains CLI access, backend
configuration and reserved worker keys. **Do not bulk-import that entire file.**
Only backend runtime names from `.env.example` were imported to Convex; the
Convex admin credential and CREAO/Anthropic keys were kept out of the ingestion
runtime. Keep CLI selection explicit, for example:

```sh
npm run generate
npx convex deploy --env-file .env.server.local --typecheck enable
npx convex env list --names-only --env-file .env.server.local
# For runtime updates, first prepare a private file containing only .env.example names.
npx convex env set --env-file .env.server.local --from-file <runtime-only-file>
```

The owner subsequently requested live operation and chose 24-hour retention.
The existing backend is now in live mode with Reddit reviewed/enabled, and is
connected to the CREAO coordinator at `grandiose-barracuda-22`. The real-post
pipeline completed on the hosted website. Launch settings are 100 comments,
$1 per Actor run and no daily reservation cap (0), as requested by the owner.
See the [hosted verification record](verification/2026-10-24-hosted-live.md)
and [retention policy](RETENTION.md). X, YouTube and TikTok remain unverified and
disabled; broader provider coverage and hosted live history cases remain open.

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
| `APIFY_DAILY_BUDGET_CENTS`        | 500 maximum reserved USD cents per UTC day; 0 disables the daily cap        |
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

Each investigation pins its provider mode at creation; changing deployment mode cannot silently replace a running live collection with fixture data or turn a synthetic investigation into a live lookup. Enrichment jobs persist their initial cache hits and missing-author plan before external work, so cache fills and expiry in another job cannot change an in-flight plan.

History candidates target 150 per author, with cache keys including mode,
platform, author and collection policy. One batch deduplicates repeated authors;
Reddit uses a single bulk run, X uses authored-search plans. Independent concurrent
jobs can miss the same cache and make separate bounded runs. Final samples remain
anchor-specific and are not cached as candidate pools. If a later author task fails, already-collected candidate evidence and its run/snapshot provenance are preserved; only affected authors receive failures. Incomplete candidate paging is reported explicitly, and transient failures are not cached as empty history. Cache TTL is freshness,
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

The Reddit `verification` entry in `src/provider-policy.ts` references the
reviewed discussion/history evidence; the other three entries remain false.
The adapter gate and capabilities read this single policy source.
Capabilities report the required contract support classes alongside the actual reviewed verification state and a computed `liveEnabled` flag. Initially both are false. Enabling live collection requires the reviewed flag/evidence, live mode, authorization, retention reference and a nonempty server credential. These
classes describe operation intent, not live availability. Even setting an Apify
token and authorization flags cannot enable an unverified adapter.

On 2026-10-24, one user-permitted Reddit discussion was checked with Actor build
`0.0.127`, capped at 20 comments and $0.25. It returned one post and 20 comments;
the normalized graph passed canonical schema, topology and fingerprint checks.
Apify reported $0.0235 after billing counters settled. The run, its default
dataset/key-value store/request queue and local content were deleted after
verification, with each remote resource subsequently returning 404. The
[non-content verification record](verification/2026-10-24-reddit-discussion.md)
documents counts, omissions and the remaining checks. No real content was written
to Convex, inference or Git. This scoped discussion check does not verify author
histories, multi-page collection or the hosted live workflow. All policy flags
were still false at that point; the later hosted launch is documented separately.

The owner then authorized a two-author history follow-up with the same deletion
policy. The history Actor build `0.0.78` returned 150 candidates for one author;
after mapping `author_fullname`, `_content_type` and `link_id`, the backend
returned ten valid items using `recent_fallback` and excluded the focal discussion.
The second author returned no content in either the batch or an individual
lookup, producing an explicit partial/empty result with unknown availability.
The follow-up, including recollecting a small discussion seed, cost a reported
$0.3245. All three runs, their default storages and local source content were
deleted, with authenticated 404 checks for remote resources. See the
[history verification record](verification/2026-10-24-reddit-history.md).
During that standalone smoke, no real content reached Convex or inference.
Optional Reddit account dates/karma were not fetched or invented.

Other candidate field mappings remain documentation/synthetic checks only and
may require correction against authorized provider output.
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
verification entry and mappings in a reviewed commit with tests.
Do not edit frozen contracts to match a provider's output. After smoke checks,
follow the approved retention decision for the run, its separate default storages
and local files; deleting an Actor run alone does not delete its storages.

## Failure recovery and deployment

Inspect jobs and resources in the Convex dashboard using privileged operator
access. Public errors are sanitized and never include credentials or raw provider
messages. Do not log raw source bodies or secret headers. The automatic retries
cover known transient failures and expired leases. An ambiguous provider start
retains its maximum spend reservation and fails closed instead of risking a
second charge. An Actor keeps its capacity slot until a terminal provider status is confirmed, including while the worker waits between polls. A confirmed run ID is recorded before the next payload update so recovery can resume it without another charge. An ambiguous start retains its slot indefinitely; a timeout or expired worker lease alone does not prove a queued remote Actor stopped. After inspecting Apify run history, an operator can mark the corresponding `providerSlots` record released in the dashboard only when the run is terminal or the start is confirmed not accepted. When Apify answers a start with HTTP 4xx (for example 401 bad token, 402 out of credit or over the usage limit, 403/404 Actor or build unavailable, 429 rate limit), no run exists: the worker releases the slot and reserved budget itself and fails the investigation with `PROVIDER_REJECTED`, whose message names the HTTP status. Only network errors, timeouts and 5xx answers remain `PROVIDER_START_AMBIGUOUS`.

Inspect Apify run history before an operator initiates another
investigation; no v1 recollect/restart route exists. Terminal job errors retain
the graph if one was completed. Independent inference may still submit a valid
final analysis after a delivery failure.

Before production deployment or live collection, approve: provider access/terms and runtime evidence;
public-client issuer/BFF and key rotation; actual retention duration, deletion,
correction and takedown procedure (including snapshots, jobs, cache, idempotency
and Convex backups); per-deployment budget/capacity; HTTPS inference inbox and
restart/deduplication behavior; operational ownership and alerting. The owner's
24-hour application policy is implemented with indexed deletion sweeps and
durable Apify cleanup retries; upstream-provider retention boundaries are in
[RETENTION.md](RETENTION.md). No public deletion endpoint is added to v1.

Configure a Convex project, set reviewed server env, then `npm run deploy`.
Deploying externally and merging the PR require the owner's authorization.
Check the HTTP site URL with authenticated capabilities, then perform an approved
synthetic smoke before permitted provider runs. Roll back to the last reviewed
Convex deployment; do not rewrite immutable source graphs or silently reanalyze a
revision. Monitor failed jobs and exhausted event delivery through the dashboard.
