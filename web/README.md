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

Production builds also publish the extension's canonical privacy HTML and CSS
at `/extension/privacy.html` and `/extension/privacy.css`. Use
`https://www.deadinternettheory.us/extension/privacy.html` for the Chrome Web
Store privacy-policy field. The source remains in `extension/public/`; the
website build copies it without maintaining a separate policy.

## Preview the results screen without a backend

Run `npm run dev` in `web/`, then open `http://localhost:5173/dev/report`
(use the port Vite prints if 5173 is busy). This renders the same results layout
with saved synthetic report data, including the score, findings, discussion and
account histories. No backend, inference service, API keys or analysis requests
are needed. Changes to report components update through Vite as usual.

The fixture post title identifies it as a synthetic example. The route and
fixture import are development-only and excluded from production builds.

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
- Rejects ordinary cross-origin creates and bodies over 8 KB, and passes backend errors
  and `Retry-After` through. Submission rate limits are the backend's
  (`POSTS_PER_HOUR`); the proxy adds none.

The Chrome extension uses a separate anonymous nonce session with the exact
client/origin allowlist in [the extension transport](../contracts/browser-extension.md).
Its credential is hashed into a distinct owner; the backend signing secret stays
server-side. It uses the same frontend route allowlist, provider limits and
retention. No provider key or backend token is packaged in the extension.

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
page's sections, in the SPEC 4.2 order: score and plain-language result, up to three
findings with quoted evidence, account signals, detailed analysis, coverage and
limitations, then the original post and source. Completed reports put the post
below all analytics; the collected-thread preview remains available while waiting.
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

The analysis view uses three layers: the passive graveyard globe behind the
centered reading column, eighteen comment models in a pointer-transparent layer,
and the expressive ghost above the comments. Comments always stay behind the
reading column, including during inactivity and after report completion; the
ghost stays on top. The column keeps
its 94%-opacity backdrop. Loading and completed reports share a centered 640px
maximum column, with responsive gutters, so prose stays at a comfortable reading
width and results do not widen the layout. There are no separate visible
scene-control buttons.
The same ghost appears on the landing page and stays mounted across navigation,
phase changes and report completion. The world, comments and ghost remain after
completion, with a celebratory greeting; a failed request retains a calm scene.

The analysis globe has no drag/flick, hover-tilt or arrow-key rotation. Only clicking
the ghost (or pressing Enter/Space while it is focused) triggers reactions. Its
flight keeps moving during mouse hover and clicks. Keyboard focus alone holds
the target steady for accessible activation, while the character keeps animating.
Taps cycle hop, wink/wave and twirl reactions and finish before accepting
another. P pauses/resumes scene motion; Escape pauses. Clicking a paused/static
ghost explicitly opts into motion and queues one reaction. Background/page clicks
and report controls do not trigger reactions. The landing page's separate globe
keeps its existing interactions.

Actual backend phases select the comment behavior: models spawn one by one and
spiral inward during collection, then form a rotating double helix with a moving
gold scan during analysis. Formations never advance on an animation timer. The
ghost has arms, blush, shiny eyes, blinks, waves, reaching motions and nods. The
analysis globe has a stronger 90%-opacity green grid and an opaque surface that
hides far-side graves and lines. Foreground comments do not participate in globe
occlusion and let pointer input through to the column.

The real backend status, clock, milestones, collected count and preview remain
authoritative. Illustration input never starts collection, changes polling or
scores, or simulates completion. Native page scrolling and text selection remain
available. Instructions and focus indication belong to the ghost itself.

Optional 3D code loads after 400 ms. Reduced motion starts with static SVGs;
activating the ghost opts in. Hidden tabs suspend all scene clocks and resume on
return; phase/layout changes do not stop the visible scenes. Graphics failure
keeps static art and the functioning report. Shared bounded geometry, a small
224px ghost renderer, native-resolution comments, a 1.25 pixel-ratio
cap on the other scenes, no shadows/post-processing/external models, and disposal
on unmount keep rendering bounded. The scene shares the homepage's Three.js code.
This feature deploys with the website; neither ingestion nor inference requires
redeployment.

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

The score card includes a collapsed **Score explanation** with the stored section
score components, cited usernames, supporting reasons, weights and sampling note. Detailed signal assessments stay
under detailed analysis. Formatting uses stored values and never recalculates scores. Findings, account signals and
detailed evidence share one white panel; coverage details and the original post
follow below it, in that order.

The header shows **How it works** on the homepage only; search and report routes
keep the home logo without the navigation link.

The evidence timeline scales from the earliest to latest plotted comment,
including a selected comment added to the visible sample. Hidden timestamps do
not stretch the axis; identical timestamps are centered. The chart labels when
its range covers only the displayed sample.

Completed reports retain the score card and white report panel within the shared
640px reading column when background animations are active. The evidence explorer
uses its container width to stack the visualization and selected comment when
space is limited, including on desktop. Animation styling only flattens
direct loading/error cards, not cards inside the finished report. The local
`/dev/report` preview uses the same completed-state animated background.

The discussion explorer is always visible directly after the original post and
before the findings. Finding Explore actions select its relevant view and scroll
back to it; no disclosure button is required.
