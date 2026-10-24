import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { buildReport } from '../analysis/report';
import { AnalysisReport, SyntheticBanner } from '../components/AnalysisReport';
import { syntheticDemo as fixture } from '../demo';

export function ExamplePage() {
  const report = buildReport(fixture.analysis, fixture.graph, [fixture.enrichment]);
  return <main className="analysis-main">
    <Link className="back-link" to="/">{String.fromCharCode(8592)} Check a post</Link>
    <SyntheticBanner notice={fixture.notice}/>
    <AnalysisReport report={report}/>
    <div className="bottom-cta">
      <h2>Have a post to check?</h2>
      <Link className="primary-button link-button" to="/">Analyze a post <ArrowRight size={18}/></Link>
    </div>
  </main>;
}
