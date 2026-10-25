// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnalysisPage } from './AnalysisPage';
import { InvestigationAtmosphere } from '../components/AnalysisPlayground/InvestigationAtmosphere';
vi.mock('../components/AnalysisPlayground/AnalysisPlayground', () => ({ AnalysisPlayground: ({ phase }: { phase: string }) => <div className="analysis-playground" data-phase={phase}/> }));
import { ApiError, createInvestigation, getAnalysis, getEnrichment, getGraph, getInvestigation, idempotencyKeyFor } from '../api/client';
import { exampleData } from '../demo';
import type { InvestigationResource } from '../api/contract';
vi.mock('../api/client', async original => ({
  ...await original<typeof import('../api/client')>(),
  createInvestigation: vi.fn(),
  getInvestigation: vi.fn(),
  getGraph: vi.fn(),
  getAnalysis: vi.fn(),
  getEnrichment: vi.fn(),
}));
const url = 'https://www.reddit.com/r/synthetic/comments/abc123/';
const queued: InvestigationResource = { investigationId: 'synthetic-old', sourceUrl: url, platform: 'reddit', ingestionStatus: 'queued', analysisStatus: 'waiting_for_graph', graphRevision: null };
const failed = (code: string): InvestigationResource => ({ ...queued, ingestionStatus: 'failed', error: { code, message: 'Synthetic failure', retryable: false } });
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.mocked(getAnalysis).mockResolvedValue(exampleData.analysis);
  vi.mocked(getEnrichment).mockImplementation(async (_id, eid) => exampleData.enrichments.find(e => e.enrichmentId === eid)!);
  sessionStorage.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});
const render = async (sourceUrl = url) => act(async () => { root.render(<MemoryRouter initialEntries={['/analysis']}><InvestigationAtmosphere><AnalysisPage url={sourceUrl}/></InvestigationAtmosphere></MemoryRouter>); });

it('explains how to recover from an unavailable TikTok share without a duplicate create', async () => {
  vi.mocked(createInvestigation).mockRejectedValue(new ApiError(502, 'SOURCE_LINK_UNAVAILABLE', 'Unavailable', true));
  await render();
  expect(container.textContent).toContain('We couldn’t open this share link.');
  expect(container.textContent).toContain('full TikTok video URL');
  expect(container.querySelector('.retry-button')).toBeNull();
});

it('explains an empty video collection without blaming the platform or offering a duplicate retry', async () => {
  vi.mocked(createInvestigation).mockResolvedValue(failed('PROVIDER_NO_COMMENTS'));
  await render();
  expect(container.textContent).toContain('No public comments were returned.');
  expect(container.textContent).toContain('Comments may be disabled or unavailable');
  expect(container.querySelector('.retry-button')).toBeNull();
});

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
  vi.mocked(getInvestigation).mockResolvedValueOnce(queued).mockResolvedValue({ ...queued, ingestionStatus: 'running' });
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

it('shows saved comments for five seconds and saved analysis for five seconds after a finished replay lookup', async () => {
  vi.mocked(createInvestigation).mockResolvedValue({ ...exampleData.investigation, ingestionStatus: 'queued', analysisStatus: 'waiting_for_graph', graphRevision: null, graphFingerprint: null });
  vi.mocked(getInvestigation).mockResolvedValue(exampleData.investigation);
  vi.mocked(getGraph).mockResolvedValue(exampleData.graph);
  await render();
  expect(container.querySelector('.result-card')).toBeNull();
  expect(container.querySelector('.analysis-playground')?.getAttribute('data-phase')).toBe('collecting');
  expect(container.textContent).toContain('Loading saved comments…');
  expect(container.textContent).toContain('This post has a saved result.');
  expect(container.querySelector('.thread-preview')).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(4999));
  expect(container.querySelector('.analysis-playground')?.getAttribute('data-phase')).toBe('collecting');
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(container.querySelector('.analysis-playground')?.getAttribute('data-phase')).toBe('analyzing');
  expect(container.textContent).toContain('Preparing saved analysis…');
  expect(container.textContent).toContain('Comments we collected');
  expect(container.textContent).not.toContain('This can take a few minutes.');
  expect(container.querySelector('.result-card')).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(4999));
  expect(container.querySelector('.result-card')).toBeNull();
  expect(container.querySelector('.analysis-playground')?.getAttribute('data-phase')).toBe('analyzing');
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(container.querySelector('.result-card')).not.toBeNull();
  expect(container.querySelector('.analysis-playground')?.getAttribute('data-phase')).toBe('complete');
  expect(createInvestigation).toHaveBeenCalledTimes(1);
  expect(getInvestigation).toHaveBeenCalledTimes(1);
  expect(getAnalysis).toHaveBeenCalledTimes(1);
  expect(getGraph).toHaveBeenCalledTimes(1);
});

