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
    <header className="demo-page-heading"><div><span className="demo-eyebrow">AN INTERACTIVE EXAMPLE</span><h1>Follow the evidence.</h1><p>A real Reddit thread, checked end to end. Explore what the analysis found.</p></div><GraveyardGlobe compact/></header>
    <div className="demo-source"><span>THE QUESTION</span><p>{report.post.text}</p><small>r/BuyItForLife · {report.discussion.length} comments · usernames hidden{report.post.url && <> · <a className="text-link" href={report.post.url} target="_blank" rel="noopener noreferrer">View the original thread <ArrowUpRight size={13} aria-hidden="true"/></a></>}</small></div>
    <DemoExperience report={report} autoplay={params.get('play') === '1'} onOpenReport={openReport}/>
    <details className="demo-full-report" id="full-report" ref={fullReport}><summary><div><span className="demo-eyebrow">EVERY FINDING, WITH ITS EVIDENCE</span><h2>Read the full report</h2></div><ArrowRight size={20} aria-hidden="true"/></summary><div className="demo-full-report-content"><AnalysisReport report={report}/></div></details>
    <section className="demo-bottom-cta"><div><span className="demo-eyebrow">YOUR TURN</span><h2>What’s behind your next recommendation?</h2><p>Start with a public Reddit post. See what the evidence supports.</p></div><TransitionLink className="primary-button link-button" to="/">Check a post <ArrowRight size={17} aria-hidden="true"/></TransitionLink></section>
  </main>;
}
