import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EvidenceItem } from '../../analysis/report';
import { evidenceTime, HighlightedText, sharedPhrases } from './phrases';

const comment = (id: string, text: string): EvidenceItem => ({ id, text, author: null, url: null, createdAt: null, source: 'discussion' });
describe('literal evidence highlights', () => {
  it('matches words across punctuation and case, without counting one comment twice', () => {
    const phrases = sharedPhrases([comment('a', '15-bar pump, steam wand. 15-bar pump, steam wand.'), comment('b', '15 BAR PUMP + STEAM WAND')]);
    expect(phrases[0].commentIds).toEqual(['a', 'b']);
    expect(renderToStaticMarkup(<HighlightedText text="15 BAR PUMP + STEAM WAND" phrase={phrases[0]}/>)).toContain('<mark>15 BAR PUMP + STEAM WAND</mark>');
  });
  it('does not invent similarity or match inside another word', () => {
    expect(sharedPhrases([comment('a', 'A very good machine.'), comment('b', 'Excellent espresso maker!')])).toEqual([]);
    const phrase = { text: 'best budget machine', words: ['best', 'budget', 'machine'], commentIds: ['a', 'b'] };
    expect(renderToStaticMarkup(<HighlightedText text="best budget machinery" phrase={phrase}/>)).not.toContain('<mark>');
  });
  it('handles Unicode and renders untrusted markup as plain text', () => {
    const phrase = sharedPhrases([comment('a', 'Une excellente machine à café.'), comment('b', 'UNE EXCELLENTE MACHINE À CAFÉ!')])[0];
    const markup = renderToStaticMarkup(<HighlightedText text='<img src=x onerror="alert(1)"> Une excellente machine à café.' phrase={phrase}/>);
    expect(markup).toContain('&lt;img');
    expect(markup).not.toContain('<img');
    expect(markup).toContain('<mark>Une excellente machine à café</mark>');
  });
  it('bounds phrase extraction and preserves missing times', () => {
    const unique = Array.from({ length: 12 }, (_, i) => comment(String(i), String(i)));
    expect(sharedPhrases([...unique, comment('a', 'a repeated promotional phrase'), comment('b', 'a repeated promotional phrase')])).toEqual([]);
    expect(evidenceTime(null)).toBe('Time unavailable');
    expect(evidenceTime('bad date')).toBe('Time unavailable');
    expect(evidenceTime('2026-10-23T18:06:00Z')).toBe('6:06 PM UTC');
  });
});
