import { useEffect, useState } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export function useWalkthrough(autoplay: boolean, count: number, inView = true) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(autoplay && !reduced);
  useEffect(() => { if (reduced) setPlaying(false); }, [reduced]);
  useEffect(() => {
    const hide = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  useEffect(() => {
    if (!playing || !inView) return;
    if (step === count - 1) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setStep(s => s + 1), 6500);
    return () => window.clearTimeout(timer);
  }, [playing, step, count, inView]);
  const go = (next: number) => { setPlaying(false); setStep(Math.max(0, Math.min(count - 1, next))); };
  const toggle = () => { if (step === count - 1) setStep(0); setPlaying(v => !v); };
  return { step, playing, go, toggle, pause: () => setPlaying(false) };
}
