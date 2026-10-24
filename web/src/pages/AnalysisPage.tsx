import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { buildReport, buildThreadPreview, type Report, type ThreadPreview } from '../analysis/report';
import { ApiError, createInvestigation, forgetIdempotencyKeyFor, getAnalysis, getEnrichment, getGraph, getInvestigation, idempotencyKeyFor } from '../api/client';
import type { EnrichmentJob, InvestigationResource } from '../api/contract';
import { AnalysisErrorState } from '../components/AnalysisPresentation';
import { AnalysisReport } from '../components/AnalysisReport';
import { ThreadPreviewCard } from '../components/ThreadPreviewCard';
import { AnalysisProgress, type ProgressPhase } from '../components/AnalysisProgress';
import { ServiceUnavailable, UnsupportedLinkState } from '../components/AnalysisStates';
import { PostSummaryCard } from '../components/SiteLayout';
import { parsePostUrl } from '../url';

const POLL_MS = 2500;
/** Backend ingestion codes meaning live collection is not available for this link yet. */
const NOT_CONNECTED = new Set(['INGESTION_NOT_CONNECTED', 'FIXTURE_SOURCE_NOT_FOUND', 'PROVIDER_NOT_AUTHORIZED', 'PROVIDER_NOT_CONFIGURED', 'PROVIDER_NOT_VERIFIED']);
/** Codes meaning collection failed on our side (scraping service refused or unconfirmed), not because of the post. */
const SERVICE_SIDE = new Set(['PROVIDER_REJECTED', 'PROVIDER_START_AMBIGUOUS', 'PROVIDER_BUDGET_LIMIT']);
/** Two CREAO runs usually take 1-3 minutes; stop waiting well before the worker's own limits. */
const MAX_WAIT_MS = 8 * 60_000;

type View =
  | { kind: 'loading'; status: string; phase: ProgressPhase; preview?: ThreadPreview }
  | { kind: 'report'; report: Report }
  | { kind: 'unavailable' }
  | { kind: 'error'; title: string; message: string; retry: boolean; showExample?: boolean; freshRequest?: boolean };

/** Progress text follows the real investigation states (SPEC REQ-STATE-1). */
function statusText(inv: InvestigationResource): string {
  if (inv.ingestionStatus === 'queued') return 'Waiting to collect public comments…';
  if (inv.ingestionStatus === 'running') return 'Collecting public comments…';
  if (inv.analysisStatus === 'running') return 'Analyzing the discussion…';
  return 'Waiting to analyze the discussion…';
}

function failureView(inv: InvestigationResource): View {
  if (inv.ingestionStatus === 'failed') {
    if (inv.error?.code === 'PROVIDER_NO_COMMENTS') return { kind: 'error', title: 'No public comments were returned.', message: 'Comments may be disabled or unavailable for this video, so there is no discussion to analyze.', retry: false };
    if (NOT_CONNECTED.has(inv.error?.code ?? '')) {
      return { kind: 'error', title: 'We can’t collect this post yet.', message: 'Live collection for this platform is not connected yet, so nothing was analyzed.', retry: false, showExample: true };
    }
    if (SERVICE_SIDE.has(inv.error?.code ?? '')) {
      // Only a definite refusal created no run, so only then may a retry start a new request.
      const refused = inv.error?.code === 'PROVIDER_REJECTED';
      return { kind: 'error', title: 'Collection is temporarily unavailable.', message: 'Our comment-collection service couldn’t start, so nothing was analyzed. This is a problem on our side, not with the post. Please try again later.', retry: true, freshRequest: refused };
    }
    if (inv.error?.code === 'DISCUSSION_TOO_LARGE' || inv.error?.code === 'PROVIDER_SIZE_LIMIT') {
      return { kind: 'error', title: 'This discussion is too large to check.', message: 'It has more comments than we can analyze at once.', retry: false };
    }
    return { kind: 'error', title: 'We couldn’t collect this post.', message: 'The post may be private, deleted, or unavailable right now.', retry: true };
  }
  return { kind: 'error', title: 'We couldn’t finish the analysis.', message: 'The comments were collected, but the analysis did not complete. No result is shown rather than a partial guess.', retry: true };
}

