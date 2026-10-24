import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RULES } from '../convex/lib/inference/rubric';

// Keeps convex/lib/inference/rubric.ts aligned with the rubric document.
const markdown = readFileSync(resolve(__dirname, '../../rubrics/product-astroturfing.md'), 'utf8');

function documentedPoints(): Map<string, string> {
  const rows = new Map<string, string>();
  for (const line of markdown.split('\n')) {
    const cells = line.split('|').map(c => c.trim());
    if (cells.length > 3 && /^[CBTXE][0-9]$/.test(cells[1])) {
      const id = cells[1];
      // Families C/B/T/X have Points in column 3; family E has it in column 3 as well.
      rows.set(id, cells[3]);
    }
  }
  return rows;
}

describe('rubric table', () => {
  const documented = documentedPoints();

  it('has every documented rule and no extras', () => {
    expect(RULES.map(r => r.id).sort()).toEqual(Array.from(documented.keys()).sort());
  });

  it('matches documented point values', () => {
    for (const rule of RULES) {
      const doc = documented.get(rule.id)!;
      if (rule.id === 'E1') {
        expect(doc).toContain('cap 15');
        continue;
      }
      const numbers = Array.from(doc.matchAll(/[+−-]\d+/g)).map(m => Number(m[0].replace('−', '-')));
      expect(numbers, rule.id).toEqual(rule.points);
    }
  });

  it('limits YouTube and TikTok to the rules the platform profile allows', () => {
    const allowed = RULES.filter(r => r.platforms.includes('youtube')).map(r => r.id).sort();
    expect(allowed).toEqual(['C1', 'C4', 'E1', 'E3', 'E5', 'E6', 'T1', 'T3', 'T4', 'T5', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7']);
    expect(RULES.filter(r => r.platforms.includes('x')).map(r => r.id)).not.toContain('E4');
  });
});
