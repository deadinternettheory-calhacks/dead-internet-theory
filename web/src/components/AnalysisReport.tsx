import { scoreExplanation } from '../analysis/scoreExplanation';
import { verdictFor, type Report } from '../analysis/report';
import { SourceLink, formatTime } from './EvidenceQuote';
import { ReportFindings } from './ReportFindings';
import { AccountSignals } from './AccountSignals';
import { Sources } from './Sources';
import { HISTORY_CONTRAST_SOURCES, SIGNAL_SOURCES } from '../analysis/sources';
import { EvidenceDetails } from './AnalysisPresentation';
import './report.css';


const PLATFORM_LABEL: Record<string, string> = { reddit: 'Reddit', x: 'X', youtube: 'YouTube', tiktok: 'TikTok' };
const STANCE_LABEL: Record<string, string> = { supportive: 'Supportive', critical: 'Critical', neutral: 'Neutral', mixed: 'Mixed', unclear: 'Unclear' };


/** A comment's 0-100 astroturfing estimate, with its reasons on hover. */
function Estimate({ row }: { row: Report['comments'][number] }) {
  if (!row.estimate) return null;
  const s = row.estimate.score;
  return <span className={`comment-estimate${s >= 55 ? ' is-high' : s >= 35 ? ' is-medium' : ''}`} title={row.estimate.reasons.join(' · ') || 'No signals'}>{s}/100{row.estimate.reasons.length > 0 && <span className="comment-estimate-reasons"> · {row.estimate.reasons.join(' · ')}</span>}</span>;
}

/** Score and verdict in one card. Bands follow the rubric tiers: under 35 low, 35-54 moderate, 55+ high. */
function ResultCard({ report }: { report: Report }) {
  const score = report.index?.score ?? null;
  const breakdown = report.index ? scoreExplanation(report.index.explanation) : null;
  return <section className={`card result-card tone-${report.verdict.tone}`} aria-label="Result">
    <div className="result-score">{score === null ? <strong>–</strong> : <strong>{score}</strong>}<span>/ 100</span></div>
    <div className="result-text">
      <h2>{report.verdict.label}</h2>
      <p>{report.verdict.description}</p>
      {score !== null && <div className="result-track" role="img" aria-label={`Astroturfing score: ${score} out of 100`}>
        <span className="risk-low" style={{ width: '35%' }}/><span className="risk-moderate" style={{ width: '20%' }}/><span className="risk-high" style={{ width: '45%' }}/>
        <i style={{ left: `${Math.max(0, Math.min(100, score))}%` }}/>
      </div>}
    </div>
    <details className="score-explanation">
      <summary><span className="score-explanation-label">Score explanation</span></summary>
      <div className="score-explanation-content">
      {report.index && <div className="index-note">
        {breakdown ? <>
          <dl className="score-breakdown">{breakdown.parts.map(part => <div key={part.label}>
            <dt>{part.label}</dt><dd><strong className={`tone-${verdictFor(part.score, '').tone}`}>{part.score}<small>/100</small></strong><p>{part.reason}</p></dd>
          </div>)}</dl>
          <p className="score-calculation-notes">{breakdown.notes}</p>
        </> : <p>{report.index.explanation}</p>}
        <Sources sources={HISTORY_CONTRAST_SOURCES}/>
      </div>}
      {!report.index && <p>Not enough evidence to calculate a score.</p>}
      </div>
    </details>
  </section>;
}

