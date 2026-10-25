import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { EXTENSION_CLIENT_ID } from '../../contracts/extension-client.mjs';
import { SESSION_KEY, STATE_KEY, TTL_MS, type SavedJob, type SavedState } from './state';

let data: Record<string, unknown>;
let message: (value: unknown, sender: chrome.runtime.MessageSender, reply: (value: unknown) => void) => unknown;
let action: (tab: chrome.tabs.Tab) => void;
let menu: (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => void;
let expiry: (alarm: chrome.alarms.Alarm) => void;
let installed: () => void;
const sender = { id: EXTENSION_CLIENT_ID, url: `chrome-extension://${EXTENSION_CLIENT_ID}/sidepanel.html` };
const post = 'https://www.reddit.com/r/example/comments/demo';
const send = async <T>(value: unknown, source = sender) => {
  const result = await new Promise<{ ok: boolean; value: T }>(resolve => message(value, source, resolve as (value: unknown) => void));
  expect(result.ok).toBe(true);
  return result.value;
};

beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(1_000_000_000);
  data = {};
  vi.stubGlobal('chrome', {
    runtime: { id: EXTENSION_CLIENT_ID, getURL: (path: string) => `chrome-extension://${chrome.runtime.id}/${path}`, onMessage: { addListener: (fn: typeof message) => { message = fn; } }, onInstalled: { addListener: (fn: typeof installed) => { installed = fn; } }, onStartup: { addListener: vi.fn() } },
    storage: { local: { get: vi.fn(async (key: string) => ({ [key]: structuredClone(data[key]) })), set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(data, structuredClone(values)); }), setAccessLevel: vi.fn(async () => {}) } },
    alarms: { create: vi.fn(async () => {}), clear: vi.fn(async () => true), onAlarm: { addListener: (fn: typeof expiry) => { expiry = fn; } } },
    action: { onClicked: { addListener: (fn: typeof action) => { action = fn; } } },
    sidePanel: { open: vi.fn(async () => {}) },
    contextMenus: { removeAll: vi.fn(async () => {}), create: vi.fn(), onClicked: { addListener: (fn: typeof menu) => { menu = fn; } } },
  });
  await import('./service-worker');
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('serializes first-use credentials across panel/report tabs and survives a worker restart', async () => {
  const sessions = await Promise.all(Array.from({ length: 10 }, () => send<string>({ type: 'GET_SESSION' })));
  expect(new Set(sessions).size).toBe(1);
  expect(sessions[0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(vi.mocked(chrome.storage.local.set).mock.calls.filter(([values]) => SESSION_KEY in values)).toHaveLength(1);
  vi.resetModules(); await import('./service-worker');
  expect(await send<string>({ type: 'GET_SESSION' })).toBe(sessions[0]);
});

it('accepts the actual store identity while rejecting callers from another extension', async () => {
  const id = 'p'.repeat(32);
  Object.defineProperty(chrome.runtime, 'id', { value: id });
  const value = await send<string>({ type: 'GET_SESSION' }, { id, url: `chrome-extension://${id}/sidepanel.html` });
  expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const reply = vi.fn();
  expect(message({ type: 'GET_SESSION' }, sender, reply)).toBe(false);
  expect(reply).not.toHaveBeenCalled();
});

it('persists intent before a create, records receipts without replacing a newer check, and clears only local metadata', async () => {
  const first = await send<SavedJob>({ type: 'START_JOB', sourceUrl: post });
  const second = await send<SavedJob>({ type: 'START_JOB', sourceUrl: 'https://youtu.be/jDtG_pwIIv0' });
  expect(first.investigationId).toBeUndefined();
  expect(first.key).not.toBe(second.key);
  await send({ type: 'RECORD_JOB', key: first.key, investigationId: 'inv_first' });
  const state = await send<SavedState>({ type: 'GET_STATE' });
  expect(state.currentKey).toBe(second.key);
  expect(state.jobs.find(job => job.key === first.key)?.investigationId).toBe('inv_first');
  const session = await send<string>({ type: 'GET_SESSION' });
  await send({ type: 'CLEAR_LOCAL' });
  expect(data[STATE_KEY]).toEqual({ jobs: [], candidate: null, currentKey: null });
  expect(data[SESSION_KEY]).toBe(session);
});

it('opens the real panel API synchronously on user actions and stores only selected supported URLs', async () => {
  action({ url: post, windowId: 5 } as chrome.tabs.Tab);
  expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 5 });
  expect((await send<SavedState>({ type: 'GET_STATE' })).candidate?.url).toBe(post);
  menu({ menuItemId: 'dit-analyze-link', linkUrl: 'https://x.com/example/status/123' } as chrome.contextMenus.OnClickData, { windowId: 5 } as chrome.tabs.Tab);
  expect((await send<SavedState>({ type: 'GET_STATE' })).candidate?.url).toBe('https://x.com/example/status/123');
  action({ url: 'https://private.example/inbox', windowId: 5 } as chrome.tabs.Tab);
  expect((await send<SavedState>({ type: 'GET_STATE' })).candidate?.url).toBe('');
  expect(JSON.stringify(data)).not.toContain('private.example');
});

it('removes expiring metadata through the alarm and restricts storage to extension contexts', async () => {
  installed();
  await send({ type: 'GET_STATE' });
  expect(chrome.storage.local.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
  await send({ type: 'START_JOB', sourceUrl: post });
  expect(chrome.alarms.create).toHaveBeenCalledWith('dit-expire-links', { when: Date.now() + TTL_MS });
  vi.setSystemTime(Date.now() + TTL_MS);
  expiry({ name: 'dit-expire-links' } as chrome.alarms.Alarm);
  expect((await send<SavedState>({ type: 'GET_STATE' })).jobs).toEqual([]);
  const reply = vi.fn();
  expect(message({ type: 'GET_SESSION' }, { id: 'other', url: 'https://evil.test/' }, reply)).toBe(false);
  expect(reply).not.toHaveBeenCalled();
});
