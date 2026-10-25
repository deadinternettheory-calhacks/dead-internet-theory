# Approved delta: missing history is neutral on TikTok and YouTube

Date: 2026-10-25 01:35 UTC
Status: Requested by the owner: "Make sure that lack of comment history on
tiktok does not push it either way as we do not have access to comment
history on tiktok".
Canonical specification: [SPEC.md](../SPEC.md)
Baseline: `main` at 6611cc2
Scope: rubric gate K4 (rubric v0.4), inference scoring, analysis limitation
and section-score wording. No contract change.

## Previous and revised requirements

| Area | Previous | Revised | Rationale |
| --- | --- | --- | --- |
| Rubric K4 | A score of 75+ needs a C and a B signal, so YouTube and TikTok comments never exceeded 74 because family B needs commenter history. | On platforms without commenter histories (no family B rule allowed: YouTube, TikTok), K4 needs only the C signal; K3 still needs two families. Reddit and X are unchanged. | History the platform does not provide is unknown, not absent, and must not lower a score. |
| Limitation text | "Scores cannot exceed 74." | Missing history counts neither for nor against astroturfing; history-based checks are left out, confidence is low. | Matches the rule. |
| Section score | History contrast not measured, with a sample-size reason. | On these platforms the note says histories are unavailable and the other parts carry its weight (already renormalized; no numeric change). | Clearer. |

Already neutral and unchanged: history-based rules (levels A and C) are not
allowed on these platforms, so they neither add nor subtract points; the
history-contrast part is left out of the section score and the remaining
weights are renormalized; per-comment estimates and thread signals use no
history; no account signals are produced. Confidence stays Low, since it
describes evidence, not suspicion.

## Compatibility and migration

No wire change. `inferenceVersion` now reports `rubric/0.4`. TikTok and
YouTube rubric scores of 74 can now be higher when the signals support it.
Bump the backend `RESULT_CACHE_VERSION` after deploying so stored reports are
not reused.

## Preserved contracts

v1.0.0 contracts; all other rubric rules, caps and weights.

## Superseded decisions and open questions

Supersedes the rubric v0.3 statement that YouTube and TikTok scores never
exceed 74.

## Architecture decision log

ADR-014 added in SPEC.md.

## Validation and evidence

Inference unit tests, including a new TikTok K4 test; regenerated example
fixtures (version label only). No live TikTok run for this change.
