// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getCapabilities } from '../api/client';
import { PlatformAvailability } from './PlatformAvailability';

vi.mock('../api/client', () => ({ getCapabilities: vi.fn() }));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks(); container = document.createElement('div'); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); });
const render = () => act(async () => root.render(<PlatformAvailability/>));

it('shows all four platforms and uses the backend enablement flags', async () => {
  vi.mocked(getCapabilities).mockResolvedValue({ platforms: [
    { platform: 'reddit', actorRuntimeVerified: true, liveEnabled: true },
    { platform: 'x', actorRuntimeVerified: true, liveEnabled: false },
    { platform: 'youtube', actorRuntimeVerified: true, liveEnabled: true },
    { platform: 'tiktok', actorRuntimeVerified: false, liveEnabled: false },
  ] });
  await render();
  expect([...container.querySelectorAll('li')].map(item => item.textContent)).toEqual(['XIn setup', 'RedditLive', 'TikTokIn setup', 'YouTubeLive']);
});
it('does not invent availability when the lookup fails', async () => {
  vi.mocked(getCapabilities).mockRejectedValue(new Error('offline'));
  await render();
  expect(container.querySelectorAll('li')).toHaveLength(4);
  expect(container.querySelectorAll('.is-live')).toHaveLength(0);
  expect(container.textContent).toContain('Unknown');
});
it('labels the X free-plan demo and explains its limits', async () => {
  vi.mocked(getCapabilities).mockResolvedValue({ platforms: [{ platform: 'x', actorRuntimeVerified: true, liveEnabled: true, demoLimited: true }] });
  await render();
  expect(container.querySelector('li')?.textContent).toBe('XDemo');
  expect(container.textContent).toContain('10 items/run, 5 runs/month per collector');
});
it('cancels an outstanding capability read when the homepage unmounts', async () => {
  vi.mocked(getCapabilities).mockImplementation(() => new Promise(() => {}));
  await render();
  const signal = vi.mocked(getCapabilities).mock.calls[0][0]!;
  expect(signal.aborted).toBe(false);
  await act(async () => root.render(null));
  expect(signal.aborted).toBe(true);
});
