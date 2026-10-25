import { useEffect, useState } from 'react';

const IDLE_MS = 3000;

/** Keep illustrations behind reading controls until the visitor stops interacting. */
export function useIdleComments(enabled: boolean) {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    setIdle(false);
    if (!enabled) return;
    let timer: number | undefined;
    const active = () => {
      window.clearTimeout(timer);
      setIdle(false);
      if (!document.hidden) timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    };
    const events = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'focusin', 'scroll'] as const;
    // Capture nested scrolls, too. Never prevent native report input.
    for (const event of events) document.addEventListener(event, active, { passive: true, capture: true });
    document.addEventListener('visibilitychange', active);
    active();
    return () => {
      window.clearTimeout(timer);
      for (const event of events) document.removeEventListener(event, active, true);
      document.removeEventListener('visibilitychange', active);
    };
  }, [enabled]);

  return idle;
}
