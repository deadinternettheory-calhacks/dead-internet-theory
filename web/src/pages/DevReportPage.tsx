import { useInvestigationPhase } from '../components/AnalysisPlayground/InvestigationAtmosphere';
import { AnalysisReport } from '../components/AnalysisReport';
import { testReport } from '../test/fixtures';
import { AnalysisPageLayout } from './AnalysisPage';

/** Local UI preview: recorded fixture data, no investigation or API calls. */
export default function DevReportPage() {
  useInvestigationPhase('complete');
  return <AnalysisPageLayout>
    <AnalysisReport report={testReport}/>
  </AnalysisPageLayout>;
}
