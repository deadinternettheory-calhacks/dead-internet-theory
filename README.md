# Dead Internet Theory

Investigates public discussion content for possible coordinated promotion.
The repository contains the frontend, a Convex backend that serves the v1 API
and runs a CREAO-based inference worker, a proposed scoring rubric, and the v1
wire contracts. Live ingestion, live CREAO runs and deployment remain
unverified.

## Repository guide

- [SPEC.md](SPEC.md): canonical specification for scope, requirements, architecture,
  interfaces, validation, open decisions, and architecture decision log.
- [CONTRIBUTING.md](CONTRIBUTING.md): development workflow, Conventional Commits,
  branches, pull requests, and specification changes.
- [AGENTS.md](AGENTS.md): instructions for coding agents.
- [contracts/](contracts/README.md): v1 schemas, OpenAPI definitions, synthetic
  examples, provider adapter notes, and validation instructions.
- [web/](web/README.md): frontend setup, commands, and current behavior.
- [backend/](backend/README.md): Convex v1 API, inference worker, CREAO setup
  ([creao-agent.md](backend/creao-agent.md)), and the synthetic example.
- [deltas/](deltas/README.md): specification-change records and their template.
- [rubrics/product-astroturfing.md](rubrics/product-astroturfing.md):
  rules an AI agent follows to score a product recommendation in a Reddit, X,
  YouTube or TikTok comment section for likely astroturfing (proposal, not yet
  validated).

## Getting started

Read the contribution guide and relevant specification sections before working.
Use [web/README.md](web/README.md) for frontend commands,
[backend/README.md](backend/README.md) for the Convex backend and CREAO setup,
and [contracts/README.md](contracts/README.md) for contract validation setup.

## Specification changes

For work that contradicts an established requirement in
[SPEC.md](SPEC.md), follow the approval and timestamped-delta
workflow in [CONTRIBUTING.md](CONTRIBUTING.md). Update the specification, delta,
and architecture decision log together after approval. TBDs and placeholders are
unfinished documentation, not established requirements.

## Current status

The backend implements the v1 routes and the inference worker and has run end
to end on a local Convex backend against a labeled synthetic fixture. Live
collection is not connected, so real links fail honestly. The rubric and its
mapping to contract axes are uncalibrated proposals. See `backend/README.md`
and `web/README.md` for behavior and limitations; `/example` in the app shows
what a finished (synthetic) report looks like.
