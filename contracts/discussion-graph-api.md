# Discussion graph and enrichment API

Status: draft, version 0.1. Agreed in design discussion between the ingestion
service and the inference engine; not yet frozen. Items under
[Open decisions](#9-open-decisions) must be settled by both owners before this
contract is frozen. No schema format or validation tooling is selected yet.

## 1. Parties and ownership

| Component | Owner | Responsibility |
| --- | --- | --- |
| **Ingestion service** (backend) | Ingestion owner | Platform adapters (via Apify), normalization, graph construction, persistence, account-history retrieval, batching, caching, API orchestration, storing analysis results |
| **Inference engine** | Inference owner | Interpreting the post and discussion, choosing which authors to investigate, analyzing histories, detecting anomalies, producing evidence-backed scores |
| **Frontend** | TBD | Showing scores, the graph and evidence for an investigation |

Boundaries:

- The inference engine never depends on which Apify Actor was used or how data
  was fetched. It sees only the normalized graph and this API.
- The ingestion service does not select suspicious authors. It fulfills
  enrichment requests as reliably as it can.
- Analysis results are persisted by the ingestion service under the
  investigation ID; the frontend reads them from there.

## 2. Pipeline

1. Ingestion service receives a discussion URL, ingests it through Apify,
   normalizes comments and authors, builds the discussion graph and persists it.
2. Inference engine runs a first pass on the graph.
3. If it needs more author context, it requests histories for selected authors,
   each with an anchor comment. The ingestion service fetches (or reuses
   cached) histories and returns up to `limit` relevant comments per author.
4. Inference engine runs a second pass and finalizes its assessment.
5. Inference engine submits results; the ingestion service stores them.
6. Frontend shows scores, graph and evidence.

Step 3 is optional. Inference must be able to finish with only the original
discussion graph.

## 3. Operations

| Operation | Called by | Responsibility |
| --- | --- | --- |
| `createInvestigation(url)` | TBD (frontend or inference) | Ingest the discussion, construct and persist its graph; returns an `investigationId` |
| `getGraph(investigationId)` | Inference, frontend | Return normalized nodes, edges and collection metadata |
| `getAuthorHistories(request)` | Inference | Enrich a batch of selected authors (section 6) |
| `submitAnalysis(investigationId, results)` | Inference | Persist inference output for the frontend (section 7) |

Ingestion and history retrieval can take long. Apify supports asynchronous runs
and completion webhooks, so these operations should not require an HTTP
connection to stay open. The exact asynchronous pattern is an open decision.

## 4. Identifiers

- Every comment and author has a stable, platform-prefixed ID:
  `<platform>:<native id>`, for example `reddit:user123` and `reddit:t1_abc`.
- IDs are always strings. Large platform identifiers must never be sent as
  numbers.
- Requests and results refer to existing graph nodes by ID instead of copying
  comment content.
- Provider-native identifiers are kept alongside the normalized ID.

## 5. Discussion graph

The graph is a heterogeneous property graph with comment nodes and author
nodes, not just a reply tree. Each author is one node, so repeat commenters can
be identified.

### Nodes

**Comment** must carry:

- ID and provider-native ID
- Author (author node ID)
- Text
- Timestamp
- Engagement metadata (for example score or likes, as the platform provides)
- Parent comment (or the discussion root for top-level comments)
- Evidence URL linking to the comment on the platform

**Author** must carry:

- ID and provider-native ID
- TBD: profile fields (see open decisions)

### Edges

| Edge | Source | Added by |
| --- | --- | --- |
| Reply: comment → parent | Original reply structure | Ingestion |
| Authorship: author → comment | Comment author field | Ingestion |
| Similarity link between comments or authors | Analysis | Inference only, after analysis; never created during ingestion |

### Collection metadata

Attached to the graph, and to each history result, wherever the provider
reports it:

| Field | Meaning |
| --- | --- |
| `retrievedCommentCount` | Comments actually collected |
| `reportedCommentCount` | Comment count the platform reports |
| `truncated` | Whether collection stopped before the end |
| `sortOrder` | Sort order used during collection |

Also recorded: collection timestamps, the provider used, and a reference to the
raw source snapshot. Retrieved and reported counts can differ even on a full
collection because of hidden, deleted or unavailable comments.

### Raw data

The original Apify dataset (or a reference to a stored snapshot) is preserved
beside the graph. The graph is a normalized view, not a replacement, so every
finding can be traced back to source data.

## 6. Author-history enrichment

### Request

Batched: one request covers many authors.

```json
{
  "investigationId": "inv_001",
  "authors": [
    {
      "authorId": "reddit:user123",
      "anchorCommentId": "reddit:t1_abc"
    },
    {
      "authorId": "reddit:user456",
      "anchorCommentId": "reddit:t1_def"
    }
  ],
  "limit": 10,
  "windowDays": 14,
  "fallback": "most_recent"
}
```

| Field | Meaning |
| --- | --- |
| `investigationId` | Investigation the authors belong to |
| `authors[].authorId` | Author node ID from the graph |
| `authors[].anchorCommentId` | Comment node ID whose timestamp anchors the sample |
| `limit` | Maximum comments returned per author. Set to 10 for now |
| `windowDays` | Window around the anchor timestamp (example: 14) |
| `fallback` | Strategy when the window yields too few comments (example: `most_recent`) |

### Ingestion service behavior

1. Resolve each author and the timestamp of their anchor comment.
2. Retrieve the author's available public comment history.
3. Select up to `limit` comments closest to the anchor timestamp within
   `windowDays`.
4. If that sample is insufficient, apply `fallback` (for example most recent
   comments) and mark which strategy was used.
5. Return the comments with their timestamps and sources, plus any collection
   errors.

The service deduplicates authors, reuses cached histories, and limits
concurrent Apify runs.

### Response

For each requested author:

- **Status:** `complete`, `partial` or `unavailable`.
- **Strategy used:** time-adjacent sample or fallback.
- **Comments:** each with timestamp and source (evidence URL).
- **Collection metadata** (section 5) and **errors**.

`unavailable` means history could not be retrieved. It must never be treated as
the author having no history.

## 7. Analysis results

`submitAnalysis` carries a structured object containing:

- Overall investigation scores
- Per-comment or per-cluster assessments
- Evidence references, as graph node IDs
- Coverage limitations (for example authors whose history was `partial` or
  `unavailable`)
- Similarity links found during analysis (section 5)

The ingestion service persists it under the `investigationId` for the frontend.

## 8. Platform support

All four platforms are in scope. Discussion graphs are supported on all of
them; commenter history is modelled only for Reddit and X.

| Platform | Discussion graph | Commenter history |
| --- | --- | --- |
| Reddit | Supported by Actors | Modelled. User-history Actors with date filtering, subject to access restrictions |
| X / Twitter | Supported by Actors | Modelled. Author and date search; results may be incomplete (often `partial`) and some queries have minimums |
| YouTube | Video comments supported | **Not modelled.** No general author-history lookup through the official comments API |
| TikTok | Video comments supported | **Not modelled.** Reviewed Actors only fetch comments under given videos or a creator's videos |

For YouTube and TikTok:

- Inference should not request histories for these platforms.
- If it does, the ingestion service returns `unavailable` for each author
  without calling a provider.
- Inference must work from the discussion graph alone.

The provider capabilities above come from the design discussion's reading of
Apify Actor and platform API documentation; they are not yet verified in this
repository.

Rollout: get Reddit working end to end first (graph, history requests,
inference response, frontend persistence), then add the other adapters.

## 9. Open decisions

To settle before freezing:

1. Exact field names, types and nesting for nodes, edges and the `getGraph`
   response.
2. How the discussion root (the post or video) is represented in the graph.
3. Author profile fields. The scoring rubric in
   [rubrics/product-astroturfing.md](../rubrics/product-astroturfing.md)
   uses account age and post/comment karma, which this contract does not yet
   include.
4. Response shape of `getAuthorHistories`: field names for status, strategy
   and errors, and the allowed values of `fallback`.
5. Asynchronous pattern for `createInvestigation` and `getAuthorHistories`
   (polling, callback or webhook) and the transport.
6. Timestamp format and time zone.
7. `submitAnalysis` schema, including score scales, and whether similarity
   links are stored with results or merged into the graph.
8. Who calls `createInvestigation`, and the frontend's read operations.
9. Error behavior, versioning and compatibility rules for this contract.
10. Schema format and validation tooling, chosen with the stack (SPEC section 6).
