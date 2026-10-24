# Scoped Reddit author-history verification

On 2026-10-24 the owner requested author histories after the permitted discussion
test, extending the test scope to two authors. The existing delete-after-
verification decision was retained. The test targeted up to 150 public authored
comments per author and ten selected history items, with a $1 total test budget.
No model calls, cloud publication, account classification or profile lookup was
included. This record contains no source URL, account identifiers or source text.

## Provider observations

The previous discussion data had been deleted, so a new 20-comment seed was
collected from the same permitted post. The first two distinct available authors
in graph comment-ID order were selected; selection required an exact-time anchor
and an observed native author ID. This selection only exercises the ingestion
boundary; inference still owns author selection in the application workflow.

| Run                 | Actor/build                    | Dataset rows | Provider-reported USD |
| ------------------- | ------------------------------ | ------------ | --------------------- |
| `OxEytB2AjxbESEjSO` | Discussion, `0.0.127`          | 21           | $0.0235               |
| `hVtPsNejdVKpPGZbS` | History, `0.0.78`              | 150          | $0.3005               |
| `0hyzi2Nt83zGlpfgo` | Individual follow-up, `0.0.78` | 0            | $0.0005               |
| Total               |                                |              | **$0.3245**           |

The history Actor was `clearpath/reddit-user-content-scraper`, pinned to build
`gmf5yV8EPorrtnqOw`. Inputs selected comments only, sorted `new`, capped at 150
items per user. All runs used 256 MiB and a 180-second timeout. The discussion
and initial history charge caps were $0.25 and $0.75. Once their combined reported
charge settled at $0.324, the second author's individual lookup was capped at
$0.50, keeping the follow-up within the $1 overall budget. Billing was last read
at 2026-10-24T08:06:32.387Z. All three runs reported `SUCCEEDED`.

Only the first author had returned rows: 150 found comments, all with the
requested authored handle, matching native author ID and source-discussion ID.
The second author returned zero rows both in the batch and a separate lookup.
No per-author unavailable marker was returned, so that absence remains unknown;
it does not establish an empty lifetime history or an inaccessible account.

## Mapping and selection checks

The existing mapping dropped these rows because it did not recognize the raw
`author_fullname` and `link_id` fields. The adapter now uses the observed native
author ID, `_content_type:comment`, and source-discussion fullname. It preserves
the provider's bare comment IDs, resolves relative source permalinks, omits
hidden scores and rejects explicit post rows. A requested-handle map allows
status/handle-only rows to be associated with the requested graph author; a
conflicting observed native identity takes precedence and is excluded.
Older persisted untyped comment rows remain supported.

Canonical `HistoryResult` validation passed for both results:

| Result        | Candidates | Selected | Status     | Strategy          |
| ------------- | ---------- | -------- | ---------- | ----------------- |
| First author  | 150        | 10       | `complete` | `recent_fallback` |
| Second author | 0          | 0        | `partial`  | `none`            |

All ten selected items had exact UTC timestamps, native IDs, source links and
known source-discussion IDs. IDs were distinct; neither the anchor nor any focal
discussion item was included. One focal-discussion candidate was excluded. The
first author's capped pool was marked truncated. Its normalized result had no
optional account-date/karma profile fields. The zero-item result explicitly
preserved uncertainty about availability and lifetime history.

The 150 raw rows occupied 342028 serialized bytes and the associated initial
worker task occupied 345186 bytes, within the backend's 650000-byte raw-state
limit. This observation does not establish that every two-author or larger batch
will fit; larger collections still fail explicitly at configured byte limits.

## Deletion and verification limits

At 2026-10-24T08:06:35.011Z all three runs, each default dataset, key-value store
and request queue were deleted with HTTP 204. Authenticated GET requests then
returned 404 for all twelve resources. Local rows, selected author/anchor records
and provider run-state files were removed. Only permission, shape/count,
verification, billing and cleanup metadata remain in protected local files.

128 backend tests, backend typechecking/format checks and canonical contract
validation passed after the fixes. New regression inputs are synthetic and cover
author/source-ID mapping, ten-item selection and exclusions, empty results,
explicit unavailability, mismatched identities, post exclusion, hidden metrics,
per-author caps and compatibility with older persisted rows.

This verifies one returned history pool, its ten-item selection and honest
handling of a second empty result. It does not establish complete history,
successful history collection for every author, profile metadata, hosted live
enrichment/persistence, the full inference workflow or a public deletion policy.
No real source content reached Convex, inference or Git. The hosted backend
remains in fixture mode and all provider verification flags remain false.
