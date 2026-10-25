# Hosted URL processing verification — 2026-10-25

PRs [#35](https://github.com/deadinternettheory-calhacks/dead-internet-theory/pull/35)
and [#36](https://github.com/deadinternettheory-calhacks/dead-internet-theory/pull/36)
were merged after passing CI, then deployed to the website's existing ingestion
deployment (`impartial-sheep-516`) and the production inference deployment
(`grandiose-barracuda-22`). Both deploys passed schema validation without deleting
indexes. The website deployment succeeded.

## Runtime configuration

The inference deployment now has the owner's existing Anthropic key and
`ANTHROPIC_MODEL=claude-haiku-5-5`. CREAO remains configured for scoring. The
completeness guard was deployed before selecting the faster triage model.
The default model in source remains Opus for deployments without an override.

Configured `CREAO_WEBHOOK_URL` and a random callback secret using a temporary
runtime-only env file. Runtime presence checks passed, the file was deleted,
and the private setup inventory was updated. The callback rejected an invalid
token (401) and accepted a valid token for an unknown synthetic run ID (200,
`woke:false`). This verifies the receiver and authentication, **not actual CREAO
delivery**. CREAO completion still has its five-second polling fallback.

The source cache was seeded only with retained, compatible completed reports
using the current `prompts-2026-10-24e` policy. The seed created two pointers.
No provider/model run or duplicate source copy was created by seeding. Daily and
per-run spending settings, comment cap, sampling and retention are unchanged.

## Cold permitted Reddit URL

The owner's previously permitted Reddit post was submitted once through the
production website proxy, with a persisted anonymous session and idempotency key.
An operator cache check confirmed a miss before submission.

- Investigation: `inv_1792887239682_zkf02fwnek`.
- 100 collected comments; partial discussion coverage.
- Ingestion and analysis reached `completed`.
- All 100 analyzed comment IDs were classified exactly once by direct Claude
  triage. No CREAO triage run was started.
- One completed history job returned six author results: three `complete`, three
  `partial`, **zero failed**; 30 usable history comments in total. Missing items
  were preserved as partial evidence, rather than failing the batch.
- Saved version:
  `dit-inference/0.2.0; rubric/0.3; prompts-2026-10-24e; claude:claude-haiku-5-5+creao-app-trigger`.

| Stage                                                 | Observed time                                   |
| ----------------------------------------------------- | ----------------------------------------------- |
| Collection and event dispatch                         | 8.9 s                                           |
| Direct Claude triage                                  | 27.0 s                                          |
| Histories and intervening scheduling                  | 16.5 s                                          |
| CREAO scoring                                         | Skipped by the existing no-recommendations rule |
| Total through completed API readback and verification | **55.4 s**                                      |

This discussion required no commercial recommendation scoring, so the result
does not measure CREAO scoring latency or verify provider webhook delivery. It
cannot be compared directly with the earlier 150-second YouTube flow that did
require a CREAO scoring run. Individual collection/model times can vary.

Readback independently passed the canonical graph, analysis and enrichment
schemas, graph integrity, recomputed fingerprint and all analysis evidence
references. No source text or model response was saved in local artifacts.

## Warm reuse of that same finished report

Two new anonymous owners submitted the same URL with fresh idempotency keys:

| Owned investigation view        | POST   | Complete graph, analysis and history readback |
| ------------------------------- | ------ | --------------------------------------------- |
| `inv_1792887336383_eg8ynhrervq` | 204 ms | 698 ms                                        |
| `inv_1792887337208_k8ygdqmcp4`  | 178 ms | 682 ms                                        |

Both responses were already completed. Each view's remapped graph fingerprint,
analysis IDs and history references passed independent schema and evidence
checks. Neither owner could read the original investigation; neither could read
the other's view. The original graph fingerprint stayed unchanged, and both
views inherited the original fixed expiry.

New collection jobs: **0**. New inference jobs: **0**. No source content was copied
into another graph. An earlier completed Reddit report with a CREAO scoring run
also passed the same reuse/ownership checks, with full readback in 773/831 ms.

## Checks and limits

CI passed 165 backend, 134 website and 71 inference tests (**370 total**), backend
and inference typechecks, backend formatting, website lint/build, generated-demo
consistency and canonical contract validation. The website retains its existing
large Three.js chunk warning; it does not affect server processing time.

Standalone model comparisons and the full path audit are in
[URL-PERFORMANCE.md](../URL-PERFORMANCE.md). The two small synthetic fixture checks
are not a model accuracy study. These hosted timings are not latency guarantees.
No new platforms, provider plans or author-history sources were enabled.

Verification authentication files and temporary runtime env files were deleted.
Only IDs, counts, timings and validation outcomes remain in local verification
metadata. The hosted report, private views, evidence and owned Apify artifacts
follow the owner's fixed 24-hour application retention/deletion workflow; reuse
does not extend it. CREAO processing copies remain subject to provider controls.
