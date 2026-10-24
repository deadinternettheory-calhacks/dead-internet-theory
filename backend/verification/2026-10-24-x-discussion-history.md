# X discussion and authored-history verification — 2026-10-24

The owner supplied post `2113795065873047850` for the four-platform rollout.
All runs used a $0.25 per-run cap, 180-second timeout and pinned builds.

## Discussion

- Original-post lookup: `apidojo/twitter-scraper-lite`, build `0.0.1040`,
  run `64tAS9bFAb1zDAeIq`, `SUCCEEDED`, one matching original post.
- Replies: `apidojo/twitter-replies-scraper`, build `0.0.152`,
  run `HUUvZ89kQlA6bTrKX`, `SUCCEEDED`, ten returned rows with a 20-item input cap.
- One returned row was explicitly a non-reply from another conversation: a
  recommendation card. It was excluded and the omission recorded in coverage.
  Foreign actual replies still fail validation.
- Normalization retained nine replies: five to the root and four nested replies,
  with no dangling parents. The graph had six observed authors, nine source URLs
  and nine parsed timestamps. Canonical schema, topology and fingerprint passed.
- Coverage was partial; the original post reported 204 replies. Ordering reflects
  the provider's ranking. Bounded provider state was approximately 14 KB.
- Settled reported charges: $0.0504 for lookup and $0.018 for replies.

## Authored history

One observed reply author was checked with the Lite Actor using
`from:handle filter:replies`, a 20-candidate cap and the same pinned build:
run `2acskbXwvnYkN4OdZ`, `SUCCEEDED`, settled reported charge $0.02.
All ten returned candidates were replies authored by the requested native author
ID. Canonical sampling retained nine usable comments outside the focal discussion,
using `recent_fallback`; status was partial and schema validation passed. This
does not establish a ten-item temporal-nearest sample or lifetime-history coverage.

## Plan and retention limits

The account is on Apify Free. The owner elected to leave it there after being
informed that these X Actors permit five runs per month and ten items per run on
Free. X remains a limited demo; one analysis may consume several runs and optional
histories may be unavailable. `APIFY_X_DEMO_ONLY=true` makes capabilities and the
website display that limitation without changing per-run budgets or billing.
The publisher's single-concurrent-run restriction is respected by serialization
across both X Actors.

All three runs and nine default storages were deleted, each confirmed by an
authenticated 404. Local source rows, graph and history were deleted. Only
non-content verification metadata remains; none of this standalone source content
was stored in Convex, inference or Git. These scoped checks establish adapter
behavior, not universal post availability or inference quality.

Reviewed provider documentation: [Lite lookup/search](https://apify.com/apidojo/twitter-scraper-lite),
[discussion replies](https://apify.com/apidojo/twitter-replies-scraper).
