import { ArrowLeft, ArrowRight, Check, Pause, Play, RotateCcw, Sparkles } from 'lucide-react';
import type { Report } from '../../analysis/report';
import { EvidenceExplorer, type EvidenceMode } from '../evidence/EvidenceExplorer';
import { useWalkthrough } from './useWalkthrough';
import './demo.css';

const STEPS = [
  { label: 'The thread', title: 'It starts with an ordinary question.', description: 'Someone wants a recommendation. Select a node to read the comments that follow.', mode: 'overview' },
  { label: 'The wording', title: 'Some words start to sound familiar.', description: 'Compare the phrases in the cited recommendations. Select a phrase, then open the comments that contain it.', mode: 'wording' },
  { label: 'The timing', title: 'Put those comments on a timeline.', description: 'Compare the cited recommendations with the rest of the discussion. Similar timing is a clue to examine, with innocent explanations too.', mode: 'timing' },
  { label: 'The history', title: 'One comment is only part of the story.', description: 'Explore the returned public-history samples. Partial and unavailable histories are shown explicitly.', mode: 'history' },
  { label: 'The result', title: 'A finding you can follow back to its source.', description: 'The report brings these observations together, shows its evidence, and explains what it cannot establish.', mode: 'result' },
] as const;

export function DemoExperience({ report, autoplay = false, onOpenReport }: { report: Report; autoplay?: boolean; onOpenReport: () => void }) {
  const { step, playing, go, toggle, pause } = useWalkthrough(autoplay, STEPS.length);
  const current = STEPS[step];
  return <section className="demo-experience" aria-label="Guided synthetic investigation">
    <div className="demo-controls">
      <div className="demo-controls-start"><button type="button" className="demo-play" onClick={toggle}
        aria-label={playing ? 'Pause walkthrough' : step === STEPS.length - 1 ? 'Replay walkthrough' : 'Play walkthrough'}>
        {playing ? <Pause size={15} aria-hidden="true"/> : step === STEPS.length - 1 ? <RotateCcw size={15} aria-hidden="true"/> : <Play size={15} aria-hidden="true"/>}
        {playing ? 'Pause' : step === STEPS.length - 1 ? 'Replay' : 'Play walkthrough'}
      </button><span className="demo-duration">About 30 seconds · explore at your pace</span></div>
      <button type="button" className="demo-skip" onClick={() => { pause(); go(4); onOpenReport(); }}>Skip to full report <ArrowRight size={14} aria-hidden="true"/></button>
    </div>
    <ol className="demo-step-nav" aria-label="Walkthrough steps">{STEPS.map((s, index) => <li key={s.label} className={step === index ? 'is-current' : step > index ? 'is-visited' : ''} data-playing={playing && step === index}>
      <button type="button" onClick={() => go(index)} aria-current={step === index ? 'step' : undefined}>
        <span className="demo-step-number">{step > index ? <Check size={12} aria-hidden="true"/> : String(index + 1).padStart(2, '0')}</span><span>{s.label}</span>
      </button>
    </li>)}</ol>
    <div className="demo-scene-heading" key={step}>
      <span className="demo-scene-eyebrow">{String(step + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')} <span>EXAMPLE WALKTHROUGH</span></span>
      <h2 aria-live="polite">{current.title}</h2><p>{current.description}</p>
    </div>
    {current.mode === 'result' ? <div className="demo-result-scene">
      <span className="demo-result-icon"><Sparkles size={24} aria-hidden="true"/></span>
      <span className="demo-result-kicker">THE FINDING</span><h3>{report.verdict.label}</h3><p>{report.verdict.description}</p>
      <div className="demo-result-observations">{report.findings.map(f => <span key={f.axis}><Check size={14} aria-hidden="true"/>{f.title}</span>)}</div>
      <button type="button" className="primary-button" onClick={onOpenReport}>Read the full report <ArrowRight size={16} aria-hidden="true"/></button>
      <small>{report.coverage.analyzed} comments analyzed · {report.coverage.completeness} coverage · synthetic data</small>
    </div> : <EvidenceExplorer report={report} mode={current.mode} onInteraction={pause}
      onModeChange={(mode: EvidenceMode) => go(STEPS.findIndex(s => s.mode === mode))}/>}
    <div className="demo-scene-footer"><span>Illustrative replay of a completed example</span><div>
      <button type="button" className="demo-arrow" aria-label="Previous walkthrough step" disabled={step === 0} onClick={() => go(step - 1)}><ArrowLeft size={16} aria-hidden="true"/></button>
      <button type="button" className="demo-next" disabled={step === STEPS.length - 1} onClick={() => go(step + 1)}>Next <ArrowRight size={16} aria-hidden="true"/></button>
    </div></div>
  </section>;
}
