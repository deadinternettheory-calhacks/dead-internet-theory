// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GraveyardGlobe } from './GraveyardGlobe';

// Exercise motion preferences and lifecycle without requiring a GPU in the unit runner.
vi.mock('./GlobeScene', () => ({
  default: function Scene({ animate, onReady, onFailure }: { animate: boolean; onReady: () => void; onFailure: () => void }) {
    useEffect(onReady, [onReady]);
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
});
