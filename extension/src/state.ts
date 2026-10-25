import { parsePostUrl } from '../../web/src/url';

export const STATE_KEY = 'dit-state';
export const SESSION_KEY = 'dit-session';
export const TTL_MS = 24 * 60 * 60_000;
export const MAX_JOBS = 10;

export interface SavedJob {
  key: string;
  sourceUrl: string;
  createdAt: number;
  expiresAt: number;
  investigationId?: string;
}
export interface SavedState {
  candidate: { url: string; selectedAt: number } | null;
  jobs: SavedJob[];
  currentKey: string | null;
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object';
export const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

/** Stored links and IDs expire; report/source contents are never persisted here. */
export function pruneState(value: unknown, now = Date.now()): SavedState {
  const state = record(value) ? value : {};
  const jobs = (Array.isArray(state.jobs) ? state.jobs : []).filter((job): job is SavedJob =>
    record(job) && validId(job.key) && typeof job.sourceUrl === 'string' && parsePostUrl(job.sourceUrl).ok
    && typeof job.createdAt === 'number' && Number.isFinite(job.createdAt) && job.createdAt <= now
    && typeof job.expiresAt === 'number' && job.expiresAt > now && job.expiresAt <= job.createdAt + TTL_MS
    && (job.investigationId === undefined || validId(job.investigationId)),
  ).sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_JOBS).map(job => ({ key: job.key, sourceUrl: job.sourceUrl, createdAt: job.createdAt, expiresAt: job.expiresAt, ...(job.investigationId ? { investigationId: job.investigationId } : {}) }));
  const candidate = record(state.candidate) && typeof state.candidate.url === 'string'
    && (state.candidate.url === '' || parsePostUrl(state.candidate.url).ok)
    && typeof state.candidate.selectedAt === 'number' && state.candidate.selectedAt <= now && state.candidate.selectedAt + TTL_MS > now
    ? { url: state.candidate.url, selectedAt: state.candidate.selectedAt } : null;
  return { candidate, jobs, currentKey: jobs.some(job => job.key === state.currentKey) ? state.currentKey as string : null };
}

export function nextExpiry(state: SavedState): number | null {
  const times = [...state.jobs.map(job => job.expiresAt), ...(state.candidate ? [state.candidate.selectedAt + TTL_MS] : [])];
  return times.length ? Math.min(...times) : null;
}

export type WorkerRequest =
  | { type: 'GET_STATE' }
  | { type: 'GET_SESSION' }
  | { type: 'START_JOB'; sourceUrl: string }
  | { type: 'RECORD_JOB'; key: string; investigationId: string }
  | { type: 'CLEAR_LOCAL' };

export async function requestWorker<T>(message: WorkerRequest): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as { ok: boolean; value?: T; error?: string } | undefined;
  if (!response?.ok) throw new Error(response?.error ?? 'The extension could not connect. Reload it in chrome://extensions.');
  return response.value as T;
}
