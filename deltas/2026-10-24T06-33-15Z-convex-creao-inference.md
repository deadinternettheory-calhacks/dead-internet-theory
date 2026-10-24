# Approved delta: Convex backend and CREAO inference

Date: 2026-10-24T06:33:15+00:00 (record created; approval given earlier in the same session)
Status: Directed by the user, who owns the inference ("AI agent") workstream:
"We are using CREAO for inference" and "Use convex for backend", with a request
to set up the full link-to-analysis flow and a mocked example response,
assuming contract requests are fulfilled. This authorizes the implementation
below. It does not attest to ingestion-owner acceptance, live provider behavior
or deployment.
Canonical specification: [SPEC.md](../SPEC.md)
Baseline: 017fbaf (main after PR #3).
Scope: `backend/` (Convex v1 API, inference worker, CREAO client, synthetic
fixture), `web/` (API client, report rendering, `/example`), and documentation.
Excludes live Apify ingestion, author-history sampling against real providers,
user auth, rate limits, retention policy and production deployment.

## Previous and revised requirements

| Sections | Previous | Approved revision | Rationale |
| --- | --- | --- | --- |
| SPEC 5.3, 9, 13.4 ADR-006 | CREAO **proposed**; "do not add until integration behavior and incremental value are verified"; "If CREAO is selected later…" | CREAO **selected** as the model-reasoning provider for inference: two bounded runs (triage, rubric scoring) per analysis, with no tools granted, untrusted-data framing, and deterministic re-validation of every reply | User decision for the inference workstream |
| SPEC 5.3, 13.4 ADR-003 | Convex selected direction; no backend code | Convex **implemented** as the v1 REST backend and inference host (routes, idempotency, job state, scheduler-driven worker); deployment unverified | User decision; makes the contract runnable end to end |
| SPEC 5.3, 13.4 ADR-007 | Python selected for deterministic analysis | Superseded for the inference worker: deterministic measurements and rubric scoring run in TypeScript inside Convex. Python libraries remain candidates for later research analysis | One runtime for the backend and worker; Convex hosts TypeScript |
| SPEC 8 | Mapping rubric signal rules to contract axes unresolved; do not expose rubric scores as operational findings until evaluated and explicitly mapped | A **provisional, explicit** mapping is implemented and documented in `backend/README.md`. Scores remain uncalibrated heuristic indices, labeled as such in the API limitations and UI; evaluation is still required | The requested link-to-analysis flow needs a defined mapping; it stays visibly provisional |
| SPEC 10.3, 12.3 | UI not connected; synthetic fixtures specified but not implemented | Frontend consumes the v1 API when `VITE_API_BASE_URL` is set. A labeled synthetic fixture (espresso thread) is implemented and rendered at `/example` with a banner. Mock ingestion serves only that fixture URL | Shows the finished report without presenting fabricated data as real |

## Compatibility and migration

No contract change. All payloads validate against the v1.0.0 canonical schema.
The backend adds no fields beyond the schema. Inference runs inside the same
Convex deployment and calls the internal functions behind the REST routes, so
it gets the same validation as an external inference client would. The
contract's frontend bearer auth is not implemented: frontend create/read routes
are open. Inference write routes require `INFERENCE_API_TOKEN` over HTTP.

## Preserved contracts

Ingestion owns provider access, normalization and history sampling.
`ingestion.ts` and `enrichment.ts` are stand-ins to be replaced. Missing data
is never zero or negative evidence. Model output is draft data and cannot
create evidence. Provider keys stay server-side. The product reports signals,
not intent, and never labels a post real or fake.

## Superseded decisions and open questions

ADR-006 is superseded by ADR-008, and ADR-007 is superseded for the inference
worker. Open: live CREAO verification (the agent ID is pending), rubric
calibration and review of the axis mapping, frontend auth and rate limits, a
contract route for reporting inference failure, retention policy, and live
ingestion.

## Architecture decision log

SPEC 13.4: ADR-003 updated, ADR-006 and ADR-007 marked superseded, ADR-008 added.

## Validation and evidence

Run in this checkout on 2026-10-24:

- `backend`: `npm run lint` passed. `npm test` passed: 38 tests, including the
  rubric's five worked examples, caps, evidence-reference rejection, CREAO
  request shapes, and generated-example sync.
- `backend`: end-to-end on a local Convex backend (`CONVEX_AGENT_MODE=anonymous`),
  the synthetic URL went from create to completed analysis (index 76). A real
  Reddit link failed with `INGESTION_NOT_CONNECTED`. Idempotent replay and
  conflict, URL rejection, 401 without the inference token, 422 anchor/author
  mismatch and duplicate pairs, 409 for unready graph and analysis, capabilities
  and CORS preflight were all checked with curl.
- `web`: `npm run lint`, `npm test` (16 tests) and `npm run build` passed. A
  Playwright check of `/example` and the live flow at 375px and 1440px showed no
  console errors and no horizontal overflow.
- `scripts/validate_contracts.py` passed (contracts unchanged).

Not verified: a live CREAO run, any live provider, Convex cloud deployment,
Vercel preview, accessibility review with assistive technology.
