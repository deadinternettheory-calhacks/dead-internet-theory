import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, Link2, RotateCcw } from 'lucide-react';
import { AnalysisReport } from '../../web/src/components/AnalysisReport';
import { AnalysisProgress } from '../../web/src/components/AnalysisProgress';
import { ThreadPreviewCard } from '../../web/src/components/ThreadPreviewCard';
import { parsePostUrl } from '../../web/src/url';
import type { CapabilityResponse } from '../../web/src/api/contract';
import { client } from './client';
import { isCurrentPagePost } from './currentPage';
import { PanelGhost } from './PanelGhost';
import { requestWorker, STATE_KEY, validId, type SavedJob, type SavedState } from './state';
import { useAnalysis } from './useAnalysis';

const fullReport = location.pathname.endsWith('/report.html');
const reportId = new URLSearchParams(location.search).get('investigationId');

function Investigation({ job, onRestartAllowed }: { job: SavedJob; onRestartAllowed: (allowed: boolean) => void }) {
  const { view, retry, investigationId } = useAnalysis(job, client, fullReport);
  const phase = view.kind === 'loading' ? view.phase : view.kind === 'report' ? 'complete' : 'failed';
  const restartAllowed = view.kind === 'report' || (view.kind === 'error' && view.restartAllowed);
  useEffect(() => onRestartAllowed(restartAllowed), [onRestartAllowed, restartAllowed]);
  return <>
    {investigationId && !fullReport && <button className="panel-full-report" type="button" onClick={() => { void chrome.tabs.create({ url: chrome.runtime.getURL(`report.html?investigationId=${encodeURIComponent(investigationId)}`) }); }}>Open full report <ArrowUpRight size={15} aria-hidden="true"/></button>}
    {view.kind === 'loading' && <div className="panel-waiting">
      <PanelGhost phase={phase}/>
      <AnalysisProgress phase={view.phase} status={view.status} collectedCount={view.preview?.collectedCount} savedResult={view.savedResult}/>
      <p className="panel-resume-note">{view.savedResult ? 'Showing a saved result from this post’s existing investigation.' : 'You can close this panel. Your investigation continues, and reopening it picks up where you left off.'}</p>
      {view.preview && <ThreadPreviewCard preview={view.preview}/>}
    </div>}
    {view.kind === 'error' && <section className="panel-error" role="alert"><h2>{view.title}</h2><p>{view.message}</p>{view.retryable && <button className="secondary-button" onClick={retry}><RotateCcw size={15} aria-hidden="true"/>Try again</button>}</section>}
    {view.kind === 'report' && <AnalysisReport report={view.report}/>}
  </>;
}

