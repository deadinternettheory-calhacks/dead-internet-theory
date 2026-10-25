# URL processing performance

Audit of the production path, 2026-10-25 UTC. These are individual observations,
not p50/p95 guarantees. Collection coverage and the rubric remain uncalibrated.

## Measurements

| Check                                               | Observation                                                                  | Meaning                                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Completed Reddit link, two new browser owners       | POST 185 ms each; complete graph, analysis and history readback 773 / 831 ms | Retained results are reused across owners without new collection or inference jobs.                                |
| Earlier cold YouTube, 100 comments                  | 150 s end to end; about 74 s Opus triage and 60 s scoring                    | Models dominated this check; the earlier CREAO-only flow took 321 s.                                               |
| Haiku 5.5 on the same retained 100-comment evidence | 32.4 s; all 100 comment IDs classified exactly once                          | Candidate faster triage configuration; 84 stance labels agreed with stored Opus output, which is not ground truth. |
| Haiku 5.5 on two synthetic fixtures                 | 4.4 / 2.0 s; 11/11 expected stance labels matched                            | Small regression check, not an accuracy study.                                                                     |
| Sonnet 5.5 on that retained evidence                | 4.7 s but only 1/100 comments classified                                     | Rejected as incomplete. Schema validity alone did not establish task completion.                                   |

The reuse check independently validated the canonical schemas, graph fingerprint
and analysis evidence references, including remapped history IDs. Both owners
were denied access to the original owner's investigation and to each other's
view. The source graph and expiry stayed unchanged. New collection jobs: **0**;
new inference jobs: **0**. Verification stored only IDs, counts and timing metadata.

The [earlier direct-triage record](verification/2026-10-24-direct-claude-triage.md)
describes the cold baseline. Model trials used retained evidence in memory; no
additional scraping was needed and no source or model text was saved locally.

## Path audit and decisions

