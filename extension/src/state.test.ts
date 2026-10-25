import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import manifest from '../public/manifest.json';
import { EXTENSION_CLIENT_ID } from '../../contracts/extension-client';
import { MAX_JOBS, nextExpiry, pruneState, TTL_MS } from './state';

describe('extension identity and data lifetime', () => {
  const now = Date.now();
  const job = { key: 'ext-test', sourceUrl: 'https://www.reddit.com/r/example/comments/demo', createdAt: now - 1000, expiresAt: now - 1000 + TTL_MS, investigationId: 'inv_test' };
  it('pins the unpacked client ID to the manifest public key without requesting social-site access', () => {
    const hex = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32);
    expect(hex.replace(/[a-f0-9]/g, char => String.fromCharCode(97 + parseInt(char, 16)))).toBe(EXTENSION_CLIENT_ID);
    expect(manifest.host_permissions).toEqual(['https://www.deadinternettheory.us/*']);
    expect(manifest.permissions).not.toContain('scripting');
    expect(manifest).not.toHaveProperty('content_scripts');
  });
  it('removes expired/invalid metadata and never retains source content hidden in a stored job', () => {
    const state = pruneState({ jobs: [{ ...job, report: { secretContent: 'discard' } }, { ...job, key: 'expired', expiresAt: now }, { ...job, key: 'too-long', expiresAt: now + TTL_MS * 2 }, { ...job, key: 'unsupported', sourceUrl: 'https://example.org/' }], currentKey: job.key, candidate: { url: job.sourceUrl, selectedAt: now - TTL_MS } }, now);
    expect(state).toEqual({ jobs: [job], currentKey: job.key, candidate: null });
    expect(nextExpiry(state)).toBe(job.expiresAt);
    expect(pruneState(state, job.expiresAt)).toEqual({ jobs: [], currentKey: null, candidate: null });
  });
  it('bounds saved requests, invalidates missing current keys, and schedules the earliest metadata expiry', () => {
    const jobs = Array.from({ length: 15 }, (_, i) => ({ ...job, key: `job-${i}`, createdAt: now - i, expiresAt: now - i + TTL_MS }));
    const state = pruneState({ jobs, currentKey: 'job-14', candidate: { url: job.sourceUrl, selectedAt: now - TTL_MS + 1000 } }, now);
    expect(state.jobs).toHaveLength(MAX_JOBS);
    expect(state.currentKey).toBeNull();
    expect(nextExpiry(state)).toBe(now + 1000);
    expect(nextExpiry(pruneState(null, now))).toBeNull();
  });
});
