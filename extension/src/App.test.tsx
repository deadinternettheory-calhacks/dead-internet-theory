// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import type { SavedJob, SavedState } from './state';

vi.mock('./client', () => ({ client: { getCapabilities: vi.fn(async () => ({ platforms: [] })) } }));
vi.mock('./PanelGhost', () => ({ PanelGhost: () => null }));
vi.mock('../../web/src/components/AnalysisProgress', () => ({ AnalysisProgress: () => <p>Waiting</p> }));
vi.mock('./useAnalysis', () => ({ useAnalysis: (job: SavedJob) => ({
  view: { kind: 'loading', phase: 'queued', status: 'Waiting' }, retry: vi.fn(), investigationId: job.investigationId,
}) }));

let root: Root, host: HTMLDivElement, saved: SavedState;
const queryTabs = vi.fn<(query: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>>();
const sendMessage = vi.fn<(message: { type: string; sourceUrl?: string }) => Promise<{ ok: boolean; value: unknown }>>();
const post = 'https://www.reddit.com/r/Coffee/comments/abc123/best_machine/';
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label)!;
const input = () => host.querySelector<HTMLInputElement>('#post-url')!;
const messages = () => sendMessage.mock.calls.map(([message]) => message);
const render = () => act(async () => root.render(<App/>));
const clickCurrentPage = () => act(async () => button('Use Current Page').click());
function typeUrl(url: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), url);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  saved = { candidate: null, jobs: [], currentKey: null };
  queryTabs.mockReset().mockResolvedValue([{ url: post } as chrome.tabs.Tab]);
  sendMessage.mockReset().mockImplementation(async message => ({ ok: true, value: message.type === 'START_JOB'
    ? { key: 'ext-new', sourceUrl: message.sourceUrl, createdAt: Date.now(), expiresAt: Date.now() + 86400000 } : saved }));
  vi.stubGlobal('chrome', {
    tabs: { query: queryTabs, create: vi.fn(async () => ({})) },
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      sendMessage,
    },
    storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('places the secondary shortcut immediately after Analyze post and only fills the input', async () => {
  await render();
  const shortcut = button('Use Current Page');
  expect(button('Analyze post').nextElementSibling).toBe(shortcut);
  expect(shortcut.type).toBe('button');
  expect(shortcut.classList.contains('secondary-button')).toBe(true);
  expect(chrome.tabs.query).not.toHaveBeenCalled();
  await clickCurrentPage();
  expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  expect(input().value).toBe(post);
  expect(messages().some(m => m.type === 'START_JOB')).toBe(false);
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(messages()).toContainEqual({ type: 'START_JOB', sourceUrl: post });
});

it.each(['https://www.youtube.com/@example', 'https://example.com/', 'https://x.com/example/status/12345'])('keeps manual input and shows an inline error for %s', async url => {
  queryTabs.mockResolvedValue([{ url } as chrome.tabs.Tab]);
  await render(); typeUrl(post); await clickCurrentPage();
  expect(input().value).toBe(post);
  expect(host.querySelector('#panel-error')?.textContent).toContain('Open a public Reddit, TikTok or YouTube post or video first.');
  expect(messages().some(m => m.type === 'START_JOB')).toBe(false);
});

it('handles missing tab URLs and API failures without clearing the input or starting analysis', async () => {
  await render(); typeUrl(post);
  queryTabs.mockResolvedValueOnce([]);
  await clickCurrentPage();
  expect(host.querySelector('#panel-error')).not.toBeNull();
  queryTabs.mockRejectedValueOnce(new Error('Permission unavailable'));
  await clickCurrentPage();
  expect(host.querySelector('#panel-error')?.textContent).toContain('Could not read the current tab.');
  expect(input().value).toBe(post);
  expect(messages().some(m => m.type === 'START_JOB')).toBe(false);
});

it('reads the active tab again after switching pages and clears the old validation error', async () => {
  await render();
  queryTabs.mockResolvedValueOnce([{ url: 'https://example.com/' } as chrome.tabs.Tab]);
  await clickCurrentPage();
  const video = 'https://www.youtube.com/watch?v=jDtG_pwIIv0&t=30s';
  queryTabs.mockResolvedValueOnce([{ url: video } as chrome.tabs.Tab]);
  await clickCurrentPage();
  expect(input().value).toBe(video);
  expect(host.querySelector('#panel-error')).toBeNull();
  expect(messages().some(m => m.type === 'START_JOB')).toBe(false);
});

it('preserves manual X entry and its explicit submit action', async () => {
  await render(); const url = 'https://x.com/example/status/12345'; typeUrl(url);
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(messages()).toContainEqual({ type: 'START_JOB', sourceUrl: url });
  expect(chrome.tabs.query).not.toHaveBeenCalled();
});

it('keeps opening the saved investigation in the full report tab without starting another analysis', async () => {
  saved = { candidate: null, currentKey: 'ext-saved', jobs: [{ key: 'ext-saved', sourceUrl: post, investigationId: 'inv_saved', createdAt: Date.now(), expiresAt: Date.now() + 86400000 }] };
  await render();
  await act(async () => button('Open full report').click());
  expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome-extension://test/report.html?investigationId=inv_saved' });
  expect(messages().some(m => m.type === 'START_JOB')).toBe(false);
});
