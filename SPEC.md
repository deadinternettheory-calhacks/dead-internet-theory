# Dead Internet Theory — Project Specification

Status: partial specification; v1 wire contracts adopted for implementation.
Backend/inference acceptance and operational verification remain outstanding.

This is the canonical location for project requirements once they are defined.
TBDs and placeholders do not establish requirements or imply implementation.
Distinguish selected decisions, proposals, and verified behavior as the project
develops. Record evidence and verification limits for implementation claims.

## 1. Summary

TBD: describe the problem, intended users, and proposed solution.

## 2. Goals, scope, and non-goals

TBD: define the MVP, measurable outcomes, and explicit exclusions.

## 3. Users and workflows

TBD: describe users, their tasks, and expected end-to-end behavior.

## 4. Requirements

TBD: define functional requirements, constraints, and acceptance criteria.

## 5. Architecture and dependencies

TBD: select the stack, components, component boundaries, and external services.
No stack or provider is selected by this scaffold.

## 6. Interfaces and data contracts

The top-level [contracts/](contracts/README.md) directory is the canonical home
for shared schemas and interface contracts, including API requests/responses,
events, and data exchanged between components. Keep concrete definitions there
and link to them from this specification instead of duplicating their contents.

Producers and consumers must use the same contract definitions. When changing a
contract, review affected producers and consumers, document compatibility and
migration needs, and update relevant validation and examples together. Follow the
specification-change workflow for changes that contradict established requirements.

The v1.0.0 interface design supersedes draft 0.1:

- [Discussion graph and enrichment API](contracts/discussion-graph-api.md):
  normative lifecycle, sampling, identity, error, and compatibility semantics.
- [models.schema.json](contracts/models.schema.json): single canonical model
  source, using JSON Schema Draft 2020-12.
- [openapi.yaml](contracts/openapi.yaml): OpenAPI 3.1 HTTP operations referencing
  those models.
- [Provider adapters](contracts/provider-adapters.md): candidate mappings and
  operational verification needs.
- [Synthetic examples](contracts/examples/README.md) and
  [validator](scripts/validate_contracts.py): reproducible structure and selected
  cross-record checks. See [contracts/README.md](contracts/README.md) for setup.

The design defines async REST jobs, immutable graph revisions, typed analysis
with evidence references, and explicit per-author enrichment outcomes. The
supplied bundle does not establish separate team-owner acceptance, live Actor
correctness, or runtime implementation. The scoring rubric remains a proposal;
its output must be explicitly mapped to the wire models by inference code.

## 7. Data handling and security

TBD: define data collection, storage, retention, access, authentication,
authorization, and secret handling as applicable.

## 8. Development and deployment

TBD: define local setup, configuration, environments, and deployment workflow.
Add verified commands to README.md when they exist.

## 9. Implementation priorities and ownership

TBD: define reviewable milestones, dependencies, and owners.

## 10. Validation and implementation status

Current state: a frontend-only app lives in `web/`; v1 contract definitions,
synthetic fixtures and a Python contract validator are available. No connected
backend/inference implementation or live-provider verification is established
by this contract integration. Fixture validation does not establish runtime behavior.

TBD: record acceptance checks, results, evidence, and outstanding limitations.

## 11. Risks and open decisions

- Product scope and intended users: TBD.
- Stack, architecture, and deployment: TBD.
- Backend/inference owner acceptance, provider verification, deployment limits,
  rubric-to-analysis mapping, and runtime integration remain outstanding.

## 12. Architecture decision log

### ADR-001: Adopt v1 wire contracts

Date: 2026-10-24 (UTC). Status: selected for repository integration.

Context: draft 0.1 left wire shapes and transport decisions open.
Decision: adopt the supplied OpenAPI 3.1 / JSON Schema Draft 2020-12 bundle,
with models.schema.json as the canonical model source.
Consequences: producers and consumers must align to v1 IDs, job/status semantics,
immutable graphs, evidence references, and versioning. Separate team acceptance
and live verification are not implied.
Related delta: [2026-10-24T05-47-50Z-astroturfing-contracts-v1.md](deltas/2026-10-24T05-47-50Z-astroturfing-contracts-v1.md).

## 13. Specification change history

The [v1 contract delta](deltas/2026-10-24T05-47-50Z-astroturfing-contracts-v1.md) supersedes draft 0.1. Use the workflow in
[CONTRIBUTING.md](CONTRIBUTING.md) and the guidance in
[deltas/README.md](deltas/README.md) when changing established requirements.
