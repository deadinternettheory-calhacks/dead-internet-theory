# Dead Internet Theory

Investigates public discussion content for possible coordinated promotion.
The repository contains a frontend app, a Convex ingestion backend with a verified
synthetic workflow, a CREAO and Claude inference service, a proposed scoring rubric,
and v1 wire contracts. The frontend accepts X, Reddit, TikTok and YouTube links.
All four discussion adapters have scoped runtime verification; X is limited by
the current Apify Free-plan demo limits. Newly enabled X, TikTok and YouTube
links also completed through the [hosted CREAO pipeline](backend/verification/2026-10-24-four-platform-hosted.md).
CREAO analysis and 24-hour
application retention are configured; the form shows live backend availability.

## Repository guide

- [SPEC.md](SPEC.md): canonical specification for scope, requirements, architecture,
  interfaces, validation, open decisions, and architecture decision log.
- [CONTRIBUTING.md](CONTRIBUTING.md): development workflow, Conventional Commits,
  branches, pull requests, and specification changes.
- [AGENTS.md](AGENTS.md): instructions for coding agents.
- [contracts/](contracts/README.md): v1 schemas, OpenAPI definitions, synthetic
  examples, provider adapter notes, and validation instructions.
- [web/](web/README.md): frontend setup, commands, and current behavior.
- [backend/](backend/README.md): ingestion backend setup, synthetic demo, tests and integration.
- [inference/](inference/README.md): independent CREAO inference service, rubric
  scoring, agent setup ([creao-agent.md](inference/creao-agent.md)), and the
  synthetic example report.
- [deltas/](deltas/README.md): specification-change records and their template.
- [rubrics/product-astroturfing.md](rubrics/product-astroturfing.md):
  rules an AI agent follows to score a product recommendation in a Reddit, X,
  YouTube or TikTok comment section for likely astroturfing (proposal, not yet
  validated).

## Getting started

Read the contribution guide and relevant specification sections before working.
Use [web/README.md](web/README.md) for frontend commands,
[backend/README.md](backend/README.md) for the ingestion backend,
[inference/README.md](inference/README.md) for the inference service and CREAO setup,
and [contracts/README.md](contracts/README.md) for contract validation setup.

## Specification changes

For work that contradicts an established requirement in
[SPEC.md](SPEC.md), follow the approval and timestamped-delta
workflow in [CONTRIBUTING.md](CONTRIBUTING.md). Update the specification, delta,
and architecture decision log together after approval. TBDs and placeholders are
unfinished documentation, not established requirements.

## Current status

The backend implements the v1 API and durable jobs with synthetic end-to-end
verification on local Convex and authenticated REST checks on a hosted development
deployment. The website's server proxy issues scoped frontend tokens, and reviewed
Reddit adapters are enabled with pinned Actor builds. The inference service consumes the backend's ready events,
calls Claude directly for triage, uses a CREAO agent for rubric scoring, and re-scores deterministically; it has
run end to end locally and on the hosted site, including one permitted real post.
The rubric and its mapping to contract axes are uncalibrated proposals.
The frontend renders v1 analyses through a configured API base and shows a labeled
synthetic report at `/example`; see `web/README.md`. See `backend/README.md` and
`inference/README.md` for implementation details and verification limits.
