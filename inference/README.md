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
- Direct Claude triage was checked inside a local Convex deployment on a small
  synthetic thread (8.8 s), then through the production website on a permitted
  100-comment video. The hosted direct-Claude-triage/CREAO-scoring path completed
  in 150 seconds and passed saved-report validation; see the
  [production correction and verification](../backend/verification/2026-10-24-direct-claude-triage.md).
  CREAO webhook delivery remains unverified; this check used polling.
- Scores come from an uncalibrated rubric with a provisional axis mapping.

## Commands

Node 22. `.npmrc` sets `legacy-peer-deps` because npm 10.9 crashes resolving
Convex's optional React/Clerk peer dependencies.

This service and the ingestion backend both pin the Convex SDK/CLI to **1.48.0**.
After pulling an update, run `npm ci` in each service directory. Check
`npx convex --version` from the service directory to use its project-local CLI.

```sh
npm ci
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
| `ANTHROPIC_API_KEY` | Hosted production | Runs triage and focused account-history review directly through the Anthropic Messages API. Without it, the worker falls back to CREAO triage; local fixtures may omit it. Timings depend on input size and provider latency. |
| `ANTHROPIC_MODEL` | No | Claude model for triage, scoring and account review. Default `claude-opus-5-5` at low effort; production selects tested `claude-haiku-5-5`. See the [hosted performance record](../backend/verification/2026-10-25-url-performance.md). |
| `SCORING_PROVIDER` | No | Internal switch for the scoring stage: `claude` (default when `ANTHROPIC_API_KEY` is set) runs it as one direct Claude call, about 30 s; `creao` runs it on the CREAO agent, 1.5–5 min. Takes effect for the next job without a deploy. |
| `CREAO_WEBHOOK_SECRET` | With a webhook | Random secret that authenticates CREAO's callbacks. |
| `CREAO_WEBHOOK_URL` | Recommended | `<this deployment's .convex.site URL>/creao-webhook?token=<CREAO_WEBHOOK_SECRET>`. CREAO calls it when a run finishes, so the worker continues at once instead of at the next poll. |

On the backend, set `INFERENCE_EVENT_URL` to `<this deployment's .convex.site URL>/events`.
Create the CREAO agent with [creao-agent.md](creao-agent.md).

### Switch the production scoring analyst

From the repository root, with Node 22+ and `npm ci` already run in `inference/`:

```sh
./scripts/use-claude-analyst.sh
./scripts/use-creao-analyst.sh
```

Run the command for the provider you want. Each reads only the scoped
`INFERENCE_CONVEX_DEPLOY_KEY` from the private `backend/.env.server.local`
inventory, validates that it targets the website's inference deployment
`grandiose-barracuda-22`, checks the provider's hosted configuration, sets
`SCORING_PROVIDER` and reads it back. No deploy, restart, or frontend update is
required. This hosted deployment is development-class in Convex; `--prod` would
target a different deployment.

Both commands accept `--dry-run` for a read-only hosted preflight and
`--env-file /path/to/private.env` for an alternate inventory. Secrets are never
printed or passed as command-line arguments. Provider credentials must already
be configured on inference; these scripts do not upload the inventory.

Only scoring changes. Triage and account review keep their existing settings.
New scoring stages use the selected provider immediately; provider calls already
started continue. Retained reports and model caches remain reusable, and no
ingestion settings change. Discussions without recommendations skip scoring.
Run one switch at a time; if a network error leaves the result uncertain, rerun
the desired command to set and verify it again.

### Production triage configuration

Set `ANTHROPIC_API_KEY` on the **inference deployment** (`grandiose-barracuda-22`),
which runs triage. A key in `backend/.env.server.local` is only part of the private
setup inventory; that file is not automatically synchronized to inference's
Convex runtime. The ingestion deployment does not need the Anthropic key.

From `inference/`, select the deployment explicitly and upload a private file
containing only `ANTHROPIC_API_KEY` and an optional `ANTHROPIC_MODEL`:

```sh
npx convex env set --env-file .env.local --from-file /path/to/inference-runtime.env
npx convex run --env-file .env.local --inline-query 'return {hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY?.trim())};'
```

The readback must return `hasAnthropicKey:true` before a production verification
run. Never print the key or import the entire setup inventory, which also holds
Convex admin and unrelated provider credentials. Runtime environment updates take
effect without a code deployment. Confirm a fresh job creates no CREAO triage
run and its saved inference version includes `claude:<model>+creao-app-trigger`;
CREAO still handles scoring when the discussion needs it.

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
3. **Triage.** A bounded packet of the post and every retrieved comment
   (under 180 KB) goes to Claude directly when `ANTHROPIC_API_KEY` is set
   (structured outputs, so the reply is always valid JSON), otherwise to a
   CREAO run. Each reply carries an excerpt of the comment it answers. It
   returns the subject as one specific product (brand and model; in a
   "what should I buy?" thread, the most-recommended one), and for each
   comment the exact product it is about (`aboutProduct`, read through the
   reply chain), its stance toward that product, and any product it
   recommends.