it('drops the replay key once the report is complete so a later check asks the backend again', async () => {
  const key = idempotencyKeyFor(url);
  vi.mocked(createInvestigation).mockResolvedValue(exampleData.investigation);
  vi.mocked(getGraph).mockResolvedValue(exampleData.graph);
  await render();
  expect(container.textContent).toContain('Loading saved comments…');
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(container.querySelector('.report-view')).not.toBeNull();
  expect(container.querySelector('.analysis-playground')?.getAttribute('data-phase')).toBe('complete');
  expect(vi.mocked(createInvestigation).mock.calls[0][1]).toBe(key);
  expect(idempotencyKeyFor(url)).not.toBe(key);
});

it('clears saved-result timers when switching links so an old replay cannot finish the new one', async () => {
  vi.mocked(createInvestigation).mockResolvedValue(exampleData.investigation);
  const updated = { ...exampleData.graph, nodes: exampleData.graph.nodes.map(node => node.type === 'discussion' ? { ...node, title: 'Second saved discussion' } : node) };
  vi.mocked(getGraph).mockResolvedValueOnce(exampleData.graph).mockResolvedValueOnce(updated);
  await render();
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  await render('https://www.reddit.com/r/synthetic/comments/def456/');
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(container.querySelector('.analysis-playground')?.getAttribute('data-phase')).toBe('collecting');
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(container.querySelector('.analysis-playground')?.getAttribute('data-phase')).toBe('analyzing');
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(container.querySelector('.result-card')).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(container.querySelector('.report-view')).not.toBeNull();
  expect(container.querySelector('.original-post-heading')?.textContent).toContain('Second saved discussion');
  expect(createInvestigation).toHaveBeenCalledTimes(2);
});

it('shows failed saved-report reads immediately instead of playing a successful result sequence', async () => {
  vi.mocked(createInvestigation).mockResolvedValue(exampleData.investigation);
  vi.mocked(getGraph).mockRejectedValue(new ApiError(404, 'GRAPH_NOT_FOUND', 'Expired', false));
  await render();
  expect(container.textContent).toContain('Something went wrong.');
  expect(container.textContent).not.toContain('Loading saved comments…');
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(container.querySelector('.report-view')).toBeNull();
  expect(container.querySelector('.analysis-playground')?.getAttribute('data-phase')).toBe('failed');
});

it('uses the already displayed immutable graph when the same revision and fingerprint completes', async () => {
  vi.mocked(createInvestigation).mockResolvedValue({ ...exampleData.investigation, analysisStatus: 'running' });
  vi.mocked(getInvestigation).mockResolvedValueOnce({ ...exampleData.investigation, analysisStatus: 'running' }).mockResolvedValue(exampleData.investigation);
  vi.mocked(getGraph).mockResolvedValue(exampleData.graph);
  await render();
  expect(container.textContent).toContain('Comments we collected');
  await act(async () => vi.advanceTimersByTimeAsync(2500));
  expect(container.querySelector('.report-view')).not.toBeNull();
  expect(container.querySelector('.analysis-playground')?.getAttribute('data-phase')).toBe('complete');
  expect(getGraph).toHaveBeenCalledTimes(1);
});

it('fetches the new graph if completion identifies a different revision instead of rendering the old preview', async () => {
  const updated = { ...exampleData.graph, graphRevision: 2, graphFingerprint: 'sha256:' + 'b'.repeat(64), nodes: exampleData.graph.nodes.map(n => n.type === 'discussion' ? { ...n, title: 'Updated discussion' } : n) };
  vi.mocked(createInvestigation).mockResolvedValue({ ...exampleData.investigation, analysisStatus: 'running' });
  vi.mocked(getInvestigation).mockResolvedValueOnce({ ...exampleData.investigation, analysisStatus: 'running' }).mockResolvedValue({ ...exampleData.investigation, graphRevision: updated.graphRevision, graphFingerprint: updated.graphFingerprint });
  vi.mocked(getGraph).mockResolvedValueOnce(exampleData.graph).mockResolvedValue(updated);
  await render();
  await act(async () => vi.advanceTimersByTimeAsync(2500));
  expect(container.querySelector('.report-view')).not.toBeNull();
  expect(container.querySelector('.analysis-playground')?.getAttribute('data-phase')).toBe('complete');
  expect(container.textContent).toContain('Updated discussion');
  expect(getGraph).toHaveBeenCalledTimes(2);
});
