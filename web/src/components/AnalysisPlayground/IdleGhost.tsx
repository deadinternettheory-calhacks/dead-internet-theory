import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const IdleGhostScene = lazy(() => import('./IdleGhostScene'));
class GhostBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export function IdleGhost() {
  const host = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [activeTab, setActiveTab] = useState(true);
  useEffect(() => {
    const media = window.matchMedia?.('(min-width: 1024px)');
    if (!media) return;
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const element = host.current;
    if (!element || !desktop) return;
    if (!window.IntersectionObserver) { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, [desktop]);
  useEffect(() => {
    const update = () => setActiveTab(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return <div className="about-ghost" ref={host} aria-hidden="true">
    {desktop && visible && <GhostBoundary><Suspense fallback={null}><IdleGhostScene animate={!reduced && activeTab}/></Suspense></GhostBoundary>}
  </div>;
}
