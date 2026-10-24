# Reddit scraper build recovery

The owner requested deployment of the merged provider-refusal fix, reconciliation
of stuck capacity, and safe merge of the recovery work. Permission for the tested
Reddit post, the $1 per-run cap, and deletion after isolated verification were
already provided in the same session.

## Diagnosis and capacity recovery

The deployed backend's fresh check failed with `PROVIDER_REJECTED`, HTTP 403.
The new rejection handling released its slot automatically; no run was created.
The server credential passed authenticated read checks. The previously verified
discussion build `0.0.127` (`p42AI0fVJgkX454Ip`) returned HTTP 404 from the build
lookup. The public Actor listed only successful build `0.0.129`, published at
2026-10-24T16:03:47.034Z. This is a build-availability failure.

Four earlier reservations belonged to failed jobs, had no recorded run, and were
created between 17:20 and 17:57 UTC. An exhaustive account run listing contained
seven terminal runs, with the latest start at 09:28 UTC and no runs after any of
those reservations. The four specific slots were marked released through the
authenticated dashboard mutation, retaining reconciliation metadata and a 24-hour
expiry. The old spend ledger remains conservative; the daily reservation cap is
disabled. Newly rejected starts return both their slot and reserved budget.

## Replacement build verification

The isolated authorized smoke used the existing adapter against build `0.0.129`,
limited to 20 comments, 180 seconds and $1 maximum charge.

| Check                    | Observation                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Verified at              | 2026-10-24T18:09:38.105Z                                                            |
| Actor run                | `RdlESWmGnK1FcSPrr`, `SUCCEEDED`                                                    |
| Build                    | `0.0.129`, `WD7hphNM2OWi0g5Zw`                                                      |
| Output                   | One post, 20 comments and 20 author nodes; partial coverage                         |
| Provider-reported charge | $0.0235                                                                             |
| Validation               | Canonical GraphEnvelope schema, graph invariants and recomputed fingerprint passed  |
| Synthetic                | No                                                                                  |
| Cleanup                  | Run and all three default storages deleted; each authenticated GET returned 404     |
| Local evidence           | Raw source and graph files deleted; only non-content verification metadata retained |

The discussion pin now selects the verified replacement. The history pin remains
`0.0.78`; this smoke collected no author histories. A removed public build needs a
new authorized verification before updating its pin. Source coverage and score
calibration limitations from the earlier verification records still apply.
