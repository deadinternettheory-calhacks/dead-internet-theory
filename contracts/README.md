# Schemas and contracts

This directory holds canonical shared schemas and interface contracts for data
exchanged between components: API requests and responses, events, and shared
payloads. The supplied v1.0.0 design supersedes draft 0.1. Repository adoption
does not attest to separate backend/inference owner acceptance or live readiness.

## Contracts

- [discussion-graph-api.md](discussion-graph-api.md): normative interface behavior.
- [models.schema.json](models.schema.json): canonical JSON Schema Draft 2020-12
  model definitions. Edit these rather than duplicating models in OpenAPI.
- [openapi.yaml](openapi.yaml): OpenAPI 3.1 routes, auth, and HTTP status contracts;
  references the canonical models.
- [provider-adapters.md](provider-adapters.md): candidate Apify mappings and
  remaining operational verification.
- [browser-extension.md](browser-extension.md): website proxy transport and
  anonymous sessions for the packaged Chrome client; existing v1 payloads remain
  canonical.
- [examples/](examples/README.md): synthetic fixtures, never real investigations.

## Validation

With Python 3.10+ from the repository root:

```sh
python3 -m venv /tmp/dit-contracts-venv
/tmp/dit-contracts-venv/bin/python -m pip install -r contracts/requirements.txt
/tmp/dit-contracts-venv/bin/python scripts/validate_contracts.py
```

The validator checks JSON Schema definitions, fixture shapes, OpenAPI model
references and operation names, and selected graph/enrichment/analysis invariants.
It is not a complete OpenAPI linter, a history-sampling implementation test, or a
live provider/backend integration test. Operational checks remain in the contract.

## Usage

- Add definitions here as interfaces are established. Choose formats appropriate
  to the selected stack; document their validation commands when tooling exists.
- Give files descriptive names and group them by interface or domain as needed.
- Describe fields, required/optional values, constraints, and error behavior in
  each contract's format or accompanying documentation. Keep examples beside the
  definition and validate them when tooling is available.
- Have producers and consumers reference or generate from these definitions.
  Document generated outputs and their regeneration command; edit source
  definitions rather than generated copies.
- Review affected producers and consumers before changing a contract. Document
  compatibility, versioning, or migration needs and update validation and examples
  with the definition.

[SPEC.md](../SPEC.md) defines requirements and links to concrete contracts here.
Follow [CONTRIBUTING.md](../CONTRIBUTING.md) for changes that contradict established
requirements.
