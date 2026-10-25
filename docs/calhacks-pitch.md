# Cal Hacks 13.0 pitch and sponsor plan

Prepare around one promise: **Check the conversation before you trust the recommendation.** Dead Internet Theory helps someone researching a purchase examine the comments behind apparent consensus, with visible evidence and coverage limits.

This is pitch preparation against `main` at `f6e6c2b`, not a change to product scope or a claim of prize eligibility. Runtime statements below come from checked-in verification records, not a new live run during this review.

## Positioning

**One sentence:** Paste a public social post and inspect the recommendation patterns, commercial signals, and available account context behind its comment section.

**Opening question:** “Have you ever added ‘Reddit’ to a product search because you wanted advice from real people? How do you know the agreement you found is independent?”

**Audience for the main pitch:** People using social discussion to research a purchase. For Anthropic, propose a narrower community such as Cal Poly students using r/BuyItForLife to choose durable essentials on a budget; use that community only after talking to people who actually do this.

**Why this is useful:** A source-backed report makes patterns inspectable without requiring the reader to manually compare comments, reply chains, timestamps, and sampled histories. Helping people evaluate a recommendation is the immediate value. Better purchase decisions and restored trust are intended outcomes, not measured results.

**What makes the demo memorable:** Move from a section-level index to one comment, its explanation, and the source or context behind it. Give judges a concrete reason they can examine and question. Use whichever finding the selected report actually supports, including an ordinary explanation or insufficient evidence.

## Two minute pitch

Approximately 240 words. Rehearse with the actual clicks; the time windows include the demonstration.

**0:00–0:20 — Problem**

“When I want an honest product recommendation, I search Reddit. But a comment section can look like a room full of independent people even when its recommendations share suspicious patterns. Reading every comment and checking account histories is more work than most people can do before buying something.”

**0:20–0:40 — Start the flow**

“We built Dead Internet Theory. You paste a public post from Reddit, X, TikTok, or YouTube. It collects a bounded discussion and turns it into a report you can inspect. Here’s the post we’re checking, and here’s what we were able to collect.”

[Submit a prepared permitted URL. Show genuine progress or disclose that an existing result was reused.]

**0:40–1:15 — Show the evidence**

“While that runs, this is a completed analysis of a real Reddit thread, with names hidden. Start with the comment-section index, then open a comment and its reasons. We compare recommendation language, repeated patterns, timing where available, and sampled public account history. You can inspect the evidence instead of taking a generated verdict on trust.”

[Open one finding and its context. Name only the signals actually present.]

**1:15–1:40 — Explain the engineering**

“Apify collects the discussion. Convex coordinates collection, analysis, and stored results. Claude reads comments in their reply context; CREAO handles recommendation scoring. Our code recomputes rubric scores and validates that the evidence references exist before storing the report.”

**1:40–2:00 — Close**

“The index is experimental. It is not the probability that someone is a bot or was paid. Missing history stays missing. We want people to leave with a better question to ask about a recommendation and the evidence to investigate it. Check the conversation before you trust the recommendation.”

## Three minute version and demo order

