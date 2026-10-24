# dead internet theory inference

Independent inference service, built as its own Convex app. It consumes
`investigation.ready` events from the [ingestion backend](../backend/README.md),
analyzes the discussion with Claude and a CREAO agent that runs on Claude,
using the [astroturfing rubric](../rubrics/product-astroturfing.md), and submits a v1
`AnalysisSubmission` back to the backend. It follows the consumer workflow in
[backend/INTEGRATION.md](../backend/INTEGRATION.md) and owns no API that the
frontend calls.

**Status:**
- Implemented and unit-tested.
- On 2026-10-24 it ran end to end against a local backend in fixture mode, both
  with recorded replies and with the live CREAO agent. Each CREAO run took about
  40–80 s.
- Deployed at `https://grandiose-barracuda-22.convex.site`, connected to the
  hosted ingestion backend and website. Claude and CREAO do the AI
  inference; this Convex service coordinates events, stages and validated writes.
  Hosted synthetic checks and one permitted real Reddit post completed; see the
  [verification record](../backend/verification/2026-10-24-hosted-live.md).
- Direct Claude triage was checked live inside a local Convex deployment on
  the synthetic thread: 8.8 s, valid reply. The full speed-up path (Claude
  triage, early histories, webhooks) has not run end to end against a
  backend; the hosted deployment does not have it until this change is deployed.
- Scores come from an uncalibrated rubric with a provisional axis mapping.

## Commands

Node 22. `.npmrc` sets `legacy-peer-deps` because npm 10.9 crashes resolving
Convex's optional React/Clerk peer dependencies.

```sh
npm install
npx convex dev          # or CONVEX_AGENT_MODE=anonymous for a local deployment
npm test                # unit tests, including the rubric's worked examples
npm run lint            # TypeScript check
npm run demo            # regenerate the mocked example response
npm run demo:check      # fail if the generated example files are stale
npx convex deploy
```

## Configuration

Set with `npx convex env set NAME value`. All values are server-side secrets
or settings; never commit them or put them in `VITE_*`.

| Name | Required | Purpose |
| --- | --- | --- |
| `INFERENCE_EVENT_TOKEN` | Yes | Bearer credential the backend sends with each event. Must equal the backend's `INFERENCE_EVENT_TOKEN`. |
| `BACKEND_BASE_URL` | Yes | Backend HTTP base, e.g. `https://<backend>.convex.site`, or `http://127.0.0.1:3211` locally. |
| `BACKEND_JWT_SECRET` | One of these two | The backend's `AUTH_JWT_SECRET`. The worker mints a five-minute `inference` token scoped to the one investigation it is analyzing. |
| `BACKEND_API_TOKEN` | One of these two | A pre-issued inference JWT. It expires within an hour, so use it only for local demos. |
| `CREAO_API_KEY` | For real discussions | `capi_…` (app-scoped API Trigger) or `cr_sk_…` (CREAO CLI). Without it, only labeled synthetic fixtures are analyzed, using recorded replies. |
| `CREAO_APP_ID` | With `capi_` | The CREAO agent's ID. |
| `CREAO_AGENT_ID` | With `cr_sk_` | The agent ID for `developer.creao.ai/v1/runs`. |
| `CREAO_MODEL` | No | Model ID for `cr_sk_` runs. |
| `ANTHROPIC_API_KEY` | Recommended | Runs triage as one direct Claude call (about 10 s) instead of a CREAO run (about 1 min). Without it, triage uses CREAO. |
| `ANTHROPIC_MODEL` | No | Claude model for triage. Default `claude-opus-5-5` at low effort. |
| `CREAO_WEBHOOK_SECRET` | With a webhook | Random secret that authenticates CREAO's callbacks. |
| `CREAO_WEBHOOK_URL` | Recommended | `<this deployment's .convex.site URL>/creao-webhook?token=<CREAO_WEBHOOK_SECRET>`. CREAO calls it when a run finishes, so the worker continues at once instead of at the next poll. |

On the backend, set `INFERENCE_EVENT_URL` to `<this deployment's .convex.site URL>/events`.
Create the CREAO agent with [creao-agent.md](creao-agent.md).

Sharing `BACKEND_JWT_SECRET` lets this service sign any backend token. The
backend's token issuance mechanism is still an open decision
(backend/INTEGRATION.md); replace this with issued, scoped credentials when one
exists.

Coordinator job state and cached model replies expire after 24 hours and are
deleted by a minute sweep.
Expired jobs stop processing. See [the retention policy](../backend/RETENTION.md)
for application, Apify and upstream-provider retention boundaries.

## Local end-to-end run (synthetic, no CREAO key)

1. In `backend/`, follow its "Real local synthetic demo" setup through
   `npx convex env set --from-file /tmp/dit-local-demo/backend.env`. Do not
   start its mock consumer; this service replaces it. The backend delivers
   events to `http://127.0.0.1:4010/events`.
2. In `inference/`, start a local deployment whose HTTP actions listen on port 4010:

   ```sh
   CONVEX_AGENT_MODE=anonymous npx convex dev --local-cloud-port 3214 --local-site-port 4010
   ```

3. Copy `INFERENCE_EVENT_TOKEN` and `INFERENCE_API_TOKEN` from
   `/tmp/dit-local-demo/client.env`, then set them on this deployment:

   ```sh
   npx convex env set INFERENCE_EVENT_TOKEN <value>
   npx convex env set BACKEND_API_TOKEN <INFERENCE_API_TOKEN value>
   npx convex env set BACKEND_BASE_URL http://127.0.0.1:3211
   ```

