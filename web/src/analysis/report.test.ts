import { describe, expect, it } from 'vitest';
import { exampleData } from '../demo';
import { testDemo } from '../test/fixtures';
import { buildReport, buildThreadPreview, verdictFor } from './report';

describe('analysis report', () => {
  const report = buildReport(testDemo.analysis, testDemo.graph, testDemo.enrichments);


  it('leads with a cautious verdict and at most three findings', () => {
    expect(report.verdict.tone).toBe('high');
    expect(report.findings.length).toBeLessThanOrEqual(3);
    expect(report.findings[0].evidence.length).toBeGreaterThan(0);
  });

  it('resolves evidence from both the discussion and account histories', () => {
    const sources = new Set(report.findings.flatMap(f => f.evidence.map(e => e.source)));
    expect(sources).toEqual(new Set(['discussion', 'history']));
  });

  it('lists recommendations first and keeps every analyzed comment', () => {
    expect(report.comments).toHaveLength(testDemo.analysis.result.commentAssessments.length);
    expect(report.comments[0].isRecommendation).toBe(true);
  });

  it('reports coverage and history outcomes', () => {
    expect(report.coverage.analyzed).toBe(8);
    expect(report.coverage.histories).toBe('6 account histories requested: 5 complete, 1 partial.');
  });

  it('preserves the original collection time when an existing report is reused', () => {
    const collectedAt = '2026-10-24T08:00:00Z';
    const stored = buildReport(testDemo.analysis, { ...testDemo.graph, coverage: { ...testDemo.graph.coverage, collectedAt } }, testDemo.enrichments);
    expect(stored.coverage.collectedAt).toBe(collectedAt);
  });

  it('keeps every axis citation available even when findings share quotes', () => {
    const semantic = report.axes.find(x => x.axis === 'semantic_coordination')!;
    const temporal = report.axes.find(x => x.axis === 'temporal_coordination')!;
    expect(semantic.evidence).toHaveLength(3);
    expect(temporal.evidence.map(e => e.id)).toEqual(semantic.evidence.map(e => e.id));
    expect(report.discussion).toHaveLength(8);
    expect(report.histories).toHaveLength(6);
    expect(report.histories.find(h => h.status === 'partial')?.comments).toHaveLength(6);
    expect(report.index?.explanation).toBe(testDemo.analysis.result.overallCoordinationRisk.explanation);
  });

  it('preserves unavailable histories without inventing comments', () => {
    const job = testDemo.enrichments[0];
    const reportWithGap = buildReport(testDemo.analysis, testDemo.graph, [{ ...job, results: [{ ...job.results![0], status: 'unavailable', comments: [] }] }]);
    expect(reportWithGap.histories[0].status).toBe('unavailable');
    expect(reportWithGap.histories[0].comments).toEqual([]);
  });

  it('does not treat a missing score as low risk', () => {
    expect(verdictFor(null, 'Thing').tone).toBe('neutral');
    expect(verdictFor(10, 'Thing').tone).toBe('low');
    expect(verdictFor(40, 'Thing').tone).toBe('medium');
  });

  it('previews the collected thread before the analysis finishes', () => {
    const preview = buildThreadPreview(testDemo.graph, 3);
    expect(preview.post.text).toBe(report.post.text);
    expect(preview.comments).toHaveLength(3);
    expect(preview.moreCount).toBe(testDemo.graph.coverage.retrievedCommentCount - 3);
    expect(preview.comments[0].author).toMatch(/^u\//);
    expect(preview.collectedCount).toBe(8);
  });
});

describe('real example', () => {
  const report = buildReport(exampleData.analysis, exampleData.graph, exampleData.enrichments);
  it('treats the example as a real thread that links to its source', () => {
    expect(report.synthetic).toBe(false);
    expect(report.post.url).toMatch(/^https:\/\/www\.reddit\.com\/r\/BuyItForLife\/comments\/zq4rbu\//);
    expect(report.discussion.every(c => c.url === null && (c.author === null || /^u\/(commenter\d+|original_poster)$/.test(c.author)))).toBe(true);
  });

  it('names one specific product and scores the genuine thread low', () => {
    expect(report.subject).toMatch(/Wüsthof/);
    expect(report.verdict.tone).toBe('low');
    expect(report.index!.score).toBeLessThan(35);
  });
});
