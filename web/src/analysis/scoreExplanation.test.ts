import { expect, it } from 'vitest';
import { testReport } from '../test/fixtures';
import { scoreExplanation } from './scoreExplanation';

it('preserves stored component scores, weights and history sampling while removing repeated score wording', () => {
  const original = testReport.index!.explanation;
  const result = scoreExplanation(original)!;
  expect(result.parts.map(p => [p.label, p.score])).toEqual([
    ['Rubric strength', 76], ['Coordination', 55], ['Comment realism', 100],
    ['Commercial signals', 0], ['History contrast', 50], ['One-sided support', 67],
  ]);
  expect(result.parts[0].reason).toContain('76 (u/brewfan_22)');
  expect(result.parts[0].reason).toContain('76 (u/crema_queen)');
  expect(result.parts[0].reason).toContain('76 (u/daily_grind_dan)');
  expect(result.parts.find(p => p.label === 'Comment realism')!.reason).toContain('unnatural text, seller or random usernames, template phrases, duplicates');
  expect(result.parts.every(p => original.includes(p.reason))).toBe(true);
  expect(result.notes).toBe(original.slice(original.indexOf('Weights:')));
});

it('retains optional low-effort components and uses the stored weight text', () => {
  const original = testReport.index!.explanation.replace('Commercial signals 0:', 'Low-effort support 42: Recorded praise flood. Commercial signals 0:');
  expect(scoreExplanation(original)!.parts).toContainEqual({ label: 'Low-effort support', score: 42, reason: 'Recorded praise flood.' });
});

it('leaves unknown explanation formats unchanged for the caller to render', () => {
  expect(scoreExplanation('Too little to measure: 2 comment(s) analyzed.')).toBeNull();
  expect(scoreExplanation('Custom explanation. Coordination 55: Recorded. Weights: custom.')).toBeNull();
});
