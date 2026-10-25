// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnalysisProgress, type ProgressPhase } from '../AnalysisProgress';
import { AnalysisPlayground } from './AnalysisPlayground';
import type { PlaygroundSceneProps } from './playground-types';

let latest: PlaygroundSceneProps | undefined;
let latestGhost: PlaygroundSceneProps | undefined;
let latestComments: Pick<PlaygroundSceneProps, 'animate' | 'phase' | 'onReady' | 'onFailure'> | undefined;
const disposed = vi.fn();
vi.mock('./PlaygroundScene', () => ({
  default: function Scene(props: PlaygroundSceneProps) {
    latest = props;
    useEffect(() => { props.onReady(() => {}); return disposed; }, [props.onReady]);
    return <div data-testid="playground-scene"/>;
  },
}));

vi.mock('./GhostScene', () => ({
  default: function GhostScene(props: PlaygroundSceneProps) {
    latestGhost = props;
    useEffect(() => { props.onReady(() => {}); }, [props.onReady]);
    return <div data-testid="ghost-scene"/>;
  },
}));

vi.mock('./CommentScene', () => ({
  default: function CommentScene(props: NonNullable<typeof latestComments>) {
    latestComments = props;
    useEffect(() => { props.onReady(() => {}); }, [props.onReady]);
    return <div data-testid="comment-scene"/>;
  },
}));

let root: Root;
let container: HTMLDivElement;
let reduced: boolean;
let hidden: boolean;
let preferenceChanged: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  latest = latestGhost = latestComments = undefined;
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
  root.render(<><AnalysisProgress phase={phase} status={phase === 'analyzing' ? 'Analyzing the discussion…' : 'Waiting to collect public comments…'} collectedCount={8}/><AnalysisPlayground phase={phase}/></>);
});
const advance = async (ms = 450) => act(async () => vi.advanceTimersByTimeAsync(ms));
const stage = () => container.querySelector<HTMLElement>('.playground-stage')!;
const ghost = () => document.querySelector<HTMLButtonElement>('.ghost-interaction')!;
const clickGhost = () => act(() => ghost().click());
const key = (value: string) => act(() => ghost().dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })));

it('skips optional 3D for a route visit shorter than the lazy delay', async () => {
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
  clickGhost();
  await advance();
  expect(latest?.animate).toBe(true);
  expect(container.querySelector('.playground-poster.is-hidden')).not.toBeNull();
});

it('ignores globe gestures and page clicks while only the ghost triggers reactions', async () => {
  await render(); await advance();
  const before = { ...latest!.motion.current };
  act(() => {
    stage().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10 }));
    stage().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 200 }));
    stage().dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 200 }));
    stage().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });
  expect(latest!.motion.current).toEqual(before);
  expect(latestGhost?.pulse).toBe(0);
  expect(stage().getAttribute('aria-hidden')).toBe('true');
  expect(stage().hasAttribute('tabindex')).toBe(false);
  clickGhost();
  expect(latestGhost?.pulse).toBe(1);
  expect(latest?.pulse).toBe(0);
  expect(latestComments?.phase).toBe('analyzing');
});

it('has only a ghost interaction target and changes formation only when the real phase changes, even after minutes', async () => {
  await render('queued'); await advance();
  expect(container.querySelectorAll('button')).toHaveLength(0);
  expect(document.querySelectorAll('.ghost-overlay button')).toHaveLength(1);
  expect(container.querySelector('.analysis-playground')?.getAttribute('data-formation')).toBe('rest');
  clickGhost();
  expect(latestGhost?.pulse).toBe(1);
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
  key('p');
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
  clickGhost();
  for (let i = 0; i < 20; i++) {
    clickGhost();
    act(() => ghost().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  }
  expect(latestGhost?.pulse).toBe(1);
  expect(latest?.animate).toBe(true);
  await render('collecting');
  await render('analyzing');
  expect(latest?.animate).toBe(true);
  expect(disposed).not.toHaveBeenCalled();
  await advance(1500);
  clickGhost();
  expect(latestGhost?.pulse).toBe(2);
  key('Escape');
  expect(latest?.animate).toBe(false);
  key('p');
  expect(latest?.animate).toBe(true);
  act(() => ghost().dispatchEvent(new KeyboardEvent('keydown', { key: 'p', repeat: true, bubbles: true })));
  expect(latest?.animate).toBe(true);
  expect(container.querySelectorAll('button')).toHaveLength(0);
  expect(document.querySelectorAll('.ghost-overlay button')).toHaveLength(1);
});

it('updates the reduced-motion illustration with the actual stage without loading WebGL', async () => {
  reduced = true;
  await render('collecting'); await advance();
  expect(latest).toBeUndefined();
  expect(document.querySelector('.ghost-poster-lens')).toBeNull();
  await render('analyzing');
  expect(document.querySelector('.ghost-poster-lens')).not.toBeNull();
  expect(latest).toBeUndefined();
});

it('renders only the foreground companion on the landing page without a second world', async () => {
  await act(async () => root.render(<AnalysisPlayground phase="queued" background={false}/>));
  await advance();
  expect(latest).toBeUndefined();
  expect(latestGhost?.animate).toBe(true);
  expect(container.querySelector('.playground-poster')).toBeNull();
  expect(document.querySelector('.ghost-overlay [data-testid="ghost-scene"]')).not.toBeNull();
  key('Escape');
  expect(latestGhost?.animate).toBe(false);
});

it('places noninteractive comments in their own portal and keeps the ghost accessible above them', async () => {
  await render(); await advance();
  expect(document.querySelector('.comment-overlay [data-testid="comment-scene"]')).not.toBeNull();
  expect(document.querySelector('.ghost-overlay [data-testid="ghost-scene"]')).not.toBeNull();
  expect(ghost().closest('[aria-hidden="true"]')).toBeNull();
  expect(ghost().getAttribute('aria-label')).toBe('Make the ghost react');
  expect(container.querySelector('[data-testid="comment-scene"]')).toBeNull();
});

it('lets a click resume a paused ghost without resetting the real investigation phase', async () => {
  await render(); await advance();
  key('Escape');
  expect(latestGhost?.animate).toBe(false);
  clickGhost();
  expect(latestGhost?.animate).toBe(true);
  expect(latestGhost?.pulse).toBe(1);
  expect(latestGhost?.phase).toBe('analyzing');
});