function LiveAnalysis({ url }: { url: string }) {
  const [view, setView] = useState<View>({ kind: 'loading', status: 'Starting…', phase: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const cancelled = useRef(false);

  const run = useCallback(async () => {
    const started = Date.now();
    setView({ kind: 'loading', status: 'Starting…', phase: 'starting' });
    let preview: ThreadPreview | undefined;
    let previewTried = false;
    try {
      let inv = await createInvestigation(url, idempotencyKeyFor(url));
      let replacedFixtureFailure = false;
      while (!cancelled.current) {
        // A failed fixture lookup never started a provider run. Replace it once
        // so an existing browser session can recover after live configuration.
        if (inv.ingestionStatus === 'failed' && inv.error?.code === 'FIXTURE_SOURCE_NOT_FOUND' && !replacedFixtureFailure) {
          replacedFixtureFailure = true;
          forgetIdempotencyKeyFor(url);
          inv = await createInvestigation(url, idempotencyKeyFor(url));
          continue;
        }
        if (inv.ingestionStatus === 'failed' || inv.analysisStatus === 'failed') return setView(failureView(inv));
        if (inv.analysisStatus === 'completed') break;
        // The graph is ready before the analysis: show the post and comments meanwhile.
        if (inv.ingestionStatus === 'completed' && !previewTried) {
          previewTried = true;
          try {
            preview = buildThreadPreview(await getGraph(inv.investigationId), 100);
          } catch {
            // The preview is optional; keep waiting for the analysis.
          }
          if (cancelled.current) return;
        }
        setView({ kind: 'loading', status: statusText(inv), phase: inv.ingestionStatus === 'completed' ? inv.analysisStatus === 'running' ? 'analyzing' : 'analysis-queued' : inv.ingestionStatus === 'running' ? 'collecting' : 'queued', preview });
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
      // The proxy answers SERVICE_NOT_CONFIGURED until the deployment has backend credentials.
      if (err instanceof ApiError && err.code === 'SERVICE_NOT_CONFIGURED') return setView({ kind: 'unavailable' });
      if (err instanceof ApiError && err.code === 'SOURCE_LINK_UNAVAILABLE') return setView({ kind: 'error', title: 'We couldn’t open this share link.', message: 'Copy the full TikTok video URL from your browser and try that link.', retry: false });
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

  if (view.kind === 'unavailable') return <><PostSummaryCard url={url}/><ServiceUnavailable/><p className="example-link">Want to see what a finished report looks like? <Link className="text-link" to="/example">View the example</Link></p></>;
  if (view.kind === 'loading') return <><AnalysisProgress key={attempt} phase={view.phase} status={view.status} collectedCount={view.preview?.collectedCount}/>{view.preview ? <ThreadPreviewCard preview={view.preview}/> : <PostSummaryCard url={url}/>}</>;
  if (view.kind === 'error') {
    return <><PostSummaryCard url={url}/><AnalysisErrorState title={view.title} message={view.message} onRetry={view.retry ? () => { if (view.freshRequest) forgetIdempotencyKeyFor(url); setAttempt(a => a + 1); } : undefined}/>
      {view.showExample && <p className="example-link">Want to see what a finished report looks like? <Link className="text-link" to="/example">View the example</Link></p>}</>;
  }
  return <AnalysisReport report={view.report}/>;
}

export function AnalysisPage({ url }: { url: string }) {
  const valid = parsePostUrl(url);
  let body;
  if (!valid.ok) body = <UnsupportedLinkState/>;
  else body = <LiveAnalysis key={valid.url.href} url={valid.url.href}/>;
  return <main className="analysis-main"><Link className="back-link" to="/">{String.fromCharCode(8592)} Check another post</Link><header className="analysis-page-heading"><h1>Your investigation.</h1><p>Reports expire 24 hours after the check starts.</p></header>{body}<div className="bottom-cta"><h2>Have another post to check?</h2><Link className="primary-button link-button" to="/">Analyze another post <ArrowRight size={18}/></Link></div></main>;
}

export function UnsupportedPrefixPage() {
  return <main className="analysis-main"><Link className="back-link" to="/">{String.fromCharCode(8592)} Check another post</Link><UnsupportedLinkState/><div className="bottom-cta"><Link className="primary-button link-button" to="/">Try another link <ArrowRight size={18}/></Link></div></main>;
}
