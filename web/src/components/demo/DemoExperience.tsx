import { ArrowLeft, ArrowRight, Check, Pause, Play, RotateCcw, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Report } from '../../analysis/report';
import { EvidenceExplorer, type EvidenceMode } from '../evidence/EvidenceExplorer';
import { useWalkthrough } from './useWalkthrough';
import './demo.css';

const STEPS = [
  { label: 'The thread', title: 'What people said.', description: 'Select a comment to read it.', mode: 'overview' },
  { label: 'The wording', title: 'Repeated wording?', description: 'Select a phrase to see who used it.', mode: 'wording' },
  { label: 'The timing', title: 'Put those comments on a timeline.', description: 'When the comments arrived.', mode: 'timing' },
  { label: 'The history', title: 'Account histories.', description: 'Recent comments from a random sample of users.', mode: 'history' },
  { label: 'The result', title: 'The result.', description: 'One score, with its evidence.', mode: 'result' },
] as const;

export function DemoExperience({ report, autoplay = false, onOpenReport }: { report: Report; autoplay?: boolean; onOpenReport: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (!stage.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.15), { threshold: 0.15 });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  // Platforms without commenter histories (TikTok, YouTube) skip the history scene.
  const steps = report.histories.length ? STEPS : STEPS.filter(s => s.mode !== 'history');
  const last = steps.length - 1;
  const { step, playing, go, toggle, pause } = useWalkthrough(autoplay, steps.length, inView);
  const current = steps[step];
  return <section className="demo-experience" aria-label="Guided example investigation">
    <div className="demo-controls">
      <div className="demo-controls-start"><button type="button" className="demo-play" onClick={toggle}
        aria-label={playing ? 'Pause walkthrough' : step === last ? 'Replay walkthrough' : 'Play walkthrough'}>
        {playing ? <Pause size={15} aria-hidden="true"/> : step === last ? <RotateCcw size={15} aria-hidden="true"/> : <Play size={15} aria-hidden="true"/>}
        {playing ? 'Pause' : step === last ? 'Replay' : 'Play walkthrough'}
      </button></div>
      <button type="button" className="demo-skip" onClick={() => { pause(); go(last); onOpenReport(); }}>Skip to full report <ArrowRight size={14} aria-hidden="true"/></button>
    </div>
    <ol className="demo-step-nav" aria-label="Walkthrough steps">{steps.map((s, index) => <li key={s.label} className={step === index ? 'is-current' : step > index ? 'is-visited' : ''} data-playing={playing && step === index}>
      <button type="button" onClick={() => go(index)} aria-current={step === index ? 'step' : undefined}>
        <span className="demo-step-number">{step > index ? <Check size={12} aria-hidden="true"/> : String(index + 1).padStart(2, '0')}</span><span>{s.label}</span>
      </button>
    </li>)}</ol>
    <div className="demo-scene-heading" key={step}>
      <span className="demo-scene-eyebrow">{step + 1} / {steps.length}</span>
      <h2 aria-live="polite">{current.title}</h2><p>{current.description}</p>
    </div>
    <div className="demo-playback-stage" ref={stage}>{current.mode === 'result' ? <div className="demo-result-scene">
      <span className="demo-result-icon"><Sparkles size={24} aria-hidden="true"/></span>
      <h3>{report.verdict.label}</h3><p>{report.verdict.description}</p>
      <div className="demo-result-observations">{report.findings.map(f => <span key={f.axis}><Check size={14} aria-hidden="true"/>{f.title}</span>)}</div>
      <button type="button" className="primary-button" onClick={onOpenReport}>Full report <ArrowRight size={16} aria-hidden="true"/></button>
    </div> : <EvidenceExplorer report={report} mode={current.mode} onInteraction={pause}
      onModeChange={(mode: EvidenceMode) => go(steps.findIndex(s => s.mode === mode))}/>}</div>
    <div className="demo-scene-footer"><span/><div>
      <button type="button" className="demo-arrow" aria-label="Previous walkthrough step" disabled={step === 0} onClick={() => go(step - 1)}><ArrowLeft size={16} aria-hidden="true"/></button>
      <button type="button" className="demo-next" disabled={step === last} onClick={() => go(step + 1)}>Next <ArrowRight size={16} aria-hidden="true"/></button>
    </div></div>
  </section>;
}
