# Approved delta: extension saved-result presentation

Date: 2026-10-25 13:24:08 UTC
Status: Explicitly requested by the owner after the website rollout: “can you update the extension too and rerelease”.
Canonical specification: [SPEC.md](../SPEC.md)
Baseline: `50e9d0787c72f2971774d36c8c2ab5910b4275d3`
Scope: Extension result presentation, visibility resume, version 1.0.3 packaging and release.

## Previous and revised requirements

ADR-022 added five seconds loading saved comments and five seconds preparing
saved analysis on the website. Extension views still showed completed results
immediately. ADR-023 extends that presentation to the side panel and full-report
tab when their initial create/current-status lookup is already complete.

Load the full report before beginning the presentation. Use the shared progress
copy to identify saved data, show its comment preview in the second phase, and
let the ghost follow those phases. Keep original deadlines when a document is
hidden and resumes; a report already shown in that mounted view does not replay.
Record the known investigation receipt so visibility resume uses GET. Clear
timers on cancellation. Failed report reads remain immediate, and live work
observed in progress keeps its real timing.

## Compatibility and preserved contracts

Publish new v1.0.3 unpacked and keyless Web Store ZIPs with checksums. Preserve
the development ID, permissions, local storage keys, anonymous sessions,
ownership, idempotency, provider work and fixed original expiry. No API change,
data migration or ingestion/inference redeployment is needed. Existing ZIPs
remain available; users update/reload their local package or upload the new
Web Store ZIP through their developer account.

## Validation

All 58 extension and 186 website tests pass, along with both builds/typechecks.
Controlled timers verify exact boundaries, cached submits and GET-only resume,
hidden-tab deadlines, cancellation and immediate errors. Both ZIPs pass archive,
version and checksum checks; executable payloads match and only the store ZIP
omits the development key and unpacked instructions.

Real Chromium loaded the unpacked ZIP with its native extension worker, runtime
ID and storage APIs. With synthetic API responses, the panel measured 5.004s
loading saved comments and 5.011s preparing analysis. The full-report tab
measured 5.001s and 5.003s, using GET requests with no additional submission.
Returning to the panel retained its completed report. The request identity and
43-character session credential were valid; the credential was not recorded.
The report retained its post-last order and had no horizontal overflow at
320/375/768/1024/1440px. Collection/analysis screenshots were inspected and there
were no application errors. These checks started no live provider work and do
not prove live provider/cache behavior. Published downloads are verified separately.
