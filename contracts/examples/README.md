# Synthetic contract fixtures

Every example is fabricated and must not be described as scraped real data.

- `graph.json`: immutable Reddit discussion graph with one root, three authors, three comments and typed edges.
- `investigation.json`: completed ingestion and pending analysis.
- `investigation-ready-event.json`: backend-to-inference at-least-once event.
- `enrichment-request.json`: batched author/anchor selections; request exactly ten samples per author.
- `enrichment-completed.json`: two author results, including one time-window fallback and one empty/partial result.
- `enrichment-unsupported.json`: YouTube author history not supported; no provider run attempted.
- `analysis-submission.json`: scores, counts, evidence, clusters and analysis-only edges.
- `analysis-resource.json`: persisted submission.
- `capabilities.json`: best-effort per-platform capability hints.
- `error.json`: standard error envelope.

The files are consistent with the schema and each other; see `../../scripts/validate_contracts.py`.
