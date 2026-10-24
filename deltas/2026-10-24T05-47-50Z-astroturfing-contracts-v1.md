# Approved delta: adopt astroturfing v1 wire contracts

Date: 2026-10-24T05:47:50+00:00
Status: Authorized by the user's request to fold in astroturfing-contracts-v1.zip,
open a branch and PR, and merge. This authorizes repository integration; it does
not attest to separate backend/inference owner acceptance or live readiness.
Canonical specification: [SPEC.md](../SPEC.md)
Baseline: 004b133 (main after PR #2).
Source: astroturfing-contracts-v1.zip, SHA-256
`23ced8c96cfe9e431442e013fd6486b245c11f3c3cc4eec8f3d853c6ed785f8e`.
Scope: Contracts, synthetic fixtures, validator, and documentation. No backend,
inference worker, provider calls, frontend implementation changes, or deployment.

## Previous and revised requirements

| Sections | Previous | Approved revision | Rationale |
| --- | --- | --- | --- |
| SPEC 6; draft 0.1 | Model shapes, transport, timestamps, errors and versioning unresolved | Adopt supplied v1.0.0 design, OpenAPI 3.1 and canonical JSON Schema Draft 2020-12 models | Provide concrete interfaces for implementation |
| Draft identifiers | Platform-prefixed IDs without a node kind | Platform:kind:native-id IDs | Distinguish discussion, comment and author nodes |
| Draft enrichment | Three result statuses; enriched profiles backfilled into graph | Five per-author statuses, async enrichment jobs and separately stored evidence | Preserve immutable graph revisions and expose unsupported/provider failure states |
| Draft history selection | Up to 10 nearest comments with loosely defined fallback | Exactly specified ten-item sampling target, focal-discussion exclusion and full recent fallback replacement | Make sample selection reproducible |
| Draft analysis | Loose result object; similarity links unresolved | Typed analysis, graph revision/fingerprint matching, evidence references and analysis-only inferred edges | Keep ingestion and inference responsibilities explicit |

## Compatibility and migration

This supersedes draft 0.1. Producers and consumers must use the canonical v1
models and routes, including new IDs and per-author statuses; do not silently
reinterpret draft payloads as v1. The frontend currently has no connected backend
or competing response schema. No deployed draft consumer was verified here.
The scoring rubric remains a proposal, not an AnalysisSubmission wire payload;
its mapping into typed axes requires an explicit inference implementation.

## Preserved contracts

Ingestion owns provider access and persistence; inference selects authors and
scores evidence; frontend reads stored results. Ten history items remain the
target. YouTube/TikTok author histories remain unsupported. Missing data is not
zero, empty history, or proof of deception. Provider credentials stay server-side.

## Decisions and validation

SPEC ADR-001 records the contract selection. Imported files retain the bundle's
team-acceptance and operational-verification caveats. Run
`python scripts/validate_contracts.py` with the documented dependencies for
schema, fixtures and selected cross-record checks. These checks do not prove
sampling implementation, provider correctness, backend integration, or deployment.
