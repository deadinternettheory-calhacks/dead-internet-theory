# YouTube discussion verification — 2026-10-24

The owner supplied public video `jDtG_pwIIv0` for the requested four-platform
rollout. This was a standalone collection check with a 20-comment limit, replies
enabled (at most two per parent), 180-second timeout and $0.25 maximum charge.
No author-history requests were made.

## Provider and output

- Actor: `datagleaner/youtube-comments-scraper`, pinned build `0.1.3`
  (`x5STeY6mZwcgh1m9U`).
- Run: `zoiebAmzdkXtzCw3c`, `SUCCEEDED`.
- Returned 20 comments from the requested video, with 20 observed channel IDs.
- Normalization retained 18 replies to the video and two replies to comments.
  All 20 source-comment links were retained.
- Original-video identity and title came from the provider's `videoId` and
  `videoTitle` metadata. No commenter was made the video author; the unavailable
  video author and publication time stayed null.
- The provider supplied date-only estimated comment ages. These stay in source
  timestamp metadata; canonical timestamps remain unknown rather than assigning
  every comment an invented midnight and manufacturing a posting burst.
- The normalized graph passed canonical schema, topology and fingerprint checks.
  Coverage is partial. The bounded provider state was approximately 16 KB after
  dropping unused media/profile fields.
- Final reported charge: **$0.008** for 20 comment events.

## Retention and limits

The run's dataset, key-value store, request queue and run were deleted after
verification. Each deletion returned 204 and a following authenticated GET
returned 404. Local rows, graph and run document were deleted too; only
non-content verification metadata remains. No source content from this standalone
check was stored in Convex, inference or Git.

This verifies the discussion adapter against one permitted public video. It does
not establish exhaustive retrieval or universal availability. Empty video
collections produce an explicit no-comments error. Video input remains metadata
text only; audiovisual content and cross-video commenter histories are not
collected. Public engagement counts and comment ages may be rounded. X and TikTok
remain gated until their own permitted runtime checks succeed.

Reviewed provider documentation:
[input and output](https://apify.com/datagleaner/youtube-comments-scraper).
