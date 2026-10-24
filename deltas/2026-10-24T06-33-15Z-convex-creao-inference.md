# Approved delta: CREAO inference service on Convex

Date: 2026-10-24T06:33:15+00:00 (record created; approval given earlier in the same session)
Status: Directed by the user, who owns the inference ("AI agent") workstream:
"We are using CREAO for inference" and "Use convex for backend". The user asked
for the full link-to-analysis flow and a mocked example response, assuming
contract requests are fulfilled. This authorizes the implementation below. It
does not attest to live provider behavior, CREAO data terms or deployment.
Canonical specification: [SPEC.md](../SPEC.md)
Baseline: 017fbaf (main after PR #3), merged with main at 0fb5609, which added
the Convex ingestion backend (PRs #7, #8).
Scope: `inference/` (independent Convex inference service, CREAO client,
rubric scoring, synthetic fixtures), `web/` (API client, report rendering,
`/example`), and documentation. Excludes ingestion, which `backend/` owns.
Also excludes credential issuance, the frontend proxy, rate limits for public
use, retention policy and production deployment.

## Previous and revised requirements

| Sections | Previous | Approved revision | Rationale |
| --- | --- | --- | --- |
| SPEC 5.3, 9, 13.4 ADR-006 | CREAO **proposed**: "do not add until integration behavior and incremental value are verified", and "If CREAO is selected later…" | CREAO **selected** as the model-reasoning provider. Each analysis makes two bounded runs (triage, rubric scoring). The agent gets no tools and untrusted-data framing, and every reply is re-validated deterministically | User decision for the inference workstream |
| SPEC 5.3, 13.4 ADR-003 | Convex selected direction; no backend code | Convex hosts both the ingestion backend (`backend/`, built separately) and a second, independent deployment for inference (`inference/`) that consumes `investigation.ready` over authenticated HTTPS, per backend/INTEGRATION.md | User decision; keeps the ingestion/inference ownership boundary in the contract |
| SPEC 5.3, 13.4 ADR-007 | Python selected for deterministic analysis | Superseded for the inference worker: deterministic measurements and rubric scoring run in TypeScript in the inference Convex app. Python libraries remain candidates for later research analysis | One runtime for the Convex service |
| SPEC 8 | Mapping rubric signal rules to contract axes is unresolved; do not expose rubric scores as operational findings until they are evaluated and explicitly mapped | A **provisional, explicit** mapping is implemented and documented in `inference/README.md`. Scores remain uncalibrated heuristic indices, labeled as such in the API limitations and UI; evaluation is still required | The requested link-to-analysis flow needs a defined mapping; it stays visibly provisional |
| SPEC 10.3, 12.3 | UI not connected; synthetic fixtures specified but not implemented | The frontend renders v1 analyses through `VITE_API_BASE_URL` (a trusted proxy is required). A labeled synthetic espresso-thread report is rendered at `/example` with a banner | Shows the finished report without presenting fabricated data as real |

## Compatibility and migration

No contract change. The inference service uses only the frozen v1 routes, with
stable idempotency keys, and validates every backend response and its own
submission against the canonical schema. The backend accepted those
submissions in local fixture-mode runs. The service mints inference JWTs scoped
to one investigation using the backend's signing secret. This works, but
shares a secret the backend team may want to replace once a credential issuer
exists. The frontend's direct API calls need a proxy that adds a frontend token,
because the backend requires JWTs and allows no browser cross-origin access.

## Preserved contracts

Ingestion owns provider access, normalization, history sampling, persistence
and event delivery. Missing data is never zero or negative evidence. Model
output is draft data and cannot create evidence. Provider and CREAO keys stay
server-side. The product reports signals, not intent, and never labels a post
real or fake. No progress/failure-report route is added; inference failures stay
in the inference service's job records.

## Superseded decisions and open questions

ADR-006 is superseded by ADR-008, and ADR-007 is superseded for the inference
worker. Open items:
- CREAO data-retention and cost review, and inference cloud deployment
- rubric calibration and axis-mapping review
- scoped credential issuance and the frontend proxy
- a contract route for inference failure, if wanted
- retention policy

## Architecture decision log

SPEC 13.4: ADR-003 updated, ADR-006 and ADR-007 marked superseded, ADR-008 added.

## Validation and evidence

See SPEC 12.1 for the checks run on 2026-10-24 after merging with the ingestion
backend:
- inference, backend and web lint and tests
- the contract validator
- a two-deployment local end-to-end run in fixture mode, with duplicate-event and credential checks
- a Playwright check of `/example`

A live CREAO run through both local deployments also completed (see SPEC 12.1).

Not verified: any live provider, inference cloud deployment, connection to the
hosted development backend, and a browser test of the live flow through a proxy.
