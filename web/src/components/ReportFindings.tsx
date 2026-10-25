import { useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, ScanLine } from 'lucide-react';
import type { Report } from '../analysis/report';
import { EvidenceQuote } from './EvidenceQuote';
import { Sources } from './Sources';
import { SIGNAL_SOURCES } from '../analysis/sources';
import { EvidenceExplorer, type EvidenceMode } from './evidence/EvidenceExplorer';

export function ReportFindings({ report }: { report: Report }) {
  const explorer = useRef<HTMLDetailsElement>(null);
  const [mode, setMode] = useState<EvidenceMode>('overview');
  function explore(axis: string) {
    const hasHistory = report.axes.find(item => item.axis === axis)?.evidence.some(item => item.source === 'history');
    setMode(axis === 'semantic_coordination' ? 'wording' : axis === 'temporal_coordination' ? 'timing' : hasHistory ? 'history' : 'overview');
    if (!explorer.current) return;
    explorer.current.open = true;
    explorer.current.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    explorer.current.querySelector('summary')?.focus({ preventScroll: true });
  }
  return <>
    <section className="findings report-findings" aria-label="Findings">
      {report.findings.length === 0 && <p className="empty-note">Nothing stood out.</p>}
      {report.findings.map((finding, index) => <article className="card finding-card" key={finding.axis}>
        <span className="finding-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <div>
          <h3>{finding.title}</h3><p>{finding.description}</p>
          {finding.evidence[0] && <ul className="evidence-list"><EvidenceQuote item={finding.evidence[0]} synthetic={report.synthetic}/></ul>}
          {finding.evidence.length > 1 && <details className="finding-more"><summary>{finding.evidence.length - 1} more <ChevronDown size={14} aria-hidden="true"/></summary><ul className="evidence-list">{finding.evidence.slice(1).map(item => <EvidenceQuote key={item.id} item={item} synthetic={report.synthetic}/>)}</ul></details>}
          <div className="finding-actions"><details><summary>How it’s measured</summary><p>{finding.details}</p><Sources sources={SIGNAL_SOURCES[finding.axis]}/></details><button type="button" onClick={() => explore(finding.axis)}>Explore <ArrowUpRight size={14} aria-hidden="true"/></button></div>
        </div>
      </article>)}
    </section>
    <details className="report-explorer" ref={explorer}>
      <summary><span><ScanLine size={18} aria-hidden="true"/>Explore the discussion</span><ChevronDown size={18} aria-hidden="true"/></summary>
      <EvidenceExplorer report={report} mode={mode} onModeChange={setMode}/>
    </details>
  </>;
}
