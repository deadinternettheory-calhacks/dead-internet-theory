// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { testDemo } from '../../web/src/test/fixtures';
import { ApiError, type ApiClient } from '../../web/src/api/client';
import { useAnalysis } from './useAnalysis';
import type { SavedJob } from './state';

let root: Root, element: HTMLDivElement, latest: ReturnType<typeof useAnalysis>;
let client: ApiClient;
let hidden: boolean;
const pending: SavedJob = { key: 'ext-stable-request', sourceUrl: testDemo.investigation.sourceUrl, createdAt: Date.now(), expiresAt: Date.now() + 86400000 };
const running = { ...testDemo.investigation, ingestionStatus: 'completed' as const, analysisStatus: 'running' as const };
const complete = { ...running, analysisStatus: 'completed' as const };
function Probe({ job, readOnly = false }: { job: SavedJob; readOnly?: boolean }) { latest = useAnalysis(job, client, readOnly); return <p>{latest.view.kind}</p>; }
beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn(async () => ({ ok: true, value: null })) } });
  hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  client = {
    getCapabilities: vi.fn(), createInvestigation: vi.fn(async () => running),
    getInvestigation: vi.fn(async () => complete), getGraph: vi.fn(async () => testDemo.graph),
    getAnalysis: vi.fn(async () => testDemo.analysis), getEnrichment: vi.fn(async () => testDemo.enrichments[0]),
  };
  element = document.createElement('div'); document.body.append(element); root = createRoot(element);
});
afterEach(() => { act(() => root.unmount()); element.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const render = (job = pending, readOnly = false) => act(async () => root.render(<Probe job={job} readOnly={readOnly}/>));
const setHidden = (value: boolean) => act(async () => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); });

it('submits the saved request key, persists its receipt and builds a report with the shared presentation model', async () => {
  await render();
  expect(client.createInvestigation).toHaveBeenCalledWith(pending.sourceUrl, pending.key, expect.any(AbortSignal));
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'RECORD_JOB', key: pending.key, investigationId: running.investigationId });
  expect(latest.view).toMatchObject({ kind: 'loading', phase: 'collecting', savedResult: true });
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(latest.view.kind).toBe('report');
  if (latest.view.kind === 'report') expect(latest.view.report.comments).toHaveLength(testDemo.analysis.result.commentAssessments.length);
});

it('resumes a saved investigation and opens full reports with GET requests only', async () => {
  await render({ ...pending, investigationId: running.investigationId }, true);
  expect(client.createInvestigation).not.toHaveBeenCalled();
  expect(client.getInvestigation).toHaveBeenCalledWith(running.investigationId, expect.any(AbortSignal));
  expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  expect(latest.view).toMatchObject({ kind: 'loading', phase: 'collecting', savedResult: true });
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(latest.view.kind).toBe('report');
});

it('follows actual phases, reuses the matching preview graph and aborts polling when the view closes', async () => {
  vi.mocked(client.getInvestigation).mockResolvedValue(running);
  await render();
  expect(latest.view.kind).toBe('loading');
  if (latest.view.kind === 'loading') { expect(latest.view.phase).toBe('analyzing'); expect(latest.view.preview?.collectedCount).toBe(testDemo.graph.coverage.retrievedCommentCount); }
  vi.mocked(client.getInvestigation).mockResolvedValue(complete);
  await act(async () => vi.advanceTimersByTimeAsync(2500));
  expect(client.getGraph).toHaveBeenCalledTimes(1);
  expect(latest.view.kind).toBe('report');
  await act(async () => root.render(<p>Closed</p>));
  const count = vi.mocked(client.getInvestigation).mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  expect(client.getInvestigation).toHaveBeenCalledTimes(count);
});

it('retries an unconfirmed create with the original saved key instead of creating another paid request', async () => {
  vi.mocked(client.createInvestigation).mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'Connection interrupted.', true));
  await render();
  expect(latest.view.kind).toBe('error');
  await act(async () => latest.retry());
  expect(client.createInvestigation).toHaveBeenCalledTimes(2);
  for (const call of vi.mocked(client.createInvestigation).mock.calls) expect(call[1]).toBe(pending.key);
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(latest.view.kind).toBe('report');
});

