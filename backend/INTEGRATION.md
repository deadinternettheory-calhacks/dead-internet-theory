# Frontend and independent inference integration

Canonical payloads, status codes and errors are defined in
[OpenAPI](../contracts/openapi.yaml), [JSON Schema](../contracts/models.schema.json)
and the [behavioral contract](../contracts/discussion-graph-api.md). Consume those
models. Do not import backend dependencies into `web/` or invent a report model.

The verified local backend base is `http://127.0.0.1:3211` while the local Convex
development process is running. Obtain a cloud site URL from the deployment owner;
none is published by this change. A browser frontend should call its own trusted
server/BFF, which forwards to the backend. This implementation does not enable
cross-origin browser access or issue public browser credentials.

## Authentication and authorization

All eight operations require `Authorization: Bearer <JWT>`. The server verifies
HS256 against `AUTH_JWT_SECRET`, issuer `dit-backend`, audience `dit-v1`, subject,
expiration, issued-at, maximum token age one hour and a role:

| Role        | Access                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend`  | Create investigations; read only investigations created by its `sub`; read capabilities                                                                      |
| `inference` | Read, request histories and submit analysis only for IDs in its `investigations` claim; explicit `['*']` grants trusted service access to all investigations |

No token, signing secret or Apify credential belongs in `VITE_*`, browser source,
logs or URLs. The public-client issuance/exchange mechanism is unresolved. Before
public deployment, the team must approve a trusted issuer/BFF, stable anonymous
principal handling or other identity strategy, expiry/rotation and abuse controls.
The local demo generates throwaway credentials for testing; it is not that issuer.

Every POST requires an 8–128 printable ASCII `Idempotency-Key`. Keep the same key
and exact logical JSON body on retries. Objects are compared with recursively
sorted keys; array order is significant. Replays return the original success
resource (which may still say `queued`); use GET for current state. Reuse with a
changed body returns `409 IDEMPOTENCY_CONFLICT`. Retention of keys is 24 hours.

## Frontend workflow

1. `POST /v1/investigations` with `{sourceUrl}` and a frontend bearer token → 202.
2. Poll `GET /v1/investigations/{id}`. Respect real ingestion and analysis states.
3. `GET .../graph` returns 409 `NOT_READY` until ingestion completes; a configured
   size guard can return 413. Ingestion failures remain on the resource returned
   by a successful GET.
4. `GET .../analysis` returns 409 `ANALYSIS_NOT_READY` until separately produced
   analysis is stored, then 200 `AnalysisResource`. Render only returned evidence,
   limitations and nullable scores. The backend does not fill missing inference.
5. If needed, read named enrichment jobs under the investigation for history
   evidence. A completed job may include unsupported, unavailable or failed authors.

There is no push-based frontend integration in this slice. Poll with bounded
backoff, rather than holding an HTTP request open or simulating progress.

## Inference consumer workflow

Configure backend `INFERENCE_EVENT_URL` to a public HTTPS endpoint and
`INFERENCE_EVENT_TOKEN` to its server-only bearer credential. The backend sends
POSTed canonical `InvestigationReadyEvent` JSON with that bearer credential.
Return a 2xx acknowledgement only after persisting the event. All destination
IPs are checked and pinned; redirects are refused. This outbound credential is
separate from the worker's inbound API JWT.

The receiver **must durably deduplicate `(investigationId, graphRevision)`** and
check the fingerprint, then queue one effective inference task. At-least-once
network delivery cannot itself promise exactly-once remote computation. Use
stable backend idempotency keys for each enrichment request and final submission.
The independent synthetic mock demonstrates persistent inbox deduplication,
restart recovery and stable operation keys. It runs one process per inbox and
bounds workflow attempts to three; it is not a production distributed worker.

After receiving the event:

1. GET the graph using an appropriately scoped inference JWT; verify revision
   and fingerprint against the event.
2. Choose authors/anchors in the independent inference service. Optionally POST
   `.../enrichments` with 1–25 pairs, `limit:10`, `windowDays:1..30`, and
   `fallback:'most_recent'`. Distinct anchors for the same author are accepted;
   duplicate identical pairs are rejected.
3. Poll the enrichment job and use returned evidence with coverage. Empty or
   unavailable history cannot establish an empty lifetime history.
4. POST an independently generated canonical `AnalysisSubmission` to
   `.../analysis`, including revision, fingerprint and used enrichment IDs → 201.
5. All evidence must resolve to the source graph or completed, referenced
   enrichment jobs for that investigation. A stale revision, invented evidence,
   foreign enrichment or conflicting final submission is rejected.

Event acknowledgement changes analysis `queued → running`; accepted final
submission changes it to `completed`. A worker may submit before the event POST
returns; a late acknowledgement cannot overwrite `completed`. Exhausted delivery
retries mark analysis `failed` while preserving the completed ingestion graph.
A later valid final submission is still accepted for that graph. There is no
public progress/failure-report operation in the frozen v1 API; inference owners
must not invent an additional route without contract review.