4. **Sampled histories.** Instead of requesting every user's history, the
   worker randomly picks up to 6 supportive users (any supportive comment or
   any product recommendation) and up to 6 unsupportive users (critical or
   mixed; users who recommend nothing fill the group when too few), plus
   the post author if they commented. The shuffle is seeded by investigation
   and graph revision, so a retry picks the same users. It is one request,
   Reddit and X only, anchored on each user's own comment. The worker
   continues without histories after 5 minutes or a failed job. The
   unsupportive group is the baseline for the comparison in step 7.
   When `ANTHROPIC_API_KEY` is configured, a separate schema-constrained Claude
   task reviews **every** returned history (including on discussions with no
   product recommendations), requiring complete, unique author coverage. It uses
   the same bounded history samples, makes no additional Apify requests, and is
   cached for 24 hours by model, exact evidence and `ACCOUNT_REVIEW_VERSION`.
   Account evidence must belong to that author. Missing product context leaves
   brand focus unknown; missing profile fields and bounded activity remain explicit.
   The broad CREAO task then skips duplicate account reviews. Without direct
   Claude configuration, the existing CREAO account-review path remains available.
5. **Scoring (Claude call by default, or a CREAO run with `SCORING_PROVIDER=creao`).** The model gets the recommendations and their
   context (parents, replies, the recommenders' other comments and the 15
   most-engaged comments) rather than every comment, plus deterministic
   measurements (timing, burst size, word overlap, tracking links, brand
   mentions in histories, account age) and the rubric rules. It returns which
   rules fire for each recommendation, with cited IDs.
6. **Re-scoring.** `scoring.ts` drops rules the platform or evidence cannot
   support, or whose cited IDs do not exist. It then applies the rubric's
   points, caps K1–K6, tiers and confidence itself; the model never sets a
   number.
7. **Section score.** `section.ts` computes one 0–100 astroturfing index for
   the whole comment section (`overallCoordinationRisk`); see the table below.
8. **Account signals.** For each sampled user with a history, the scoring
   reply lists which account rules (B1–B9) fire. `scoring.ts` keeps only family
   B rules with evidence that exists, adds brand focus (3+ of 10 comments) and
   a new account (under 30 days) when measured, and scores the share of
   evaluable B points that fired (unchecked rules are unknown). The result is
   attached to the user's anchor comment as `accountSignals`. It is not a bot
   probability. If the history shows an ordinary human user (E2 established
   account, E4 recognized member, E7 criticized the brand elsewhere; E2 is also
   measured from age, communities and brand mentions), no automation signals
   are reported and the score is 0 (`humanSignals`).
9. **Comment estimates and commercial signals.** `signals.ts` measures, in
   code, shop-style accounts among supporters, template and seller phrases,
   store-owner outreach, every short phrase copied across accounts, low-effort
   praise and nonsense filler. Each comment with text gets an
   `astroturfEstimate` (0–100, with reasons): the larger of its rubric score and
   points for unnatural or generic text (from triage `realism`), seller, random
   or default usernames, template phrases, outreach, copied praise and nonsense
   filler. The section score uses comment realism (share of endorsing comments
   at 50+), low-effort support, coordination (including copied praise),
   commercial signals, rubric and history; one-sided support is only a small
   bonus. At most 25 recommendations go to rubric scoring.
10. **Submit.** `assemble.ts` builds the `AnalysisSubmission` and replaces
   accusatory model text. The worker checks it against the schema and every
   evidence reference, then POSTs it with a stable idempotency key.

Each stage is a separately scheduled action. CREAO runs are polled every 5 s,
including the fallback when `CREAO_WEBHOOK_URL` is set, with a 15-minute
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

Triage must classify every comment in its bounded input exactly once. Missing,
duplicate or foreign IDs trigger the same bounded retry policy; a fast incomplete
reply cannot pass as a completed classification. Candidate replies from the same
CREAO run are checked before another run is started. Job state records the requested
triage model and stage start/completion timestamps, so runtime model changes cannot
relabel a job that already used a different model. See the
[URL performance audit](../backend/URL-PERFORMANCE.md) for measurements and remaining options.

## Provisional rubric mapping

The rubric's own output is not the wire format, and SPEC section 8 left the
mapping open. This implementation uses the following mapping. It is
unvalidated and should be reviewed with the detection-research owner.

