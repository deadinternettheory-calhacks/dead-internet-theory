import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from '../../web/src/hooks/useReducedMotion';
import { GhostPoster } from '../../web/src/components/AnalysisPlayground/PlaygroundPoster';
import type { PlaygroundPhase } from '../../web/src/components/AnalysisPlayground/playground-types';

const Scene = lazy(() => import('./PanelGhostScene'));
class GhostBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <GhostPoster phase="queued"/> : this.props.children; }
}

export function PanelGhost({ phase }: { phase: PlaygroundPhase }) {
  const reduced = useReducedMotion();
  const [optedIn, setOptedIn] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const [pulse, setPulse] = useState(0);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  const ready = useRef(0);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => setOptedIn(false), [reduced]);
  const playing = !failed && (!reduced || optedIn);
  return <button type="button" className="panel-ghost" aria-label="Make the ghost react" aria-keyshortcuts="P Escape" onKeyDown={event => {
    if (event.key === 'Escape') setPaused(true);
    else if (event.key.toLowerCase() === 'p' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) setPaused(value => !value);
  }} onClick={() => {
    if (performance.now() < ready.current) return;
    ready.current = performance.now() + 1400;
    setOptedIn(true); setPaused(false); setPulse(value => value + 1);
  }}>
    <GhostBoundary>{playing ? <Suspense fallback={<GhostPoster phase={phase}/>}><Scene animate={visible && !paused} phase={phase} pulse={pulse} onFailure={fail}/></Suspense> : <GhostPoster phase={phase}/>}</GhostBoundary>
  </button>;
}
