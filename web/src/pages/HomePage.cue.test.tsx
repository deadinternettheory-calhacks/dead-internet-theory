// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';

vi.mock('../components/GraveyardGlobe/GraveyardGlobe', () => ({ GraveyardGlobe: () => <div/> }));
vi.mock('../components/PlatformAvailability', () => ({ PlatformAvailability: () => <div/> }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('homepage scroll cue', () => {
  let container: HTMLDivElement;
  let root: Root;
  let scrollY = 0;
  let pageHeight = 1600;
  let originalScrollY: PropertyDescriptor | undefined;
  let originalScrollHeight: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    scrollY = 0;
    pageHeight = 1600;
    originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');
    originalScrollHeight = Object.getOwnPropertyDescriptor(document.documentElement, 'scrollHeight');
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => pageHeight });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    if (originalScrollY) Object.defineProperty(window, 'scrollY', originalScrollY);
    else Reflect.deleteProperty(window, 'scrollY');
    if (originalScrollHeight) Object.defineProperty(document.documentElement, 'scrollHeight', originalScrollHeight);
    else Reflect.deleteProperty(document.documentElement, 'scrollHeight');
    vi.useRealTimers();
  });

  function render() {
    act(() => root.render(<MemoryRouter><HomePage/></MemoryRouter>));
  }

  it('appears after five seconds of inactivity and resets on user activity', () => {
    render();
    expect(container.textContent).not.toContain('Scroll for more');

    act(() => vi.advanceTimersByTime(5000));
    expect(container.textContent).toContain('Scroll for more');

    act(() => window.dispatchEvent(new MouseEvent('mousemove')));
    expect(container.textContent).not.toContain('Scroll for more');
    act(() => vi.advanceTimersByTime(5000));
    expect(container.textContent).toContain('Scroll for more');
  });

  it('stays hidden after scrolling or when there is no content below the viewport', () => {
    render();
    scrollY = 100;
    act(() => window.dispatchEvent(new Event('scroll')));
    act(() => vi.advanceTimersByTime(5000));
    expect(container.textContent).not.toContain('Scroll for more');

    scrollY = 0;
    pageHeight = window.innerHeight;
    act(() => window.dispatchEvent(new Event('scroll')));
    act(() => vi.advanceTimersByTime(5000));
    expect(container.textContent).not.toContain('Scroll for more');
  });
});
