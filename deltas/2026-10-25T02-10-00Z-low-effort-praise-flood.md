# Approved delta: low-effort praise flood and copied praise

Date: 2026-10-25 02:10 UTC
Status: Requested by the owner after a TikTok night-light video
(@goodstuffdiary) with dozens of one-word praise comments, shop accounts and
word-salad bot comments scored 46: "Fix scoring so that this is about an 80".
Canonical specification: [SPEC.md](../SPEC.md)
Baseline: `main` at 6611cc2 plus the no-history delta on the same branch
Scope: inference thread signals, per-comment estimate and section score;
inference README and pitch notes. No contract change.

## Previous and revised requirements

| Area | Previous | Revised | Rationale |
| --- | --- | --- | --- |
| Section weights | Comment realism 35, coordination 20, commercial 20, rubric 15, history 10. | Comment realism 30, low-effort support 15, coordination 15, commercial 20, rubric 10, history 10 (renormalized; one-sided bonus unchanged). | Thread-wide patterns were not measured. |
| Low-effort support (new) | — | Share of supportive comments of three words or fewer or generic praise, plus nonsense filler, mapped 50% → 0 to 90% → 1; needs 10 supportive comments. | Floods of "nice", "good", "wow". |
| Copied praise | Only the largest identical phrase counted, inside commercial signals. | Every short phrase posted by 2+ accounts counts; the share of supportive comments in them (30% counts fully) feeds coordination as the larger of it and the best recommendation cluster, and no longer commercial signals. | 31 copied comments were seen as 10. |
| Shop accounts | Only praising shop-named accounts; narrow name list. | Any non-critical shop-named account; names also match trends, picks, gadget, drop, online, digital, tools, producto/products. Outreach also matches online-store and dropshipping talk. | Missed obvious drop-shipping accounts. |
| Per-comment estimate | Non-endorsing comments only scored for outreach. | Nonsense filler (unnatural text, no stance, not about the product) adds 30 and lets the username count. | Word-salad bot comments scored 0. |

## Compatibility and migration

No wire change. Section scores change meaning again. Bump the backend
`RESULT_CACHE_VERSION` after deploying inference.

## Preserved contracts

v1.0.0 contracts; rubric rules and caps; one-sided bonus rule.

## Superseded decisions and open questions

Updates ADR-013's weights. Open: genuine viral product videos also attract
short praise, so low-effort support may raise scores on real threads; no
labelled TikTok data exists to calibrate it.

## Architecture decision log

ADR-015 added in SPEC.md.

## Validation and evidence

The @goodstuffdiary thread re-run locally (production triage model, CREAO
scoring) and re-assembled: 79 (was 46 on hosted, 64 before the coordination
change). The earlier @airlandolists TikTok thread: 85 (was 73). Synthetic
espresso fixture 67 (was 69); real Reddit knife example 0. Unit tests for
copied phrases, flood, filler, shop names. Not calibrated.
