import type { EvidenceItem } from '../../analysis/report';
import { evidenceTime } from './phrases';

export function EvidenceTimeline({ comments, citedIds, selectedId, onSelect }: {
  comments: EvidenceItem[]; citedIds: Set<string>; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const dated = comments.filter(c => c.createdAt && Number.isFinite(Date.parse(c.createdAt))).sort((a, b) => Date.parse(a.createdAt!) - Date.parse(b.createdAt!));
  if (!dated.length) return <div className="evidence-empty">There are no usable comment timestamps in this report.</div>;
  const cited = dated.filter(c => citedIds.has(c.id));
  const span = cited.length > 1 ? Math.round((Date.parse(cited.at(-1)!.createdAt!) - Date.parse(cited[0].createdAt!)) / 60000) : null;
  const visible = [...cited, ...dated.filter(c => !citedIds.has(c.id))].slice(0, 12);
  const selected = dated.find(comment => comment.id === selectedId);
  if (selected && !visible.some(comment => comment.id === selected.id)) visible[visible.length - 1] = selected;
  visible.sort((a, b) => Date.parse(a.createdAt!) - Date.parse(b.createdAt!));
  // Match the axis to plotted comments, including a selected comment outside the initial sample.
  const first = visible[0];
  const last = visible.at(-1)!;
  const start = Date.parse(first.createdAt!);
  const range = Date.parse(last.createdAt!) - start;
  return <div className="evidence-timeline">
    <div className="timeline-summary"><strong>{span === null ? `${dated.length} timestamps` : `${span} minute span`}</strong><span>{span === null ? 'Dates returned with the comments' : `Across ${cited.length} cited comments`}</span></div>
    <div className="timeline-scale"><span>{evidenceTime(first.createdAt, true)}</span><span>{evidenceTime(last.createdAt, true)}</span></div>
    <div className="timeline-rows" role="group" aria-label="Comment timestamps">
      {visible.map((comment, index) => <div className="timeline-row" key={comment.id}>
        <span className="timeline-row-label">{String(index + 1).padStart(2, '0')}</span>
        <div className="timeline-track"><button type="button" className={`timeline-point${citedIds.has(comment.id) ? ' is-cited' : ''}${selectedId === comment.id ? ' is-selected' : ''}`}
          style={{ left: `${range > 0 ? (Date.parse(comment.createdAt!) - start) / range * 100 : 50}%` }} aria-pressed={selectedId === comment.id}
          aria-label={`Read ${comment.author ?? 'comment'} at ${evidenceTime(comment.createdAt)}`} onClick={() => onSelect(comment.id)}><span/></button></div>
      </div>)}
    </div>
    <p className="evidence-visual-note">Highlighted: cited in the timing finding.{comments.length > dated.length ? ` ${comments.length - dated.length} without a time.` : ''}{dated.length > visible.length ? ` ${visible.length} of ${dated.length} shown; scale covers shown timestamps.` : ''}</p>
  </div>;
}
