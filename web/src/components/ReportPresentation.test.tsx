// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnalysisProgress } from './AnalysisProgress';
import { ThreadPreviewCard } from './ThreadPreviewCard';
import { AnalysisReport } from './AnalysisReport';
import { buildThreadPreview } from '../analysis/report';
import { testDemo as exampleData, testReport as exampleReport } from '../test/fixtures';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); });
const render = (node: ReactNode) => act(async () => root.render(node));

it('keeps queued milestones unchanged as elapsed time increases', async () => {
  await render(<AnalysisProgress phase="queued" status="Waiting to collect public comments…"/>);
  await act(async () => vi.advanceTimersByTimeAsync(70000));
  expect(container.textContent).toContain('1:10 in this view');
  expect(container.querySelector('[aria-current="step"]')?.textContent).toContain('Collect public commentsQueued');
  expect(container.querySelectorAll('.is-done')).toHaveLength(1);
  expect(container.textContent).not.toContain('%');
  expect(container.textContent).not.toContain('comments collected.');
});
it('marks collection complete only after the backend says so and uses returned counts', async () => {
  await render(<AnalysisProgress phase="collecting" status="Collecting public comments…"/>);
  expect(container.querySelector('[aria-current="step"]')?.textContent).toContain('Collect public comments');
  await render(<AnalysisProgress phase="analyzing" status="Analyzing the discussion…" collectedCount={8}/>);
  expect(container.querySelector('[aria-current="step"]')?.textContent).toContain('Analyze the discussion');
  expect(container.querySelectorAll('.is-done')).toHaveLength(2);
  expect(container.textContent).toContain('8 comments collected.');
});
it('distinguishes queued analysis from an actively running worker', async () => {
  await render(<AnalysisProgress phase="analysis-queued" status="Waiting to analyze the discussion…" collectedCount={8}/>);
  expect(container.querySelector('[aria-current="step"]')?.textContent).toContain('Analyze the discussionQueued');
  expect(container.textContent).toContain('waiting for analysis to begin');
  expect(container.textContent).not.toContain('checking the evidence for patterns');
});
it('lets readers expand already-collected comments without fetching more data', async () => {
  await render(<ThreadPreviewCard preview={buildThreadPreview(exampleData.graph, 100)}/>);
  expect(container.querySelectorAll('.comment-row')).toHaveLength(6);
  await act(async () => container.querySelector<HTMLButtonElement>('.preview-more')!.click());
  expect(container.querySelectorAll('.comment-row')).toHaveLength(8);
  expect(container.querySelector('.preview-more')).toBeNull();
});
it('opens relevant evidence and shows the section score without per-item caveats', async () => {
  await render(<AnalysisReport report={exampleReport}/>);
  const finding = [...container.querySelectorAll('.finding-card')].find(article => article.querySelector('h3')?.textContent === 'Accounts used nearly identical wording')!;
  expect(container.querySelector<HTMLDetailsElement>('.finding-more')?.open).toBe(false);
  expect(container.querySelectorAll('.evidence-quote').length).toBeGreaterThan(0);
  await act(async () => finding.querySelector<HTMLButtonElement>('.finding-actions button')!.click());
  expect(container.querySelector<HTMLDetailsElement>('.report-explorer')?.open).toBe(true);
  expect(container.querySelector('.mode-wording')).not.toBeNull();
  expect(container.querySelector('.index-note')?.closest('details')?.open).toBe(false);
  expect(container.querySelector('.risk-score')?.textContent).toContain('Astroturfing score for this comment section');
  expect(container.querySelector('.risk-note')).toBeNull();
  expect(container.querySelector('a')).toBeNull();
  expect(container.textContent).toContain('6 history samples with returned comments');
  const sections = [...container.querySelectorAll('.summary-card, .verdict-card, .report-findings, .evidence, .limitations')].map(node => node.className);
  expect(sections).toEqual(['card summary-card', 'card verdict-card tone-high', 'findings report-findings', 'card evidence', 'limitations']);
});
