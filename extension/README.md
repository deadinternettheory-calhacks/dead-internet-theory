# Dead Internet Theory for Chrome

Manifest V3 side panel for the existing public-post analysis service. It reuses
the website's URL validation, API client, report/evidence components and animated
ghost. Analysis still runs on the configured Convex/Apify/Claude/CREAO pipeline.

## Install the ZIP

1. Extract `dead-internet-theory-chrome-1.0.4.zip` into a folder.
2. Open `chrome://extensions` in Chrome 123 or newer and enable **Developer mode**.
3. Choose **Load unpacked**, then select the folder containing `manifest.json`.
4. Pin the ghost icon in Chrome's extensions menu.

No provider keys, personal access tokens, or environment configuration are
needed. The default package calls `https://www.deadinternettheory.us`.
It is an unpacked package, not a Chrome Web Store publication.

## Upload to Chrome Web Store

Use **`dead-internet-theory-chrome-webstore-1.0.4.zip`** for the developer dashboard.
This ZIP has `manifest.json` at its root and omits the development-only `key`
field. The ordinary Chrome ZIP retains that key for stable Load unpacked installs.

Upload the Web Store ZIP to create a draft item, then copy its 32-letter Item ID.
Add that ID to `EXTENSION_CLIENT_IDS` in
[extension-client.mjs](../contracts/extension-client.mjs), deploy the website,
and verify the store version's connection before submitting it for review.
The client uses `chrome.runtime.id` automatically; no ID-specific rebuild is needed.
The API accepts only explicitly listed IDs. A draft upload alone does not enable
an unlisted store ID on the API.

The public privacy-policy URL for the listing is
`https://www.deadinternettheory.us/extension/privacy.html`. The website build
publishes this extension's `public/privacy.html` and `public/privacy.css` so the
hosted policy and subsequent packages use the same source.

## Use

Open a public Reddit, X, TikTok or YouTube post and click the toolbar ghost
(or Ctrl+Shift+Y / Command+Shift+Y). You can also right-click a supported post
link anywhere and choose **Analyze with Dead Internet Theory**. Review the link,
then press **Analyze post**. The secondary **Use Current Page** button directly
below Analyze post fills the URL input from the active Reddit post, TikTok video
or YouTube video (including supported short/share links). Home/profile pages and
unsupported URLs show an inline error without replacing the current input.
Selecting a link never starts collection by itself; manual entry, including X
links, and Open full report keep their existing behavior.

The panel shows real collection/analysis states and an optional collected-comment
preview. Closing it leaves the durable investigation running; reopening resumes
the saved ID. **Open full report** displays the same investigation in a packaged
extension tab and never submits a new post. The animated ghost responds to
clicks; reduced motion starts with static art, P pauses/resumes, Escape pauses,
and hidden documents suspend motion and polling.

Already-completed initial lookups use the website's saved-result presentation:
five seconds **Fetching comments**, then five seconds **Analyzing the discussion**, then the report. This applies to cached submissions and completed
investigations opened or resumed in the panel/report tab. Progress uses the same
generic copy as live work, the comment preview appears in the second stage, and the ghost follows
both phases. Each mounted view keeps its original presentation deadlines across
background-tab suspension; returning to an already displayed report does not
replay the sequence. Live work observed in progress keeps its real timing.
Failed reads show their error immediately. This presentation adds no collection
or inference work and does not extend the original retention deadline.

Pending requests disable repeat submissions of the same link. A connection
retry uses the original idempotency key; known investigation IDs resume with GET
requests. Provider limits, platform availability, result reuse and the existing
fixed 24-hour server retention remain authoritative.

## Build and check

Install the website's dependencies first because shared components resolve their
types and dependencies there. Use Node 22 or newer:

```sh
cd web
npm ci
cd ../extension
npm ci
npm test
npm run package
```

`npm run build` typechecks and writes the unpacked package to `extension/dist/`.
`npm run package` also validates package entries and writes unpacked and Web Store
ZIPs, each with a SHA-256 checksum, under the ignored `output/` directory.
`npm run package:webstore` writes only the store-upload ZIP. Generated packages,
browser profiles and credentials do not belong in Git. `art/ghost.svg` is the
source for the committed PNG toolbar icons.

The manifest's public key pins the unpacked ID to
`nodkcggcbpiolpkphjkfedhlmaallhnb`. This must match the canonical public client ID
in [extension-client.mjs](../contracts/extension-client.mjs). The store ZIP omits
the public key so Chrome assigns the listing's identity. Add the assigned ID to
the proxy allowlist before review; use the store public key for local testing
if needed. Changing an installed identity or removing extension storage
also removes access to that anonymous session's saved investigation IDs.

## Sessions, storage and permissions

[browser-extension.md](../contracts/browser-extension.md) defines the transport;
v1 payloads remain in the existing canonical contracts. A random anonymous nonce
is kept in trusted extension local storage, hashed into an owner by the website
proxy, and exchanged server-side for the normal short-lived frontend JWT. No
backend signing secret or provider key reaches the package.

The worker serializes session and metadata writes across panel/report tabs, so
first-use races do not create different owners. It stores at most ten links,
idempotency keys, IDs and expiry times. Alarms and startup remove expired metadata;
source graphs and report contents are held only in the view's memory. **Clear
saved links** removes local metadata without canceling backend work. The anonymous
credential persists until uninstall/storage deletion. The packaged
[privacy disclosure](public/privacy.html) describes the full data path.

Permissions: `activeTab`, `tabs`, `sidePanel`, `contextMenus`, `storage`, and `alarms`.
The `tabs` permission supplies the active tab URL when Use Current Page is
clicked, including after switching tabs with the panel open; it does not add
page monitoring. Host access is limited to the website API origin. There are no content scripts,
persistent social-site permissions, remotely loaded scripts, or browser scraping.

## Deployment

This feature requires the website deployment containing the extension session
transport. Neither ingestion nor inference needs redeployment. Load/reload the
ZIP's extracted folder after updating the package. Chrome Web Store submission
requires a developer account, public privacy URL, listing assets and review;
this repository does not publish the extension automatically.
