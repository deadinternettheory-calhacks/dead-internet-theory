# Schemas and contracts

This directory holds canonical shared schemas and interface contracts for data
exchanged between components: API requests and responses, events, and shared
payloads. No concrete contracts or schema tooling have been defined yet.

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
