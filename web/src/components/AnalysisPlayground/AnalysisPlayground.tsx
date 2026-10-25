import { Component, lazy, memo, Suspense, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { ProgressPhase } from '../AnalysisProgress';
import { useGlobeDrag } from '../GraveyardGlobe/useGlobeDrag';
import { PlaygroundPoster } from './PlaygroundPoster';
import { formationFor } from './playground-types';
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

  return <div className="analysis-playground" ref={frame} data-phase={phase} data-formation={formationFor(phase)} data-playing={playing && !failed}>
    <div className="playground-stage" ref={stage} role="group" aria-label="Interactive investigation illustration" aria-describedby={helpId}
      aria-keyshortcuts="Space Enter Escape Home ArrowLeft ArrowRight ArrowUp ArrowDown"
      tabIndex={failed ? undefined : 0} data-ready={ready && !failed} data-dragging={dragging} {...handlers}
      onDoubleClick={() => { if (!failed) setPlaying(p => !p); }}
      onPointerUp={event => {
        const tapped = motion.current.drag?.id === event.pointerId && !motion.current.drag.moved;
        handlers.onPointerUp(event);
        if (tapped) sendPulse();
      }}
      onKeyDown={event => {
        if (event.key === ' ') { event.preventDefault(); if (!failed) setPlaying(p => !p); }
        else if (event.key === 'Escape') { event.preventDefault(); setPlaying(false); }
        else if (event.key === 'Enter') { event.preventDefault(); sendPulse(); }
        else handlers.onKeyDown(event);
      }}>
      <div className={`playground-poster${ready && !failed ? ' is-hidden' : ''}`} aria-hidden="true"><PlaygroundPoster phase={phase}/></div>
      {requested && !failed && <SceneBoundary onFailure={handleFailure}><Suspense fallback={null}>
        <PlaygroundScene animate={animate} phase={phase} pulse={pulse} pointer={pointer} motion={motion} onReady={handleReady} onFailure={handleFailure}/>
      </Suspense></SceneBoundary>}
      <span className="playground-stage-hint" aria-hidden="true">{playing ? 'Drag to spin · Tap to say hi · Space to pause' : 'Motion paused · Space or double-click to play'}</span>
    </div>
    <span className="sr-only" id={helpId}>Decorative illustration, separate from your results. It changes with the real investigation stage. Drag to spin, or use arrow keys. Tap or Enter makes the ghost react. Space or double-click pauses and resumes motion; Escape pauses. Home resets the view. On touch screens, swipe sideways to spin or vertically to scroll.</span>
  </div>;
});