it('reports retention expiry and backend failures without manufacturing a result', async () => {
  vi.mocked(client.getInvestigation).mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'Expired.', false));
  await render({ ...pending, investigationId: 'expired' }, true);
  expect(latest.view).toMatchObject({ kind: 'error', title: 'This report is no longer available.', retryable: false });
  expect(client.getAnalysis).not.toHaveBeenCalled();
  expect(client.createInvestigation).not.toHaveBeenCalled();
});

it('never creates an investigation for an invalid full-report link', async () => {
  await render(pending, true);
  expect(latest.view.kind).toBe('error');
  expect(client.createInvestigation).not.toHaveBeenCalled();
  expect(client.getInvestigation).not.toHaveBeenCalled();
});

it('presents saved comments for five seconds and saved analysis for five seconds with one submission', async () => {
  vi.mocked(client.createInvestigation).mockResolvedValue(complete);
  await render();
  expect(latest.view).toMatchObject({ kind: 'loading', phase: 'collecting', savedResult: true, status: 'Loading saved comments…' });
  if (latest.view.kind === 'loading') expect(latest.view.preview).toBeUndefined();
  await act(async () => vi.advanceTimersByTimeAsync(4999));
  expect(latest.view).toMatchObject({ kind: 'loading', phase: 'collecting' });
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(latest.view).toMatchObject({ kind: 'loading', phase: 'analyzing', savedResult: true, status: 'Preparing saved analysis…' });
  if (latest.view.kind === 'loading') expect(latest.view.preview?.collectedCount).toBe(testDemo.graph.coverage.retrievedCommentCount);
  await act(async () => vi.advanceTimersByTimeAsync(4999));
  expect(latest.view.kind).toBe('loading');
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(latest.view.kind).toBe('report');
  expect(client.createInvestigation).toHaveBeenCalledTimes(1);
  expect(client.getInvestigation).not.toHaveBeenCalled();
  expect(client.getGraph).toHaveBeenCalledTimes(1);
  expect(client.getAnalysis).toHaveBeenCalledTimes(1);
});

it('resumes the original saved-result deadlines with GET and does not replay a report after returning to the tab', async () => {
  vi.mocked(client.createInvestigation).mockResolvedValue(complete);
  await render();
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  await setHidden(true);
  await act(async () => vi.advanceTimersByTimeAsync(4000));
  await setHidden(false);
  expect(latest.view).toMatchObject({ kind: 'loading', phase: 'analyzing', savedResult: true });
  expect(client.createInvestigation).toHaveBeenCalledTimes(1);
  expect(client.getInvestigation).toHaveBeenCalledWith(complete.investigationId, expect.any(AbortSignal));
  await act(async () => vi.advanceTimersByTimeAsync(2999));
  expect(latest.view.kind).toBe('loading');
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(latest.view.kind).toBe('report');
  await setHidden(true);
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  await setHidden(false);
  expect(latest.view.kind).toBe('report');
  expect(client.createInvestigation).toHaveBeenCalledTimes(1);
});

it('cancels the saved-result timer when the panel closes', async () => {
  vi.mocked(client.createInvestigation).mockResolvedValue(complete);
  await render();
  await act(async () => root.render(<p>Closed</p>));
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(element.textContent).toBe('Closed');
  expect(client.createInvestigation).toHaveBeenCalledTimes(1);
});

it('shows a failed saved-report read immediately without a presentation timer', async () => {
  vi.mocked(client.createInvestigation).mockResolvedValue(complete);
  vi.mocked(client.getGraph).mockRejectedValue(new ApiError(404, 'GRAPH_NOT_FOUND', 'Expired.', false));
  await render();
  expect(latest.view).toMatchObject({ kind: 'error', title: 'This report is no longer available.' });
  expect(vi.getTimerCount()).toBe(0);
});