| Contract field | Computed as |
| --- | --- |
| `overallCoordinationRisk.score` | Comment-section astroturfing index, 0–100: a weighted mean of the parts below that could be measured, with weights renormalized over them. `null` only when fewer than 3 comments were analyzed. |
| …comment realism (30%) | Share of endorsing comments whose `astroturfEstimate` is 50 or more; 30% counts fully. Needs at least 5 endorsing comments. |
| …low-effort support (15%) | Share of supportive comments that are three words or fewer or generic praise, with nonsense filler (unnatural text from accounts that neither support nor criticize) added to both counts, mapped from 50% → 0 to 90% → 1. Needs at least 10 supportive comments. |
| …coordination (15%) | The larger of the strongest cluster's `coordinationScore` ÷ 100 and copied praise: the share of supportive comments repeating another account's short text (40 characters or fewer), where 30% counts fully; needs a phrase from at least 3 accounts and at least 5 supportive comments. |
| …commercial signals (20%) | Shop-style accounts among accounts praising or asking about the product (30% counts fully, weight 0.4; needs 5 supportive accounts), template phrases (3 count fully, 0.3) and store-owner outreach (2 count fully, 0.15), renormalized. |
| …rubric strength (10%) | Mean of the top three recommendation rubric scores ÷ 100; 0 when nothing recommends a product. |
| …history contrast (10%) | Sampled supportive users against sampled unsupportive users: the gap in the share of recent comments that mention the subject (a 30-point gap counts fully), and the gap in the share of accounts under 90 days old (a 50-point gap counts fully), averaged. Needs at least 2 sampled users with history on each side; never measured on TikTok or YouTube. |
| …one-sided support (bonus) | Supportive share of comments taking a side, mapped from 50% → 0 to 100% → 1; needs at least 5 such comments. Adds up to 10 points, only when the weighted parts reach 15. |
| `…confidence` | 0.3, +0.25 if history contrast was measured, +0.15 with at least two scored recommendations (or none to score), +0.1 with complete coverage; at most 0.8. |
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

## Website example and test fixtures

`fixtures/example-tiktok-nightlight/` is the real comment section of a TikTok
product video (a foldable night light) collected through the hosted backend on
2026-10-25. Usernames are replaced with made-up names of the same kind
(shop-like, random string, platform default or ordinary), and author IDs,
comment IDs and per-comment links are replaced (see the retention exception in
backend/RETENTION.md). It holds the Claude triage (`claude-haiku-5-5`, as in
production) and CREAO scoring replies recorded from a local run on 2026-10-25,
with the same replacements. `npm run demo` runs the pipeline on it with those
replies and writes `../web/src/demo/example-report.json`, which the website
shows at `/example`. TikTok gives no commenter histories, so the walkthrough
skips its history scene.

`fixtures/synthetic-espresso/` is a fabricated thread used only in tests (it is
written to `../web/src/test/` for UI tests and never shown on the site). `fixtures/contract-example-reddit/` holds
recorded replies for the backend's fixture-mode Reddit graph, so the local
end-to-end run works without a CREAO key.

## Open items

- CREAO data-retention and cost review. The agent's reply format varies (summary vs. JSON, and files) until it is edited as in [creao-agent.md](creao-agent.md#edit-the-agent-for-speed).
- Anthropic data-retention and cost review for direct triage calls.
- Cloud deployment, and setting `INFERENCE_EVENT_URL`/`INFERENCE_EVENT_TOKEN` on the hosted backend (`impartial-sheep-516`).
- Rubric calibration, and review of the axis mapping.
- Scoped credential issuance from the backend instead of a shared signing secret.
- A contract route for reporting inference failure, if the team wants one.

### Account-history review coverage

`convex/lib/inference/accounts.ts` isolates account review from the larger
recommendation task. This prevents omitted accounts from silently inheriting a
zero from the deterministic brand/age checks. The focused task uses the configured
Anthropic model at low effort and retries incomplete or duplicate author coverage
at most three times. Normal worker provider-error and lease handling still apply.
Rubric/evidence validation recomputes scores and rejects cross-account citations.

The website preserves `accountSignals.unknown` and history counts. Incomplete
zeroes are labeled **Limited**; unavailable scores and genuine completed zeroes
stay distinct. Existing stored reports gain the availability display without a
rewrite; new submissions receive the focused review after the inference rollout
and backend result-cache epoch change. No contract/schema migration is needed.
Deploy `inference/` and update ingestion's `RESULT_CACHE_VERSION`; the ingestion
code itself does not require deployment. See the
[verification record](verification/2026-10-25-account-review.md).
