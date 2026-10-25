// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInvestigation, getCapabilities } from './api/client';
import App from './App';

vi.mock('./api/client', async original => ({
  ...await original<typeof import('./api/client')>(),
  createInvestigation: vi.fn(() => new Promise(() => {})),
  getCapabilities: vi.fn(() => Promise.resolve({ platforms: [] })),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('URL-prefix investigation routing', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.mocked(createInvestigation).mockClear();
    vi.mocked(getCapabilities).mockClear();
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.history.replaceState(null, '', '/');
  });

  async function renderPrefix(path: string) {
    window.history.replaceState(null, '', path);
    await act(async () => { root.render(<App />); });
  }

  it.each([
    ['/https://www.reddit.com/r/Roms/comments/7hxzro/some_pokemon_roms/', 'https://www.reddit.com/r/Roms/comments/7hxzro/some_pokemon_roms/'],
    ['/https://x.com/example/status/123456789', 'https://x.com/example/status/123456789'],
    ['/https://www.youtube.com/watch?v=jDtG_pwIIv0&si=share', 'https://www.youtube.com/watch?v=jDtG_pwIIv0&si=share'],
    ['/https://www.tiktok.com/@example/video/7653941272524115231', 'https://www.tiktok.com/@example/video/7653941272524115231'],
  ])('renders %s as an investigation without replacing the prefix address', async (path, sourceUrl) => {
    await renderPrefix(path);

    expect(container.textContent).toContain('Your investigation.');
    expect(`${window.location.pathname}${window.location.search}`).toBe(path);
    expect(createInvestigation).toHaveBeenCalledWith(sourceUrl, expect.any(String));
  });

  it('keeps an encoded external fragment and preserves the prefix address', async () => {
    const sourceUrl = 'https://www.reddit.com/r/Roms/comments/7hxzro/some_pokemon_roms/#comment';
    const path = `/${encodeURIComponent(sourceUrl)}`;
    await renderPrefix(path);

    expect(`${window.location.pathname}${window.location.search}`).toBe(path);
    expect(createInvestigation).toHaveBeenCalledWith(sourceUrl, expect.any(String));
  });

  it('uses the same idempotency key after a prefix-route refresh', async () => {
    const path = '/https://www.reddit.com/r/Roms/comments/7hxzro/some_pokemon_roms/?context=3';
    await renderPrefix(path);
    const firstKey = vi.mocked(createInvestigation).mock.calls[0][1];

    act(() => root.unmount());
    root = createRoot(container);
    await renderPrefix(path);

    expect(`${window.location.pathname}${window.location.search}`).toBe(path);
    expect(vi.mocked(createInvestigation).mock.calls[1][1]).toBe(firstKey);
  });

  it('shows the unsupported state for an invalid prefix without creating an investigation', async () => {
    await renderPrefix('/https://example.invalid/post/123');

    expect(container.textContent).toContain("We can't check this link yet.");
    expect(createInvestigation).not.toHaveBeenCalled();
  });
});
