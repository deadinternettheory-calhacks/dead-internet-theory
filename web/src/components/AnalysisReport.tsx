import { ArrowUpRight, FlaskConical } from 'lucide-react';
import type { Report, EvidenceItem, ThreadPreview } from '../analysis/report';
import { createContext, useContext, type ReactNode } from 'react';
import { EvidenceDetails, VerdictCard } from './AnalysisPresentation';

const PLATFORM_LABEL: Record<string, string> = { reddit: 'REDDIT', x: 'X / TWITTER', youtube: 'YOUTUBE', tiktok: 'TIKTOK' };
const SyntheticContext = createContext(false);
const STANCE_LABEL: Record<string, string> = { supportive: 'Supportive', critical: 'Critical', neutral: 'Neutral', mixed: 'Mixed', unclear: 'Unclear' };

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
}

/** Opens only https source links; anything else is shown as text (SPEC REQ-UX-3). */
function SourceLink({ url, children }: { url: string | null; children: ReactNode }) {
  const synthetic = useContext(SyntheticContext);
  // Synthetic fixtures use made-up URLs on real sites; never link to them.
  if (synthetic || !url || !/^https:\/\//i.test(url)) return null;
  return <a className="text-link" href={url} target="_blank" rel="noopener noreferrer">{children} <ArrowUpRight size={14} aria-hidden="true"/></a>;
}

export function SyntheticBanner({ notice }: { notice: string }) {
  return <aside className="synthetic-banner" role="note"><FlaskConical size={20} aria-hidden="true"/><p>{notice}</p></aside>;
}

function EvidenceQuote({ item }: { item: EvidenceItem }) {
  const time = formatTime(item.createdAt);
  return <li className="evidence-quote">
    <p className="quote-meta">{item.author ?? 'Unknown author'}{time ? ` · ${time}` : ''}{item.source === 'history' ? ' · from this account’s other comments' : ''}</p>
    <blockquote>{item.text}</blockquote>
    <SourceLink url={item.url}>View source</SourceLink>
  </li>;
}

/** The collected post and first comments, shown while the analysis runs. */
export function ThreadPreviewCard({ preview }: { preview: ThreadPreview }) {
  const { post } = preview;
  return <>
    <article className="card summary-card">
      <span className="platform-label">{PLATFORM_LABEL[post.platform] ?? 'POST'}</span>
      {post.title && <h2 className="url-title">{post.title}</h2>}
      {post.text && <p className="post-text">{post.text}</p>}
      {post.author && <p className="url-display">{post.author}</p>}
    </article>
    <section className="card thread-preview" aria-labelledby="thread-preview-heading">
      <h2 id="thread-preview-heading" className="detail-heading">Comments we collected</h2>
      {preview.comments.length === 0 && <p className="empty-note">No visible comments were collected.</p>}
      <ul className="comment-list">{preview.comments.map(c => <li key={c.id} className={`comment-row${c.isReply ? ' is-reply' : ''}`}>
        <p className="quote-meta">{c.author ?? 'Unknown author'}{c.isReply ? ' · reply' : ''}</p>
        <blockquote>{c.text}</blockquote>
      </li>)}</ul>
      {preview.moreCount > 0 && <p className="repeat-note">And {preview.moreCount} more comment{preview.moreCount === 1 ? '' : 's'}.</p>}
    </section>
  </>;
}

export function AnalysisReport({ report }: { report: Report }) {
  const { post, coverage } = report;
  const time = formatTime(post.createdAt);
  const recommendations = report.comments.filter(c => c.isRecommendation);
  const others = report.comments.filter(c => !c.isRecommendation);
  return <SyntheticContext.Provider value={report.synthetic}>
    <article className="card summary-card">
      <span className="platform-label">{PLATFORM_LABEL[post.platform] ?? 'POST'}</span>
      {post.title && <h2 className="url-title">{post.title}</h2>}
      <p className="post-text">{post.text}</p>
      {(post.author || time) && <p className="url-display">{[post.author, time].filter(Boolean).join(' · ')}</p>}
      <SourceLink url={post.url}>View original post</SourceLink>
    </article>

    <VerdictCard label={report.verdict.label} description={report.verdict.description} tone={report.verdict.tone}/>

    <section className="findings" aria-labelledby="findings-heading">
      <h2 id="findings-heading">What stood out</h2>
      <p>Up to three of the strongest patterns, with the comments behind them.</p>
      {report.findings.length === 0 && <p className="empty-note">No coordination patterns stood out in the comments we checked.</p>}
      {report.findings.map(f => <article className="card finding-card" key={f.axis}>
        <div>
          <h3>{f.title}</h3>
          <p>{f.description}</p>
          {f.evidence.length > 0 && <ul className="evidence-list">{f.evidence.map(e => <EvidenceQuote key={e.id} item={e}/>)}</ul>}
          {f.repeatedEvidence > 0 && <p className="repeat-note">{f.evidence.length ? 'Also based on' : 'Based on'} {f.repeatedEvidence} comment{f.repeatedEvidence === 1 ? '' : 's'} quoted above.</p>}
          <details><summary>How we measured this</summary><p>{f.details}</p></details>
        </div>
      </article>)}
    </section>

    <EvidenceDetails>
      {report.index && <div className="index-note">
        <p><strong>Coordination index: {report.index.score} / 100.</strong> This comes from a hand-weighted, uncalibrated scoring guide. It is a way to rank leads for review, not a probability that the discussion was manipulated.</p>
      </div>}
      <h3 className="detail-heading">Each signal we checked</h3>
      <ul className="axis-list">{report.axes.map(x => <li key={x.axis}><strong>{x.title}: {x.score === null ? 'not measured' : `${x.score} / 100`}</strong><p>{x.explanation}</p></li>)}</ul>
      {report.clusters.length > 0 && <>
        <h3 className="detail-heading">Groups of related comments</h3>
        <ul className="axis-list">{report.clusters.map(c => <li key={c.id}><strong>{c.size} comments</strong><p>{c.explanation}</p></li>)}</ul>
      </>}
      <h3 className="detail-heading">Recommendations we scored</h3>
      {recommendations.length === 0 && <p>No comments recommended a product.</p>}
      <ul className="comment-list">{recommendations.map(c => <li key={c.id} className="comment-row">
        <p className="quote-meta">{c.author ?? 'Unknown author'} · <span className={`stance stance-${c.stance}`}>{STANCE_LABEL[c.stance]}</span></p>
        <blockquote>{c.text}</blockquote>
        <p>{c.rationale}</p>
        <SourceLink url={c.url}>View comment</SourceLink>
      </li>)}</ul>
      {others.length > 0 && <>
        <h3 className="detail-heading">Other comments</h3>
        <ul className="comment-list">{others.map(c => <li key={c.id} className="comment-row">
          <p className="quote-meta">{c.author ?? 'Unknown author'} · <span className={`stance stance-${c.stance}`}>{STANCE_LABEL[c.stance]}</span></p>
          <blockquote>{c.text}</blockquote>
        </li>)}</ul>
      </>}
      <p className="version-note">Analysis version: {report.inferenceVersion}</p>
    </EvidenceDetails>

    <aside className="limitations">
      <h2>What we checked, and what this means</h2>
      <p>We analyzed {coverage.analyzed} of {coverage.retrieved} comments we could retrieve{coverage.reported !== null ? ` (the platform reported ${coverage.reported})` : ''}. Whether we retrieved every comment: {coverage.completeness}.</p>
      <p>Stance toward {report.subject}: {coverage.sentiment.supportive} supportive, {coverage.sentiment.critical} critical, {coverage.sentiment.neutral} neutral, {coverage.sentiment.mixed} mixed, {coverage.sentiment.unclear} unclear.</p>
      {coverage.histories && <p>{coverage.histories}</p>}
      <p>Unusual patterns can have innocent explanations, such as fans of a product, a launch, or a community reacting to the same news. This report highlights signals worth examining. It does not prove that anyone was paid or that any account is fake.</p>
      <ul className="limitation-list">{report.limitations.map(l => <li key={l}>{l}</li>)}</ul>
    </aside>
  </SyntheticContext.Provider>;
}

