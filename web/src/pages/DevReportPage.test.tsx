// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import DevReportPage from './DevReportPage';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('renders the complete fixture report without backend requests', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><DevReportPage/></MemoryRouter>));
    expect(container.querySelector('.dev-report-notice')).toBeNull();
    expect(container.querySelector('.report-view')?.firstElementChild?.classList.contains('result-card')).toBe(true);
    expect(container.querySelectorAll('.finding-card').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.report-accounts li').length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
