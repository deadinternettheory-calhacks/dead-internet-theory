# Agent Instructions

## Read before working

- Read [README.md](README.md) for project context and setup.
- Read [CONTRIBUTING.md](CONTRIBUTING.md) for the development and commit workflow.
- Read the relevant sections of [SPEC.md](SPEC.md) for the current task. Use its
  headings to select requirements, architecture, interfaces, data handling, or
  validation details as needed. Read additional sections when the change affects
  their assumptions or contracts.
- Check for more specific `AGENTS.md` instructions in directories you work in.
- Before changing an interface or exchanged data, read
  [contracts/README.md](contracts/README.md) and the relevant contract definitions.

## Schemas and contracts

- Keep shared schemas and interface contracts in the top-level `contracts/`
  directory. Link to canonical definitions rather than maintaining independent
  copies in component directories or documentation.
- Keep producers, consumers, examples, and relevant validation aligned when a
  contract changes. Check compatibility and document any migration needed.
- Follow `CONTRIBUTING.md` when a contract change contradicts established spec
  requirements. Do not invent schemas or select tooling to fill placeholders.

## Working expectations

- Keep changes scoped to the task and preserve unrelated work.
- Treat placeholder text as unfinished documentation, not a source of invented
  requirements. Ask for clarification when a material decision cannot be inferred
  from the task or existing code.
- Implement small, reviewable slices and make a Conventional Commit after each
  completed slice, following `CONTRIBUTING.md`.
- Run checks appropriate to the change and report their results and any limits.
- Update documentation when behavior, setup, or interfaces change.
