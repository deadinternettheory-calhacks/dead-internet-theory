import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { buildReport, type Report } from '../analysis/report';
import { ApiError, apiBaseUrl, createInvestigation, getAnalysis, getEnrichment, getGraph, getInvestigation, idempotencyKeyFor } from '../api/client';
import type { EnrichmentJob, InvestigationResource } from '../api/contract';
import { AnalysisErrorState, AnalysisLoadingState } from '../components/AnalysisPresentation';
import { AnalysisReport, SyntheticBanner } from '../components/AnalysisReport';
import { ServiceUnavailable, UnsupportedLinkState } from '../components/AnalysisStates';
import { PostSummaryCard } from '../components/SiteLayout';
import { syntheticDemo } from '../demo';
import { parsePostUrl } from '../url';

const POLL_MS = 2500;
const MAX_WAIT_MS = 20 * 60_000;

type View =
  | { kind: 'loading'; status: string }
  | { kind: 'report'; report: Report }
  | { kind: 'error'; title: string; message: string; retry: boolean; showExample?: boolean };

/** Progress text follows the real investigation states (SPEC REQ-STATE-1). */
function statusText(inv: InvestigationResource): string {
  if (inv.ingestionStatus === 'queued') return 'Waiting to collect public comments…';
  if (inv.ingestionStatus === 'running') return 'Collecting public comments…';
  if (inv.analysisStatus === 'running') return 'Analyzing the discussion…';
  return 'Waiting to analyze the discussion…';
}

function failureView(inv: InvestigationResource): View {
  if (inv.ingestionStatus === 'failed') {
    if (inv.error?.code === 'INGESTION_NOT_CONNECTED') {
      return { kind: 'error', title: 'We can’t collect this post yet.', message: 'Live collection for this platform is not connected yet, so nothing was analyzed.', retry: false, showExample: true };
    }
    if (inv.error?.code === 'DISCUSSION_TOO_LARGE') {
      return { kind: 'error', title: 'This discussion is too large to check.', message: 'It has more comments than we can analyze at once.', retry: false };
    }
    return { kind: 'error', title: 'We couldn’t collect this post.', message: 'The post may be private, deleted, or unavailable right now.', retry: true };
  }
  return { kind: 'error', title: 'We couldn’t finish the analysis.', message: 'The comments were collected, but the analysis did not complete. No result is shown rather than a partial guess.', retry: true };
}

function LiveAnalysis({ url }: { url: string }) {
  const [view, setView] = useState<View>({ kind: 'loading', status: 'Starting…' });
  const [attempt, setAttempt] = useState(0);
  const cancelled = useRef(false);

  const run = useCallback(async () => {
    const started = Date.now();
    try {
      let inv = await createInvestigation(url, idempotencyKeyFor(url));
      while (!cancelled.current) {
        if (inv.ingestionStatus === 'failed' || inv.analysisStatus === 'failed') return setView(failureView(inv));
        if (inv.analysisStatus === 'completed') break;
        setView({ kind: 'loading', status: statusText(inv) });
        if (Date.now() - started > MAX_WAIT_MS) {
          return setView({ kind: 'error', title: 'This is taking longer than expected.', message: 'The analysis is still running. Try again in a few minutes.', retry: true });
        }
        await new Promise(r => setTimeout(r, POLL_MS));
        inv = await getInvestigation(inv.investigationId);
      }
      if (cancelled.current) return;
      const [analysis, graph] = await Promise.all([getAnalysis(inv.investigationId), getGraph(inv.investigationId)]);
      const enrichments: EnrichmentJob[] = await Promise.all(analysis.result.usedEnrichmentIds.map(id => getEnrichment(inv.investigationId, id)));
      if (!cancelled.current) setView({ kind: 'report', report: buildReport(analysis, graph, enrichments) });
    } catch (err) {
      if (cancelled.current) return;
      const unsupported = err instanceof ApiError && err.code === 'INVALID_URL';
      setView(unsupported
        ? { kind: 'error', title: 'We can’t check this link.', message: 'This site or link type is not supported.', retry: false }
        : { kind: 'error', title: 'Something went wrong.', message: 'We couldn’t reach the analysis service. Please try again.', retry: true });
    }
  }, [url]);

  useEffect(() => {
    cancelled.current = false;
    void run();
    return () => { cancelled.current = true; };
  }, [run, attempt]);

  if (view.kind === 'loading') return <><PostSummaryCard url={url}/><AnalysisLoadingState status={view.status}/></>;
  if (view.kind === 'error') {
    return <><PostSummaryCard url={url}/><AnalysisErrorState title={view.title} message={view.message} onRetry={view.retry ? () => setAttempt(a => a + 1) : undefined}/>
      {view.showExample && <p className="example-link">Want to see what a finished report looks like? <Link className="text-link" to="/example">View the synthetic example</Link></p>}</>;
  }
  return <>{view.report.synthetic && <SyntheticBanner notice={syntheticDemo.notice}/>}<AnalysisReport report={view.report}/></>;
}

export function AnalysisPage({ url }: { url: string }) {
  const valid = parsePostUrl(url);
  let body;
  if (!valid.ok) body = <UnsupportedLinkState/>;
  else if (!apiBaseUrl) body = <><PostSummaryCard url={url}/><ServiceUnavailable/><p className="example-link">Want to see what a finished report looks like? <Link className="text-link" to="/example">View the synthetic example</Link></p></>;
  else body = <LiveAnalysis key={valid.url.href} url={valid.url.href}/>;
  return <main className="analysis-main"><Link className="back-link" to="/">{String.fromCharCode(8592)} Check another post</Link>{body}<div className="bottom-cta"><h2>Have another post to check?</h2><Link className="primary-button link-button" to="/">Analyze another post <ArrowRight size={18}/></Link></div></main>;
}

export function UnsupportedPrefixPage() {
  return <main className="analysis-main"><Link className="back-link" to="/">{String.fromCharCode(8592)} Check another post</Link><UnsupportedLinkState/><div className="bottom-cta"><Link className="primary-button link-button" to="/">Try another link <ArrowRight size={18}/></Link></div></main>;
}
