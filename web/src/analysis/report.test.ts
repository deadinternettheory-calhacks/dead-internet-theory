import { describe, expect, it } from 'vitest';
import { syntheticDemo } from '../demo';
import { buildReport, verdictFor } from './report';

describe('analysis report', () => {
  const report = buildReport(syntheticDemo.analysis, syntheticDemo.graph, [syntheticDemo.enrichment]);

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
    expect(report.coverage.histories).toBe('4 account histories requested: 3 complete, 1 partial.');
  });

  it('does not treat a missing score as low risk', () => {
    expect(verdictFor(null, 'Thing').tone).toBe('neutral');
    expect(verdictFor(10, 'Thing').tone).toBe('low');
    expect(verdictFor(40, 'Thing').tone).toBe('medium');
  });
});
