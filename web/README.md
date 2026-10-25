# dead internet theory web

React, TypeScript, and Vite application. The Vercel project root is `web/`.

## Commands

```sh
npm install
npm run dev
npm run lint
npm test
npm run build
```

## Connecting the analysis API

The analysis page calls the site's own `/api/v1/*` routes. A same-origin proxy
(`server/proxy.ts`, deployed as the Vercel Function `api/proxy.ts`) forwards
them to the ingestion backend
([../backend/INTEGRATION.md](../backend/INTEGRATION.md)). The backend requires a
bearer JWT on every route and allows no browser cross-origin calls.

Set these **server-side** environment variables in the Vercel project. Never
use `VITE_*` names for them, because those are bundled into the browser.

| Name | Value |
| --- | --- |
| `BACKEND_BASE_URL` | Backend HTTP base, e.g. `https://impartial-sheep-516.convex.site` |
| `BACKEND_JWT_SECRET` | The backend's `AUTH_JWT_SECRET` |

Until both are set, the proxy answers `SERVICE_NOT_CONFIGURED` and the page shows
the "service not connected" state.

What the proxy does:

- Forwards only the frontend routes: create an investigation, read an
  investigation, graph, analysis or enrichment, and capabilities. Inference
  routes are never proxied.
- Gives each browser an anonymous session ID in an HttpOnly, SameSite=Lax cookie.
  It mints a five-minute `frontend` JWT with subject `web:<session>` for each
  request, so the backend's owner check lets visitors read only investigations
  they created.
- Reads platform availability without setting or replacing the session cookie,
  so a homepage capability request cannot race an investigation create and change
  its owner.
- Rejects cross-origin creates and bodies over 8 KB, and passes backend errors
  and `Retry-After` through. Submission rate limits are the backend's
  (`POSTS_PER_HOUR`); the proxy adds none.

Locally, `npm run dev` and `npm run preview` serve `/api` through the same handler
when the two variables are set in the shell:

```sh
BACKEND_BASE_URL=http://127.0.0.1:3211 BACKEND_JWT_SECRET=<secret> npm run dev
```

`VITE_API_BASE_URL` can override the default `/api` base; it is a public URL.

The form accepts X/Twitter, Reddit, TikTok and YouTube links, including `youtu.be`,
YouTube Shorts and mobile YouTube URLs. TikTok accepts full `@user/video/id`
URLs and `/t/`, `vm.tiktok.com` and `vt.tiktok.com` shares. Share resolution uses
server-side HEAD requests only, validated/pinned public DNS, exact TikTok hosts,
at most two constrained redirects and four-second DNS/request deadlines. It
strips tracking and passes the full video URL to the independently validating
backend; the browser never fetches the source.
Platform labels use the backend's `/v1/capabilities` response, with distinct live,
setup and unknown states. `demoLimited` labels X's Free-plan quotas when
`APIFY_X_DEMO_ONLY=true` on the backend. URL recognition does not claim a provider is live or
bypass its server-side gate. The browser does not fetch the submitted source URL.

Submitting a link creates an investigation, polls its real `ingestionStatus` and
`analysisStatus`, then fetches the stored analysis, graph and used enrichment
jobs and renders the report.
The page reads current status immediately when create returns an unfinished
receipt, so refreshing a finished investigation does not wait for the next poll.
It reuses the preview graph for the final report only when investigation ID,
revision and fingerprint still match; otherwise it fetches the current graph.
Ingestion failures, analysis failures and
unsupported links each get their own message; no result is shown for a failed
analysis. The v1 API has no inference-failure route, so if inference fails after
accepting an event, the page stops waiting after 8 minutes. While the backend
runs in fixture mode, only its documented synthetic test threads can be collected.
The hosted site enables reviewed Reddit, X, TikTok and YouTube collection,
direct Claude triage and CREAO scoring; X retains the Free-plan demo limits.
Reports expire 24 hours after creation. A cached failure from the earlier fixture
deployment is replaced once, so refreshing can start a real investigation;
ambiguous live requests retain their idempotency key to avoid duplicate starts.
`/example` remains a labeled local example and links back to the real URL form.

## Animated homepage globe

The homepage shows an original, procedural wireframe globe with 28 modeled
gravestones, slow rotation, a gentle float and pointer tilt. Drag to turn it;
releasing a flick carries angular momentum that decays back to the gentle spin.
Grabbing again stops the momentum. Horizontal touch swipes spin the globe while
vertical gestures scroll the page and pinch zoom remains available. Arrow keys
turn the focused globe, and Home resets its orientation. It is a decorative
illustration, not a visualization of collected accounts or analysis results.
The existing form and analysis flow remain usable independently of the scene.

Three.js and React Three Fiber load in a separate chunk, with an inline SVG
poster for first paint or graphics failure. Reduced-motion preferences start
with the static poster and an explicit Play control; Pause stops automatic motion
and momentum while direct dragging and keyboard turns remain available.
Animation also stops offscreen and in background tabs. The renderer caps pixel
ratio at 1.5, uses simple lighting without post-processing or external assets,
and releases its resources when leaving the homepage.

