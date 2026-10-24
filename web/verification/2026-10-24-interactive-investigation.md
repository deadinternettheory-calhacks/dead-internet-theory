# Interactive investigation verification — 2026-10-24

Integrated with `main` at `fa9aa0b` (random history sampling and the prominent
comment-section index). Preserves that scoring behavior and its explanation;
no provider, wire-contract, retention or inference changes are included.

## Automated checks

- Node 22: frontend typecheck, 79 tests and production build pass.
- Canonical contract validation passes: 39 schema definitions, seven HTTP paths,
  fixture integrity, history sampling and evidence consistency.
- New checks cover playback, pause/replay/skip, hidden tabs, offscreen evidence,
  reduced motion, keyboard-compatible controls, literal Unicode phrase matches,
  escaped untrusted content, missing timestamps/histories, larger discussions,
  source-link restrictions, real progress milestones and expandable previews.
- The existing globe drag/inertia tests remain green.

## Browser checks

Headless Chromium, using the production build through Vite preview:

- Inspected the homepage, walkthrough, selected evidence, report and waiting
  screen at 1440 × 1000 and 375 × 812. All four evidence modes also fit 320 × 812
  with document width equal to viewport width.
- Homepage demo entry works with Enter. Comment buttons work with keyboard
  activation and update the selected quote. A native picker opens comments
  beyond the map's 12-node limit; selected dated comments remain on the timeline.
- Checked the synthetic case's actual 13-minute span across three cited comments,
  six history outcomes, partial-sample state and section index of 63.
- Skipping opens the complete report. The synthetic label remains visible while
  scrolling. Mobile controls move between evidence and the selected comment.
- Reduced motion starts the walkthrough manually, leaves the globe as its SVG
  poster (zero canvases), and disables CSS motion. Normal navigation invokes the
  native globe view transition in supporting Chromium.
- The walkthrough and its complete report made **zero analysis API requests**.
- A separate, intercepted synthetic API scenario exercised queued collection,
  collection, analysis and completion. It made one create request, no graph
  request while queued, one graph request for the collected preview, and another
  when loading the finished report. Expanding the preview made no requests.
  Provider calls were never made.

Local screenshots are in the ignored `output/playwright/demo/` directory,
including `final-home-desktop.png`, `final-home-mobile.png`,
`final-demo-desktop.png`, `final-selected-comment-mobile.png`,
`progress-desktop.png` and `progress-mobile.png`. All depicted content is
synthetic. Visual inspection caught and corrected a dashed SVG line rendering
issue before merge.

## Limits

The existing separately loaded Three.js renderer still produces Vite's large
chunk warning and Three's Clock deprecation warning. Browser checks cover
Chromium, not physical devices or every browser. These frontend checks do not
establish live provider performance, score calibration or detection accuracy.
