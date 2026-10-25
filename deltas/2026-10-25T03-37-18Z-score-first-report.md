# Approved delta: score-first report

Date: 2026-10-25 03:37:18 UTC
Status: Requested by the owner in this task: put the number/score at the top and remove Summary text.
Canonical specification: [SPEC.md](../SPEC.md)

## Previous and revised requirements

REQ-UX-2 and section 4.2 previously placed the post before the result. The report now leads with the score and plain-language verdict, followed by the original post and evidence. Remove the visible page title; retain an accessible heading and the expiry notice below the report. ADR-017 supersedes the post-first order.

## Compatibility and preserved contracts

No API, scoring, stored-data, retention, or inference changes. Existing source links, evidence, bands, limitations and report actions remain available. No data migration is needed.

## Validation

Frontend build and affected report, analysis-page and routing tests are checked locally. This record does not imply deployment or browser visual verification.