The public demo and its navigation links have been removed. Legacy `/example`
URLs redirect to the homepage. Prepared report data remains available for tests.
Inter is self-hosted through the pinned Fontsource variable-font package.

## Report

`src/analysis/report.ts` turns the v1 `AnalysisResource` and graph into the
page's sections, in the SPEC 4.2 order: score and plain-language result, post, up to three
findings with quoted evidence, detailed analysis, then coverage and limitations.
The comment-section astroturfing index appears prominently with its bands and an
uncalibrated-heuristic explanation; detailed analysis includes its rationale
(SPEC ADR-010). Types in `src/api/contract.ts` mirror only the fields
the UI reads; the canonical models are in `../contracts/`.

Findings show one quote initially and expand to reveal additional citations.
**Explore evidence** opens the relevant interactive view; all axis citations
remain accessible even when a quote is shared between findings. Ready and missing
history outcomes remain distinct. Counts and charts use stored response data.

While a live check runs, milestones distinguish queued collection, active
collection, queued analysis and active analysis. The clock is elapsed time in
the current view, not a completion estimate. Once collection finishes, a bounded
preview lets readers browse up to 100 returned visible comments, six at a time,
without fetching the graph again on each poll. The walkthrough's illustrative
scene timing is never used as live progress.

## Interactive analysis playground

The live waiting view has a fixed, full-viewport 3D background: a large graveyard
globe and eighteen comment tiles spread across the page. An expressive ghost
roams both axes in a separate 224px foreground renderer with pointer events disabled,
so links, forms and buttons work through it. The same companion appears on the
landing page and stays mounted across navigation, phase changes and report completion.
The completed scene keeps moving with a celebratory greeting; a failed request
keeps a calm illustration. A continuous reading column with section dividers
replaces individual floating text panels. The column is horizontally centered
with an 80%-opacity backdrop so the modeled background remains visible; secondary
text uses a darker tone for readability. There are no visible scene
buttons or control panel. Formations follow the real backend phase: a gentle orbit
while waiting, comment models spawning one by one and spiraling inward during collection, then a rotating double helix with a traveling gold scan highlight
and a magnifying glass during analysis. They never advance on a timer. The ghost
has arms, blush, shiny eyes, blinks, waves, reaching motions and nods. Taps cycle
local hop, wink/wave and twirl reactions with ripples and sparks.

The analysis globe uses a stronger, 90%-opacity green grid over an opaque surface,
which hides far-side graves and grid lines. Floating comment models stay in front
of that surface during collection and analysis.

Drag/flick rotates the world with momentum; tap or Enter makes the ghost react.
Each reaction finishes before another starts, so rapid input cannot constantly
reset it. Clicks, including double-clicks, never pause animation. Space
pauses/resumes, Escape pauses, arrow keys turn the world, and Home resets its
orientation. Instructions are available to screen readers and on keyboard focus.
Horizontal touch gestures preserve vertical scrolling and pinch zoom. Pausing
stops automatic motion and inertia while allowing direct turns and static pose
changes when the real investigation phase changes.

This is an illustration with local controls, separate from the evidence. The
real backend status, elapsed-view clock, milestones, collected count and comment
preview remain authoritative. The toy does not initiate requests, alter polling,
change scores or simulate completion. Finishing the report keeps the scene and companion; leaving the analysis/home routes releases them.

The scene shares the homepage's lazy Three.js chunk; its own code loads only if
the route remains visible for at least 400 ms. Reduced motion starts with a stage-specific static
SVG, with Space as explicit opt-in. It reacts to preference changes
and keeps a poster on graphics failure. Hidden tabs suspend motion and resume on
return; scrolling or phase/layout changes never suspend the fixed scene. Simple
shared geometry, front-facing tiles, a small foreground canvas, instanced sparks and a 1.25 pixel-ratio cap and no shadow maps, post-processing or
external models keep rendering bounded; resources are disposed on unmount.
This feature deploys with the website and requires no ingestion or inference
Convex redeployment.

## Routing

Vercel `web/vercel.json` rewrites paths to the SPA entry point for refresh and shortcut links. Prefix URLs preserve nested path and query strings. A browser does not send an unencoded `#fragment` to the server; to preserve one, encode the complete source URL as the shortcut path segment first. Hash fragments are not needed to identify an ordinary post and the raw form cannot preserve them.

Repeated links can return a stored report immediately or join an existing run. Each browser retains private investigation access. Reports show the original comment-collection time and explain that reuse ends at the original 24-hour expiry.

## Account review availability

Account rows preserve the API's unavailable-rule list and sampled history count.
An incomplete zero displays **Limited** and the number of unavailable checks,
instead of “0 / None found.” A completed review can genuinely score zero and says
“No signals in sampled history.” The history explorer uses the same availability
logic. Supported signals and ordinary-participation evidence keep their existing
presentation. This display change also works with retained reports; the separate
inference update adds focused Claude history reviews for new analyses.
