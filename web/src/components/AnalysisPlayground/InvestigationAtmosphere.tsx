import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useLocation } from 'react-router-dom';
import { AnalysisPlayground } from './AnalysisPlayground';
import type { PlaygroundPhase } from './playground-types';
import { parsePrefixPath } from '../../url';

const PhaseContext = createContext<Dispatch<SetStateAction<PlaygroundPhase | null>>>(() => {});

/** Publishing a phase never remounts the companion or ties its lifetime to a status card. */
export function useInvestigationPhase(phase: PlaygroundPhase) {
  const setPhase = useContext(PhaseContext);
  useEffect(() => { setPhase(phase); }, [phase, setPhase]);
  useEffect(() => () => setPhase(null), [setPhase]);
}

export function InvestigationAtmosphere({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<PlaygroundPhase | null>(null);
  const { pathname, search } = useLocation();
  const home = pathname === '/';
  const previewRoute = import.meta.env.DEV && pathname === '/dev/report';
  const analysisRoute = previewRoute || pathname === '/analysis' || pathname === '/analysis/' || parsePrefixPath(pathname, search).ok;
  return <PhaseContext.Provider value={setPhase}>
    {children}
    {(home || analysisRoute) && <AnalysisPlayground phase={home ? 'queued' : phase ?? 'starting'} background={!home}/>}
  </PhaseContext.Provider>;
}
