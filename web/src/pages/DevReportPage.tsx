import { AnalysisReport } from '../components/AnalysisReport';
import { testReport } from '../test/fixtures';
import { AnalysisPageLayout } from './AnalysisPage';

/** Local UI preview: recorded fixture data, no investigation or API calls. */
export default function DevReportPage() {
  return <AnalysisPageLayout>
    <p className="dev-report-notice" role="note">Local preview ? synthetic test data</p>
    <AnalysisReport report={testReport}/>
  </AnalysisPageLayout>;
}
