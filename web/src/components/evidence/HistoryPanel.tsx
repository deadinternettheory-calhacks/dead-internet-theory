import { useState } from 'react';
import { ArrowUpRight, Check, Minus } from 'lucide-react';
import type { Report } from '../../analysis/report';

const STATUS: Record<string, string> = { complete: 'Sample ready', partial: 'Partial sample', unavailable: 'Unavailable', unsupported: 'Not supported', failed: 'Could not collect' };
export function HistoryPanel({ histories, selectedId, onSelect }: { histories: Report['histories']; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const [active, setActive] = useState(histories[0]?.id ?? '');
  const [expanded, setExpanded] = useState(false);
  const sample = histories.find(h => h.id === active) ?? histories[0];
  if (!sample) return <div className="evidence-empty">No account-history samples were used in this analysis.</div>;
  return <div className="history-panel">
    <div className="history-accounts" aria-label="Choose an account-history sample">
      {histories.map(h => <button key={h.id} type="button" aria-pressed={sample.id === h.id} className={sample.id === h.id ? 'is-selected' : ''}
        onClick={() => { setActive(h.id); setExpanded(false); onSelect(h.comments[0]?.id ?? null); }}>
        <span>{h.author ?? 'Unknown author'}</span>{h.comments.length ? <Check size={13} aria-hidden="true"/> : <Minus size={13} aria-hidden="true"/>}
      </button>)}
    </div>
    <div className="history-sample-meta"><span className={`history-status status-${sample.status}`}>{STATUS[sample.status] ?? sample.status}</span><span>{sample.comments.length} comments</span>{sample.account && sample.account.score !== null && <span className="history-account-score">Signals {sample.account.score}/100</span>}</div>
    <div className="history-snippets">{sample.comments.slice(0, expanded ? undefined : 3).map(c => <button key={c.id} type="button" className={selectedId === c.id ? 'is-selected' : ''} onClick={() => onSelect(c.id)}>
      <span>{c.text}</span><ArrowUpRight size={14} aria-hidden="true"/>
    </button>)}</div>
    {sample.comments.length > 3 && <button type="button" className="evidence-text-button" onClick={() => setExpanded(v => !v)}>{expanded ? 'Show fewer' : `All ${sample.comments.length}`}</button>}
    {!sample.comments.length && <p className="evidence-empty">No comments returned.</p>}
  </div>;
}
