// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { EvidenceItem } from '../../analysis/report';
import { EvidenceTimeline } from './EvidenceTimeline';
import { evidenceTime } from './phrases';

const comment = (id: string, seconds: number): EvidenceItem => ({
  id, author: id, text: id, url: null, source: 'discussion',
  createdAt: new Date(Date.UTC(2026, 9, 24) + seconds * 1000).toISOString(),
});
function render(comments: EvidenceItem[], selectedId: string | null = null) {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(<EvidenceTimeline comments={comments} citedIds={new Set()} selectedId={selectedId} onSelect={() => {}}/>);
  return container;
}
const positions = (container: HTMLElement) => [...container.querySelectorAll<HTMLButtonElement>('.timeline-point')].map(point => point.style.left);

it('scales to visible endpoints rather than an unplotted later comment', () => {
  const comments = [...Array.from({ length: 12 }, (_, i) => comment(String(i), i * 60)), comment('much-later', 86400)];
  const container = render(comments);
  const points = positions(container);
  expect(points[0]).toBe('0%');
  expect(points.at(-1)).toBe('100%');
  expect(parseFloat(points[6])).toBeCloseTo(600 / 11);
  expect(container.querySelector('.timeline-scale')?.lastElementChild?.textContent).toBe(evidenceTime(comments[11].createdAt, true));
  expect(container.textContent).toContain('scale covers shown timestamps');
});

it('updates the plotted range when selecting a comment outside the initial sample', () => {
  const comments = [...Array.from({ length: 12 }, (_, i) => comment(String(i), i * 60)), comment('much-later', 86400)];
  const container = render(comments, 'much-later');
  expect(container.querySelector<HTMLButtonElement>('.timeline-point.is-selected')?.style.left).toBe('100%');
  expect(container.querySelector('.timeline-scale')?.lastElementChild?.textContent).toBe(evidenceTime(comments.at(-1)!.createdAt, true));
});

it('uses the full chart width for sub-minute intervals', () => {
  expect(positions(render([comment('first', 0), comment('middle', 10), comment('last', 20)]))).toEqual(['0%', '50%', '100%']);
});

it('centers a single timestamp and identical timestamps without an artificial range', () => {
  expect(positions(render([comment('only', 0)]))).toEqual(['50%']);
  expect(positions(render([comment('a', 0), comment('b', 0)]))).toEqual(['50%', '50%']);
});

it('ignores missing and invalid timestamps when establishing the range', () => {
  const container = render([{ ...comment('missing', 0), createdAt: null }, comment('a', 5), { ...comment('invalid', 0), createdAt: 'invalid' }, comment('b', 25)]);
  expect(positions(container)).toEqual(['0%', '100%']);
  expect(container.textContent).toContain('2 without a time');
});
