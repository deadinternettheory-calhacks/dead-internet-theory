# Approved delta: continuous ghost flight on hover

Date: 2026-10-25 04:14:58 UTC
Status: Requested by the owner: remove the ghost stopping under the cursor.
Canonical specification: [SPEC.md](../SPEC.md), section 10.3 and ADR-019.

Previously, hovering or focusing the ghost held its flight position. Mouse hover
and clicks now leave flight running; only keyboard focus holds the target steady
for accessible activation. Character animations and click reactions continue.

This website-only change preserves phase-driven animation, explicit pause,
reduced motion, hidden-tab suspension and comment layering. No service interfaces,
stored data or backend deployments change.
