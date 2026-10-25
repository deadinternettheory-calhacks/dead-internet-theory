# Account-history review correction — 2026-10-25

## Observed failure

A read-only audit of retained hosted records found that the broad CREAO rubric
response omitted some sampled authors, while some replies marked all account
checks unknown. The assembler then used only measured brand/age rules for the
omitted accounts. The website discarded the API's unavailable-check list and
showed these incomplete zeroes as “0 / None found.” No source text, handles or
investigation identifiers are retained in this record.

## Change and checks

A focused direct Claude task now reviews every retrieved Reddit/X history when
Anthropic is configured, including discussions without recommendations. Its
schema and semantic check require each supplied author exactly once. Existing
histories and stage caching are reused; no extra scraper collection is requested.
The broader CREAO task skips duplicate account reviews. Account evidence is
restricted to that author's history/anchor IDs; no product context leaves brand
focus unknown. The frontend keeps unknown counts and sample size, shows incomplete
zeroes as Limited, and preserves genuine observed zeroes and ordinary-user signs.

Inference lint, 85 tests and demo checks passed; website lint, 166 tests and
production build passed. Tests cover complete/unique author coverage, bounded
retries, no-recommendation discussions, no-history/unsupported-platform skips,
cross-account citation rejection, unavailable context and retained-report display.

## Live provider verification

One focused Claude review reused a retained permitted Reddit discussion and its
histories. This did not submit or replace an existing report and started no new
Apify runs. Only non-content verification metadata was retained:

```json
{
  "platform": "reddit",
  "source": "existing retained histories",
  "authorsSupplied": 10,
  "authorsReviewed": 10,
  "previousAccountReviews": 1,
  "elapsedMs": 6962,
  "validSubmission": true,
  "accountsWithObservedSignals": 0,
  "accountsWithHumanSignals": 0,
  "limitedAccounts": 10,
  "newApifyRuns": 0,
  "reportSubmitted": false
}
```

Every supplied account was reviewed, compared with one account in the earlier
broad response. No positive signals were found in this sample; that is a valid
outcome. Some checks remained unavailable with bounded history/profile coverage.
This check proves the direct provider path and canonical assembled-payload
validation, not detector accuracy or a full fresh hosted collection run.

## Rollout

Deploy the reviewed inference commit, then change ingestion's result-cache epoch
to `account-history-2026-10-25a-rubric-0.4`. The ingestion code needs no redeploy.
Website deployment updates retained-report availability labels; a new submission
gets the focused review. Existing reports are not rewritten, and normal fixed
24-hour retention still applies.
