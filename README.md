# Dead Internet Theory

## Product model

Dead Internet Theory is a consumer protection tool for people researching a
product, service, or company through social media. Its purpose is to help people
inspect potentially coordinated promotion before treating a comment section as
independent advice.

Paste a public Reddit, X, TikTok, or YouTube post. The report brings together
recommendation language, repeated patterns, timing, commercial signals, and
available account context so the reader can examine what sits behind apparent
agreement. Findings lead back to the comments and evidence that support them.

The consumer is the user: someone deciding what to buy or which recommendation
to trust. The product's value is making that decision easier to investigate.
A useful result explains a pattern, shows its context, and makes gaps in the
evidence visible. A discussion with little usable evidence should leave the
reader with that limitation, rather than false reassurance.

The scores are experimental, uncalibrated indices. They do not establish that
an account is a bot, a recommendation was paid for, or a company manipulated a
discussion. Consumer protection is the product's purpose; improved decisions
and reduced harm still need to be evaluated.

## Data path

1. **Submit a link.** The browser validates the supported URL and sends it through
   the website's same-origin server proxy. The proxy issues a short-lived token
   scoped to the visitor's anonymous session; the backend validates the request
   again. The browser does not scrape the source platform.
2. **Collect the discussion.** The ingestion backend creates a durable job and
   invokes pinned Apify Actors. Adapters normalize the retrieved post, comments,
   authors, and reply relationships into an immutable discussion graph, keeping
   source references, retrieval metadata, and coverage limits. A compatible
   retained result can be reused; concurrent submissions can join existing work.
3. **Read comments in context.** Once the graph is ready, the backend sends an
   authenticated event to the separate inference service. The worker reads the
   graph and sends a bounded packet of source text to Claude for the subject,
   each comment's stance and product recommendations, and text-realism judgments.
   CREAO handles triage when direct Claude configuration is absent.
4. **Request sampled history.** Inference selects a reproducible random sample
   of supportive and unsupportive authors and asks ingestion for bounded public
   histories. This enrichment is supported for Reddit and X. Missing, partial,
   or unsupported history remains explicit; it is not evidence against an account.
5. **Assess the evidence.** Code measures timing, overlap, commercial patterns,
   and available history signals. When recommendations exist, a CREAO agent
   receives their bounded context, measurements, and rubric, and returns proposed
   rule matches with evidence IDs. Code filters unsupported matches, computes
   rubric scores and comment/account/section indices, and validates the analysis
   against the canonical contract and referenced evidence.
6. **Store and show the report.** Inference submits the validated analysis to the
   ingestion backend. The frontend polls through the proxy and renders the stored
   report, evidence, and coverage. Each browser has its own scoped investigation
   view. Live application records have a fixed 24-hour expiry; reuse does not
   extend it. Owned Apify resources enter a deletion queue with retries. Provider
   internal copies and backups have separate retention controls.

See the [integration guide](backend/INTEGRATION.md),
[inference workflow](inference/README.md#how-an-analysis-runs), and
[retention policy](backend/RETENTION.md) for the detailed boundaries.

## Implementation

| Component | Responsibility | Setup and checks |
| --- | --- | --- |
| `web/` | React/TypeScript/Vite frontend and Vercel server proxy. | [Frontend guide](web/README.md) |
| `backend/` | Convex API, Apify adapters, durable collection/enrichment jobs, graph and analysis storage, reuse, and retention. | [Backend guide](backend/README.md) |
| `inference/` | Separate TypeScript/Convex coordinator, direct Claude triage, CREAO scoring agent, deterministic scoring, and evidence validation. | [Inference guide](inference/README.md), [agent setup](inference/creao-agent.md) |
| `contracts/` | Canonical shared models, HTTP operations, and synthetic contract examples. | [Contract validation](contracts/README.md) |
| `rubrics/` | Proposed recommendation-assessment rules; not a validated detector. | [Product astroturfing rubric](rubrics/product-astroturfing.md) |

### Verified behavior

Checked-in records document scoped hosted investigations for
[Reddit, X, TikTok, and YouTube](backend/verification/2026-10-24-four-platform-hosted.md),
including [direct Claude triage with CREAO scoring](backend/verification/2026-10-24-direct-claude-triage.md)
and [retained-result reuse](backend/verification/2026-10-25-url-performance.md).
X is limited by the current Apify Free-plan demo limits. Video-platform analysis
uses observed text, not audiovisual content. The form reads live backend
availability; successful checks do not guarantee exhaustive collection or
future provider availability.

The `/example` walkthrough replays a completed analysis of a real TikTok product
video's comments with usernames and comment identifiers replaced and recorded
Claude/CREAO replies. It does not start fresh collection. This public example has an approved
[retention exception](backend/RETENTION.md#public-example-exception).

### Development and project references

Read [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md), and the relevant
sections of [SPEC.md](SPEC.md) before working. Component guides above contain
setup and check commands. Shared models live in
[models.schema.json](contracts/models.schema.json); HTTP operations live in
[openapi.yaml](contracts/openapi.yaml).

[SPEC.md](SPEC.md) is the canonical specification. Changes that contradict an
established requirement follow the approval and timestamped
[delta workflow](deltas/README.md) in the contribution guide. TBDs and placeholders
are unfinished documentation, not established requirements.

For the demo script, sponsor relevance, and judge questions, see
[Cal Hacks pitch preparation](docs/calhacks-pitch.md).
