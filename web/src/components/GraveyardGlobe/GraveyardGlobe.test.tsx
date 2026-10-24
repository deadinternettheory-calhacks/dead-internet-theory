// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GraveyardGlobe } from './GraveyardGlobe';
import type { GlobeMotion } from './globe-motion';

let renderedMotionRef: { current: GlobeMotion };
const requestFrame = vi.fn();

// Exercise motion preferences and lifecycle without requiring a GPU in the unit runner.
vi.mock('./GlobeScene', () => ({
  default: function Scene({ animate, motion, onReady, onFailure }: {
    animate: boolean; motion: { current: GlobeMotion }; onReady: (invalidate: () => void) => void; onFailure: () => void;
  }) {
    renderedMotionRef = motion;
    useEffect(() => onReady(requestFrame), [onReady]);
    return <div data-testid="scene" data-animate={animate}><button onClick={onFailure}>Lose GPU context</button></div>;
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('homepage globe motion and fallback', () => {
  let container: HTMLDivElement;
  let root: Root;
  let reducedMotion: boolean;
  let preferenceChanged: (() => void) | undefined;
  let visibilityChanged: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
  let hidden = false;

  beforeEach(() => {
    requestFrame.mockClear();
    reducedMotion = false;
    hidden = false;
    preferenceChanged = undefined;
    visibilityChanged = undefined;
    vi.stubGlobal('matchMedia', () => ({
      get matches() { return reducedMotion; },
      addEventListener: (_: string, callback: () => void) => { preferenceChanged = callback; },
      removeEventListener: vi.fn(),
    }));
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: typeof visibilityChanged) { visibilityChanged = callback; }
      observe() {}
      disconnect() {}
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function render() {
    await act(async () => { root.render(<GraveyardGlobe/>); });
  }
  function clickMotion() {
    act(() => container.querySelector<HTMLButtonElement>('.globe-motion-control')!.click());
  }
  function scene() { return container.querySelector('[data-testid="scene"]'); }
  function stage() { return container.querySelector<HTMLDivElement>('.globe-stage')!; }
  function prepareDrag() {
    const captured = new Set<number>();
    stage().setPointerCapture = vi.fn(id => { captured.add(id); });
    stage().hasPointerCapture = id => captured.has(id);
    stage().releasePointerCapture = vi.fn(id => { captured.delete(id); });
    vi.spyOn(stage(), 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 480, height: 300 } as DOMRect);
  }
  function pointer(type: string, x: number, y: number, time: number, extra = {}) {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
    Object.defineProperties(event, Object.fromEntries(Object.entries({
      pointerId: 1, pointerType: 'mouse', isPrimary: true, timeStamp: time, ...extra,
    }).map(([key, value]) => [key, { value }])));
    act(() => stage().dispatchEvent(event));
  }

  it('shows a static illustration for reduced motion, with explicit opt-in to play', async () => {
    reducedMotion = true;
    await render();
    expect(scene()).toBeNull();
    expect(container.querySelector('.globe-poster-layer.is-hidden')).toBeNull();
    expect(container.querySelector('.globe-motion-control')?.getAttribute('aria-label')).toBe('Play globe animation');
    await act(async () => { clickMotion(); });
    expect(scene()?.getAttribute('data-animate')).toBe('true');
    expect(container.querySelector('.globe-motion-control')?.getAttribute('aria-label')).toBe('Pause globe animation');
  });

  it('keeps a manual pause when the browser tab becomes visible again', async () => {
    await render();
    clickMotion();
    expect(scene()?.getAttribute('data-animate')).toBe('false');
    act(() => { hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    act(() => { hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    expect(scene()?.getAttribute('data-animate')).toBe('false');
    clickMotion();
    expect(scene()?.getAttribute('data-animate')).toBe('true');
  });

  it('suspends animation offscreen and in a hidden tab without losing the scene', async () => {
    await render();
    const originalScene = scene();
    act(() => visibilityChanged?.([{ isIntersecting: false }]));
    expect(scene()?.getAttribute('data-animate')).toBe('false');
    act(() => visibilityChanged?.([{ isIntersecting: true }]));
    expect(scene()?.getAttribute('data-animate')).toBe('true');
    act(() => { hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    expect(scene()?.getAttribute('data-animate')).toBe('false');
    act(() => { hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    expect(scene()).toBe(originalScene);
    expect(scene()?.getAttribute('data-animate')).toBe('true');
  });

  it('immediately respects a changed operating-system motion preference', async () => {
    await render();
    act(() => { reducedMotion = true; preferenceChanged?.(); });
    expect(scene()?.getAttribute('data-animate')).toBe('false');
    expect(container.querySelector('.globe-motion-control')?.getAttribute('aria-label')).toBe('Play globe animation');
  });

  it('restores the poster when the graphics context fails', async () => {
    await render();
    expect(container.querySelector('.globe-poster-layer.is-hidden')).not.toBeNull();
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="scene"] button')!.click());
    expect(scene()).toBeNull();
    expect(container.querySelector('.globe-poster-layer.is-hidden')).toBeNull();
    expect(container.querySelector('svg.globe-poster')).not.toBeNull();
    expect(container.querySelector('.globe-motion-control')).toBeNull();
  });

  it('captures a drag outside the stage and releases with momentum', async () => {
    await render();
    prepareDrag();
    pointer('pointerdown', 100, 100, 0);
    expect(stage().setPointerCapture).toHaveBeenCalledWith(1);
    expect(stage().dataset.dragging).toBe('true');
    pointer('pointermove', 600, 150, 100);
    expect(renderedMotionRef.current.yaw).toBeGreaterThan(0);
    expect(renderedMotionRef.current.pitch).toBeGreaterThan(0);
    pointer('pointerup', 600, 150, 110);
    expect(renderedMotionRef.current.velocityYaw).toBeGreaterThan(0);
    expect(stage().releasePointerCapture).toHaveBeenCalledWith(1);
    expect(stage().dataset.dragging).toBe('false');
  });

  it.each(['pointercancel', 'lostpointercapture'])('clears a cancelled drag on %s', async type => {
    await render();
    prepareDrag();
    pointer('pointerdown', 100, 100, 0);
    pointer('pointermove', 200, 100, 100);
    pointer(type, 200, 100, 110);
    expect(renderedMotionRef.current.drag).toBeNull();
    expect(renderedMotionRef.current.velocityYaw).toBe(0);
    expect(stage().dataset.dragging).toBe('false');
  });

  it('cancels a held gesture when the window loses focus or Pause is pressed', async () => {
    await render();
    prepareDrag();
    pointer('pointerdown', 100, 100, 0);
    pointer('pointermove', 200, 100, 100);
    act(() => window.dispatchEvent(new Event('blur')));
    expect(renderedMotionRef.current.drag).toBeNull();
    expect(renderedMotionRef.current.velocityYaw).toBe(0);
    pointer('pointerdown', 100, 100, 200);
    clickMotion();
    expect(renderedMotionRef.current.drag).toBeNull();
    expect(stage().hasPointerCapture(1)).toBe(false);
  });

  it('leaves vertical touch scrolling alone and ignores secondary fingers', async () => {
    await render();
    prepareDrag();
    pointer('pointerdown', 100, 100, 0, { pointerType: 'touch' });
    pointer('pointermove', 200, 100, 10, { pointerType: 'touch', pointerId: 2, isPrimary: false });
    expect(renderedMotionRef.current.yaw).toBe(0);
    pointer('pointermove', 102, 150, 20, { pointerType: 'touch' });
    expect(renderedMotionRef.current.drag).toBeNull();
    expect(stage().hasPointerCapture(1)).toBe(false);
    expect(renderedMotionRef.current.pitch).toBe(0);
  });

  it('supports direct drag and keyboard turns while paused without starting inertia', async () => {
    await render();
    prepareDrag();
    clickMotion();
    expect(stage().tabIndex).toBe(0);
    act(() => stage().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
    expect(renderedMotionRef.current.yaw).toBeGreaterThan(0);
    expect(renderedMotionRef.current.velocityYaw).toBe(0);
    const yaw = renderedMotionRef.current.yaw;
    pointer('pointerdown', 100, 100, 0);
    pointer('pointermove', 200, 100, 100);
    pointer('pointerup', 200, 100, 110);
    expect(renderedMotionRef.current.yaw).toBeGreaterThan(yaw);
    expect(renderedMotionRef.current.velocityYaw).toBe(0);
    expect(scene()?.getAttribute('data-animate')).toBe('false');
    expect(requestFrame).toHaveBeenCalled();
    act(() => stage().dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })));
    expect(renderedMotionRef.current.yaw).toBe(0);
    expect(renderedMotionRef.current.pitch).toBe(0);
  });
});
