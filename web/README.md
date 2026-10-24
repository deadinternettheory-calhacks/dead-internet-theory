# dead internet theory web

Frontend-only React, TypeScript, and Vite application. The Vercel project root is `web/`.

## Commands

```sh
npm install
npm run dev
npm run lint
npm test
npm run build
```

The app currently has no connected analysis backend. URL entry, URL validation, homepage, informational page, and honest unavailable analysis states work; no analysis results, scores, authors, findings, or metrics are generated. Platform checking is clearly marked unavailable.

Backend integration should consume the canonical request and response definitions from the repository's top-level `contracts/` directory once those are established. Presentation components currently avoid defining a competing response schema. No backend or contract code is included here.

Vercel `web/vercel.json` rewrites paths to the SPA entry point for refresh and shortcut links. Prefix URLs preserve nested path and query strings. A browser does not send an unencoded `#fragment` to the server; to preserve one, encode the complete source URL as the shortcut path segment first. Hash fragments are not needed to identify an ordinary post and the raw form cannot preserve them.
