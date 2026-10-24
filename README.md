# Dead Internet Theory

Investigates public discussion content for possible coordinated promotion.
The repository contains a frontend app, a Convex ingestion backend with a verified
synthetic workflow, a proposed scoring rubric, and v1 wire contracts. Live providers,
production deployment, and a real inference worker remain unverified.

## Repository guide

- [SPEC.md](SPEC.md): canonical specification for scope, requirements, architecture,
  interfaces, validation, open decisions, and architecture decision log.
- [CONTRIBUTING.md](CONTRIBUTING.md): development workflow, Conventional Commits,
  branches, pull requests, and specification changes.
- [AGENTS.md](AGENTS.md): instructions for coding agents.
- [contracts/](contracts/README.md): v1 schemas, OpenAPI definitions, synthetic
  examples, provider adapter notes, and validation instructions.
- [web/](web/README.md): frontend setup, commands, and current behavior.
- [backend/](backend/README.md): backend setup, synthetic demo, tests and integration.
- [deltas/](deltas/README.md): specification-change records and their template.
- [rubrics/product-astroturfing.md](rubrics/product-astroturfing.md):
  rules an AI agent follows to score a product recommendation in a Reddit, X,
  YouTube or TikTok comment section for likely astroturfing (proposal, not yet
  validated).

## Getting started

Read the contribution guide and relevant specification sections before working.
Use [web/README.md](web/README.md) for frontend commands and
[contracts/README.md](contracts/README.md) for contract validation setup.

## Specification changes

For work that contradicts an established requirement in
[SPEC.md](SPEC.md), follow the approval and timestamped-delta
workflow in [CONTRIBUTING.md](CONTRIBUTING.md). Update the specification, delta,
and architecture decision log together after approval. TBDs and placeholders are
unfinished documentation, not established requirements.

## Current status

The backend implements the v1 API and durable jobs with synthetic end-to-end
verification on local Convex. Candidate Apify adapters remain disabled pending
authorized runtime verification and retention review. No real inference model or
public credential issuer is implemented. The rubric remains an uncalibrated proposal.
The frontend is not connected; its behavior is documented in `web/README.md`.
The frozen master spec records the implementation baseline; see `backend/README.md`
for the newer backend implementation and its verification limits.