The guide recommends preparing two minutes and requires a live demo (printed pp. 7–8). The current [Devpost requirements](https://cal-hacks-13-0.devpost.com/) list three minutes to pitch plus two minutes for questions, and accept a recorded or live demonstration. Prepare the two-minute core, add the minute below when allowed, and bring both a working live flow and a recording.

| Time | Action | What it establishes |
| --- | --- | --- |
| 0:00–0:40 | Hook, paste the permitted URL, show collected coverage. | A concrete user task and a working entry point. |
| 0:40–1:15 | Open `/example`, disclose stored real-thread replay, inspect one reason. | A reliable explanation during an unpredictable cold run. |
| 1:15–2:00 | Explain the pipeline and index limits. | Engineering depth and a defensible interpretation. |
| 2:00–2:25 | Return to the submitted investigation; show the report if ready. | Fresh execution, or an honest in-progress state. |
| 2:25–2:45 | Show source context, missing history, or a benign counterexample. | The report can be questioned and does not equate missing data with guilt. |
| 2:45–3:00 | One sponsor-specific line and the close. | Why this particular integration or impact matters. |

If the run is still pending, keep it visible and use the completed report for inspection. A recording can show the full cold path with its elapsed time disclosed. Do not time a reused report as fresh inference. Do not promise a live CREAO run on a discussion without recommendations: that path correctly skips scoring.

The public `/example` is now a stored real TikTok product video's comment section (a foldable night light) with usernames replaced by made-up names of the same kind, replaced comment identifiers and recorded model replies. It is not synthetic, fresh collection, or confirmed ground truth for astroturfing. The synthetic espresso case remains a test fixture. Older verification notes describing a synthetic public example predate this change; use [the current example implementation](../web/src/pages/ExamplePage.tsx), [fixture provenance](../inference/README.md#website-example-and-test-fixtures), and [retention exception](../backend/RETENTION.md#public-example-exception).

## Sponsor priorities

These are fit assessments. The guide says criteria can change. Check the final entry requirements before selecting tracks. The strongest existing technology fits are **Apify, Convex, CREAO AI-First Disruptor, and Anthropic**; **Microsoft** is a strong product/engineering fit. **Visa** has a credible shopping angle. **Meta and Armadin** need a more careful fit argument.

### Apify — Best Use of Apify

**Priority: primary.** Collection is essential: pinned Actors retrieve public discussions and available histories, then adapters normalize them into a graph while preserving omissions. This is a direct match for the guide's meaningful-use requirement (p. 16).

**Sponsor line:** “Apify turns a public discussion link into the bounded evidence our investigation can actually analyze.”

**Show:** A real Actor run, collected counts, source platform, and the resulting report. Explain partial coverage, provider limits, and owned-resource cleanup. Have a metadata-only run view ready; keep credentials out of the demo.

**Separate award:** Best Actor requires building an Actor for the event. The current reviewed adapters use third-party Actors. Using them supports Best Use of Apify; it does not establish a Best Actor entry. A custom Actor would need its own implemented and demonstrated value.

### Convex — Best use of Convex

**Priority: primary.** Convex runs the ingestion API, persisted graphs, durable jobs, analysis coordinator, scoped result access, reuse, and retention. It is the application backbone rather than a spare database. The guide leaves criteria pending; the [current Devpost listing](https://cal-hacks-13-0.devpost.com/) now names substantive Convex features and lists a $5,000 cash prize, replacing the guide's hardware listing.

**Sponsor line:** “Convex keeps a multi-provider investigation durable from URL submission through validated analysis, and lets repeated links reuse the retained result.”

**Show:** The investigation progressing across persisted stages, its stored validated result, and reuse without another collection/model run. Explain fixed expiry and separate browser ownership. The frontend polls the HTTP API: do not describe it as a demonstrated Convex live-query subscription. Demonstrate the features we use rather than claiming every feature listed by the sponsor.

### CREAO — Best AI-First Disruptor

**Priority: primary.** The [current CREAO guide](https://community.creao.ai/CalHacks2026) requires the run share link and agent ID in the Devpost README, selection of the CREAO track, and a demo showing the agent at work. The project's references are in the [README submission section](../README.md#cal-hacks-130--creao-submission). Best AI-First Disruptor asks for a product that depends on the agent's output.

**Sponsor line:** “CREAO performs the recommendation assessment, and the application validates and re-scores the returned rules.”

**Show:** A discussion with recommendations, its CREAO agent run, and the corresponding stored assessment. Explain how the application validates the agent's evidence references and recomputes final rubric scores. Use the shared run and agent ID in the README as the submission references. Retained results reuse earlier work.

**Other CREAO awards:** Team Empowerment is plausible only with a demonstrated workflow for a real reviewing team; the current single-user utility is weaker evidence. One-Person Company needs an independently supported business/operator story and its actual category rules; do not infer eligibility from the award name or reframe a team build as a solo build. AI-First Disruptor is the clearest present fit.

### Anthropic — Claude for Public Benefit

**Priority: primary once user evidence is ready.** The guide asks for a named community, a lived or researched problem, a usable solution, and thoughtful Claude use (p. 17). Claude performs actual contextual triage, including the product being discussed and a comment's stance in its reply chain. The public-benefit case is helping a defined community inspect recommendations.

**Sponsor line:** “Claude reads the recommendation in context; the report makes its supporting evidence inspectable and keeps the final decision with the reader.”

**Show:** One contextual classification, a benign alternative, and the link from the assessment to its evidence. Prepare a concrete failure case: enthusiastic fans, repeated product names, seller-like usernames, generic praise, and new accounts can all be legitimate. Deterministic validation catches invalid references; it cannot establish that an interpretation is true.

**Needed before entry:** Talk to members of the chosen community. Record the decision they struggle with, how they check recommendations now, and whether the report helps them find a useful source or reason. Do not invent interviews, adoption, or benefit measurements. A small timed comparison of manual evidence-finding versus using the report can measure usability, not detection accuracy.

### Microsoft — Built for the Real World and Customer Impact Award

**Priority: strong secondary; submit if final rules match.** The guide emphasizes a useful AI agent, customer understanding, measurable value, responsible design, a path to production, and end-to-end functionality (p. 16). It states no Azure requirement. Our durable pipeline and deployed flow fit that theme; a specific user and measured utility will strengthen it.

**Sponsor line:** “This is a deployed investigation workflow with bounded collection, validated model output, recoverable orchestration, reusable results, and explicit data expiry.”

**Show:** One complete permitted investigation, an access/coverage limit, and one measured user task. Bring a short next-step plan: evaluate false positives on labeled cases, verify provider data controls, and improve failure visibility. The inference README records a current limitation: after terminal inference failure the backend can remain visually running because v1 has no failure-report route. Do not claim every failure is cleanly surfaced.

### Visa — Reimagining Shopping

**Priority: credible secondary when the demo is about a purchase.** The guide scores shopping innovation, experience, technical execution, commerce impact, and trust/responsibility (pp. 16–17). Nothing printed there requires payments or a Visa API. Recommendation research is part of shopping, so a knife or durable-essential purchase is a natural demonstration within existing scope.

**Sponsor line:** “We help shoppers inspect the social proof behind a purchase before they spend their money.”

**Show:** Research question, discussion, evidence, then what the shopper would check next. Measure clarity or time to inspect a claim. Improved conversion, loyalty, savings, or merchant outcomes are hypotheses until measured. Confirm any additional sponsor rules before entry. Keep the narrative about informed decisions rather than identifying fraudulent sellers.

### Meta — Bringing People Closer Together with AI

**Priority: conditional.** The guide asks whether AI meaningfully strengthens human connection (p. 10). Helping people find trustworthy peer advice is relevant, but detecting suspicious patterns alone does not establish stronger connection.

**Sponsor line:** “We want people to stay open to useful advice from other people while having a way to question suspicious consensus.”

**Needed:** A concrete example where context preserves a legitimate human recommendation and helps a reader engage with it. Avoid a pitch that makes every participant look suspect. Confirm the separate Round 2 eligibility conditions. This is weaker than our four direct technology fits.

### Armadin — Best Security Hack

**Priority: verify before spending pitch time.** The guide leaves the rubric pending (p. 11). Coordinated promotion can resemble social engineering and information manipulation, but this is a consumer research tool rather than a verified security detector. Ask whether the sponsor includes that threat model. Show a concrete supported pattern if accepted; do not claim payment, malicious intent, or fraud from the index.

## Tracks to leave out of the current submission

| Track | Why it is not a present fit |
| --- | --- |
| Elastic | Retrieval is planned, not implemented. The current listing specifically names Elastic Agent Builder on Serverless; a graph visualization does not satisfy that. |
| Bright Data | The public-web-data use case fits, but the evidenced provider is Apify. No Bright Data integration is established. |
| Factory Droid | Guide requires meaningful Droid SDK work inside the running product; coding assistance alone does not qualify. |
| Fetch.ai, Coinbase x402 | No demonstrated Fetch agent or paid protocol flow. |
| Capital One Nessie, CRS, Hyphenate finance | No banking/credit sandbox or autonomous finance workflow; checking purchase advice does not create one. |
| Cartesia, Moss | No core voice or Moss integration. |
| Bitdeer | No Model Studio integration. |
| SpacetimeDB | Convex is the selected backend; no meaningful SpacetimeDB state is demonstrated. |
| Figma, Notability, Mana | Only consider if the team has actual qualifying workflow artifacts. Repo review does not establish their use. |
| SpaceXAI | No space-data product or demonstrated qualifying tool/API workflow. Guide and current listing also differ on the API condition. |

For general prizes, the best narratives are People-First Social Impact, Technical Complexity, and overall consideration. Show the evidence workflow and one clear user benefit. Hardware and Planet-First do not match the present build; beginner/solo categories depend on actual team eligibility.

## Claims and judge questions

| Likely question | Defensible answer |
| --- | --- |
| “Is 80 an 80% chance of manipulation?” | No. These are hand-weighted, uncalibrated indices. Comment/account estimates also lack probability calibration. The section index supports inspection and needs evaluation against labeled cases. |
| “What is AI doing that rules cannot?” | Contextual interpretation of comments, subject and stance, and recommendation assessment. Code measures defined patterns, recomputes rubric scores, and checks references. Both semantic judgments and rule choices can be wrong. |
| “What makes this more than an LLM wrapper?” | Bounded ingestion, graph provenance, selective history enrichment, durable execution, deterministic scoring, evidence validation, retained-result reuse, and source-linked inspection. |
| “Does this prove astroturfing?” | No. It highlights observations consistent with several explanations. It does not verify sponsorship, identity, bot status, or intent. |
| “Which platforms work?” | Scoped hosted records exist for Reddit, X, TikTok, and YouTube. X has Free-plan demo limits, histories vary, and the video paths analyze observed text rather than audiovisual content. Recheck availability before judging. |
| “How fast is it?” | A recorded 100-comment Reddit cold run took 55.4 seconds and skipped CREAO scoring. A separate YouTube run including CREAO scoring took 150 seconds. Reuse readbacks were under a second. These are individual checks, not guarantees or equivalent workloads. |
| “Is it accurate?” | No validated accuracy study yet. Operational/schema checks establish a functioning pipeline, not detection quality. Next is a labeled evaluation with benign fan communities and commercial discussions, reporting false positives and separating related discussions across evaluation splits. |
| “What do you keep?” | Live application records have fixed 24-hour expiry; owned Apify artifacts have a deletion queue with retries. Provider internal copies/backups have separate controls. The anonymized public example is an approved longer-lived exception. |

Current section weights in [section.ts](../inference/convex/lib/inference/section.ts) are comment realism 30%, low-effort support 15%, coordination (including copied praise) 15%, commercial signals 20%, recommendation rubric 10%, and history contrast 10%, renormalized over measurable parts. One-sided support adds at most ten points after a minimum base threshold. These are design choices, not learned or validated weights; see the mapping table in `inference/README.md` and ADR-015.

## Preparation before judging

1. Choose one permitted purchase discussion with an inspectable finding and one ordinary counterexample. Open both reports before judging and note their fixed expiry. Do not choose solely for a dramatic score.
2. Rehearse the cold flow, stored replay, and reuse separately. Capture a short recording of a real run with elapsed time visible. Prepare a CREAO-scored case for CREAO judges.
3. Interview the chosen community and measure one evidence-finding task. Keep the result scoped to those participants and that task.
4. Keep metadata-only proof of the Apify run, CREAO scoring run, and Convex state transitions ready. Show no credentials, private dashboards, or extra source content in public artifacts.
5. Prepare a project image, repository link, concise demo video, and accurate Devpost technology/track descriptions. The published deadline is Sunday, October 25 at 9:00 a.m. Pacific; the guide schedules judging 10:30 a.m.–12:30 p.m. and requires the team at its table. Confirm the final schedule with organizers.
6. Select primary tracks first; confirm CREAO details and conditional tracks before entry. This plan does not submit, publish, or contact sponsors.

## Sources and verification boundaries

- Supplied **13.0 Hacker Guide-2.pdf**, printed pp. 7–18 (PDF physical pages 8–19): judging and sponsor criteria. Local source: `/Users/nkuhanas/Downloads/13.0 Hacker Guide-2.pdf`. Its table of contents is offset; the printed page numbers above refer to the page footers.
- [Cal Hacks Devpost](https://cal-hacks-13-0.devpost.com/): current track names, Convex update, pitch timing and submission requirements, checked during preparation. The guide's two-minute recommendation and live-demo instruction differ from this listing; prepare to satisfy both. [Hive prizes](https://hive.hackberkeley.org/prizes) rendered only a loading state to the text reader.
- [CREAO detailed track page](https://community.creao.ai/CalHacks2026): linked by the guide, inaccessible to the web reader during preparation. Full category eligibility remains to confirm.
- [Current specification](../SPEC.md), particularly Sections 1–4, 8–12 and ADR-009 through ADR-013. Some older status paragraphs, including the sponsor table, lag current verification; this brief does not revise established requirements.
- [Four-platform hosted verification](../backend/verification/2026-10-24-four-platform-hosted.md), [direct Claude and CREAO check](../backend/verification/2026-10-24-direct-claude-triage.md), and [URL performance and reuse verification](../backend/verification/2026-10-25-url-performance.md): scoped runtime evidence, not a fresh availability check or score-quality study. The last record is dated October 25 UTC, which falls on October 24 Pacific.
- [Inference implementation notes](../inference/README.md), [current section scoring](../inference/convex/lib/inference/section.ts), [example implementation](../web/src/pages/ExamplePage.tsx), and [retention policy](../backend/RETENTION.md).
