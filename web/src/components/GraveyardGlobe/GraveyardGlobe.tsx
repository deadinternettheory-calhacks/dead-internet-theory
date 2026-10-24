import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pause, Play } from 'lucide-react';
import { GlobePoster } from './GlobePoster';
import './graveyard-globe.css';

const GlobeScene = lazy(() => import('./GlobeScene'));

class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function GraveyardGlobe() {
  const frame = useRef<HTMLElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const [requestedScene, setRequestedScene] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

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

  return <figure className="graveyard-globe" ref={frame} aria-label="Illustration of a wireframe globe with gravestones">
    <div className="globe-stage" aria-hidden="true"
      onPointerMove={event => {
        if (event.pointerType === 'touch') return;
        const box = event.currentTarget.getBoundingClientRect();
        pointer.current = {
          x: (event.clientX - box.left) / box.width * 2 - 1,
          y: (event.clientY - box.top) / box.height * 2 - 1,
        };
      }}
      onPointerLeave={() => { pointer.current = { x: 0, y: 0 }; }}>
      <div className={`globe-poster-layer${ready && !failed ? ' is-hidden' : ''}`}><GlobePoster/></div>
      {requestedScene && !failed && <SceneBoundary onFailure={() => setFailed(true)}>
        <Suspense fallback={null}>
          <GlobeScene animate={animate} pointer={pointer} onReady={() => setReady(true)} onFailure={() => setFailed(true)}/>
        </Suspense>
      </SceneBoundary>}
    </div>
    <figcaption className="globe-caption">
      <span>Dead internet. Still spinning.</span>
      {!failed && <button type="button" className="globe-motion-control"
        aria-label={motionEnabled ? 'Pause globe animation' : 'Play globe animation'}
        onClick={() => setMotionEnabled(value => !value)}>
        {motionEnabled ? <Pause size={12} aria-hidden="true"/> : <Play size={12} aria-hidden="true"/>}
        <span>{motionEnabled ? 'Pause' : 'Play'}</span>
      </button>}
    </figcaption>
  </figure>;
}
