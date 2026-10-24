import type { Report } from '../analysis/report';
import { SourceLink, formatTime } from './EvidenceQuote';
import { ReportFindings } from './ReportFindings';
import { EvidenceDetails, RiskScoreIndicator, VerdictCard } from './AnalysisPresentation';
import './report.css';


const PLATFORM_LABEL: Record<string, string> = { reddit: 'REDDIT', x: 'X / TWITTER', youtube: 'YOUTUBE', tiktok: 'TIKTOK' };
const STANCE_LABEL: Record<string, string> = { supportive: 'Supportive', critical: 'Critical', neutral: 'Neutral', mixed: 'Mixed', unclear: 'Unclear' };


export function AnalysisReport({ report }: { report: Report }) {
  const { post, coverage } = report;
  const time = formatTime(post.createdAt);
  const recommendations = report.comments.filter(c => c.isRecommendation);
  const others = report.comments.filter(c => !c.isRecommendation);
  return <div className="report-view">
    <article className="card summary-card">
      <span className="platform-label">{PLATFORM_LABEL[post.platform] ?? 'POST'}</span>
      {post.title && <h2 className="url-title">{post.title}</h2>}
      <p className="post-text">{post.text}</p>
      {(post.author || time) && <p className="url-display">{[post.author, time].filter(Boolean).join(' · ')}</p>}
      <SourceLink synthetic={report.synthetic} url={post.url}>View original post</SourceLink>
    </article>

    <VerdictCard label={report.verdict.label} description={report.verdict.description} tone={report.verdict.tone}/>
    {/* Bands follow the rubric tiers: under 35 low, 35-54 moderate, 55+ high. */}
    {report.index && <RiskScoreIndicator score={report.index.score} lowMax={35} moderateMax={55} title="Astroturfing score for this comment section"/>}

    <div className="report-coverage-summary"><span><strong>{coverage.analyzed}</strong> comments analyzed</span><span><strong>{coverage.completeness}</strong> coverage</span><span><strong>{report.histories.filter(history => history.comments.length > 0).length}</strong> history samples with returned comments</span></div>
    <ReportFindings report={report}/>

    <EvidenceDetails>
      {report.index && <div className="index-note">
        <p><strong>Astroturfing score: {report.index.score} / 100.</strong> {report.index.explanation}</p>
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
        <SourceLink synthetic={report.synthetic} url={c.url}>View comment</SourceLink>
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
      <h2>What we checked</h2>
      <p>We analyzed {coverage.analyzed} of {coverage.retrieved} comments we could retrieve{coverage.reported !== null ? ` (the platform reported ${coverage.reported})` : ''}. Whether we retrieved every comment: {coverage.completeness}.</p>
      <p>Stance toward {report.subject}: {coverage.sentiment.supportive} supportive, {coverage.sentiment.critical} critical, {coverage.sentiment.neutral} neutral, {coverage.sentiment.mixed} mixed, {coverage.sentiment.unclear} unclear.</p>
      {coverage.histories && <p>{coverage.histories}</p>}
      <ul className="limitation-list">{report.limitations.map(l => <li key={l}>{l}</li>)}</ul>
    </aside>
  </div>;
}

