import { Component, lazy, Suspense, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { GlobePoster } from './GlobePoster';
import { useGlobeDrag } from './useGlobeDrag';
import './graveyard-globe.css';

const GlobeScene = lazy(() => import('./GlobeScene'));

class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function GraveyardGlobe({ compact = false }: { compact?: boolean }) {
  const frame = useRef<HTMLElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const [requestedScene, setRequestedScene] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const helpId = useId();
  const { stage, motion, invalidate, dragging, cancel, handlers } = useGlobeDrag(ready && !failed, motionEnabled, pointer);
  const handleReady = useCallback((requestFrame: () => void) => {
    invalidate.current = requestFrame;
    setReady(true);
  }, [invalidate]);
  const handleFailure = useCallback(() => setFailed(true), []);

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!preference) return;
    const update = () => setMotionEnabled(!preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const update = () => setTabVisible(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting), { threshold: 0 },
    );
    if (frame.current) observer?.observe(frame.current);
    return () => {
      document.removeEventListener('visibilitychange', update);
      observer?.disconnect();
    };
  }, []);

  const animate = motionEnabled && inView && tabVisible;
  useEffect(() => { if (animate) setRequestedScene(true); }, [animate]);
  useEffect(() => {
    if (!motionEnabled || !inView || !tabVisible || failed) cancel();
  }, [motionEnabled, inView, tabVisible, failed, cancel]);

  return <figure className={`graveyard-globe${compact ? ' graveyard-globe--compact' : ''}`} ref={frame} aria-label="Illustration of a wireframe globe with gravestones">
    <div className="globe-stage" ref={stage} role="group" aria-label="Spin the globe" aria-describedby={helpId}
      tabIndex={ready && !failed ? 0 : undefined} data-interactive={ready && !failed} data-dragging={dragging} {...handlers}>
      <div className="globe-artwork" aria-hidden="true">
        <div className={`globe-poster-layer${ready && !failed ? ' is-hidden' : ''}`}><GlobePoster/></div>
        {requestedScene && !failed && <SceneBoundary onFailure={handleFailure}>
          <Suspense fallback={null}>
            <GlobeScene animate={animate} pointer={pointer} motion={motion} onReady={handleReady} onFailure={handleFailure}/>
          </Suspense>
        </SceneBoundary>}
      </div>
    </div>
    <span className="sr-only" id={helpId}>Drag to spin. On touch screens, swipe sideways to spin or vertically to scroll. Use arrow keys to turn the globe and Home to reset its orientation.</span>
  </figure>;
}
