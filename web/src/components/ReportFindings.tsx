import { useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, ScanLine } from 'lucide-react';
import type { Report } from '../analysis/report';
import { EvidenceQuote } from './EvidenceQuote';
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
    <section className="findings report-findings" aria-labelledby="findings-heading">
      <div className="report-section-heading"><div><span className="report-eyebrow">FOLLOW THE EVIDENCE</span><h2 id="findings-heading">What stood out</h2></div><p>Up to three patterns, with the comments behind them.</p></div>
      {report.findings.length === 0 && <p className="empty-note">No coordination patterns stood out in the comments we checked.</p>}
      {report.findings.map((finding, index) => <article className="card finding-card" key={finding.axis}>
        <span className="finding-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <div>
          <h3>{finding.title}</h3><p>{finding.description}</p>
          {finding.evidence[0] && <ul className="evidence-list"><EvidenceQuote item={finding.evidence[0]} synthetic={report.synthetic}/></ul>}
          {finding.evidence.length > 1 && <details className="finding-more"><summary>Read {finding.evidence.length - 1} more cited comment{finding.evidence.length === 2 ? '' : 's'} <ChevronDown size={14} aria-hidden="true"/></summary><ul className="evidence-list">{finding.evidence.slice(1).map(item => <EvidenceQuote key={item.id} item={item} synthetic={report.synthetic}/>)}</ul></details>}
          {finding.repeatedEvidence > 0 && <p className="repeat-note">Also based on {finding.repeatedEvidence} additional cited comment{finding.repeatedEvidence === 1 ? '' : 's'}; explore the evidence below.</p>}
          <div className="finding-actions"><details><summary>How we measured this</summary><p>{finding.details}</p></details><button type="button" onClick={() => explore(finding.axis)}>Explore evidence <ArrowUpRight size={14} aria-hidden="true"/></button></div>
        </div>
      </article>)}
    </section>
    <details className="report-explorer" ref={explorer}>
      <summary><span><ScanLine size={18} aria-hidden="true"/>Explore the discussion</span><ChevronDown size={18} aria-hidden="true"/></summary>
      <p className="report-explorer-intro">Select a comment, compare cited wording and timestamps, or read the returned history samples.</p>
      <EvidenceExplorer report={report} mode={mode} onModeChange={setMode}/>
    </details>
  </>;
}