| Part of the path             | Current optimization / change                                                                                                                                                                                | Remaining option and tradeoff                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Submission and URL identity  | Platform/native post ID collapses supported URL variants and tracking parameters. Stable idempotency keys prevent refresh duplicates.                                                                        | A bounded TikTok share-link redirect cache could save repeated resolution; it must retain redirect validation and expire mappings.                                                                             |
| Repeated or concurrent links | Shared retained result or in-flight job; separate private owner views; original fixed 24-hour deadline.                                                                                                      | Longer retention or forced refresh changes freshness/retention policy. Keep current policy.                                                                                                                    |
| Queue and provider capacity  | Durable work starts immediately, with four configured provider slots; cache hits need no slot. Definite start refusals release reservations.                                                                 | More slots help simultaneous users only when provider/account limits permit. They do not speed an individual model call.                                                                                       |
| Scraper startup              | Existing pinned Actors, bounded comments, asynchronous starts checkpoint the paid run ID.                                                                                                                    | Benchmark alternative Actors, memory and provider plans before changing them. Waiting synchronously for a paid start increases ambiguity if the HTTP request times out.                                        |
| Active Apify run             | Poll every 2 s; durable observed run metadata prevents duplicate starts.                                                                                                                                     | A verified completion webhook could save at most a poll interval under normal operation; retain polling recovery.                                                                                              |
| Completed dataset pages      | **Remove the 2 s delay between ready pages and between completed tasks.** Keep backoff for active runs and busy capacity.                                                                                    | Bounded multi-page reads per action could reduce checkpoints, but increase action lease and snapshot pressure.                                                                                                 |
| Reddit author history        | One batched Actor run, cached author candidate pools, default 40 candidates, 10 sampled results. Bound bytes per author and adapt oversized dataset pages; keep valid partial results from interrupted runs. | Fewer candidates or a shorter history deadline reduces coverage. Spec requires stance-stratified sampling after triage; collecting before stance classification would change that design.                      |
| X author history             | Reuse candidates; preserve the publisher's single-concurrent-run policy.                                                                                                                                     | Free-plan run/item quotas remain the main restriction. Owner chose to retain the plan. Do not parallelize around that policy.                                                                                  |
| YouTube / TikTok history     | Unsupported histories are skipped without a provider call.                                                                                                                                                   | Additional history sources require adapter review and live verification.                                                                                                                                       |
| Triage                       | Direct Anthropic call, low effort, streaming structured output, bounded evidence. **Require exact comment-ID coverage before accepting or caching a reply.**                                                 | Tested Haiku 5.5 as a runtime override. Model selection affects stance judgments; retain completeness and evidence checks and record the model actually used.                                                  |
| Model retries                | Up to three semantic attempts; test all candidate texts from one CREAO run before paying for another. Transport errors respect backoff.                                                                      | Removing checks/retries can make failure faster but cannot create a valid report. Incomplete classification is rejected.                                                                                       |
| CREAO scoring                | Bounded recommendation/context packet and deterministic measurements; scoring remains on CREAO as specified.                                                                                                 | Agent model/workflow latency is the main remaining model bottleneck. App-scoped run keys cannot edit the agent. Any faster configuration needs a separate measured quality check.                              |
| CREAO completion             | Webhook wake-up is supported; **5 s fallback even when callbacks are configured**, replacing the former 20 s fallback. Step tokens and leases deduplicate wake-ups.                                          | Enable the runtime callback URL/secret and verify delivery. CREAO documents delivery as best effort; polling stays enabled.                                                                                    |
| Model caching                | Validated stage replies keyed by stage, prompt, model and exact evidence for 24 hours. Full-result reuse bypasses both model stages for the same link.                                                       | Anthropic prompt caching may save repeated rubric-prefix processing/cost; it does not eliminate classification output time. Cross-link reuse of whole replies would be incorrect.                              |
| Assembly / database          | Deterministic scoring and validation; indexed job, cache and owner lookups. Reused views derive IDs/fingerprints without copying source content.                                                             | Persistent graph reads between stages or an aggregated report endpoint could save HTTP round trips. Profile first: measured model waits are much larger.                                                       |
| Browser report               | Immediate completed-result handling; 2.5 s status polls; show collected comments before analysis completes; fetch analysis and graph in parallel.                                                            | Push updates can save up to a poll interval. Reuse the preview graph to remove one final read. Neither shortens collection or model execution.                                                                 |
| Page load / animation        | The interactive globe is outside the server processing path. Live reporting has no artificial demo delay.                                                                                                    | Lazy loading the 3D bundle can improve first page load, especially mobile, but does not speed an already-submitted investigation.                                                                              |
| Failures / observation       | Persist triage model and stage start/completion timestamps. History missingness does not force a new scraper run.                                                                                            | The v1 API lacks inference failure reporting: a failed worker can leave the website waiting. A contract-reviewed failure callback would improve reliability and perceived waiting, not successful-run latency. |

Do not cache authenticated report responses publicly at a CDN, extend retention
on a hit, invent missing history timestamps, drop evidence checks, increase paid
run budgets or bypass platform limits to report a faster number.

## Validation and rollout

The focused tests cover zero-delay completed pages, preserved active/busy backoff,
missing/duplicate/foreign classification IDs, candidate selection within a run,
and the bounded retry limit. Existing integration checks cover shared-result
ownership, fingerprint/history remapping, unchanged expiry and no duplicate work.

Deploy the completeness guard before selecting a faster runtime model. Keep the
default Opus model for unconfigured deployments; `ANTHROPIC_MODEL` selects the
production override. New jobs store their actual triage model so changing that
override cannot relabel a job still in progress. Verify one permitted cold run
and a subsequent warm reuse after deployment; report the observed stage timings
rather than projecting the standalone model benchmark onto the whole pipeline.

Primary provider references:
[Claude model overview](https://platform.claude.com/docs/en/models/sonnet-5-5/overview),
[model selection](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model),
[CREAO triggers and webhook guarantees](https://docs.creao.ai/pro/api-trigger).
