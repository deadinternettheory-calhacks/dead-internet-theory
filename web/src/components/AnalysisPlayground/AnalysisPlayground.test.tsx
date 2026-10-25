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
    return <div data-testid="playground-scene"/>;
  },
}));

let root: Root;
let container: HTMLDivElement;
let reduced: boolean;
let hidden: boolean;
let preferenceChanged: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  latest = undefined;
  reduced = hidden = false;
  preferenceChanged = undefined;
  disposed.mockClear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return reduced; },
    addEventListener: (_: string, callback: () => void) => { preferenceChanged = callback; },
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
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
const stage = () => container.querySelector<HTMLElement>('.playground-stage')!;
const key = (value: string) => act(() => stage().dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })));

it('keeps a fast completed request from loading any 3D scene', async () => {
  await render();
  expect(latest).toBeUndefined();
  await act(async () => root.render(<p>Completed report</p>));
  await advance(2000);
  expect(latest).toBeUndefined();
});

it('starts reduced motion with a static illustration and allows explicit opt-in', async () => {
  reduced = true;
  await render();
  await advance();
  expect(latest).toBeUndefined();
  expect(container.querySelector('.playground-poster.is-hidden')).toBeNull();
  key(' ');
  await advance();
  expect(latest?.animate).toBe(true);
  expect(container.querySelector('.playground-poster.is-hidden')).not.toBeNull();
});

it('pauses inertia while preserving direct keyboard turns', async () => {
  await render(); await advance();
  key('ArrowRight');
  expect(latest!.motion.current.velocityYaw).toBeGreaterThan(0);
  key(' ');
  expect(latest?.animate).toBe(false);
  expect(latest!.motion.current.velocityYaw).toBe(0);
  const yaw = latest!.motion.current.yaw;
  key('ArrowLeft');
  expect(latest!.motion.current.yaw).toBeLessThan(yaw);
  expect(latest!.motion.current.velocityYaw).toBe(0);
});

it('has no buttons and changes formation only when the real phase changes, even after minutes', async () => {
  await render('queued'); await advance();
  expect(container.querySelectorAll('button')).toHaveLength(0);
  expect(container.querySelector('.analysis-playground')?.getAttribute('data-formation')).toBe('rest');
  key('Enter');
  expect(latest?.pulse).toBe(1);
  await advance(180000);
  expect(container.textContent).toContain('3:00 in this view');
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Waiting to collect public comments…');
  expect(container.querySelector('[aria-current="step"]')?.textContent).toContain('Collect public comments');
  expect(container.textContent).not.toMatch(/\d+%/);
  expect(container.querySelector('.analysis-playground')?.getAttribute('data-formation')).toBe('rest');
  await render('collecting');
  expect(container.querySelector('.analysis-playground')?.getAttribute('data-formation')).toBe('gather');
  await render('analysis-queued');
  expect(container.querySelector('.analysis-playground')?.getAttribute('data-formation')).toBe('rest');
  key(' ');
  await render();
  expect(latest?.phase).toBe('analyzing');
  expect(container.querySelector('.analysis-playground')?.getAttribute('data-formation')).toBe('inspect');
  expect(latest?.animate).toBe(false);
  expect(container.textContent).toContain('8 comments collected.');
  expect(container.querySelector('[aria-current="step"]')?.textContent).toContain('Analyze the discussion');
});

it('suspends only in hidden tabs and resumes across phase changes without remounting the viewport scene', async () => {
  await render(); await advance();
  const scene = container.querySelector('[data-testid="playground-scene"]');
  act(() => { hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  expect(latest?.animate).toBe(false);
  await render('collecting');
  await render('analyzing');
  expect(latest?.animate).toBe(false);
  act(() => { hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  expect(latest?.animate).toBe(true);
  expect(container.querySelector('[data-testid="playground-scene"]')).toBe(scene);
});

it('immediately respects a changed system preference and restores the poster on graphics loss', async () => {
  await render(); await advance();
  act(() => { reduced = true; preferenceChanged?.(); });
  expect(latest?.animate).toBe(false);
  act(() => latest!.onFailure());
  expect(container.querySelector('[data-testid="playground-scene"]')).toBeNull();
  expect(container.querySelector('.playground-poster.is-hidden')).toBeNull();
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Analyzing the discussion…');
  expect(disposed).toHaveBeenCalledOnce();
});

it('ignores accidental double-clicks and lets reactions finish under repeated input', async () => {
  await render(); await advance();
  key('Enter');
  for (let i = 0; i < 20; i++) {
    key('Enter');
    act(() => stage().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  }
  expect(latest?.pulse).toBe(1);
  expect(latest?.animate).toBe(true);
  await render('collecting');
  await render('analyzing');
  expect(latest?.animate).toBe(true);
  expect(disposed).not.toHaveBeenCalled();
  await advance(1500);
  key('Enter');
  expect(latest?.pulse).toBe(2);
  key('Escape');
  expect(latest?.animate).toBe(false);
  key(' ');
  expect(latest?.animate).toBe(true);
  act(() => stage().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true })));
  expect(latest?.animate).toBe(true);
  expect(container.querySelectorAll('button')).toHaveLength(0);
});

it('updates the reduced-motion illustration with the actual stage without loading WebGL', async () => {
  reduced = true;
  await render('collecting'); await advance();
  expect(latest).toBeUndefined();
  expect(container.querySelector('.ghost-poster-lens')).toBeNull();
  await render('analyzing');
  expect(container.querySelector('.ghost-poster-lens')).not.toBeNull();
  expect(latest).toBeUndefined();
});
