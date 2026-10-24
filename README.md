# Dead Internet Theory

Investigates public discussion content for possible coordinated promotion.
The repository contains a frontend-only app, proposed scoring rubric, and v1
wire contracts. Backend/inference integration and live-provider behavior remain
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

The v1 contracts define the intended wire interface; importing and validating
them does not implement an API, inference worker, or provider integration.
The rubric remains an uncalibrated proposal. Frontend behavior and limitations
are documented in `web/README.md`.
