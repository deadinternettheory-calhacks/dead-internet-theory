import { describe, expect, it } from 'vitest';
import type { ProposedAssessment } from '../convex/lib/inference/outputs';
import { scoreComment, type EvidenceAvailability } from '../convex/lib/inference/scoring';

const known = new Set(['c:target', 'c:other', 'h:1', 'root']);
const sig = (id: string, points?: number) => ({ id, points, evidence: `${id} observed`, evidenceRefs: ['c:target'] });

function proposal(signals: string[], exculpatory: string[] = [], extra: Partial<ProposedAssessment> = {}): ProposedAssessment {
  return {
    commentId: 'c:target',
    label: 'scored',
    product: 'Thing',
    signals: signals.map(s => sig(s)),
    exculpatory: exculpatory.map(s => sig(s)),
    unknown: [],
    summary: 'summary',
    ...extra,
  };
}

const threadOnly: EvidenceAvailability = {
  platform: 'reddit',
  authorHistoryCount: 0,
  authorHistoryPartial: false,
  authorHasProfile: false,
  coRecommenderHistoryCounts: [0, 0],
  rootAuthorHistoryCount: 0,
  anyUsedHistoryPartial: false,
};
const fullHistory: EvidenceAvailability = { ...threadOnly, authorHistoryCount: 10, authorHasProfile: true, coRecommenderHistoryCounts: [10, 10] };

describe('rubric worked examples (section 11)', () => {
  it('genuine enthusiast on a new account floors at 0', () => {
    const s = scoreComment(proposal(['B4', 'X2'], ['E3', 'E6']), { ...threadOnly, authorHistoryCount: 10, authorHasProfile: true }, known);
    expect(s.score).toBe(0);
    expect(s.tier).toBe('Minimal');
    expect(s.confidence).toBe('Medium');
  });

  it('copy-paste trio from the thread only scores 49, Moderate, Low confidence', () => {
    const s = scoreComment(proposal(['C1', 'C4', 'X1', 'X2']), threadOnly, known);
    expect(s.score).toBe(49);
    expect(s.tier).toBe('Moderate');
    expect(s.confidence).toBe('Low');
  });

  it('seeded question with a ring scores 69, High, High confidence', () => {
    const s = scoreComment(proposal(['C2', 'C3', 'B1', 'T2', 'X3']), fullHistory, known);
    expect(s.score).toBe(69);
    expect(s.tier).toBe('High');
    expect(s.confidence).toBe('High');
  });

  it('partial X history: 29, Low tier, Low confidence', () => {
    const x: EvidenceAvailability = { ...threadOnly, platform: 'x', authorHistoryCount: 6, authorHistoryPartial: true, anyUsedHistoryPartial: true };
    const s = scoreComment(proposal(['B1', 'X1', 'X2'], ['E6']), x, known);
    expect(s.score).toBe(29);
    expect(s.tier).toBe('Low');
    expect(s.confidence).toBe('Low');
  });

  it('YouTube comment flood: 57, High, Low confidence', () => {
    const yt: EvidenceAvailability = { ...threadOnly, platform: 'youtube' };
    const s = scoreComment(proposal(['C1', 'C4', 'T1', 'X1', 'X2']), yt, known);
    expect(s.score).toBe(57);
    expect(s.tier).toBe('High');
    expect(s.confidence).toBe('Low');
  });
});

describe('caps and validation', () => {
  it('K1 caps content signals at 20 and K2 caps content-only scores at 25', () => {
    const s = scoreComment(proposal(['X1', 'X2', 'X3', 'X4', 'X5']), threadOnly, known);
    expect(s.score).toBe(20);
    expect(s.capsApplied).toContain('K1');
  });

  it('K4 keeps scores below 75 without both C and B signals', () => {
    const s = scoreComment(proposal(['C1', 'C2', 'C3', 'C4', 'T1']), fullHistory, known);
    expect(s.score).toBe(74);
    expect(s.capsApplied).toContain('K4');
  });

  it('K4 does not hold back platforms without commenter histories', () => {
    const tiktok: EvidenceAvailability = { ...threadOnly, platform: 'tiktok' };
    const s = scoreComment(proposal(['C1', 'C4', 'T1', 'T3', 'T4', 'T5', 'X1', 'X2', 'X3']), tiktok, known);
    expect(s.score).toBe(81);
    expect(s.capsApplied).not.toContain('K4');
    // Without a coordination (C) signal the score still stays below 75.
    expect(scoreComment(proposal(['T1', 'T3', 'T4', 'T5', 'X1', 'X2', 'X3']), tiktok, known).score).toBeLessThanOrEqual(54);
  });

  it('K5 caps disclosed promotion at 15', () => {
    const s = scoreComment(proposal(['C1', 'C4', 'B1'], ['E1']), fullHistory, known);
    expect(s.score).toBe(15);
    expect(s.label).toBe('disclosed_promotion');
  });

  it('drops rules the platform does not allow', () => {
    const s = scoreComment(proposal(['B1', 'C1']), { ...threadOnly, platform: 'tiktok' }, known);
    expect(s.signals.map(x => x.id)).toEqual(['C1']);
    expect(s.discarded.join(' ')).toContain('B1');
  });

  it('drops history rules when no history is available', () => {
    const s = scoreComment(proposal(['B1', 'C2', 'C1']), threadOnly, known);
    expect(s.signals.map(x => x.id)).toEqual(['C1']);
  });

  it('drops signals whose evidence does not resolve', () => {
    const p = proposal([]);
    p.signals = [{ id: 'C1', evidence: 'made up', evidenceRefs: ['reddit:comment:invented'] }];
    const s = scoreComment(p, threadOnly, known);
    expect(s.signals).toHaveLength(0);
    expect(s.score).toBe(0);
  });

  it('ignores model point values outside the table', () => {
    const p = proposal([]);
    p.signals = [{ id: 'C1', points: 90, evidence: 'x', evidenceRefs: ['c:target'] }];
    expect(scoreComment(p, threadOnly, known).signals[0].points).toBe(25);
  });

  it('accepts the documented alternative for B4', () => {
    const p = proposal([]);
    p.signals = [{ id: 'B4', points: 12, evidence: 'reactivated', evidenceRefs: ['h:1'] }];
    expect(scoreComment(p, fullHistory, known).signals[0].points).toBe(12);
  });

  it('E2 cannot fire from partial history', () => {
    const s = scoreComment(proposal(['C1'], ['E2']), { ...fullHistory, authorHistoryCount: 6, authorHistoryPartial: true }, known);
    expect(s.exculpatory).toHaveLength(0);
  });

  it('returns no score for not_applicable', () => {
    const s = scoreComment(proposal([], [], { label: 'not_applicable' }), threadOnly, known);
    expect(s.score).toBeNull();
  });
});
