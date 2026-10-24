# Production direct Claude triage — 2026-10-24

The owner reported slow production analyses and confirmed that triage should call
Claude directly, with CREAO handling scoring. The existing worker already
implemented this split, but `ANTHROPIC_API_KEY` was present only in the private
setup inventory and missing from the inference deployment. Production therefore
used the existing CREAO triage fallback.

## Configuration correction

- Checked `grandiose-barracuda-22`: `hasAnthropicKey:false`, with CREAO configured.
- Verified the supplied Anthropic key and access to the existing default model
  `claude-opus-5-5` through Anthropic's authenticated models endpoint (HTTP 200).
- Uploaded only `ANTHROPIC_API_KEY` to the inference deployment using a private
  runtime-only env file, then deleted that temporary file.
- Read back `hasAnthropicKey:true`; the existing default model is unchanged.
  The worker uses the existing low-effort structured-output Messages API path.
- No inference jobs were active during the configuration change. New jobs use
  direct Claude triage. CREAO remains configured for scoring. No runtime code
  deployment, billing change or source-data migration was needed.

## Hosted verification

The owner's previously permitted YouTube video was submitted once through the
production website proxy, with a persistent anonymous owner session and
idempotency key:

- Investigation: `inv_1792884328941_e1w8rh7elrg`.
- 100 collected comments, 97 observed author nodes, partial coverage.
- Ingestion and analysis both reached `completed`.
- Observed total duration, including collection and validation readback:
  **150 seconds**. The earlier [CREAO-only check](2026-10-24-four-platform-hosted.md)
  of this video with the same comment cap took 321 seconds. These are individual
  observations; content, provider latency and model output can vary.
- The job progressed from `triage_start` to scoring within approximately
  75 seconds, including validation and scheduling. It stored validated triage
  output and a CREAO scoring run, with **no CREAO triage run**.
- Saved inference version:
  `dit-inference/0.2.0; rubric/0.3; prompts-2026-10-24d; claude:claude-opus-5-5+creao-app-trigger`.
- Independent readback passed canonical graph/analysis schemas, graph topology,
  recomputed fingerprint and analysis evidence-reference checks.

Inference typecheck, all 65 tests and generated-demo consistency passed. The
existing routing test verifies that supplying the Claude configuration starts
only a CREAO scoring run, while direct Claude triage uses structured outputs.
The setup guide now requires a secret-free runtime presence check so a key in
the private inventory is not mistaken for a deployed inference credential.

No source content or provider key was saved in this record or local verification
artifacts. Temporary verification authentication/session files were deleted after
readback. The hosted investigation, report and owned provider artifacts follow
the owner's existing 24-hour application retention and cleanup workflow.
