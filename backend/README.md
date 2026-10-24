# Ingestion backend

Isolated TypeScript/Convex service implementing the frozen v1 REST boundary.
The existing Vite application remains independently owned. Canonical models and
HTTP operations are in [contracts](../contracts/README.md); generated types and
standalone Draft 2020-12 validators are build outputs, not competing schemas.

From this directory, use Node 22+ and npm:

```sh
npm ci
npm run generate
npm run typecheck
npm test
npm run dev
```

`convex dev` configures a local/development deployment. HTTP actions use its
printed `http://...` local site URL or `https://<deployment>.convex.site` cloud
URL, **not** the `.convex.cloud` function URL. No hosted deployment is provisioned
by this repository. Configure server-side `AUTH_JWT_SECRET` (at least 32 random
bytes) before invoking the API. JWTs require HS256, issuer `dit-backend`, audience
`dit-v1`, subject, issued-at, expiration (maximum age one hour), and role
`frontend` or `inference`. Frontend reads are scoped to the creating subject;
inference requires an `investigations` array of permitted IDs or explicit `*`.
No public-client credential issuer exists yet. Never put a privileged token or
JWT signing key in Vite configuration or browser source.

The provider implementation and operational runbook are delivered in subsequent
slices on this feature branch. Live source authorization, retention/deletion
policy and credential issuance remain deployment prerequisites.
