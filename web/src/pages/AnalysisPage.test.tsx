// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnalysisPage } from './AnalysisPage';
import { createInvestigation, getGraph, getInvestigation, idempotencyKeyFor } from '../api/client';
import { exampleData } from '../demo';
import type { InvestigationResource } from '../api/contract';
vi.mock('../api/client', async original => ({
  ...await original<typeof import('../api/client')>(),
  createInvestigation: vi.fn(),
  getInvestigation: vi.fn(),
  getGraph: vi.fn(),
}));
const url = 'https://www.reddit.com/r/synthetic/comments/abc123/';
const queued: InvestigationResource = { investigationId: 'synthetic-old', sourceUrl: url, platform: 'reddit', ingestionStatus: 'queued', analysisStatus: 'waiting_for_graph', graphRevision: null };
const failed = (code: string): InvestigationResource => ({ ...queued, ingestionStatus: 'failed', error: { code, message: 'Synthetic failure', retryable: false } });
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  sessionStorage.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});
const render = async () => act(async () => { root.render(<MemoryRouter><AnalysisPage url={url}/></MemoryRouter>); });

it('replaces a confirmed fixture failure once so a cached test-mode request can recover after launch', async () => {
  const oldKey = idempotencyKeyFor(url);
  vi.mocked(createInvestigation).mockResolvedValueOnce(queued).mockImplementationOnce(() => new Promise(() => {}));
  vi.mocked(getInvestigation).mockResolvedValue(failed('FIXTURE_SOURCE_NOT_FOUND'));
  await render();
  await act(async () => vi.advanceTimersByTimeAsync(2500));
  expect(createInvestigation).toHaveBeenCalledTimes(2);
  expect(vi.mocked(createInvestigation).mock.calls[0][1]).toBe(oldKey);
  expect(vi.mocked(createInvestigation).mock.calls[1][1]).not.toBe(oldKey);
  expect(container.textContent).toContain('Reports expire 24 hours');
});
it('does not rotate an ambiguous live request even when the user retries', async () => {
  const key = idempotencyKeyFor(url);
  vi.mocked(createInvestigation).mockResolvedValue(failed('PROVIDER_START_AMBIGUOUS'));
  await render();
  expect(createInvestigation).toHaveBeenCalledTimes(1);
  const retry = [...container.querySelectorAll('button')].find(b => /try again/i.test(b.textContent ?? ''))!;
  await act(async () => retry.click());
  expect(createInvestigation).toHaveBeenCalledTimes(2);
  expect(vi.mocked(createInvestigation).mock.calls.every(([, used]) => used === key)).toBe(true);
});
it('bounds fixture recovery instead of repeatedly creating failed investigations', async () => {
  vi.mocked(createInvestigation).mockResolvedValue(failed('FIXTURE_SOURCE_NOT_FOUND'));
  await render();
  expect(createInvestigation).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain('We can’t collect this post yet.');
});
it('shows the collected post and comments while the analysis runs', async () => {
  const analyzing: InvestigationResource = { ...queued, ingestionStatus: 'completed', analysisStatus: 'running', graphRevision: 1 };
  vi.mocked(createInvestigation).mockResolvedValue(analyzing);
  vi.mocked(getInvestigation).mockResolvedValue(analyzing);
  vi.mocked(getGraph).mockResolvedValue(exampleData.graph);
  await render();
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(getGraph).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('Analyzing the discussion…');
  expect(container.textContent).toContain('Comments we collected');
  expect(container.textContent).toContain(`${exampleData.graph.coverage.retrievedCommentCount} comments collected.`);
  expect(container.querySelector('[aria-current="step"]')?.textContent).toContain('Analyze the discussion');
  const firstComment = exampleData.graph.nodes.find(n => n.type === 'comment')!;
  expect(container.textContent).toContain(firstComment.type === 'comment' ? firstComment.text : '');
  await act(async () => vi.advanceTimersByTimeAsync(2500));
  expect(getGraph).toHaveBeenCalledTimes(1);
});

it('does not show collection as complete or request a graph while it is queued', async () => {
  vi.mocked(createInvestigation).mockResolvedValue(queued);
  vi.mocked(getInvestigation).mockResolvedValue({ ...queued, ingestionStatus: 'running' });
  await render();
  expect(container.textContent).toContain('Waiting to collect public comments…');
  expect(container.querySelector('[aria-current="step"]')?.textContent).toContain('Queued');
  await act(async () => vi.advanceTimersByTimeAsync(2500));
  expect(container.textContent).toContain('Collecting public comments…');
  expect(container.querySelectorAll('.progress-stages .is-done')).toHaveLength(1);
  expect(getGraph).not.toHaveBeenCalled();
});
it('blames the service, not the post, and retries a refused start with a fresh request', async () => {
  const key = idempotencyKeyFor(url);
  vi.mocked(createInvestigation).mockResolvedValueOnce(failed('PROVIDER_REJECTED')).mockImplementationOnce(() => new Promise(() => {}));
  await render();
  expect(container.textContent).toContain('Collection is temporarily unavailable.');
  expect(container.textContent).not.toContain('private, deleted');
  const retry = [...container.querySelectorAll('button')].find(b => /try again/i.test(b.textContent ?? ''))!;
  await act(async () => retry.click());
  expect(vi.mocked(createInvestigation).mock.calls[1][1]).not.toBe(key);
});
