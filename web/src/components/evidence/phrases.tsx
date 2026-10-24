import type { EvidenceItem } from '../../analysis/report';

export type SharedPhrase = { text: string; words: string[]; commentIds: string[] };
const tokens = (text: string) => [...text.matchAll(/[\p{L}\p{N}]+/gu)];

/** Literal repeated words, not a similarity score or an inference about intent. */
export function sharedPhrases(comments: EvidenceItem[]): SharedPhrase[] {
  const found = new Map<string, SharedPhrase>();
  // Bound work for large discussions; these are examples from the cited evidence.
  for (const comment of comments.slice(0, 12)) {
    const words = tokens(comment.text).slice(0, 160);
    for (let size = 7; size >= 3; size--) {
      for (let i = 0; i + size <= words.length; i++) {
        const sequence = words.slice(i, i + size);
        const normalized = sequence.map(w => w[0].toLowerCase());
        const key = normalized.join(' ');
        if (key.length < 16) continue;
        const existing = found.get(key);
        if (existing) { if (!existing.commentIds.includes(comment.id)) existing.commentIds.push(comment.id); }
        else found.set(key, { words: normalized, commentIds: [comment.id], text: comment.text.slice(sequence[0].index!, sequence.at(-1)!.index! + sequence.at(-1)![0].length) });
      }
    }
  }
  const selected: SharedPhrase[] = [];
  for (const phrase of [...found.values()].filter(p => p.commentIds.length > 1).sort((a, b) => b.words.length * b.commentIds.length - a.words.length * a.commentIds.length)) {
    if (selected.some(p => p.words.join(' ').includes(phrase.words.join(' ')))) continue;
    selected.push(phrase);
    if (selected.length === 3) break;
  }
  return selected;
}

export function HighlightedText({ text, phrase }: { text: string; phrase?: SharedPhrase | null }) {
  if (!phrase) return <>{text}</>;
  const escaped = phrase.words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped.join('[^\\p{L}\\p{N}]+')})(?=$|[^\\p{L}\\p{N}])`, 'giu');
  const output = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index! + match[1].length;
    output.push(text.slice(cursor, start), <mark key={start}>{match[2]}</mark>);
    cursor = start + match[2].length;
  }
  output.push(text.slice(cursor));
  return <>{output}</>;
}

export function evidenceTime(value: string | null, includeDate = false) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-US', { ...(includeDate ? { month: 'short', day: 'numeric', year: 'numeric' } as const : {}), hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : 'Time unavailable';
}
