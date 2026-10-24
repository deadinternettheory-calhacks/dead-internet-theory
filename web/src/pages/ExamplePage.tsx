import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { buildReport } from '../analysis/report';
import { apiBaseUrl } from '../api/client';
import { AnalysisReport, SyntheticBanner } from '../components/AnalysisReport';
import { syntheticDemo as fixture } from '../demo';

export function ExamplePage() {
  const report = buildReport(fixture.analysis, fixture.graph, [fixture.enrichment]);
  return <main className="analysis-main">
    <Link className="back-link" to="/">{String.fromCharCode(8592)} Check a post</Link>
    <SyntheticBanner notice={fixture.notice}/>
    <AnalysisReport report={report}/>
    <div className="bottom-cta">
      <h2>{apiBaseUrl ? 'Run this example through the live pipeline.' : 'Have a post to check?'}</h2>
      {apiBaseUrl
        ? <Link className="primary-button link-button" to={`/analysis?url=${encodeURIComponent(fixture.investigation.sourceUrl)}`}>Run the example <ArrowRight size={18}/></Link>
        : <Link className="primary-button link-button" to="/">Analyze a post <ArrowRight size={18}/></Link>}
    </div>
  </main>;
}
