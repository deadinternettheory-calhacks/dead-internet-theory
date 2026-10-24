# Approved delta: sampled histories and a comment-section score

Date: 2026-10-24 19:00 UTC
Status: Requested by the inference owner: "Randomly sample supportive and
unsupportive people to pull comment history. Getting everyone's is too much
info/compute. Also come up with an overall score from 0 to 100 that indicates
whether the comment section is astroturfed", clarified as randomly selecting
users (not their comments).
Canonical specification: [SPEC.md](../SPEC.md)
Baseline: `main` at 26c7a13
Scope: `inference/` sampling and assembly, `web/` report, SPEC 4.2, 7.1, 8,
13.4, 13.5. No contract change.

## Previous and revised requirements

| Sections | Previous | Approved revision | Rationale |
| --- | --- | --- | --- |
| 7.1 | Histories requested for up to 10 heuristically likely recommenders before triage, then every remaining recommender (up to 25). | After triage, one request for a seeded random sample: up to 6 supportive and up to 6 unsupportive users (critical or mixed, filled with neutral), plus the post author if they commented. Populations and sample sizes are recorded in limitations and the score explanation. | Less provider cost and data; the unsupportive sample is a baseline for the supportive one. |
| 8 | `overallCoordinationRisk` = highest single recommendation rubric score; `null` without recommendations. | A 0–100 comment-section index: rubric strength (mean of top three recommendation scores, 40%), coordination (strongest cluster, 25%), history contrast between the two random samples (subject-mention share and new-account share, 25%), one-sided support (10%), renormalized over measured parts; `null` only below 3 analyzed comments. | One number for the whole section, using the sampled histories. |
| 4.2 | Score shown only when calibrated and validated. | The index is shown under the verdict with its bands and an uncalibrated label; details give the part-by-part explanation. | Requested by the owner; it remains a heuristic for prioritizing review. |

## Compatibility and migration

No contract change: `overallCoordinationRisk` keeps its shape and 0–100
range. Its meaning changes, so scores from earlier analyses are not comparable
(the synthetic example moves from 76 to 63). Rubric recommendations whose
author was not sampled have history rules marked unknown and lower confidence.
The history idempotency key prefix changes to `enrich:sample`.

## Preserved contracts

Deterministic re-scoring, evidence validation, accusation filtering, the
v1 enrichment limits and the 24-hour retention are unchanged.

## Superseded decisions and open questions

ADR-009's early speculative history request is removed. Open: sample size and
weights are hand-chosen and need evaluation; a random sample of 6 can miss a
small coordinated group.

## Architecture decision log

SPEC 13.4: ADR-010 added.

## Validation and evidence

Inference lint and tests (sampling repeatability and size, group fill,
section index parts), `demo:check`, web lint, tests and build, and a visual
check of the score card on `/example`. Not verified against live data.
