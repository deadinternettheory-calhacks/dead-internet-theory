import { useEffect, useState } from 'react';
import { ApiError, type ApiClient } from '../../web/src/api/client';
import type { GraphEnvelope, InvestigationResource } from '../../web/src/api/contract';
import { buildReport, buildThreadPreview, type Report, type ThreadPreview } from '../../web/src/analysis/report';
import type { ProgressPhase } from '../../web/src/components/AnalysisProgress';
import { requestWorker, type SavedJob } from './state';

export type AnalysisView =
  | { kind: 'loading'; phase: ProgressPhase; status: string; preview?: ThreadPreview }
  | { kind: 'report'; report: Report }
  | { kind: 'error'; title: string; message: string; retryable: boolean; restartAllowed: boolean };

function progress(inv: InvestigationResource): { phase: ProgressPhase; status: string } {
  if (inv.ingestionStatus === 'queued') return { phase: 'queued', status: 'Waiting to collect public comments…' };
  if (inv.ingestionStatus === 'running') return { phase: 'collecting', status: 'Collecting public comments…' };
  if (inv.analysisStatus === 'running') return { phase: 'analyzing', status: 'Analyzing the discussion…' };
  return { phase: 'analysis-queued', status: 'Waiting to analyze the discussion…' };
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export function useAnalysis(job: SavedJob, client: ApiClient, readOnly = false) {
  const [view, setView] = useState<AnalysisView>({ kind: 'loading', phase: 'starting', status: 'Connecting to your investigation…' });
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(!document.hidden);
  const [investigationId, setInvestigationId] = useState(job.investigationId);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const abort = new AbortController(), { signal } = abort;
    const run = async () => {
      setView({ kind: 'loading', phase: 'starting', status: 'Connecting to your investigation…' });
      try {
        if (readOnly && !job.investigationId) throw new Error('This report link is not valid.');
        let inv = job.investigationId
          ? await client.getInvestigation(job.investigationId, signal)
          : await client.createInvestigation(job.sourceUrl, job.key, signal);
        // Save the receipt before any polling, so closing the panel can resume
        // with a GET. An unconfirmed create retains its original idempotency key.
        setInvestigationId(inv.investigationId);
        if (!readOnly) await requestWorker({ type: 'RECORD_JOB', key: job.key, investigationId: inv.investigationId });
        if (!job.investigationId && inv.ingestionStatus !== 'failed' && inv.analysisStatus !== 'failed' && inv.analysisStatus !== 'completed') inv = await client.getInvestigation(inv.investigationId, signal);
        let graph: GraphEnvelope | undefined;
        let preview: ThreadPreview | undefined;
        const started = Date.now();
        while (!signal.aborted) {
          if (inv.ingestionStatus === 'failed' || inv.analysisStatus === 'failed') {
            setView({ kind: 'error', title: inv.ingestionStatus === 'failed' ? 'We couldn’t collect this discussion.' : 'The analysis could not finish.', message: inv.error?.message ?? 'Choose another public post or submit this link again to start a new check.', retryable: false, restartAllowed: inv.error?.code !== 'PROVIDER_START_AMBIGUOUS' });
            return;
          }
          if (inv.analysisStatus === 'completed') break;
          if (inv.ingestionStatus === 'completed' && !graph) {
            try { graph = await client.getGraph(inv.investigationId, signal); preview = buildThreadPreview(graph, 100); }
            catch { if (signal.aborted) return; /* Preview is optional; the actual status remains authoritative. */ }
          }
          if (signal.aborted) return;
          setView({ kind: 'loading', ...progress(inv), preview });
          await wait(Date.now() - started > 5 * 60_000 ? 10_000 : Date.now() - started > 60_000 ? 5000 : 2500, signal);
          inv = await client.getInvestigation(inv.investigationId, signal);
        }
        if (signal.aborted) return;
        const sameGraph = graph?.investigationId === inv.investigationId && graph.graphRevision === inv.graphRevision && graph.graphFingerprint === inv.graphFingerprint;
        const [analysis, completeGraph] = await Promise.all([
          client.getAnalysis(inv.investigationId, signal),
          sameGraph ? Promise.resolve(graph!) : client.getGraph(inv.investigationId, signal),
        ]);
        const enrichments = await Promise.all(analysis.result.usedEnrichmentIds.map(id => client.getEnrichment(inv.investigationId, id, signal)));
        if (!signal.aborted) setView({ kind: 'report', report: buildReport(analysis, completeGraph, enrichments) });
      } catch (error) {
        if (signal.aborted) return;
        const expired = error instanceof ApiError && (error.status === 404 || error.status === 410);
        setView({ kind: 'error', title: expired ? 'This report is no longer available.' : 'We couldn’t reach your investigation.', message: expired ? 'Reports expire after 24 hours. You can submit the post again for a new check.' : error instanceof Error ? error.message : 'Try again in a moment.', retryable: !expired, restartAllowed: expired });
      }
    };
    void run();
    return () => abort.abort();
    // A receipt update in storage must not remount or recreate an active check.
    // Reopening this view captures the persisted ID and resumes with a GET.
  }, [job.key, client, readOnly, attempt, visible]);

  return { view, investigationId, retry: () => setAttempt(value => value + 1) };
}
