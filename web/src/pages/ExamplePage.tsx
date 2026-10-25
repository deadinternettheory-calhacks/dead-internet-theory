import { TransitionLink } from '../components/TransitionLink';
import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { AnalysisReport } from '../components/AnalysisReport';
import { DemoExperience } from '../components/demo/DemoExperience';
import { GraveyardGlobe } from '../components/GraveyardGlobe/GraveyardGlobe';
import { exampleReport as report } from '../demo/report';

export function ExamplePage() {
  const [params] = useSearchParams();
  const fullReport = useRef<HTMLDetailsElement>(null);
  function openReport() {
    if (!fullReport.current) return;
    fullReport.current.open = true;
    fullReport.current.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    fullReport.current.querySelector('summary')?.focus({ preventScroll: true });
  }
  return <main className="demo-page">
    <div className="demo-page-top"><TransitionLink className="back-link" to="/">← Check a post</TransitionLink></div>
    <header className="demo-page-heading"><div><h1>Follow the evidence.</h1><p>A real TikTok comment section, analyzed.</p></div><GraveyardGlobe compact/></header>
    <div className="demo-source"><span>THE VIDEO</span><p>{report.post.text}</p><small>TikTok · {report.discussion.length} comments · names replaced{report.post.url && <> · <a className="text-link" href={report.post.url} target="_blank" rel="noopener noreferrer">Original <ArrowUpRight size={13} aria-hidden="true"/></a></>}</small></div>
    <DemoExperience report={report} autoplay={params.get('play') === '1'} onOpenReport={openReport}/>
    <details className="demo-full-report" id="full-report" ref={fullReport}><summary><div><h2>Full report</h2></div><ArrowRight size={20} aria-hidden="true"/></summary><div className="demo-full-report-content"><AnalysisReport report={report}/></div></details>
    <section className="demo-bottom-cta"><div><h2>Check your own post.</h2></div><TransitionLink className="primary-button link-button" to="/">Check a post <ArrowRight size={17} aria-hidden="true"/></TransitionLink></section>
  </main>;
}
