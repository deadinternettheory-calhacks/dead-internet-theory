import { Component, lazy, memo, Suspense, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { createGlobeMotion, stopGlobe } from '../GraveyardGlobe/globe-motion';
import { GhostPoster, PlaygroundPoster } from './PlaygroundPoster';
import { formationFor, type PlaygroundPhase } from './playground-types';
import { useIdleComments } from './useIdleComments';
import './playground.css';

const PlaygroundScene = lazy(() => import('./PlaygroundScene'));
const GhostScene = lazy(() => import('./GhostScene'));
const CommentScene = lazy(() => import('./CommentScene'));

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
  const commentsIdle = useIdleComments(background);
  const [playing, setPlaying] = useState(!reduced);
  const [visible, setVisible] = useState(true);
  const [requested, setRequested] = useState(false);
  const [ready, setReady] = useState(false);
  const [ghostReady, setGhostReady] = useState(false);
  const [commentsReady, setCommentsReady] = useState(false);
  const [ghostHovered, setGhostHovered] = useState(false);
  const [ghostFocused, setGhostFocused] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [pulse, setPulse] = useState(0);
  const reactionReady = useRef(0);
  const reactionPending = useRef(false);
  const helpId = useId();
  const animate = playing && visible && !failed;
  const motion = useRef(createGlobeMotion());
  const invalidate = useRef(() => {});
  const handleReady = useCallback((requestFrame: () => void) => { invalidate.current = requestFrame; setReady(true); }, [invalidate]);
  const handleGhostReady = useCallback(() => setGhostReady(true), []);
  const handleCommentsReady = useCallback(() => setCommentsReady(true), []);
  const handleFailure = useCallback(() => { setFailed(true); if (overlay.current) overlay.current.style.transform = ''; }, []);
  const sendPulse = useCallback(() => {
    // Let a reaction finish even if a visitor taps rapidly or holds Enter.
    if (!animate || !ghostReady || performance.now() < reactionReady.current) return;
    reactionReady.current = performance.now() + 1400;
    setPulse(p => p + 1);
  }, [animate, ghostReady]);

  const activateGhost = () => {
    if (failed) return;
    if (!animate || !ghostReady) { reactionPending.current = true; setPlaying(true); }
    else sendPulse();
  };
  useEffect(() => {
    if (animate && ghostReady && reactionPending.current) { reactionPending.current = false; sendPulse(); }
  }, [animate, ghostReady, sendPulse]);
  useEffect(() => setPlaying(!reduced), [reduced]);
  useEffect(() => {
    // Delay optional 3D work for very brief route visits.
    if (!animate || requested) return;
    const timer = window.setTimeout(() => setRequested(true), 400);
    return () => window.clearTimeout(timer);
  }, [animate, requested]);
  useEffect(() => { if (!animate) stopGlobe(motion.current); else invalidate.current(); }, [animate]);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    // A fixed viewport scene stays visible when the status/preview changes or
    // scrolls away. Only an explicit pause or a hidden tab stops its clock.
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    pointer.current = { x: 0, y: 0 };
    if (background) return;
    const move = (event: globalThis.PointerEvent) => {
      if (event.pointerType !== 'touch') pointer.current = { x: event.clientX / window.innerWidth * 2 - 1, y: event.clientY / window.innerHeight * 2 - 1 };
    };
    document.addEventListener('pointermove', move, { passive: true });
    return () => document.removeEventListener('pointermove', move);
  }, [background]);

  const shared = { animate, phase, pulse, pointer, motion, onFailure: handleFailure };
  return <>
  <div className="analysis-playground" data-background={background} data-phase={phase} data-formation={formationFor(phase)} data-playing={playing && !failed} data-animating={animate}>
    <div className="playground-stage" aria-hidden="true" data-ready={ready && !failed}>
      {background && <>
        <div className={`playground-poster${ready && !failed ? ' is-hidden' : ''}`} aria-hidden="true"><PlaygroundPoster phase={phase}/></div>
        {requested && !failed && <SceneBoundary onFailure={handleFailure}><Suspense fallback={null}>
          <PlaygroundScene {...shared} pulse={0} onReady={handleReady}/>
        </Suspense></SceneBoundary>}
      </>}
    </div>
    <span className="sr-only" id={helpId}>Click the ghost, or focus it and press Enter or Space, to make it react. Press P to pause or resume illustration motion; Escape pauses. Click a paused ghost to resume. The background is decorative and follows the real investigation stage.</span>
  </div>
  {createPortal(<>
    {background && <div className="comment-overlay" aria-hidden="true" data-idle={commentsIdle} data-ready={commentsReady && !failed}>
      {requested && !failed && <SceneBoundary onFailure={handleFailure}><Suspense fallback={null}>
        <CommentScene animate={animate} phase={phase} onReady={handleCommentsReady} onFailure={handleFailure}/>
      </Suspense></SceneBoundary>}
    </div>}
    <div className="ghost-overlay" ref={overlay} data-ready={ghostReady && !failed} data-reaction={pulse}>
      <div className={`ghost-poster${ghostReady && !failed ? ' is-hidden' : ''}`}><GhostPoster phase={phase}/></div>
      {requested && !failed && <SceneBoundary onFailure={handleFailure}><Suspense fallback={null}>
        <GhostScene {...shared} overlay={overlay} held={ghostHovered || ghostFocused} onReady={handleGhostReady}/>
      </Suspense></SceneBoundary>}
      <button type="button" className="ghost-interaction" aria-label="Make the ghost react" aria-describedby={helpId}
        aria-keyshortcuts="Enter Space P Escape" disabled={failed} onClick={activateGhost}
        onPointerEnter={() => setGhostHovered(true)} onPointerLeave={() => setGhostHovered(false)}
        onFocus={() => setGhostFocused(true)} onBlur={() => setGhostFocused(false)}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); setPlaying(false); }
          else if (event.key.toLowerCase() === 'p' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); if (!event.repeat) setPlaying(p => !p); }
        }}/>
    </div>
  </>, document.body)}
  </>;
});
