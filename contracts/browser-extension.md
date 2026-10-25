# Chrome extension transport

The packaged Manifest V3 client uses the existing website `/api/v1/*` frontend
operations. Their payloads remain those in [openapi.yaml](openapi.yaml) and
[models.schema.json](models.schema.json). No ingestion or inference operation is
added. Public configuration is canonical in [extension-client.ts](extension-client.ts).

For every request the client supplies:

- `X-DIT-Extension-Id`: the listed public Chrome client ID, matched to the
  unpacked manifest's public key. This is an allowlist entry, not a credential or
  proof that a request came from Chrome.
- `X-DIT-Extension-Session`: a cryptographically random 32-byte nonce encoded as
  43 unpadded base64url characters. This is an anonymous session credential.
  It stays in trusted extension local storage and request headers, never URLs.

The website proxy validates both headers. When an Origin is present it must
exactly match the listed `chrome-extension://<id>`; missing Origin is supported
for privileged extension fetch. Ordinary website creates still require the
same-origin policy. Preflight accepts only that extension origin, the frontend
GET/POST route allowlist, and the two headers plus Content-Type/Idempotency-Key.
Responses to the listed extension origin include CORS headers without credentialed
cookies. Unknown origins are never granted CORS access.

The proxy hashes the nonce into the stable owner subject
`web:extension:<sha256 nonce>` and signs the existing five-minute frontend JWT
server-side. Neither the nonce nor extension headers reach ingestion. A new
nonce creates a different owner. Browser cookies are not used or set for
extension requests. Backend owner checks, reuse, idempotency, rate limits,
provider limits and fixed 24-hour data expiry remain authoritative.

The session identity may persist like the site's anonymous cookie; the client
stores only bounded, expiring investigation metadata, not source graphs or
report contents. Closing the panel does not cancel durable backend work. A
separate extension report tab uses the same credential and stored investigation
ID, so opening a report does not create another investigation.

Before Chrome Web Store publication, use the store-assigned extension ID/public
key and update this canonical allowlist and package together. The unpacked ZIP
uses a fixed public key so all installations have the listed ID. The key contains
no private material and grants no backend privilege.
