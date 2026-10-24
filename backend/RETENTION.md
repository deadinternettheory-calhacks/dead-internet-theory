# Live data retention

The owner selected 24-hour retention for live reports and source data on
2026-10-24. An investigation receives a fixed deadline 24 hours after creation.
Its graph, analysis, enrichment, raw snapshots and execution jobs inherit that
deadline. Reading or updating a resource does not extend it. Expired resources
are unavailable immediately; an indexed sweep removes expired rows every minute.
Existing rows receive deadlines based on their original creation time during
rollout. Cached history pools are removed at their configured cache expiry,
which is one hour by default and never longer than 24 hours.

Idempotency receipts keep their contractual 24-hour lifetime after each POST,
including when the investigation expires sooner. They store a request hash and
authorization/receipt metadata, not the original request body or report text.
An authorized identical retry can replay the receipt; expired reports remain
unavailable. Changed payloads and mismatched investigation scopes are rejected.

Each observed Apify run is added to a separate durable cleanup queue, with its
default storage IDs and the investigation deadline. At expiry, the worker checks
the run, aborts it if still active, waits for terminal confirmation, deletes its
default dataset, key-value store and request queue, then deletes the run. Every
deletion is checked with an authenticated GET returning 404. Failed operations
retain only resource identifiers and retry after ten minutes. Database expiry
does not wait for Apify availability. Cleanup is idempotent; no unrelated account
resources are deleted. Active capacity reservations with an ambiguous start
remain non-content operator metadata until the remote run is reconciled.

The inference coordinator deletes its own stored job state after 24 hours and
ignores expired jobs. These controls cover application records and owned Apify
resources. Convex backup retention and CREAO's processing logs/workspaces remain
subject to those providers' controls; this application does not claim to erase
provider backups or CREAO's internal copies. No secrets or source bodies should
be placed in logs or verification records.

Operators can inspect `retention:pendingProviderCount` and the private
`providerCleanup` table for delayed external deletion. A failed cleanup remains
queued rather than being reported as deleted. For source corrections or earlier
removal, use privileged dashboard access to remove the investigation's associated
records and reconcile its owned provider artifacts. No new public deletion or
refresh operation is added to the frozen v1 API.