export function AnalysisReport({ report }: { report: Report }) {
  const { post, coverage } = report;
  const time = formatTime(post.createdAt);
  const recommendations = report.comments.filter(c => c.isRecommendation);
  // Empty comments (stickers, media) carry no text to show.
  const others = report.comments.filter(c => !c.isRecommendation && c.text.trim());
  const emptyCount = report.comments.filter(c => !c.text.trim()).length;
  const historiesReturned = report.histories.filter(history => history.comments.length > 0).length;
  const s = coverage.sentiment;
  return <div className="report-view">
    <ResultCard report={report}/>
    <div className="card report-middle">
    <article className="card summary-card">
      <h2 className="original-post-heading"><span>{PLATFORM_LABEL[post.platform] ?? post.platform}</span>{post.title && <><span className="post-divider" aria-hidden="true"> · </span><span className="original-post-title">{post.title}</span></>}</h2>
      <p className="post-text">{post.text}</p>
      {(post.author || time) && <p className="url-display">{[post.author, time].filter(Boolean).join(' · ')}</p>}
      <SourceLink synthetic={report.synthetic} url={post.url}>View original post</SourceLink>
    </article>

    <ReportFindings report={report}/>
    <AccountSignals report={report}/>

    <EvidenceDetails>
      <h3 className="detail-heading">Each signal we checked</h3>
      <ul className="axis-list">{report.axes.map(x => <li key={x.axis}><strong>{x.title}: {x.score === null ? 'not measured' : `${x.score} / 100`}</strong><p>{x.explanation}</p><Sources sources={SIGNAL_SOURCES[x.axis]}/></li>)}</ul>

      {report.clusters.length > 0 && <>
        <h3 className="detail-heading">Groups of related comments</h3>
        <ul className="axis-list">{report.clusters.map(c => <li key={c.id}><strong>{c.size} comments</strong><p>{c.explanation}</p></li>)}</ul>
      </>}
      <h3 className="detail-heading">Recommendations we scored</h3>
      {recommendations.length === 0 && <p>No comments recommended a product.</p>}
      <ul className="comment-list">{recommendations.map(c => <li key={c.id} className="comment-row">
        <p className="quote-meta">{c.author ?? 'Unknown author'} · <span className={`stance stance-${c.stance}`}>{STANCE_LABEL[c.stance]}</span><Estimate row={c}/></p>
        <blockquote>{c.text}</blockquote>
        <p>{c.rationale}</p>
        <SourceLink synthetic={report.synthetic} url={c.url}>View comment</SourceLink>
      </li>)}</ul>
      {others.length > 0 && <>
        <h3 className="detail-heading">Other comments</h3>
        <ul className="comment-list">{others.map(c => <li key={c.id} className="comment-row">
          <p className="quote-meta">{c.author ?? 'Unknown author'} · <span className={`stance stance-${c.stance}`}>{STANCE_LABEL[c.stance]}</span><Estimate row={c}/></p>
          <blockquote>{c.text}</blockquote>
        </li>)}</ul>
        {emptyCount > 0 && <p className="empty-note">{emptyCount} comment{emptyCount === 1 ? '' : 's'} with no text (stickers or media) not shown.</p>}
      </>}
      <p className="version-note">Analysis version: {report.inferenceVersion}</p>
    </EvidenceDetails>
    </div>

    <aside className="limitations">
      <h2>Coverage</h2>
      <dl className="coverage-list">
        {formatTime(coverage.collectedAt) && <div><dt>Comments collected</dt><dd><time dateTime={coverage.collectedAt!}>{formatTime(coverage.collectedAt)}</time></dd></div>}
        <div><dt>Comments</dt><dd>{coverage.analyzed} analyzed{coverage.reported !== null ? ` of ${coverage.reported}` : ''}</dd></div>
        <div><dt>Stance</dt><dd>{s.supportive} supportive · {s.critical} critical · {s.mixed} mixed · {s.neutral + s.unclear} neutral</dd></div>
        <div><dt>Histories</dt><dd>{historiesReturned} of {report.histories.length} sampled users</dd></div>
      </dl>
      {!report.synthetic && <p>Stored results may be reused for the same post until their original 24-hour expiry.</p>}
      {report.limitations.length > 0 && <details className="coverage-details"><summary>Details</summary><ul className="limitation-list">{report.limitations.map(l => <li key={l}>{l}</li>)}</ul></details>}
    </aside>
  </div>;
}

