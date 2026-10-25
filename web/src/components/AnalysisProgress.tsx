import { useEffect, useState } from 'react';
import { Check, Clock3 } from 'lucide-react';
import './report.css';

export type ProgressPhase = 'starting' | 'queued' | 'collecting' | 'analysis-queued' | 'analyzing';

/** One progress presentation for live work and retained-result transitions. */
export function AnalysisProgress({ phase, status, collectedCount }: { phase: ProgressPhase; status: string; collectedCount?: number }) {
  const [started] = useState(Date.now);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [started]);
  const active = phase === 'starting' ? 0 : phase === 'analyzing' || phase === 'analysis-queued' ? 2 : 1;
  const stages = ['Submit request', 'Fetch comments', 'Analyze the discussion'];
  let description = 'Connecting to the analysis service.';
  if (phase === 'analyzing' || phase === 'analysis-queued') {
    description = `${collectedCount === undefined ? 'The discussion is ready.' : `${collectedCount} comments collected.`} ${phase === 'analysis-queued' ? 'The discussion is waiting for analysis to begin.' : 'Preparing the analysis and supporting evidence.'}`;
  } else if (phase === 'queued') {
    description = 'Your request is queued for collection. This page will update when collection begins.';
  } else if (phase === 'collecting') {
    description = 'Preparing the discussion and available comments.';
  }
  return <section className="analysis-progress analysis-progress--immersive" aria-label="Analysis progress">
    <div className="progress-heading"><span className="report-eyebrow">YOUR INVESTIGATION</span><span className="progress-elapsed"><Clock3 size={12} aria-hidden="true"/>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} in this view</span></div>
    <div className="analysis-progress-body">
      <div className="progress-copy">
        <div className="progress-status" role="status"><span className="loading-indicator" aria-hidden="true"/><h2>{status}</h2></div>
        <p>{description}</p>
        <p className="progress-wait-invitation">Click the ghost to say hello.</p>
      </div>
    </div>
    <ol className="progress-stages">{stages.map((label, index) => <li key={label} className={index < active ? 'is-done' : index === active ? 'is-current' : ''} aria-current={index === active ? 'step' : undefined}>
      <span className="progress-stage-icon" aria-hidden="true">{index < active ? <Check size={13}/> : index + 1}</span><span>{label}{index < active && <small>Complete</small>}{index === active && <small>{phase === 'queued' || phase === 'analysis-queued' ? 'Queued' : 'In progress'}</small>}</span>
    </li>)}</ol>
  </section>;
}
