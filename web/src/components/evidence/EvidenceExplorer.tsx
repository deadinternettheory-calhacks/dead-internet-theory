import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, Clock3, MessageSquare, Quote, History } from 'lucide-react';
import type { Report } from '../../analysis/report';
import { EvidenceMap } from './EvidenceMap';
import { EvidenceTimeline } from './EvidenceTimeline';
import { HistoryPanel } from './HistoryPanel';
import { HighlightedText, evidenceTime, sharedPhrases } from './phrases';
import './evidence.css';

export type EvidenceMode = 'overview' | 'wording' | 'timing' | 'history';
const MODES = [
  { id: 'overview', label: 'Thread', icon: MessageSquare }, { id: 'wording', label: 'Wording', icon: Quote },
  { id: 'timing', label: 'Timing', icon: Clock3 }, { id: 'history', label: 'History', icon: History },
] as const;

export function EvidenceExplorer({ report, mode: controlledMode, onModeChange, onInteraction }: {
  report: Report; mode?: EvidenceMode; onModeChange?: (mode: EvidenceMode) => void; onInteraction?: () => void;
}) {
  const [ownMode, setOwnMode] = useState<EvidenceMode>('overview');
  const visual = useRef<HTMLDivElement>(null);
  const inspector = useRef<HTMLElement>(null);
  const mode = controlledMode ?? ownMode;
  const wording = report.axes.find(a => a.axis === 'semantic_coordination')?.evidence.filter(e => e.source === 'discussion') ?? [];
  const phrases = useMemo(() => sharedPhrases(wording), [report]); // The report is immutable for a completed analysis.
  const [phraseIndex, setPhraseIndex] = useState(0);
  const phrase = mode === 'wording' ? phrases[phraseIndex] ?? null : null;
  const [selectedId, setSelectedId] = useState<string | null>(report.discussion[0]?.id ?? null);
  const all = useMemo(() => new Map([...report.discussion, ...report.histories.flatMap(h => h.comments)].map(c => [c.id, c])), [report]);
  const citedIds = new Set((report.axes.find(a => a.axis === (mode === 'timing' ? 'temporal_coordination' : 'semantic_coordination'))?.evidence ?? []).map(e => e.id));
  const activeIds = new Set(phrase?.commentIds ?? []);
  useEffect(() => {
    const first = mode === 'history' ? report.histories[0]?.comments[0]?.id
      : mode === 'wording' ? phrases[phraseIndex]?.commentIds[0] ?? wording[0]?.id
      : mode === 'timing' ? report.axes.find(a => a.axis === 'temporal_coordination')?.evidence.find(e => e.source === 'discussion')?.id
      : report.discussion[0]?.id;
    setSelectedId(first ?? null);
  }, [mode, phraseIndex, report]);
  const selected = selectedId ? all.get(selectedId) : undefined;
  function select(id: string | null) { setSelectedId(id); onInteraction?.(); }
  function changeMode(next: EvidenceMode) { setOwnMode(next); onModeChange?.(next); onInteraction?.(); }
  function jump(target: HTMLElement | null) {
    target?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    target?.focus({ preventScroll: true });
  }

  return <section className={`evidence-explorer mode-${mode}`} aria-label="Interactive evidence explorer" onClickCapture={onInteraction} onFocusCapture={onInteraction}>
    <div className="explorer-toolbar" role="group" aria-label="Evidence views">
      {MODES.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={mode === id} onClick={() => changeMode(id)}><Icon size={15} aria-hidden="true"/>{label}</button>)}
      <span className="explorer-count">{report.discussion.length} visible comments</span>
    </div>
    <div className="explorer-body" key={mode}>
      <div className="explorer-visual" ref={visual} tabIndex={-1}>
        <div className="explorer-visual-heading"><span>{mode === 'overview' ? 'A conversation, up close' : mode === 'wording' ? 'Follow the words' : mode === 'timing' ? 'Put the timing in context' : 'Look beyond one comment'}</span><small>{report.synthetic ? 'EXAMPLE DATA' : 'RETURNED EVIDENCE'}</small></div>
        {mode === 'wording' && <div className="phrase-controls">
          {phrases.length ? phrases.map((p, index) => <button key={p.text} type="button" aria-label={`Compare phrase “${p.text}” in ${p.commentIds.length} comments`} aria-pressed={phraseIndex === index} onClick={() => { setPhraseIndex(index); onInteraction?.(); }}><Quote size={12} aria-hidden="true"/><span>{p.text}</span><b>{p.commentIds.length}</b></button>) : <p>No repeated phrase of three or more words was found in the displayed cited comments.</p>}
        </div>}
        {(mode === 'overview' || mode === 'wording') && <EvidenceMap comments={report.discussion} activeIds={activeIds} selectedId={selectedId} onSelect={select} overview={mode === 'overview'}/>}
        {mode === 'timing' && <EvidenceTimeline comments={report.discussion} citedIds={citedIds} selectedId={selectedId} onSelect={select}/>}
        {mode === 'history' && <HistoryPanel histories={report.histories} selectedId={selectedId} onSelect={select}/>}
        <button className="mobile-evidence-jump" type="button" onClick={() => jump(inspector.current)}>Read selected comment <ArrowDown size={14} aria-hidden="true"/></button>
      </div>
      <aside className="evidence-inspector" aria-label="Selected comment" ref={inspector} tabIndex={-1}>
        <div className="inspector-heading"><span className="inspector-kicker">{selected?.source === 'history' ? 'PUBLIC-HISTORY SAMPLE' : 'COMMENT IN CONTEXT'}</span><span className="inspector-index">{selected ? String([...all.keys()].indexOf(selected.id) + 1).padStart(2, '0') : '—'}</span></div>
        <div aria-live="polite" aria-atomic="true">{selected ? <div className="inspector-comment" key={selected.id}>
          <span className="inspector-author">{selected.author ?? 'Unknown author'}</span><time dateTime={selected.createdAt ?? undefined}>{evidenceTime(selected.createdAt, true)}</time>
          <blockquote><HighlightedText text={selected.text} phrase={phrase}/></blockquote>
          {phrase && <p className="inspector-observation">{activeIds.has(selected.id) ? 'This comment contains the highlighted phrase.' : 'This comment does not contain this exact phrase.'}</p>}
          {!report.synthetic && selected.url && /^https:\/\//i.test(selected.url) && <a href={selected.url} target="_blank" rel="noopener noreferrer" className="text-link">Open original comment <ArrowUpRight size={14} aria-hidden="true"/></a>}
        </div> : <p className="evidence-empty">Select an available comment to read its evidence.</p>}</div>
        <div className="inspector-footnote"><span className="inspector-footnote-dot"/><p>Patterns are leads to examine. They do not establish intent or prove that an account is fake.</p></div>
        <button className="mobile-evidence-jump" type="button" onClick={() => jump(visual.current)}>Back to evidence <ArrowUp size={14} aria-hidden="true"/></button>
      </aside>
    </div>
  </section>;
}
