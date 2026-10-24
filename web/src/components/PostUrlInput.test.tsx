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

  function renderInput() {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<PostUrlInput onSubmit={vi.fn()} />));
    return container;
  }

  it('shows the empty-link alert only after an empty submission', () => {
    const page = renderInput();
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
