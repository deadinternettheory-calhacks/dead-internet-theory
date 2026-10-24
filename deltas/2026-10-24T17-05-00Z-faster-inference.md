# Approved delta: faster inference

Date: 2026-10-24 17:05 UTC
Status: Requested by the inference owner ("Do all of these. Make a PR", after a
list of speed-ups that included calling Claude directly for triage), and
confirmed again when the spec change was raised.
Canonical specification: [SPEC.md](../SPEC.md)
Baseline: `main` at e733457
Scope: `inference/` worker, prompts and docs; `web/` analysis page; SPEC 1,
5.3, 6, 9, 11, 12.1, 13.4, 13.5. No contract change.

## Previous and revised requirements

| Sections | Previous | Approved revision | Rationale |
| --- | --- | --- | --- |
| 5.3, 9, 11 | Claude runs only as the CREAO agent's model; the service makes no direct Anthropic API call and has no Anthropic key. | Triage is one direct Anthropic Messages API call with a schema-constrained reply when `ANTHROPIC_API_KEY` is set (default `claude-opus-5-5`, low effort). Without the key, CREAO runs triage as before. Scoring stays on CREAO. | A CREAO run took about 40–80 s; the direct call took about 9 s and always returns valid JSON. |
| 9 | One CREAO agent runs twice per analysis; runs are polled. | The worker may pass a webhook URL so CREAO reports finished runs; polling remains as a slower fallback. | Removes poll latency. |
| 9 | Author histories are requested after triage. | Up to 10 likely recommenders' histories are requested before triage, chosen from the thread alone; triage then requests only the missing ones (25 pairs in total). | Histories are collected while triage runs. |
| 9 | Scoring gets every comment. | Scoring gets recommendations and their context (parents, replies, the recommenders' other comments, the 15 most-engaged comments) and the count of omitted comments. | Smaller input, faster run. |
| 9 | No reuse of model replies. | Validated replies are cached for 24 hours by stage, prompt version, model and exact evidence, and deleted by the same retention sweep as job state. | Re-analysis of unchanged content skips the model without keeping data past the 24-hour limit. |
| 10 | The analysis page shows only the submitted link until the report is ready. | Once collection finishes, it shows the post and the first comments while analysis runs. | The page is useful sooner. |

## Compatibility and migration

No contract change. A submission may now cite more than one enrichment job in
`usedEnrichmentIds`, which v1 already allows. The `jobs` table gains optional
fields and a new index, and a `modelCache` table is added; existing rows stay
valid, and the hosted deployment (`grandiose-barracuda-22`) picks them up on its next deploy. To use the new paths, set `ANTHROPIC_API_KEY`, `CREAO_WEBHOOK_SECRET`
and `CREAO_WEBHOOK_URL` on the inference deployment
([inference/README.md](../inference/README.md)), and edit the CREAO agent
([inference/creao-agent.md](../inference/creao-agent.md#edit-the-agent-for-speed)).

## Preserved contracts

The v1 contract, deterministic re-scoring, evidence-reference validation, the
no-tools rule for model calls, and the untrusted-evidence framing are unchanged.

## Superseded decisions and open questions

ADR-008's "two CREAO runs" is amended by ADR-009. Open: Anthropic data
retention and cost review for direct calls; whether early-history selection
requests histories the analysis does not end up using (it reports them as
requested).

## Architecture decision log

SPEC 13.4: ADR-008 marked amended; ADR-009 added.

## Validation and evidence

See SPEC 12.1 (2026-10-24, after the speed changes). Not verified: the full
speed path end to end against a backend, a real CREAO webhook delivery, and
the edited CREAO agent.
