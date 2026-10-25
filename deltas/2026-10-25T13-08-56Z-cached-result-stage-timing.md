# Approved delta: paced saved-result presentation

Date: 2026-10-25 13:08:56 UTC
Status: Explicitly requested by the owner in this task: “for cached posts/links, make it so collecting comments takes 5s and analysis takes 5s, rather than instant”.
Canonical specification: [SPEC.md](../SPEC.md)
Baseline: `ed8e87183eb4cd5f9007c409af038bcaa4643a6b`
Scope: Website presentation of already-completed results and the related progress copy, tests and documentation.

## Previous and revised requirements

REQ-STATE-1 and section 10.3 required every progress phase to follow the actual
backend state, with immediate display of retained reports. The owner requested
five seconds of collection and five seconds of analysis for cached links.

ADR-022 adds a narrow presentation exception. When the initial create/current
lookup already reports both ingestion and analysis completed, load the analysis,
graph and referenced enrichments. After those reads succeed, show five seconds
loading saved comments and five seconds preparing saved analysis, then reveal
the report. Both phases explicitly identify saved data. Their illustration
phases match live collection and analysis; the comment preview appears in the
second stage. Clear timers and abort reads when leaving the view.

The existing response has no cache-hit flag. Already-completed initial lookups
include retained-cache hits and finished idempotent replays. Work observed in
progress retains its actual timing; partial cache reuse and joining unfinished
work do not trigger this presentation. A failed report read shows its error
without a successful-result sequence.

## Compatibility and preserved contracts

No API fields or statuses change, and no data migration is needed. Backend
cache reuse, ownership, polling, provider/model costs, scores and fixed original
expiry remain authoritative. The delay begins after report data loads; network
loading time is additional. The browser's normal timer scheduling applies.
The change deploys with the website; ingestion and inference require no
redeployment. Existing extension packages retain their current behavior.

## Validation

All 186 website and 54 extension tests pass, along with both builds/typechecks.
Controlled timers verify the exact five-second boundaries, retained receipts,
request counts, navigation cleanup and immediate errors. Existing live-analysis
tests still complete without the presentation delay.

Real Chromium against the production build and synthetic API responses measured
5.008 seconds of collection presentation and 5.049 seconds of analysis, with one
submission and four total requests. The comment preview appeared in the second
stage. Checks at 320/375/768/1024/1440px found no horizontal overflow; mobile
collection and desktop analysis screenshots were inspected. There were no
application errors. These UI fixtures do not prove live provider/cache behavior
and started no provider work. Verify deployment separately.
