# Approved delta: comments stay behind the column

Date: 2026-10-25 04:56:38 UTC
Status: Requested by the owner: remove comments coming forward during inactivity.
Canonical specification: [SPEC.md](../SPEC.md), section 10.3 and ADR-020.

Previously, comment models moved above the column after three idle seconds and
returned behind on activity. They now stay behind indefinitely, through activity,
inactivity and report completion. This keeps reading text clear. The ghost stays
above both, and existing phase-driven animations continue.

Remove the idle timer, activity listeners and foreground layer override. No API,
provider, stored-data or ingestion/inference deployment changes are needed.
