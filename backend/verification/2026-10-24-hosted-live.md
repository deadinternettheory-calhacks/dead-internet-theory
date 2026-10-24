# Hosted Reddit and CREAO verification

The owner requested live deployment, selected 24-hour application retention,
provided Convex account access and the CREAO agent ID, edited the agent to return
the requested JSON, and authorized safe PR merge after checks. The owner later
requested removal of the daily Apify reservation cap while retaining the per-run
cap. Source-post permission was supplied earlier in the same session.

## Deployment and controls

- Website: `https://www.deadinternettheory.us`, including the same-origin API proxy.
- Ingestion: `https://impartial-sheep-516.convex.site`, the existing development-class deployment.
- CREAO coordinator: `https://grandiose-barracuda-22.convex.site`, a separate production-class deployment in `dead-internet-theory-inference`.
- Reddit discussion build `0.0.127`; Reddit history build `0.0.78`, both pinned.
- Runtime mode `live`; only Reddit reports `liveEnabled:true`. X, YouTube and TikTok remain gated.
- Maximum 100 retained discussion comments; $1 maximum charge per Actor run.
- `APIFY_DAILY_BUDGET_CENTS=0` removes the daily reservation cap. Concurrency, queue and submission limits remain in effect.
- Fixed 24-hour investigation/evidence expiry and minute deletion sweeps; see [RETENTION.md](../RETENTION.md) for provider retry and upstream retention boundaries.

Personal/deployment admin credentials stay in private setup files. The coordinator
receives only its runtime keys/settings; Convex admin keys and the direct
Anthropic key are not injected into its evidence packets or the website.

## Hosted checks

Two synthetic investigations completed through the actual website proxy,
ingestion API, ready-event delivery, CREAO triage/scoring, enrichment and final
analysis persistence. The fresh check after the agent edit completed at
2026-10-24T09:01:15.229Z. Both graphs remained explicitly synthetic. CREAO can
return a summary instead of the requested JSON, so candidate replies are still
validated and retries bounded; no schema or evidence checks were relaxed.

A subsequent investigation of the permitted Reddit post completed at
2026-10-24T09:06:21.798Z:

| Check                                  | Observation                                                              |
| -------------------------------------- | ------------------------------------------------------------------------ |
| Investigation                          | `inv_1792832522921_zu0m01timul`                                          |
| Ingestion / analysis                   | Both `completed`                                                         |
| Graph                                  | 100 comments, 74 author nodes, `partial`, truncated, not synthetic       |
| Actor run                              | `HNrtUG6fR9jnBSRDV`, `SUCCEEDED`, build `0.0.127`                        |
| Provider-reported charge               | $0.1035: one start, 101 dataset items, one post, 100 comments            |
| Analysis pipeline label                | `dit-inference/0.1.0; rubric/0.3; prompts-2026-10-24; creao-app-trigger` |
| Live history requests in this analysis | None selected by triage                                                  |

An independent readback at 2026-10-24T09:07:16.123Z passed canonical graph and
analysis schemas, graph invariants, recomputed fingerprint and analysis evidence
validation. No real source text was retained locally or committed. These live
records remain available until their approved 24-hour deadlines; the Actor run
and all three default storage IDs were confirmed present in the durable cleanup
queue with a future expiry. This verifies queuing/deadlines, not an elapsed
24-hour production deletion observation. Deletion behavior is covered by the
synthetic clock/transport tests and earlier actual delete/404 smoke checks.

The real check did not request author histories. The earlier scoped history test
verified one 150-item pool and a ten-item recent fallback sample, plus a second
empty result; it does not establish universal history coverage. Optional profile
dates/karma, additional platforms and model calibration remain unverified. The
CREAO API does not report the underlying served model; its Claude setting remains
an agent configuration requirement.

Repository validation after the launch fixes: 139 backend tests, backend
typecheck/format checks, 49 inference tests and lint, 36 frontend tests plus lint
and build, and canonical contract validation. New tests cover retention,
idempotency after source expiry, optional daily caps, and recovery from stale
fixture requests without replacing ambiguous live request keys.
