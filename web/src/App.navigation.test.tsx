// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('homepage How it works navigation', () => {
  let container: HTMLDivElement;
  let root: Root;
  let scrollY = 0;
  let sectionTop = 800;
  let scrollIntoView: ReturnType<typeof vi.fn>;
  let originalScrollIntoView: PropertyDescriptor | undefined;
  let originalScrollY: PropertyDescriptor | undefined;
  let originalInnerHeight: PropertyDescriptor | undefined;

  beforeEach(() => {
    scrollY = 0;
    sectionTop = 800;
    window.history.replaceState(null, '', '/');
    originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');
    originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    scrollIntoView = vi.fn();
    originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('scrollTo', vi.fn());
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
    else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    if (originalScrollY) Object.defineProperty(window, 'scrollY', originalScrollY);
    else Reflect.deleteProperty(window, 'scrollY');
    if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight);
    else Reflect.deleteProperty(window, 'innerHeight');
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  function renderApp(path = '/') {
    window.history.replaceState(null, '', path);
    act(() => root.render(<App />));
  }

  it('keeps the visible header link aligned, focusable, and clickable', () => {
    renderApp();
    const link = container.querySelector<HTMLAnchorElement>('.header nav a')!;
    expect(link.textContent).toBe('How it works');
    expect(link.href).toContain('/#how-it-works');
    expect(link.tabIndex).toBe(0);
    expect(link.closest('.hero')).toBeNull();
    act(() => link.focus());
    expect(document.activeElement).toBe(link);

    act(() => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })));
    expect(window.location.hash).toBe('#how-it-works');
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('updates the URL as manual scrolling enters and leaves the information section', () => {
    renderApp();
    const historyLength = window.history.length;
    const section = container.querySelector<HTMLElement>('#how-it-works')!;
    vi.spyOn(section, 'getBoundingClientRect').mockImplementation(() => ({ top: sectionTop } as DOMRect));

    scrollY = 100;
    sectionTop = 250;
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(window.location.hash).toBe('#how-it-works');
    expect(window.history.length).toBe(historyLength);
    expect(scrollIntoView).not.toHaveBeenCalled();

    scrollY = 50;
    sectionTop = 500;
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(window.location.pathname).toBe('/');
    expect(window.location.hash).toBe('');
    expect(window.history.length).toBe(historyLength);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('hides How it works on analysis screens and restores it on returning home', () => {
    renderApp('/analysis');
    expect(container.querySelector('.header nav')).toBeNull();
    const home = container.querySelector<HTMLAnchorElement>('.header .brand')!;
    act(() => home.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })));
    expect(window.location.pathname).toBe('/');
    expect(container.querySelector('.header nav a')?.textContent).toBe('How it works');
  });

  it('opens a direct homepage hash at the information section', () => {
    renderApp('/#how-it-works');
    expect(window.location.pathname).toBe('/');
    expect(window.location.hash).toBe('#how-it-works');
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('removes demo entry points and redirects old demo URLs home', () => {
    renderApp('/example?play=1');
    expect(window.location.pathname).toBe('/');
    expect(container.querySelector('a[href*="/example"]')).toBeNull();
    expect(container.textContent).not.toContain('Play demo');
    expect(container.querySelector('.home-hero h1')).not.toBeNull();
  });

  it('keeps the headline readable while isolating its emphasis', () => {
    renderApp();
    const heading = container.querySelector<HTMLHeadingElement>('.home-hero h1')!;
    expect(heading.textContent).toBe('Is this conversation being manipulated?');
    expect(heading.querySelector('span')?.textContent).toBe('manipulated?');
  });

  it('redirects the legacy /about URL to the homepage section', () => {
    renderApp('/about');
    expect(window.location.pathname).toBe('/');
    expect(window.location.hash).toBe('#how-it-works');
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
