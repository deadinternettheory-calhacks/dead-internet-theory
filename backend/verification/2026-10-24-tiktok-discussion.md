# TikTok discussion verification — 2026-10-24

The owner supplied TikTok share `ZTfHgfntd` for the four-platform rollout. Its
redirect identified video `7576749365398703415`; collection used that canonical
video URL, without fetching audiovisual content or commenter profiles.

- Actor `deepmine/tiktok-comments-scraper`, pinned build `0.7.20`.
- Run `IdO7TfLT0mexceDCZ`, `SUCCEEDED`; 20 top-level comments maximum,
  at most two replies per parent, 180-second timeout and $0.25 charge cap.
- Returned 12 comments from the requested video and nine observed author IDs:
  ten root replies and two nested replies. No dangling parents remained.
- All 12 timestamps and source-comment URLs were retained. Video metadata was
  read from observed `videoId` and `videoCaption`; the first row lacked a caption,
  so a later row supplied it. Video creator and publication time remain unknown.
- Canonical graph schema, topology and fingerprint checks passed. The bounded
  provider state was approximately 12 KB after dropping media/profile fields.
- Coverage remains unknown rather than exhaustive; no video-wide total was
  supplied. Ordering follows the provider's ranking, not chronological order.
- Settled provider-reported charge was $0.0042 for 12 comment events.

The run and its three default storages were deleted, followed by authenticated
404 checks for each resource. Local source rows and graph were deleted too.
Only non-content verification metadata remains. No source content from this
standalone check reached Convex, inference or Git.

The website resolves supported TikTok shares on the server using bounded HEAD
requests, validated public DNS addresses pinned to the connection, exact TikTok
hosts, at most two redirects and no credentials/cookies. It never fetches the
destination video page; the backend independently validates the full video URL.
This check does not prove universal video accessibility or retrieval completeness.
Cross-video author histories remain unsupported.

Reviewed provider [input/output documentation](https://apify.com/deepmine/tiktok-comments-scraper).
