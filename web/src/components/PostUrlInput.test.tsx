// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostUrlInput } from './SiteLayout';

describe('homepage URL input errors', () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderInput(onSubmit = vi.fn()) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<PostUrlInput onSubmit={onSubmit} />));
    return container;
  }

  it.each(['https://x.com/example/status/123456789','https://www.reddit.com/r/example/comments/abc123/','https://www.tiktok.com/@example/video/7653941272524115231','https://youtu.be/jDtG_pwIIv0?si=share'])('submits a supported platform link without a Reddit-only error: %s', url => {
    const onSubmit = vi.fn();
    const page = renderInput(onSubmit);
    const input = page.querySelector('input')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { setValue.call(input, url); input.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(onSubmit).toHaveBeenCalledWith(url);
    expect(page.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the empty-link alert only after an empty submission', () => {
    const page = renderInput();
    expect(page.querySelector('input')?.getAttribute('placeholder')).toBe('Paste a post or video link…');
    expect(page.querySelector('[role="alert"]')).toBeNull();

    act(() => page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

    expect(page.querySelector('[role="alert"]')?.textContent).toBe('Paste a post link to get started.');
    expect(page.querySelector('input')?.getAttribute('aria-describedby')).toBe('url-error');
  });

  it('clears an error when the input changes to a valid URL', () => {
    const page = renderInput();
    act(() => page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    const input = page.querySelector('input')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;

    act(() => {
      setValue.call(input, 'https://reddit.com/r/example/comments/abc123/post');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });
});
