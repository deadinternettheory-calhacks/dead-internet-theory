export interface ScoreExplanationPart { label: string; score: number; reason: string }

/** Format stored calculation prose; never recalculate scores or assume weights. */
export function scoreExplanation(explanation: string): { parts: ScoreExplanationPart[]; notes: string } | null {
  const labels = 'Rubric strength|Coordination|Comment realism|Low-effort support|Commercial signals|History contrast|One-sided support';
  const pattern = new RegExp(`(${labels}) (\\d+(?:\\.\\d+)?): `, 'g');
  const matches = [...explanation.matchAll(pattern)];
  const weightsAt = explanation.indexOf('Weights:');
  // Older or unfamiliar formats remain readable as their original explanation.
  if (!matches.length || weightsAt < 0 || matches.some(m => m.index! >= weightsAt)) return null;
  const prefix = explanation.slice(0, matches[0].index).trim();
  if (!/^Comment-section astroturfing index: \d+\/100 \([^)]+\)\.$/.test(prefix)) return null;
  const parts = matches.map((match, index) => {
    const reason = explanation.slice(match.index! + match[0].length, matches[index + 1]?.index ?? weightsAt).trim();
    return { label: match[1], score: Number(match[2]), reason };
  });
  return { parts, notes: explanation.slice(weightsAt).trim() };
}