4. Create an investigation for the backend's Reddit fixture,
   `https://www.reddit.com/r/example/comments/demo/`, with a frontend token
   (see `backend/scripts/http-e2e.ts`). Then poll it until `analysisStatus` is
   `completed`. `npx convex run worker:status` shows this service's jobs.

## How an analysis runs

1. **Receive.** `POST /events` checks the bearer credential and the event schema,
   stores the event, and returns 202. Events for an
   (investigationId, graphRevision) that is already stored are acknowledged
   without starting another analysis.
2. **Graph.** The worker reads the graph and requires the event's revision and
   fingerprint.
3. **Early histories.** Before triage, the worker guesses likely recommenders
   from the thread alone (tracking links, wording shared with another author,
   a brand-like term several authors use, top-level position; questions are
   skipped). It requests up to 10 of their histories so the backend collects
   them while triage runs.
4. **Triage.** A bounded packet of the post and every retrieved comment
   (under 180 KB) goes to Claude directly when `ANTHROPIC_API_KEY` is set
   (structured outputs, so the reply is always valid JSON), otherwise to a
   CREAO run. It returns the subject, each comment's stance, and any product
   the comment recommends.
5. **Follow-up histories.** The worker requests histories only for
   recommenders the early request missed, one anchor per author, up to 25
   pairs in total, Reddit and X only. It continues without them after
   5 minutes or a failed job.
6. **Scoring (CREAO run).** The agent gets the recommendations and their
   context (parents, replies, the recommenders' other comments and the 15
   most-engaged comments) rather than every comment, plus deterministic
   measurements (timing, burst size, word overlap, tracking links, brand
   mentions in histories, account age) and the rubric rules. It returns which
   rules fire for each recommendation, with cited IDs.
7. **Re-scoring.** `scoring.ts` drops rules the platform or evidence cannot
   support, or whose cited IDs do not exist. It then applies the rubric's
   points, caps K1–K6, tiers and confidence itself; the model never sets a
   number.
8. **Submit.** `assemble.ts` builds the `AnalysisSubmission` and replaces
   accusatory model text. The worker checks it against the schema and every
   evidence reference, then POSTs it with a stable idempotency key.

Each stage is a separately scheduled action. CREAO runs are polled every 5 s
(every 20 s as a fallback when `CREAO_WEBHOOK_URL` is set), with a 15-minute
limit per stage. A webhook call only wakes the job; the worker still fetches
and validates the run itself, and a lease plus a per-step token stop a webhook
and a poll from advancing the same job twice. Validated triage and scoring
replies are cached for 24 hours, keyed by stage, prompt version, model and the
exact evidence packet, so re-analyzing an unchanged thread skips the model. A reply with no valid JSON (in `result.text`,
the chat reply, or a JSON file) starts a fresh run of that stage, up to three
runs in total. Retryable backend or CREAO errors are retried
within that limit. Otherwise the job is marked `failed` here with its reason,
and nothing is submitted. The v1 API has no failure-report route, so the
backend keeps showing the analysis as running.

## Provisional rubric mapping

The rubric's own output is not the wire format, and SPEC section 8 left the
mapping open. This implementation uses the following mapping. It is
unvalidated and should be reviewed with the detection-research owner.

| Contract field | Computed as |
| --- | --- |
| `overallCoordinationRisk.score` | Highest rubric score among the discussion's product recommendations; `null` when none were found. |
| `…confidence` | Rubric confidence of that comment: Low 0.3, Medium 0.55, High 0.8. |
| Axis score | For each recommendation, the points of fired rules mapped to the axis ÷ the axis's maximum points on that platform × 100. The axis takes the highest value. `null` if no rule on the axis could be evaluated. |
| `semantic_coordination` | C1, C6, B2 |
| `temporal_coordination` | C4, B6 |
| `engagement_anomalies` | C2, C5, T4, T5 |
| `account_anomalies` | C3, B3, B4, B5, B8, B9, T2, T3, X6 |
| `promotional_intent` | B1, B7, T1, X1, X2, X3, X4, X5, X7 |
| `disclosure_concerns` | Always `null`. The rubric cannot measure undisclosed sponsorship; disclosed ties (E1) are listed. |
| `commentAssessments[].promotionalIntentScore` | That comment's promotional-intent axis index; `null` for comments that recommend nothing. The full rubric breakdown is in `rationale`. |
| `clusters[].coordinationScore` | Family-C points of the strongest member ÷ the platform's family-C maximum × 100. Clusters with no fired family-C rule are dropped. |
| `inferredEdges` | `SEMANTICALLY_SIMILAR` for recommendation pairs with ≥0.3 content-word overlap; `POTENTIALLY_COORDINATED` between members of each cluster. |

## Mocked example response

`fixtures/synthetic-espresso/` is a fabricated Reddit thread. Three accounts
post near-identical recommendations 13 minutes apart and defend each other;
genuine comments are mixed in. The folder includes author histories and
recorded CREAO replies. `npm run demo` runs the real pipeline on it and writes
`analysis-resource.json` plus `../web/src/demo/synthetic-report.json`, which
the website shows at `/example`. `fixtures/contract-example-reddit/` holds
recorded replies for the backend's fixture-mode Reddit graph, so the local
end-to-end run works without a CREAO key.

## Open items

- CREAO data-retention and cost review. The agent's reply format varies (summary vs. JSON, and files) until it is edited as in [creao-agent.md](creao-agent.md#edit-the-agent-for-speed).
- Anthropic data-retention and cost review for direct triage calls.
- Cloud deployment, and setting `INFERENCE_EVENT_URL`/`INFERENCE_EVENT_TOKEN` on the hosted backend (`impartial-sheep-516`).
- Rubric calibration, and review of the axis mapping.
- Scoped credential issuance from the backend instead of a shared signing secret.
- A contract route for reporting inference failure, if the team wants one.
