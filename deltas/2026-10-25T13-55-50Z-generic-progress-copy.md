# Approved delta: generic fetching and analyzing copy

Date: 2026-10-25 13:55:50 UTC
Status: Explicitly requested by the owner: remove “Saved comments” and “Saved analysis” from the website and extension and use generic fetching/analyzing wording.
Canonical specification: [SPEC.md](../SPEC.md)
Baseline: `80b5c9de3adddb8bb42008b41d5a69b53df8e010`
Scope: Progress headings, milestones, supporting copy and extension v1.0.4 packaging.

## Previous and revised requirements

ADR-022/ADR-023 required cache-specific labels during the timed presentation.
ADR-024 supersedes that copy requirement: both clients use **Fetching comments…**
and **Analyzing the discussion…**, with generic milestones and supporting text.
The extension's resume note also uses generic wording. The existing five-second
stages, preview timing, animations, cancellation and visibility-resume behavior
remain unchanged.

## Compatibility and preserved contracts

No API, cache, provider/model, ownership, retention, permission or storage-format
change. Reports retain their original collection time and reuse/expiry disclosure.
Deploy the website and publish new v1.0.4 unpacked and keyless Web Store ZIPs;
ingestion and inference need no redeployment.

## Validation

All 186 website and 58 extension tests pass, along with both builds/typechecks.
Existing timing and visibility tests still pass. Progress assertions verify
generic headings and the absence of cache-specific helper text. Both v1.0.4
ZIPs pass version, checksum, identity and archive checks, with identical
executable payloads. Compiled scripts contain the generic headings and none of
the superseded cache-specific progress phrases. Verify website deployment and
public release downloads separately.
