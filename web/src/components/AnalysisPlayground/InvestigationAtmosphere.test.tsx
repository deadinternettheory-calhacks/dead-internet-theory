// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { InvestigationAtmosphere, useInvestigationPhase } from './InvestigationAtmosphere';
import type { PlaygroundPhase } from './playground-types';

const disposed = vi.fn();
vi.mock('./AnalysisPlayground', () => ({ AnalysisPlayground: ({ phase, background }: { phase: string; background: boolean }) => {
  useEffect(() => disposed, []);
  return <div className="test-atmosphere" data-phase={phase} data-background={background}/>;
} }));

function Analysis({ phase }: { phase: PlaygroundPhase }) { useInvestigationPhase(phase); return <p>Report</p>; }
function Page({ phase }: { phase: PlaygroundPhase }) {
  const { pathname } = useLocation(), navigate = useNavigate();
  return <><button onClick={() => navigate('/analysis')}>Analyze</button><button onClick={() => navigate('/')}>Home</button><button onClick={() => navigate('/example')}>Example</button>{pathname === '/analysis' && <Analysis phase={phase}/>}</>;
}

it('keeps one companion through landing, analysis phases and completion, and releases it on other routes', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  disposed.mockClear();
  const host = document.createElement('div'), root = createRoot(host);
  const render = (phase: PlaygroundPhase) => act(async () => root.render(<MemoryRouter><InvestigationAtmosphere><Page phase={phase}/></InvestigationAtmosphere></MemoryRouter>));
  try {
    await render('queued');
    const scene = host.querySelector('.test-atmosphere');
    expect(scene?.getAttribute('data-background')).toBe('false');
    await act(async () => host.querySelectorAll('button')[0].click());
    for (const phase of ['collecting', 'analyzing', 'complete'] as const) {
      await render(phase);
      expect(host.querySelector('.test-atmosphere')).toBe(scene);
      expect(scene?.getAttribute('data-phase')).toBe(phase);
      expect(scene?.getAttribute('data-background')).toBe('true');
    }
    expect(disposed).not.toHaveBeenCalled();
    await act(async () => host.querySelectorAll('button')[1].click());
    expect(host.querySelector('.test-atmosphere')).toBe(scene);
    expect(scene?.getAttribute('data-background')).toBe('false');
    await act(async () => host.querySelectorAll('button')[2].click());
    expect(host.querySelector('.test-atmosphere')).toBeNull();
    expect(disposed).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); }
});
