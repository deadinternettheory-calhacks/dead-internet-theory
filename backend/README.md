# dead internet theory backend

Convex backend that serves the v1 REST contract
([`../contracts/openapi.yaml`](../contracts/openapi.yaml)) and runs the
astroturfing inference worker, which uses a CREAO agent for model reasoning.

**Status:** the routes, inference worker and CREAO client are implemented and
tested against a local Convex backend. Live collection (Apify) is **not**
connected: only the labeled synthetic fixture can be "collected", and every
other link fails with `INGESTION_NOT_CONNECTED`. No live CREAO run has been
verified yet. Scores come from an uncalibrated rubric.

## Commands

Node 22. `.npmrc` sets `legacy-peer-deps` because npm 10.9 crashes resolving
Convex's optional React/Clerk peer dependencies.

```sh
npm install
npx convex dev          # log in, or set CONVEX_AGENT_MODE=anonymous for a local backend
npm test                # unit tests, including the rubric's worked examples
npm run lint            # TypeScript check
npm run demo            # regenerate the mocked example response
npm run demo:check      # fail if the generated example files are stale
npx convex deploy       # production deployment
```

The HTTP API is served at the deployment's `.convex.site` URL (locally
`http://127.0.0.1:3211`). Point the frontend at it with `VITE_API_BASE_URL`.

## Environment variables

Set with `npx convex env set NAME value`. All are server-side; never commit
them or expose them through `VITE_*`.

| Name | Required | Purpose |
| --- | --- | --- |
| `CREAO_API_KEY` | For live inference | CREAO key: app-scoped `capi_…` or account `cr_sk_…`. Without it, only the synthetic fixture is analyzed, with recorded responses. |
| `CREAO_APP_ID` | With a `capi_` key | The CREAO agent's ID (from its page on agent.creao.ai). |
| `CREAO_AGENT_ID` | With a `cr_sk_` key | The agent ID for `developer.creao.ai/v1/runs`. |
| `CREAO_MODEL` | No | Model ID for `cr_sk_` runs; the agent default is used otherwise. |
| `INFERENCE_API_TOKEN` | For external inference callers | Bearer token for `POST …/enrichments` and `POST …/analysis`. Unset disables those routes over HTTP; the built-in worker does not need it. |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins, default `*`. Set it to the frontend origin in production. |

Create the CREAO agent with [creao-agent.md](creao-agent.md).

## Layout

| Path | Role |
| --- | --- |
| `convex/http.ts` | v1 routes: request checks, idempotency keys, CORS, error envelopes. |
| `convex/store.ts` | Contract operations as internal queries/mutations; all state changes and validation. |
| `convex/ingestion.ts`, `convex/enrichment.ts` | Ingestion-side stand-ins. Serve only the synthetic fixture; to be replaced by the Apify adapters. |
| `convex/inference.ts` | Inference worker state machine, started by `investigation.ready`. |
| `convex/lib/inference/` | Pure inference code: packets, prompts, CREAO client, output parsing, rubric scoring, assembly, evidence checks. |
| `convex/lib/schema.ts` | Validation against `contracts/models.schema.json`. |
| `fixtures/synthetic-espresso/` | Labeled synthetic discussion, histories, recorded CREAO replies, and the generated example response. |
| `scripts/generate-demo.ts` | Runs the pipeline on the fixture and writes the mocked example. |

## How an analysis runs

1. `POST /v1/investigations` validates the URL against an exact host allowlist,
   stores the investigation and schedules ingestion. Nothing fetches the URL.
2. Ingestion stores an immutable graph and emits `investigation.ready`
   (deduplicated by investigation and graph revision).
3. **Triage (CREAO run 1):** the agent gets a bounded packet of the post and
   every retrieved comment (under 180 KB) and returns the discussion's subject
   plus each comment's stance and any product it recommends.
4. **Enrichment:** the worker requests histories for the subject's
   recommenders, then other product recommenders, one anchor per author, up to
   25 pairs, Reddit and X only. It continues without them after 5 minutes or a
   failed job.
5. **Scoring (CREAO run 2):** the agent gets the comments, deterministic
   measurements (timing, burst size, word overlap, tracking links, brand
   mentions in histories, account age) and the rubric rules, and returns which
   rules fire for each recommendation, with cited IDs.
6. **Re-scoring:** `scoring.ts` drops rules the platform or evidence cannot
   support, or whose cited IDs do not exist, then applies the rubric's points,
   caps K1–K6, tiers and confidence itself. The model never sets a number.
7. **Assembly and submission:** `assemble.ts` builds the `AnalysisSubmission`;
   accusatory model text is replaced; the result is checked against the schema
   and every evidence reference, then submitted through the same mutation as
   `POST …/analysis`.

Each stage is a separate scheduled action, so a slow CREAO run (polled every
5 s, 15-minute limit per stage) never holds one Convex action open. If CREAO
fails or its reply cannot be parsed, the investigation's `analysisStatus`
becomes `failed`. No partial or invented report is stored.

## Provisional rubric mapping

The rubric's own output is not the wire format, and SPEC section 8 left the
mapping open. This implementation uses the following mapping. It is
unvalidated and should be reviewed with the detection-research owner.

| Contract field | Computed as |
| --- | --- |
| `overallCoordinationRisk.score` | Highest rubric score among the discussion's product recommendations; `null` when none were found. |
| `…confidence` | Rubric confidence of that comment: Low 0.3, Medium 0.55, High 0.8. |
| Axis score | For each recommendation, the points of fired rules mapped to the axis divided by the axis's maximum points on that platform, ×100; the axis takes the highest. `null` if no rule on the axis could be evaluated. |
| `semantic_coordination` | C1, C6, B2 |
| `temporal_coordination` | C4, B6 |
| `engagement_anomalies` | C2, C5, T4, T5 |
| `account_anomalies` | C3, B3, B4, B5, B8, B9, T2, T3, X6 |
| `promotional_intent` | B1, B7, T1, X1, X2, X3, X4, X5, X7 |
| `disclosure_concerns` | Always `null`. The rubric cannot measure undisclosed sponsorship; disclosed ties (E1) are listed. |
| `commentAssessments[].promotionalIntentScore` | That comment's promotional-intent axis index; `null` for comments that recommend nothing. The full rubric breakdown is in `rationale`. |
| `clusters[].coordinationScore` | Family-C points of the strongest member ÷ the platform's family-C maximum, ×100. Clusters with no fired family-C rule are dropped. |
| `inferredEdges` | `SEMANTICALLY_SIMILAR` for recommendation pairs with ≥0.3 content-word overlap; `POTENTIALLY_COORDINATED` between members of each cluster. |

## Open items

- **Live ingestion:** Apify adapters and the history sampling algorithm (contract
  section 5) belong to the ingestion owner. `ingestion.ts` and `enrichment.ts`
  are the replacement points.
- **Frontend auth and rate limits:** the contract describes bearer auth for
  frontend routes, but no user auth exists. The create/read routes are open, and
  investigation IDs are unguessable. SPEC 11.2 requires submission and spend
  limits before public launch; none are implemented.
- **Failure reporting:** the contract has no route for inference to mark an
  analysis failed; this backend sets it internally.
- **Retention:** no retention or deletion policy exists for stored graphs,
  histories or model replies (SPEC 11.4).
- **Live CREAO verification:** the client follows CREAO's documented API and is
  unit-tested against recorded responses, but no live run has completed yet.
