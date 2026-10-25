// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnalysisProgress, type ProgressPhase } from '../AnalysisProgress';
import type { PlaygroundSceneProps } from './playground-types';

let latest: PlaygroundSceneProps | undefined;
const disposed = vi.fn();
vi.mock('./PlaygroundScene', () => ({
  default: function Scene(props: PlaygroundSceneProps) {
    latest = props;
    useEffect(() => { props.onReady(() => {}); return disposed; }, [props.onReady]);
    return <div data-testid="playground-scene"><button onClick={props.onFailure}>Simulate graphics loss</button></div>;
  },
}));

let root: Root;
let container: HTMLDivElement;
let reduced: boolean;
let hidden: boolean;
let preferenceChanged: (() => void) | undefined;
let intersect: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
const disconnected = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  latest = undefined;
  reduced = hidden = false;
  preferenceChanged = undefined;
  intersect = undefined;
  disposed.mockClear();
  disconnected.mockClear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return reduced; },
    addEventListener: (_: string, callback: () => void) => { preferenceChanged = callback; },
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof intersect) { intersect = callback; }
    observe() {}
    disconnect() { disconnected(); }
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const render = async (phase: ProgressPhase = 'analyzing') => act(async () => {
  root.render(<AnalysisProgress phase={phase} status={phase === 'analyzing' ? 'Analyzing the discussion…' : 'Waiting to collect public comments…'} collectedCount={8}/>);
});
const advance = async (ms = 450) => act(async () => vi.advanceTimersByTimeAsync(ms));
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label^="${label}"]`)!;
const stage = () => container.querySelector<HTMLElement>('.playground-stage')!;

it('keeps a fast completed request from loading any 3D scene', async () => {
  await render();
  expect(latest).toBeUndefined();
  await act(async () => root.render(<p>Completed report</p>));
  await advance(2000);
  expect(latest).toBeUndefined();
  expect(disconnected).toHaveBeenCalledOnce();
});

it('starts reduced motion with a static illustration and allows explicit opt-in', async () => {
  reduced = true;
  await render();
  await advance();
  expect(latest).toBeUndefined();
  expect(container.querySelector('.playground-poster.is-hidden')).toBeNull();
  await act(async () => button('Play playground').click());
  await advance();
  expect(latest?.animate).toBe(true);
  expect(container.querySelector('.playground-poster.is-hidden')).not.toBeNull();
});

it('pauses inertia while preserving direct keyboard turns', async () => {
  await render(); await advance();
  act(() => stage().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
  expect(latest!.motion.current.velocityYaw).toBeGreaterThan(0);
  await act(async () => button('Pause playground').click());
  expect(latest?.animate).toBe(false);
  expect(latest!.motion.current.velocityYaw).toBe(0);
  const yaw = latest!.motion.current.yaw;
  act(() => stage().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })));
  expect(latest!.motion.current.yaw).toBeLessThan(yaw);
  expect(latest!.motion.current.velocityYaw).toBe(0);
});

it('keeps playful pulses and remixing independent of real progress, including after minutes', async () => {
  await render('queued'); await advance();
  act(() => stage().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
  await act(async () => button('Remix').click());
  expect(latest?.pulse).toBe(1);
  expect(latest?.orbit).toBe(1);
  await advance(180000);
  expect(container.textContent).toContain('3:00 in this view');
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Waiting to collect public comments…');
  expect(container.querySelector('[aria-current="step"]')?.textContent).toContain('Collect public comments');
  expect(container.textContent).not.toMatch(/\d+%/);
  await act(async () => button('Pause playground').click());
  await render();
  expect(latest?.phase).toBe('analyzing');
  expect(latest?.orbit).toBe(1);
  expect(latest?.animate).toBe(false);
  expect(container.textContent).toContain('8 comments collected.');
  expect(container.querySelector('[aria-current="step"]')?.textContent).toContain('Analyze the discussion');
});

it('suspends rendering offscreen and in background tabs without losing the scene', async () => {
  await render(); await advance();
  const scene = container.querySelector('[data-testid="playground-scene"]');
  act(() => intersect?.([{ isIntersecting: false }]));
  expect(latest?.animate).toBe(false);
  act(() => intersect?.([{ isIntersecting: true }]));
  expect(latest?.animate).toBe(true);
  act(() => { hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  expect(latest?.animate).toBe(false);
  act(() => { hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  expect(latest?.animate).toBe(true);
  expect(container.querySelector('[data-testid="playground-scene"]')).toBe(scene);
});

it('immediately respects a changed system preference and restores the poster on graphics loss', async () => {
  await render(); await advance();
  act(() => { reduced = true; preferenceChanged?.(); });
  expect(latest?.animate).toBe(false);
  act(() => container.querySelector<HTMLButtonElement>('[data-testid="playground-scene"] button')!.click());
  expect(container.querySelector('[data-testid="playground-scene"]')).toBeNull();
  expect(container.querySelector('.playground-poster.is-hidden')).toBeNull();
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Analyzing the discussion…');
  expect(disposed).toHaveBeenCalledOnce();
});
