import { describe, expect, it } from 'vitest';
import { syntheticDemo } from '../demo';
import { buildReport, buildThreadPreview, verdictFor } from './report';

describe('analysis report', () => {
  const report = buildReport(syntheticDemo.analysis, syntheticDemo.graph, syntheticDemo.enrichments);

  it('flags the synthetic fixture so the UI labels it', () => {
    expect(report.synthetic).toBe(true);
    expect(syntheticDemo.notice).toMatch(/Synthetic example/);
  });

  it('leads with a cautious verdict and at most three findings', () => {
    expect(report.verdict.tone).toBe('high');
    expect(report.verdict.description).toMatch(/not proof/);
    expect(report.findings.length).toBeLessThanOrEqual(3);
    expect(report.findings[0].evidence.length).toBeGreaterThan(0);
  });

  it('resolves evidence from both the discussion and account histories', () => {
    const sources = new Set(report.findings.flatMap(f => f.evidence.map(e => e.source)));
    expect(sources).toEqual(new Set(['discussion', 'history']));
  });

  it('lists recommendations first and keeps every analyzed comment', () => {
    expect(report.comments).toHaveLength(syntheticDemo.analysis.result.commentAssessments.length);
    expect(report.comments[0].isRecommendation).toBe(true);
  });

  it('reports coverage and history outcomes', () => {
    expect(report.coverage.analyzed).toBe(8);
    expect(report.coverage.histories).toBe('6 account histories requested: 5 complete, 1 partial.');
  });

  it('keeps every axis citation available even when findings share quotes', () => {
    const semantic = report.axes.find(x => x.axis === 'semantic_coordination')!;
    const temporal = report.axes.find(x => x.axis === 'temporal_coordination')!;
    expect(semantic.evidence).toHaveLength(3);
    expect(temporal.evidence.map(e => e.id)).toEqual(semantic.evidence.map(e => e.id));
    expect(report.discussion).toHaveLength(8);
    expect(report.histories).toHaveLength(5);
    expect(report.histories.find(h => h.status === 'unavailable')?.comments).toEqual([]);
  });

  it('does not treat a missing score as low risk', () => {
    expect(verdictFor(null, 'Thing').tone).toBe('neutral');
    expect(verdictFor(10, 'Thing').tone).toBe('low');
    expect(verdictFor(40, 'Thing').tone).toBe('medium');
  });

  it('previews the collected thread before the analysis finishes', () => {
    const preview = buildThreadPreview(syntheticDemo.graph, 3);
    expect(preview.post.text).toBe(report.post.text);
    expect(preview.comments).toHaveLength(3);
    expect(preview.moreCount).toBe(syntheticDemo.graph.coverage.retrievedCommentCount - 3);
    expect(preview.comments[0].author).toMatch(/^u\//);
    expect(preview.collectedCount).toBe(8);
  });
});
