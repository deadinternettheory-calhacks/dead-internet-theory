// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { testReport as exampleReport } from '../../test/fixtures';
import type { Report } from '../../analysis/report';
import { EvidenceExplorer } from './EvidenceExplorer';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); });
const render = (report = exampleReport) => act(async () => root.render(<EvidenceExplorer report={report}/>));
const click = (label: string) => act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === label)!.click());

it('lets readers select the actual evidence and suppresses invented source links', async () => {
  await render();
  const nodes = container.querySelectorAll<HTMLButtonElement>('.map-node');
  await act(async () => nodes[1].click());
  expect(container.querySelector('.inspector-comment')?.textContent).toContain(exampleReport.discussion[1].text);
  expect(nodes[1].getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('a')).toBeNull();
  await click('Wording');
  expect(container.querySelector('.inspector-comment mark')).not.toBeNull();
  await click('Timing');
  expect(container.textContent).toContain('13 minute span');
  expect(container.querySelectorAll('.timeline-point')).toHaveLength(8);
});
it('clears the previous quote when an unavailable history is selected', async () => {
  const unavailable = { id: 'missing-history', author: 'u/history_unavailable', status: 'unavailable', comments: [] };
  await render({ ...exampleReport, histories: [...exampleReport.histories, unavailable] }); await click('History');
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('.history-accounts button')];
  await act(async () => buttons.find(b => b.textContent === unavailable.author)!.click());
  expect(container.textContent).toContain('No comments returned.');
  expect(container.querySelector('.inspector-comment')).toBeNull();
  expect(container.querySelector('.evidence-inspector')?.textContent).toContain('Select an available comment');
});
it('shows missing data honestly and only opens https links for real reports', async () => {
  const report: Report = { ...exampleReport, synthetic: false, histories: [], discussion: [{ ...exampleReport.discussion[0], createdAt: null, url: 'javascript:alert(1)' }] };
  await render(report);
  expect(container.querySelector('a')).toBeNull();
  await click('Timing');
  expect(container.textContent).toContain('There are no usable comment timestamps');
  await click('History');
  expect(container.textContent).toContain('No account-history samples');
  await render({ ...report, discussion: [{ ...report.discussion[0], url: 'https://www.reddit.com/real-comment' }] });
  await click('Thread');
  expect(container.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
});
it('keeps cited evidence selectable in a large thread', async () => {
  const prefix = Array.from({ length: 20 }, (_, i) => ({ ...exampleReport.discussion[7], id: `extra-${i}` }));
  await render({ ...exampleReport, discussion: [...prefix, ...exampleReport.discussion] });
  await click('Wording');
  expect(container.querySelectorAll('.map-node')).toHaveLength(12);
  expect(container.querySelector('.map-node.is-selected')).not.toBeNull();
  expect(container.textContent).toContain('12 of 28 shown.');
  const picker = container.querySelector<HTMLSelectElement>('select')!;
  expect(picker.options).toHaveLength(29);
  await act(async () => { picker.value = 'extra-19'; picker.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(container.querySelector('.map-node.is-selected')?.getAttribute('aria-label')).toBe('Read comment 20 by u/slow_pour');
  expect(container.querySelector('.inspector-comment')?.textContent).toContain(prefix[19].text);
  await click('Timing');
  expect(container.querySelector('.timeline-point.is-selected')).not.toBeNull();
});
