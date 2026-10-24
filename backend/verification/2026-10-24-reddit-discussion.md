# Scoped Reddit discussion verification

On 2026-10-24 the owner supplied one Reddit post and stated permission to test it.
The owner approved deleting collected data and the Apify run after verification,
retaining only non-content verification metadata. No author histories, model
calls or cloud publication were included. This record contains no post/comment
text, account identifiers or source URL.

## Provider observation

| Item                     | Observed value                                           |
| ------------------------ | -------------------------------------------------------- |
| Actor                    | `clearpath/reddit-post-comments-bulk-scraper`            |
| Pinned build             | `0.0.127` (`p42AI0fVJgkX454Ip`)                          |
| Run                      | `YpvQeEc1t6EyTAxeo`, `SUCCEEDED`                         |
| Limits                   | 20 comments, 180 seconds, 256 MiB, $0.25 maximum charge  |
| Input policy             | `sort:new`, `expandAllComments:true`                     |
| Dataset                  | 21 records: one post and 20 comments                     |
| Provider-reported charge | $0.0235, observed at 2026-10-24T07:59:27.963Z            |
| Charged events           | One Actor start, 21 dataset items, one post, 20 comments |

The first terminal-status read still showed incomplete billing counters and a
zero dataset count. A later read confirmed 21 dataset items and the charge above;
the initial $0.0005 was not treated as the final observation.

## Mapping and validation

The live output exposed two implementation defects: Node's DNS lookup callback
can request an address array, and the Actor uses `_type` rather than `type` for
its post/comment rows. The transport and Reddit mapping were corrected and
covered with synthetic regression tests. Observed mappings also preserve native
IDs and parent IDs, distinguish deletion/removal flags, retain native author IDs,
resolve relative Reddit permalinks and omit provider-hidden scores.

The normalized graph passed the canonical `GraphEnvelope` schema, graph
invariants and a recomputed fingerprint. It contained 20 comments and 20 author
nodes, with 20 reply edges and 20 authorship edges. All comment timestamps were
exact UTC values, all had source links and no reply parent was unresolved. The
sample contained 15 top-level comments and five nested replies; seven scores were
hidden and omitted. Coverage remained `partial` and `truncated:true`, with a
platform-reported count of 722 comments. Linked image content was not retrieved
or interpreted.

## Deletion and limits

At 2026-10-24T07:59:34Z the run's default dataset, key-value store, request queue and run
were each deleted with HTTP 204. A subsequent authenticated GET returned 404 for
each resource. Local raw rows and run-state files were removed. Only permission,
shape/count, validation and cleanup metadata remain in protected local files;
no real content was stored in Convex, sent to inference or committed to Git.

This proves one bounded discussion collection and local graph normalization.
It does not verify author-history collection, pagination beyond this sample,
exhaustiveness, a real-data Convex lifecycle, deployed inference, or a public
retention/deletion workflow. The hosted backend stays in fixture mode and all
`src/provider-policy.ts` verification flags remain false. Further tests need
their own permitted scope and retention decision.

Repository checks after the fixes: 121 backend tests, backend typechecking and
format checks, canonical contract validation, 48 inference tests plus lint and
synthetic demo verification, and 20 frontend tests plus lint and production
build all passed. All committed regression inputs are synthetic.
