import { EXTENSION_CLIENT_ID, EXTENSION_SESSION_PATTERN } from '../../contracts/extension-client.mjs';
import { parsePostUrl, SUPPORTED_POST_HOSTS } from '../../web/src/url';
import { nextExpiry, pruneState, SESSION_KEY, STATE_KEY, TTL_MS, validId, type SavedState, type WorkerRequest } from './state';

const EXPIRY_ALARM = 'dit-expire-links';
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.catch(() => {});
  return result;
}
async function save(state: SavedState) {
  await chrome.storage.local.set({ [STATE_KEY]: state });
  const expiry = nextExpiry(state);
  if (expiry === null) await chrome.alarms.clear(EXPIRY_ALARM);
  else await chrome.alarms.create(EXPIRY_ALARM, { when: expiry });
}
async function read() {
  const stored = await chrome.storage.local.get(STATE_KEY);
  const state = pruneState(stored[STATE_KEY]);
  if (JSON.stringify(state) !== JSON.stringify(stored[STATE_KEY])) await save(state);
  return state;
}
async function handle(message: WorkerRequest): Promise<unknown> {
  if (chrome.runtime.id !== EXTENSION_CLIENT_ID) throw new Error('This extension has an unexpected ID. Load the packaged extension folder.');
  if (message.type === 'GET_SESSION') {
    const stored = await chrome.storage.local.get(SESSION_KEY);
    if (typeof stored[SESSION_KEY] === 'string' && EXTENSION_SESSION_PATTERN.test(stored[SESSION_KEY])) return stored[SESSION_KEY];
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const nonce = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await chrome.storage.local.set({ [SESSION_KEY]: nonce });
    return nonce;
  }
  const state = await read();
  if (message.type === 'GET_STATE') return state;
  if (message.type === 'START_JOB') {
    const parsed = parsePostUrl(message.sourceUrl);
    if (!parsed.ok) throw new Error('Choose a public Reddit, X, TikTok or YouTube post link.');
    const now = Date.now();
    const job = { key: `ext-${crypto.randomUUID()}`, sourceUrl: parsed.url.href, createdAt: now, expiresAt: now + TTL_MS };
    state.jobs = [job, ...state.jobs].slice(0, 10);
    state.currentKey = job.key;
    await save(state);
    return job;
  }
  if (message.type === 'RECORD_JOB') {
    if (!validId(message.key) || !validId(message.investigationId)) throw new Error('Invalid investigation receipt.');
    const job = state.jobs.find(job => job.key === message.key);
    if (job) { job.investigationId = message.investigationId; await save(state); }
    return state;
  }
  if (message.type === 'CLEAR_LOCAL') {
    const empty: SavedState = { candidate: null, jobs: [], currentKey: null };
    await save(empty);
    return empty;
  }
  throw new Error('Unknown extension request.');
}

chrome.runtime.onMessage.addListener((message: WorkerRequest, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  void serial(() => handle(message)).then(value => reply({ ok: true, value }), () => reply({ ok: false, error: 'The extension could not save this request. Reload the extension and try again.' }));
  return true;
});

function selectPost(url: string | undefined, tab: chrome.tabs.Tab | undefined) {
  // Open synchronously while Chrome's user gesture is still active. Selection
  // storage can finish afterward; the panel also observes storage changes.
  if (tab?.windowId !== undefined) void chrome.sidePanel.open({ windowId: tab.windowId }).catch(error => console.error('Could not open the side panel.', error));
  void serial(async () => {
    const state = await read();
    const parsed = parsePostUrl(url ?? '');
    state.candidate = { url: parsed.ok ? parsed.url.href : '', selectedAt: Date.now() };
    await save(state);
  });
}
chrome.action.onClicked.addListener(tab => selectPost(tab.url, tab));
chrome.contextMenus.onClicked.addListener((info, tab) => { if (info.menuItemId === 'dit-analyze-link') selectPost(info.linkUrl, tab); });

async function initialize() {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await read();
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'dit-analyze-link', title: 'Analyze with Dead Internet Theory', contexts: ['link'],
    targetUrlPatterns: SUPPORTED_POST_HOSTS.map(host => `*://${host}/*`),
  });
}
chrome.runtime.onInstalled.addListener(() => { void serial(initialize); });
chrome.runtime.onStartup.addListener(() => { void serial(initialize); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === EXPIRY_ALARM) void serial(read); });
