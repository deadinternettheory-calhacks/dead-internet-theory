import { Component, lazy, memo, Suspense, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useGlobeDrag } from '../GraveyardGlobe/useGlobeDrag';
import { GhostPoster, PlaygroundPoster } from './PlaygroundPoster';
import { formationFor, type PlaygroundPhase } from './playground-types';
import './playground.css';

const PlaygroundScene = lazy(() => import('./PlaygroundScene'));
const GhostScene = lazy(() => import('./GhostScene'));

class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Optional local toy. It never controls polling, provider work or analysis results. */
export const AnalysisPlayground = memo(function AnalysisPlayground({ phase, background = true }: { phase: PlaygroundPhase; background?: boolean }) {
  const pointer = useRef({ x: 0, y: 0 });
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(!reduced);
  const [visible, setVisible] = useState(true);
  const [requested, setRequested] = useState(false);
  const [ready, setReady] = useState(false);
  const [ghostReady, setGhostReady] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [pulse, setPulse] = useState(0);
  const reactionReady = useRef(0);
  const helpId = useId();
  const animate = playing && visible && !failed;
  const { stage, motion, invalidate, dragging, cancel, handlers } = useGlobeDrag(background && ready && !failed, animate, pointer);
  const handleReady = useCallback((requestFrame: () => void) => { invalidate.current = requestFrame; setReady(true); }, [invalidate]);
  const handleGhostReady = useCallback(() => setGhostReady(true), []);
  const handleFailure = useCallback(() => { setFailed(true); if (overlay.current) overlay.current.style.transform = ''; }, []);
  const sendPulse = useCallback(() => {
    // Let a reaction finish even if a visitor taps rapidly or holds Enter.
    if (!animate || !(background ? ready : ghostReady) || performance.now() < reactionReady.current) return;
    reactionReady.current = performance.now() + 1400;
    setPulse(p => p + 1);
  }, [animate, ready, ghostReady, background]);

  useEffect(() => setPlaying(!reduced), [reduced]);
  useEffect(() => {
    // Delay optional 3D work for very brief route visits.
    if (!animate || requested) return;
    const timer = window.setTimeout(() => setRequested(true), 400);
    return () => window.clearTimeout(timer);
  }, [animate, requested]);
  useEffect(() => { if (!animate) cancel(); else invalidate.current(); }, [animate, cancel, invalidate]);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    // A fixed viewport scene stays visible when the status/preview changes or
    // scrolls away. Only an explicit pause or a hidden tab stops its clock.
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    const control = (target: EventTarget | null) => target instanceof Element && target.closest('a, button, input, textarea, select, summary, [role="button"], .playground-stage');
    const down = (event: globalThis.PointerEvent) => { start = !control(event.target) && event.button === 0 ? { x: event.clientX, y: event.clientY } : null; };
    const up = (event: globalThis.PointerEvent) => {
      if (start && !control(event.target) && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) sendPulse();
      start = null;
    };
    const move = (event: globalThis.PointerEvent) => {
      if (!background && event.pointerType !== 'touch') pointer.current = { x: event.clientX / window.innerWidth * 2 - 1, y: event.clientY / window.innerHeight * 2 - 1 };
    };
    document.addEventListener('pointerdown', down, { passive: true });
    document.addEventListener('pointerup', up, { passive: true });
    document.addEventListener('pointermove', move, { passive: true });
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('pointerup', up); document.removeEventListener('pointermove', move); };
  }, [background, sendPulse]);

  const shared = { animate, phase, pulse, pointer, motion, onFailure: handleFailure };
  return <>
  <div className="analysis-playground" data-background={background} data-phase={phase} data-formation={formationFor(phase)} data-playing={playing && !failed} data-animating={animate}>
    <div className="playground-stage" ref={stage} role="group" aria-label={background ? 'Interactive investigation illustration' : 'Animated ghost companion'} aria-describedby={helpId}
      aria-keyshortcuts="Space Enter Escape Home ArrowLeft ArrowRight ArrowUp ArrowDown"
      tabIndex={failed ? undefined : 0} data-ready={(background ? ready : ghostReady) && !failed} data-dragging={dragging} {...handlers}
      onPointerUp={event => {
        const tapped = motion.current.drag?.id === event.pointerId && !motion.current.drag.moved;
        handlers.onPointerUp(event);
        if (tapped) sendPulse();
      }}
      onKeyDown={event => {
        if (event.key === ' ') { event.preventDefault(); if (!failed && !event.repeat) setPlaying(p => !p); }
        else if (event.key === 'Escape') { event.preventDefault(); setPlaying(false); }
        else if (event.key === 'Enter') { event.preventDefault(); sendPulse(); }
        else handlers.onKeyDown(event);
      }}>
      {background && <>
        <div className={`playground-poster${ready && !failed ? ' is-hidden' : ''}`} aria-hidden="true"><PlaygroundPoster phase={phase}/></div>
        {requested && !failed && <SceneBoundary onFailure={handleFailure}><Suspense fallback={null}>
          <PlaygroundScene {...shared} onReady={handleReady}/>
        </Suspense></SceneBoundary>}
      </>}
      <span className="playground-stage-hint" aria-hidden="true">{playing ? 'Tap to say hi · Space to pause' : 'Motion paused · Space to play'}</span>
    </div>
    <span className="sr-only" id={helpId}>Decorative illustration, separate from your results. It changes with the real investigation stage. Drag the background to spin, or use arrow keys. Tap or Enter makes the ghost react. Space pauses and resumes motion; Escape pauses. Home resets the view. On touch screens, swipe sideways to spin or vertically to scroll.</span>
  </div>
  {createPortal(<div className="ghost-overlay" ref={overlay} aria-hidden="true" data-ready={ghostReady && !failed}>
    <div className={`ghost-poster${ghostReady && !failed ? ' is-hidden' : ''}`}><GhostPoster phase={phase}/></div>
    {requested && !failed && <SceneBoundary onFailure={handleFailure}><Suspense fallback={null}>
      <GhostScene {...shared} overlay={overlay} onReady={handleGhostReady}/>
    </Suspense></SceneBoundary>}
  </div>, document.body)}
  </>;
});
