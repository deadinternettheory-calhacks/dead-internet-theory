# Approved delta: one warning, a real example, and context-aware stance

Date: 2026-10-24 21:00 UTC
Status: Requested by the owner: one warning at the bottom ("warning: dead
internet can make mistakes") instead of caveats on every piece of information;
no synthetic notes; a typical real Reddit post as the example, stored with
usernames hidden (chosen when asked); stance judged toward the exact product
using the comment chain; histories retried.
Canonical specification: [SPEC.md](../SPEC.md)
Baseline: `main` at c9c1429
Scope: inference text and triage, the website copy and example, backend
history collection, SPEC 4.2, 7.1, 8, 10, 12.3, 13.4, 13.5, RETENTION.md.
No contract change.

## Previous and revised requirements

| Sections | Previous | Approved revision | Rationale |
| --- | --- | --- | --- |
| 4.2, 8, 10 | Scores, findings and limitations each carry caveats ("not proof", "uncalibrated", "innocent explanations"); footer note on some pages. | Analysis text and the UI carry no per-item caveats; a footer on every page says "Warning: Dead Internet can make mistakes." The accusation filter and factual coverage notes stay. The About page copy is unchanged. | One clear warning instead of repeated hedging. |
| 10, 12.3 | `/example` is a labeled synthetic thread with a banner. | `/example` is a real r/BuyItForLife thread (usernames, IDs and comment links replaced) analyzed with recorded live Claude triage and CREAO scoring; the synthetic thread is a test fixture only. | A real example is more representative. |
| 9 | Triage stance is toward a subject that may be a category. | The subject is one specific product (brand and model); each comment gets `aboutProduct` and a stance toward it read through its reply chain (replies include the parent excerpt); any product recommender counts as supportive for sampling. | Correct supportive/critical judgement in multi-product threads. |
| 10 | Any axis above 0 can appear under "What stood out". | Only axes at 35 or above (the moderate band). | Weak signals read as accusations on genuine threads. |
| 7.1 | History candidates fixed at 150 per author, raw rows stored. | `HISTORY_CANDIDATES_PER_AUTHOR` (default 40, ≤150) and slimmed rows. | Raw rows filled the 650 KB snapshot budget after about two authors, failing the rest with `PROVIDER_SIZE_LIMIT`. |

## Compatibility and migration

No contract change: `aboutProduct` is an optional triage field; the
candidate count stays within the contract's "up to 150". The retention
exception is documented in backend/RETENTION.md.

## Preserved contracts

Deterministic re-scoring, evidence validation, the accusation filter, the
24-hour retention for live investigations and the v1 API.

## Superseded decisions and open questions

The labeled synthetic example (REQ in 10 and 12.3) is superseded for the site.
The example has no user histories yet: the hosted backend returned 2 of 25
histories in both runs because of the size limit fixed here. After the backend
fix is deployed, re-collect histories and re-run `npm run demo`.

## Architecture decision log

SPEC 13.4: ADR-011 added.

## Validation and evidence

Backend typecheck, 142 tests and format check; inference lint, 61 tests and
`demo:check`; web lint, 80 tests, build and a visual check of `/example`.
Live: two hosted collections of the thread (2026-10-24T20:10Z, 20:26Z), a live
Claude triage call and a live CREAO scoring run (162 s).
