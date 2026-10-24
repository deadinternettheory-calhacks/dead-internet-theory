import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';

/** A progressive globe transition for the app's declarative router. */
export function TransitionLink({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  const navigate = useNavigate();
  return <Link to={to} className={className} onClick={event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!document.startViewTransition || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    event.preventDefault();
    const transition = document.startViewTransition(() => {
      flushSync(() => navigate(to));
    });
    // A browser may skip the animation (for example in a background tab).
    void transition.ready.catch(() => {});
    void transition.finished.catch(() => {});
  }}>{children}</Link>;
}
