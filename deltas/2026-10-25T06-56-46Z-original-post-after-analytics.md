# Approved delta: original post after analytics

Date: 2026-10-25 06:56:46 UTC
Status: Explicitly requested by the owner in this task: the post itself “needs to go at the bottom of the list after all our analytics”; “update the website for that and deploy”.
Canonical specification: [SPEC.md](../SPEC.md)
Baseline: `4c1c33619dca4175c6677761a08ddb0bc9bb9a8f`
Scope: Completed-report presentation, its existing order checks, and related documentation.

## Previous and revised requirements

REQ-UX-2 and sections 4.2/10 placed the original post immediately after the score
and verdict. Keep the score first, then findings, interactive evidence, account
signals, detailed analysis and coverage/limitations. Place the original post and
source below all those sections, before the analyze-another action. This gives
the analysis priority over a repetition of the source post.

ADR-021 supersedes only ADR-017's original-post placement; its score-first
presentation and accessible page heading remain in effect.

## Compatibility and preserved contracts

The loading preview still shows the collected post while analysis runs. Scores,
evidence links, source text, metadata, coverage, retention, API payloads and
inference behavior are unchanged. No data migration or ingestion/inference
deployment is required. The shared report component also supplies this order to
future extension builds; existing released ZIPs are unchanged.

## Validation

All 184 website tests and the website and extension builds/typechecks pass.
Existing report tests cover section order and evidence interaction. Real Chromium
checks at 320, 375, 768, 1024 and 1440px confirm the score remains first, every
analytics section precedes the post, the post follows coverage, and there is no
horizontal overflow. The mobile screenshot was inspected. These checks use the
local synthetic report and do not start provider work. Verify the website
deployment separately; a source change does not prove it is live.
