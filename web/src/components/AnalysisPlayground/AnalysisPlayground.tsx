import { Component, lazy, memo, Suspense, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Pause, Play, Radio, Shuffle } from 'lucide-react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { ProgressPhase } from '../AnalysisProgress';
import { useGlobeDrag } from '../GraveyardGlobe/useGlobeDrag';
import { PlaygroundPoster } from './PlaygroundPoster';
import { ORBITS } from './playground-types';
import './playground.css';

const PlaygroundScene = lazy(() => import('./PlaygroundScene'));

class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Optional local toy. It never controls polling, provider work or analysis results. */
export const AnalysisPlayground = memo(function AnalysisPlayground({ phase }: { phase: ProgressPhase }) {
  const frame = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(!reduced);
  const [inView, setInView] = useState(true);
  const [visible, setVisible] = useState(true);
  const [requested, setRequested] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [orbit, setOrbit] = useState(0);
  const [pulse, setPulse] = useState(0);
  const helpId = useId();
  const animate = playing && inView && visible && !failed;
  const { stage, motion, invalidate, dragging, cancel, handlers } = useGlobeDrag(ready && !failed, animate, pointer);
  const handleReady = useCallback((requestFrame: () => void) => { invalidate.current = requestFrame; setReady(true); }, [invalidate]);
  const handleFailure = useCallback(() => setFailed(true), []);
  const sendPulse = () => { if (animate && ready) setPulse(p => p + 1); };

  useEffect(() => setPlaying(!reduced), [reduced]);
  useEffect(() => {
    // A completed cached report can arrive before any 3D code is needed.
    if (!animate || requested) return;
    const timer = window.setTimeout(() => setRequested(true), 400);
    return () => window.clearTimeout(timer);
  }, [animate, requested]);
  useEffect(() => { if (!animate) cancel(); }, [animate, cancel]);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting), { threshold: 0.05 },
    );
    if (frame.current) observer?.observe(frame.current);
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);

  return <div className="analysis-playground" ref={frame} data-orbit={ORBITS[orbit]}>
    <div className="playground-topline"><span>The signal playground</span><span className="playground-orbit-label">{ORBITS[orbit]}</span></div>
    <div className="playground-stage" ref={stage} role="group" aria-label="Interactive signal playground" aria-describedby={helpId}
      tabIndex={ready && !failed ? 0 : undefined} data-ready={ready && !failed} data-dragging={dragging} {...handlers}
      onPointerUp={event => {
        const tapped = motion.current.drag?.id === event.pointerId && !motion.current.drag.moved;
        handlers.onPointerUp(event);
        if (tapped) sendPulse();
      }}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); sendPulse(); }
        else handlers.onKeyDown(event);
      }}>
      <div className={`playground-poster${ready && !failed ? ' is-hidden' : ''}`} aria-hidden="true"><PlaygroundPoster/></div>
      {requested && !failed && <SceneBoundary onFailure={handleFailure}><Suspense fallback={null}>
        <PlaygroundScene animate={animate} phase={phase} orbit={orbit} pulse={pulse} pointer={pointer} motion={motion} onReady={handleReady} onFailure={handleFailure}/>
      </Suspense></SceneBoundary>}
      <span className="playground-stage-hint" aria-hidden="true">{ready && !failed ? 'Drag to spin · Tap to ripple' : 'A little universe, just for the wait'}</span>
    </div>
    <div className="playground-controls" aria-label="Playground controls">
      <button type="button" className="playground-pulse" onClick={sendPulse} disabled={!ready || !animate}><Radio size={16} aria-hidden="true"/>Send a pulse</button>
      <button type="button" className="playground-remix" onClick={() => setOrbit(o => (o + 1) % ORBITS.length)} disabled={!ready || failed} aria-label={`Remix the orbit. Current: ${ORBITS[orbit]}`}><Shuffle size={15} aria-hidden="true"/><span>Remix</span></button>
      <button type="button" className="playground-motion" onClick={() => setPlaying(p => !p)} disabled={failed} aria-label={playing ? 'Pause playground motion' : 'Play playground animation'} aria-pressed={playing}>
        {playing ? <Pause size={16} aria-hidden="true"/> : <Play size={16} aria-hidden="true"/>}
      </button>
    </div>
    <p className="playground-disclosure">Just a playground. Your analysis keeps running.</p>
    <span className="sr-only" id={helpId}>Decorative illustration, separate from your results. Drag to spin, or use arrow keys. Enter or Space sends a pulse. Home resets the view. On touch screens, swipe sideways to spin or vertically to scroll.</span>
  </div>;
});
