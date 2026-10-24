# Four-platform hosted rollout verification — 2026-10-24

PR #30 was merged as `9f9d6c9a6be115eb9acc1b1056795614ae3570f8` after
backend/contracts, inference and Vercel checks passed. The application backend
was deployed to `impartial-sheep-516`; the production website serves
`/assets/index-BkmfgsZ5.js`. Inference continues on `grandiose-barracuda-22`.
The application deployment remains development-class in Convex.

## Live operation

The production same-origin `/api/v1/capabilities` endpoint reports reviewed/live
discussion collection for Reddit, X, TikTok and YouTube. The owner elected to
keep Apify Free: X reports `demoLimited:true`, and the form displays **Demo**
with its ten-items/run and five-runs/month-per-collector restriction. Other
platforms display **Live**. No Apify subscription or billing settings changed.

Runtime controls were read back after deployment: 100 retained comments,
$1 per Actor run, no daily reservation cap (`0`), and `APIFY_X_DEMO_ONLY=true`.
The fixed 24-hour application retention policy remains in force. A capability
read no longer sets or replaces the browser's owner cookie.

## Permitted end-to-end checks

The owner supplied one public URL per newly enabled platform. Each was submitted
once through the real website proxy with a persistent anonymous owner session
and idempotency key. Retrying browser reads reused that investigation rather
than starting another collection. No source responses were mocked.

| Platform | Investigation                   | Collected comments / authors | Coverage | Completion time |
| -------- | ------------------------------- | ---------------------------- | -------- | --------------- |
| TikTok   | `inv_1792882849899_6qpskg2e8di` | 12 / 9                       | unknown  | 222 seconds     |
| X        | `inv_1792882850053_zt27dni56tr` | 9 / 6                        | partial  | 283 seconds     |
| YouTube  | `inv_1792882849632_xk7airnxpu`  | 100 / 98                     | partial  | 321 seconds     |

All three ingestion and analysis states reached `completed`. Independent
readback passed the canonical graph, analysis and used-enrichment schemas,
graph topology, recomputed graph fingerprint and analysis evidence references.
Graphs were real rather than synthetic. The persisted inference version was
`dit-inference/0.2.0; rubric/0.3; prompts-2026-10-24d; creao-app-trigger`.
The earlier [hosted Reddit record](2026-10-24-hosted-live.md) covers Reddit's
existing path; it was not charged again for this rollout.

Discussion runs all succeeded:

- TikTok: `aM7yQtJhok82ATPb6`, `deepmine/tiktok-comments-scraper`.
- X original post: `W3gZtiFG8LKoRWtNE`, `apidojo/twitter-scraper-lite`;
  replies: `1q5RPrUoaEZtvb3x7`, `apidojo/twitter-replies-scraper`.
- YouTube: `xnKIlpx7Q1CbaEYhp`, `datagleaner/youtube-comments-scraper`.

X completed one enrichment job: two authors returned partial nine-comment recent
fallback samples; four returned no usable candidates and remained partial with
strategy `none`. This does not establish empty lifetime histories. Neither
video analysis requested author histories. Video inputs remain observed text
metadata, without audiovisual analysis; estimated date-only YouTube ages do not
become invented exact timestamps.

## Browser and repository checks

The production homepage showed all four availability labels and the X demo
restriction at 375px without horizontal overflow or console errors. The supplied
TikTok `/t/` share resolved through the production proxy to its canonical video
URL. Its real completed report rendered in the browser with source links,
without overflow or page errors. Local layout checks also covered 320px and
1440px. No live report screenshot or source content was saved locally.

PR validation passed: 152 backend tests, 130 website tests, 65 inference tests,
their relevant type/lint/format/build checks, generated-demo consistency and the
canonical contract validator. The existing large Three.js chunk warning remains.

## Retention and limits

The separate standalone provider checks were deleted after verification,
including their Apify default storages, with authenticated 404 confirmations.
These hosted reports and owned provider artifacts follow the owner's existing
24-hour application expiry and durable cleanup workflow in [RETENTION.md](../RETENTION.md).
Temporary verification cookies, browser state and idempotency-session files
were removed after readback. Only non-content verification metadata is retained
locally or in this record.

The checks establish these scoped paths and validation boundaries. They do not
establish exhaustive collection, reliable source availability, unrestricted X
usage, model calibration or detection accuracy.