export function App() {
  const [state, setState] = useState<SavedState>();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [readingPage, setReadingPage] = useState(false);
  const [restartAllowed, setRestartAllowed] = useState(false);
  const [capabilities, setCapabilities] = useState<CapabilityResponse>();
  useEffect(() => {
    let disposed = false;
    let lastCandidate: number | undefined;
    const update = () => { void requestWorker<SavedState>({ type: 'GET_STATE' }).then(saved => {
      if (disposed) return;
      setState(saved);
      if (saved.candidate && saved.candidate.selectedAt !== lastCandidate) { setInput(saved.candidate.url); lastCandidate = saved.candidate.selectedAt; setError(''); }
      else if (lastCandidate === undefined) { setInput(saved.jobs.find(job => job.key === saved.currentKey)?.sourceUrl ?? ''); lastCandidate = 0; }
    }).catch(() => { if (!disposed) setError('Could not connect to the extension. Reload it in chrome://extensions.'); }); };
    update();
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === 'local' && changes[STATE_KEY]) update(); };
    chrome.storage.onChanged.addListener(changed);
    return () => { disposed = true; chrome.storage.onChanged.removeListener(changed); };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    void client.getCapabilities(abort.signal).then(setCapabilities).catch(() => {});
    return () => abort.abort();
  }, []);
  const saved = state?.jobs.find(job => fullReport ? job.investigationId === reportId : job.key === state.currentKey);
  const job = fullReport ? saved ?? (validId(reportId) ? { key: `read-${reportId}`, investigationId: reportId, sourceUrl: '', createdAt: Date.now(), expiresAt: Infinity } : undefined) : saved;
  const parsedInput = parsePostUrl(input);
  const samePending = Boolean(job && parsedInput.ok && job.sourceUrl === parsedInput.url.href && !restartAllowed);
  async function useCurrentPage() {
    setReadingPage(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !isCurrentPagePost(tab.url)) {
        setError('Open a public Reddit, TikTok or YouTube post or video first.');
        return;
      }
      setInput(tab.url);
      setError('');
    } catch {
      setError('Could not read the current tab. Paste its link instead.');
    } finally { setReadingPage(false); }
  }
  async function analyze(event: FormEvent) {
    event.preventDefault();
    const parsed = parsePostUrl(input);
    if (!parsed.ok) { setError('Enter a public Reddit, X, TikTok or YouTube post link.'); return; }
    setSubmitting(true); setError('');
    if (samePending) { setSubmitting(false); return; }
    setRestartAllowed(false);
    try {
      const started = await requestWorker<SavedJob>({ type: 'START_JOB', sourceUrl: parsed.url.href });
      setState(current => ({ candidate: current?.candidate ?? null, jobs: [started, ...(current?.jobs ?? []).filter(job => job.key !== started.key)].slice(0, 10), currentKey: started.key }));
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not start this check.'); }
    finally { setSubmitting(false); }
  }
  return <div className={`extension-shell${fullReport ? ' is-full-report' : ''}`}>
    <header className="panel-header"><img src="icons/ghost-48.png" width="32" height="32" alt=""/><span>dead internet theory</span></header>
    <main>
      <h1 className={job ? 'sr-only' : ''}>{fullReport ? 'Your investigation' : 'Look beyond the likes.'}</h1>
      {!fullReport && <>
        {!job && <div className="panel-welcome"><p>Check the discussion behind a public post, right here.</p><PanelGhost phase="queued"/></div>}
        <form onSubmit={event => { void analyze(event); }} className="panel-form">
          <label htmlFor="post-url">Public post link</label>
          <div className="panel-url"><Link2 size={17} aria-hidden="true"/><input id="post-url" type="url" value={input} onChange={event => setInput(event.target.value)} placeholder="Paste a post link" required aria-invalid={!!error} aria-describedby={error ? 'panel-error' : 'panel-platforms'}/></div>
          <button type="submit" className="primary-button" disabled={!state || submitting || samePending}>{submitting ? 'Starting…' : samePending ? 'Check already submitted' : 'Analyze post'}</button>
          <button type="button" className="secondary-button" disabled={submitting || readingPage} onClick={() => { void useCurrentPage(); }}>Use Current Page</button>
        </form>
        <p className="panel-platforms" id="panel-platforms">Reddit · X · TikTok · YouTube{capabilities?.platforms.some(platform => platform.platform === 'x' && platform.demoLimited) && <span>X is currently a limited demo.</span>}</p>
      </>}
      {error && <p id="panel-error" role="alert" className="panel-inline-error">{error}</p>}
      {state && job && <Investigation key={job.key} job={job} onRestartAllowed={setRestartAllowed}/>}
      {state && fullReport && !job && <p role="alert">This report link is not valid. Open the extension on a post to start a check.</p>}
      {!state && !error && <p role="status">Connecting to the extension…</p>}
    </main>
    <footer className="panel-footer"><p>Dead Internet can make mistakes.</p><a href="privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>{!fullReport && <button type="button" onClick={() => { void requestWorker<SavedState>({ type: 'CLEAR_LOCAL' }).then(saved => { setState(saved); setInput(''); }).catch(() => setError('Could not clear saved links. Try again.')); }}>Clear saved links</button>}</footer>
  </div>;
}
