# Approved delta: per-account automation signals

Date: 2026-10-24 21:30 UTC
Status: The owner asked for an estimate of how likely each sampled commenter is
to be a bot. Offered a signals score, a summary only, or a bot likelihood, the
owner chose the per-account signals score.
Canonical specification: [SPEC.md](../SPEC.md)
Baseline: `main` at 2868854
Scope: contract (optional field), inference scoring and assembly, web report.

## Previous and revised requirements

| Sections | Previous | Approved revision | Rationale |
| --- | --- | --- | --- |
| 8, contract | Account history informs rubric rules for recommendations only. | Each sampled account with history gets `accountSignals`: a 0-100 index of fired rubric family-B rules (model-proposed, re-scored, evidence-checked; B1 and B4 measured directly), on its anchor comment. | Gives a per-account read without a calibrated-probability claim. |
| 10 | No per-account display. | The report lists sampled accounts with score and signal labels, and research links. | Requested. |

## Compatibility and migration

`CommentAssessment.accountSignals` is optional and the object already allowed
extra properties, so the v1.0.0 contract stays compatible; consumers that do
not know it ignore it. Older recorded scoring replies have no `accounts`;
then only the measured rules count and unchecked rules are unknown.

## Preserved contracts

No account is labeled a bot; the conduct rules, evidence validation and the
24-hour retention are unchanged.

## Superseded decisions and open questions

None superseded. The weights are the rubric's hand-set points; no labeled data
calibrates the index. The public example has no histories yet, so it shows no
account rows until histories are re-collected.

## Architecture decision log

SPEC 13.4: ADR-012 added.

## Validation and evidence

Contract validator; inference lint, 65 tests (account re-scoring, measured
floor, unknown handling, submission validity) and `demo:check`; generated
analyses validated against the canonical schema; web lint, 81 tests, build and
a visual check of the account section on the test thread.
