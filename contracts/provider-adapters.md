# Provider adapter boundary — Apify

**Status:** v1 candidate Actor mappings, documentation-verified **only**, no authenticated production Actor runs performed.

Every adapter exports two backend operations internally:

- `ingestDiscussion(sourceUrl): Promise<GraphEnvelope>`: collect source root metadata and the accessible comment/reply graph; preserve raw snapshot and source run IDs.
- `collectAuthorCandidates(authorId, anchorTimestamp, budget=150): Promise<HistoryCandidateSet>`: best-effort public authored-comment history on Reddit/X only, with collection provenance, uncertainty and errors. The backend then runs the selection algorithm in `discussion-graph-api.md`.

The inference service **never** calls the adapters directly or receives raw Actor output.

| Platform | Discussion Actor | Author-history Actor | Cautions |
|---|---|---|---|
| Reddit | [`clearpath/reddit-post-comments-bulk-scraper`](https://apify.com/clearpath/reddit-post-comments-bulk-scraper) | [`clearpath/reddit-user-content-scraper`](https://apify.com/clearpath/reddit-user-content-scraper) | Root is a distinct post row; top-level comments may have `parentId:null`, normalize to root. `sort:'new'`, `maxCommentsPerPost:0`, `expandAllComments:true`. User history sorted `new`, `contentType:'comments'`, ~150 rows/user for local timestamp selection. Provider pagination can omit old content; this Actor's `timeFilter` is relative and only affects certain sorts. |
| X | [`apidojo/twitter-replies-scraper`](https://apify.com/apidojo/twitter-replies-scraper) **plus a separate root lookup with [`apidojo/twitter-scraper-lite`](https://apify.com/apidojo/twitter-scraper-lite)** | The same Lite Actor with `from:handle filter:replies` | Lite supports single-post lookups and small authored-reply searches; the older `tweet-scraper` Actor disallows single-post lookups and has query minimums. `inReplyToId` establishes hierarchy. Runs are conservatively serialized for the publisher's single-run policy. Free-plan demo limits and missing results remain provider constraints. Profile replies **to** an account are not its authored comment history. |
| YouTube | [`datagleaner/youtube-comments-scraper`](https://apify.com/datagleaner/youtube-comments-scraper) | **None** | Use `videoUrls`, `sortBy:'newest'`, `includeReplies:true`, and adequate `maxRepliesPerComment`; `maxCommentsPerVideo` counts comments + replies. `publishedAt` may be estimated from relative text; no audiovisual analysis. Video title and ID available, description availability unknown. |
| TikTok | [`deepmine/tiktok-comments-scraper`](https://apify.com/deepmine/tiktok-comments-scraper) | **None** | Use `videos`, `includeReplies:true`. `maxCommentsPerVideo` is **top-level** count with replies added beyond it; `parentCommentId` and `replyToCommentId` may differ. Actor only obtains visible public comments and not arbitrary user's comments across other videos. |

## Suggested Actor inputs for smoke tests

Reddit discussion:

```json
{"postUrl":"https://www.reddit.com/r/example/comments/POST_ID/","maxCommentsPerPost":0,"expandAllComments":true,"sort":"new"}
```

Reddit public comment history (bulk):

```json
{"usernames":["example_one","example_two"],"contentType":"comments","sort":"new","maxItemsPerUser":150}
```

X conversation replies (root content **separate**):

```json
{"startUrls":["https://x.com/example/status/POST_ID"],"useSearch":false,"maxItems":2000}
```

X authored content by window (query availability subject to search and Actor restrictions):

```json
{"searchTerms":["from:example since:2026-10-01 until:2026-10-24"],"sort":"Latest"}
```

YouTube video comment thread:

```json
{"videoUrls":["https://www.youtube.com/watch?v=VIDEO_ID"],"sortBy":"newest","maxCommentsPerVideo":3000,"includeReplies":true,"maxRepliesPerComment":50}
```

TikTok video comment thread:

```json
{"videos":["https://www.tiktok.com/@example/video/VIDEO_ID"],"maxCommentsPerVideo":3000,"includeReplies":true,"maxRepliesPerComment":50}
```

## Normalize carefully

| Canonical graph field | Example raw source | Normalization caveat |
|---|---|---|
| `DiscussionNode.text` | Reddit post body/X full tweet text/YouTube video title+optional description/TikTok caption | Metadata text is **not** a transcription of video. Use `contentScope:metadata_text_only` for video. |
| `CommentNode.id` | Reddit `id`; X tweet `id`; YouTube `commentId`; TikTok `commentId` | Always stringify before persistence. Namespaced by platform and kind. |
| `CommentNode.authorId` | Reddit `authorId`; X `author.id`; YouTube `authorChannelId`; TikTok `commenterId` | Unavailable or deleted → null; do not merge deleted pseudonyms. |
| `CommentNode.parentId` | Reddit `parentId` + `depth`; X `inReplyToId`; YouTube `parentId`; TikTok `replyToCommentId` / `parentCommentId` | Only create edge if identified parent exists. Root-level replies map to the discussion node. If parent was omitted, preserve native ID and no dangling edge. |
| `CommentNode.createdAt` | Reddit `createdAt`; X `createdAt`; YouTube `publishedAt`; TikTok `postedAt` | Normalize to UTC Z. Reddit may include `+0000`; X may provide `Thu Oct ... +0000 ...`; YouTube's value can be estimated, so set timestamp precision appropriately. |
| `CommentNode.metrics` | `score`, `likeCount`, `replyCount`, etc. | Do not pretend platform-relative engagement is comparable. Keep only observed counts. |
| `CommentNode.url` | `url`, `permalink`, comment link | Generate from a known canonical platform ID/URL only if deterministic and documented. Otherwise use null. |

Store raw provider fields and dataset refs internally. Every candidate Actor has third-party behavior that can change; check output schemas and costs in the Apify console. Actor listed as available is not proof it succeeds against a target thread or that its public-data collection is authorized under the platform's terms. Maintain a consented/approved historical dataset fallback for the demo when live access is restricted.

The video adapters use observed `videoId` plus `videoTitle` (YouTube) or
`videoCaption` (TikTok) carried on comment rows to establish the original metadata
root; comment text and commenter identity are never used as the root's content
or creator. Foreign video IDs fail validation. Date-only estimated YouTube ages
remain unknown canonical timestamps. The YouTube adapter has a
[single-video runtime check](../backend/verification/2026-10-24-youtube-discussion.md);
The [TikTok discussion](../backend/verification/2026-10-24-tiktok-discussion.md)
and [X discussion/history](../backend/verification/2026-10-24-x-discussion-history.md)
checks also passed. X's feed can include unrelated non-reply recommendation
cards; these are excluded with a coverage limitation, while foreign actual
replies fail validation. X/TikTok sort order reflects provider ranking. X remains
demo-limited on the current Apify Free plan; successful smoke checks do not
remove provider quotas or establish exhaustive collection.

## Source documentation checked October 23, 2026

- https://apify.com/clearpath/reddit-post-comments-bulk-scraper
- https://apify.com/clearpath/reddit-user-content-scraper
- https://apify.com/apidojo/twitter-replies-scraper
- https://apify.com/apidojo/tweet-scraper
- https://apify.com/apidojo/twitter-profile-scraper
- https://apify.com/datagleaner/youtube-comments-scraper
- https://apify.com/deepmine/tiktok-comments-scraper
- https://docs.apify.com/api
- https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy
