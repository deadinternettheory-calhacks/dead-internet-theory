# Approved delta: comment realism and commercial signals

Date: 2026-10-25 00:40 UTC
Status: Requested by the owner after a TikTok report scored 93 from lopsided
praise alone while missing seller accounts, template phrases ("This winning
product changed my momentum") and copied praise: "make these changes",
"consider the realism of the comment … and also the username. Give us an
estimate of how astroturfed they are", "Rate from 0/100 and use as other
scoring sections".
Canonical specification: [SPEC.md](../SPEC.md)
Baseline: `main` at 86dcdf9
Scope: inference triage, signals, assembly and section score; contract
(optional field); web report. No breaking change.

## Previous and revised requirements

| Area | Previous | Revised | Rationale |
| --- | --- | --- | --- |
| Section score | Rubric 40, coordination 25, history 25, one-sided 10, renormalized; one-sided alone could set the score. | Comment realism 35, coordination 20, commercial signals 20, rubric 15, history 10, renormalized; one-sided support adds at most 10 points and only when the rest reach 15. | Lopsided praise is normal under product posts. |
| Triage | Only comments naming a product were recommendations. | Praise of, or wanting, the product shown in the post counts; price/link questions do not. Each comment also gets `realism` (natural, generic, unnatural). | Video comments rarely name the product. |
| Per comment | Rubric score for recommendations only. | `astroturfEstimate` 0-100 for every comment with text: the larger of its rubric score and points for unnatural (35) or generic (10) text, seller (30), random (15) or default (10) usernames, template phrase (30), store-owner outreach (25), copied praise (10), with reasons. | Requested; works without histories. |
| Thread | Not measured. | Seller-style accounts among supporters, template phrases, outreach and copied short praise, measured in code; they also stand in for the promotional-intent and similar-wording sections when stronger than the rubric. | Clear evidence on video threads. |
| Rubric scoring | Every recommendation scored. | At most 25 (flagged and most detailed first). | Keeps large threads fast. |
| Report | Signals from the six axes. | Adds "Comment realism" with a 0-100 score, a "Comments read like promotion" finding, per-comment estimates with reasons, and hides empty comments. | Requested. |

## Compatibility and migration

`astroturfEstimate` is optional on an object that already allowed extra
fields, so v1.0.0 stays compatible. Triage `realism` is optional in recorded
replies. Section scores change meaning again and are not comparable with
earlier analyses.

## Preserved contracts

Estimates are uncalibrated indices, not probabilities; no comment or account is
called a bot; evidence references are validated; retention is unchanged.

## Superseded decisions and open questions

Supersedes the ADR-010 weights. All weights, phrase lists and username patterns
are hand-chosen heuristics without labeled data; default and random usernames
are common among real users and carry low weight.

## Architecture decision log

SPEC 13.4: ADR-013 added.

## Validation and evidence

Inference lint and tests (signals, username patterns, estimates, one-sided
bonus); contract validator; web lint, tests and build; a live run on the TikTok
thread with Claude triage and CREAO scoring (see the PR).
