# Ingestion backend

Isolated TypeScript/Convex service for the [frozen v1 API](../contracts/openapi.yaml).
It implements all eight REST operations, durable ingestion/enrichment jobs,
immutable graph persistence, exact history sampling, ready-event delivery and
analysis validation/storage. It contains no inference model. The existing Vite
application is preserved.

Synthetic ingestion and an independent mock inference consumer have been verified
against a real local Convex deployment. No live Apify Actor has been exercised.
Candidate provider adapters are intentionally disabled until authorized runtime
verification is reviewed. Do not describe this as production or provider ready.

## Setup and checks

Use Node **22 or 24** (Node 26 does not run local Convex Node actions) and npm.
From `backend/`:

```sh
npm ci
npm run typecheck
npm test
npm audit
CONVEX_AGENT_MODE=anonymous npm run dev
```

`dev`, `test`, `typecheck` and `deploy` generate TypeScript declarations and
standalone AJV Draft 2020-12 validators from `../contracts/models.schema.json`.
Formats are checked. Generated files are ignored build outputs; the canonical
schema is never copied into another source of truth. Convex's generated bindings
are also ignored because this package uses its generic function builders.
`convex dev` generates them for local tooling.

The CLI prints the deployment URL and HTTP site URL. The usual anonymous local
HTTP base is `http://127.0.0.1:3211`; cloud HTTP actions use
`https://<deployment>.convex.site`, **not** `.convex.cloud`. The local service runs
while `convex dev` runs. No cloud deployment or public backend URL has been created.

From the repository root, validate the unchanged contracts and client:

```sh
python3 -m venv /tmp/dit-contracts-venv
/tmp/dit-contracts-venv/bin/python -m pip install -r contracts/requirements.txt
/tmp/dit-contracts-venv/bin/python scripts/validate_contracts.py
cd web
npm ci
npm run lint
npm test
npm run build
```

## Real local synthetic demo

Keep `npm run dev` running in one terminal. In another, from `backend/`:

```sh
npx tsx scripts/prepare-local-demo.ts /tmp/dit-local-demo
npx convex env set --from-file /tmp/dit-local-demo/backend.env
node --env-file=/tmp/dit-local-demo/client.env --import tsx scripts/mock-inference.ts
```

In a third terminal, from `backend/`:

```sh
node --env-file=/tmp/dit-local-demo/client.env --import tsx scripts/http-e2e.ts
```

The last command creates an investigation, polls it, retrieves its graph,
waits for the separate mock consumer to request two histories and submit the
repository's synthetic analysis, then validates the stored analysis and history
results. It replays the event twice and verifies one effective mock execution.
The scripts generate private, one-hour local credentials without printing them.
Regenerating credentials invalidates earlier tokens; restart the mock afterward.
Stop the demo processes when finished. Files and inbox live under `/tmp`, not Git.

Fixture mode accepts only these synthetic sources (all results are labeled):

- `https://www.reddit.com/r/example/comments/demo/`
- `https://x.com/synthetic/status/100`
- `https://www.youtube.com/watch?v=synthetic01`
- `https://www.tiktok.com/@synthetic/video/100`

The independent mock performs the complete Reddit workflow only. It must never
receive genuine user data: it rejects graphs without a synthetic limitation and
submits the supplied illustrative scores, without calculating any scores.

See the [runbook](RUNBOOK.md) for configuration, storage decisions, provider
verification, operational recovery and deployment prerequisites, and the
[integration guide](INTEGRATION.md) for frontend/inference authentication.
