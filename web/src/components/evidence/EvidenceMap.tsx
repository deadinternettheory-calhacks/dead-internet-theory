import type { EvidenceItem } from '../../analysis/report';

export function EvidenceMap({ comments, activeIds, selectedId, onSelect, overview }: {
  comments: EvidenceItem[]; activeIds: Set<string>; selectedId: string | null; onSelect: (id: string) => void; overview: boolean;
}) {
  const visible = (overview ? comments : [...comments.filter(c => activeIds.has(c.id)), ...comments.filter(c => !activeIds.has(c.id))]).slice(0, 12);
  const selected = comments.find(comment => comment.id === selectedId);
  if (selected && !visible.some(comment => comment.id === selected.id)) visible[visible.length - 1] = selected;
  const points = visible.map((comment, index) => {
    const angle = index / visible.length * Math.PI * 2 - Math.PI / 2;
    return { comment, x: 50 + Math.cos(angle) * 35, y: 50 + Math.sin(angle) * 35 };
  });
  return <div className="evidence-map-wrap">
    <div className="evidence-map" role="group" aria-label="Select a comment to read its evidence">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {points.filter(p => overview || activeIds.has(p.comment.id)).map(p => <path key={p.comment.id}
          className={`map-connection${selectedId === p.comment.id ? ' is-selected' : ''}`}
          d={`M 50 50 Q ${50 + (p.x - 50) * 0.2} ${p.y} ${p.x} ${p.y}`}/>) }
      </svg>
      <div className="map-center" aria-hidden="true"><span>{overview ? comments.length : activeIds.size}</span><small>{overview ? 'comments' : 'matched'}</small></div>
      {points.map(({ comment, x, y }, index) => <button type="button" key={comment.id}
        className={`map-node${activeIds.has(comment.id) ? ' is-cited' : ''}${selectedId === comment.id ? ' is-selected' : ''}`}
        style={{ left: `${x}%`, top: `${y}%` }} aria-pressed={selectedId === comment.id}
        aria-label={`Read comment ${comments.findIndex(item => item.id === comment.id) + 1} by ${comment.author ?? 'unknown author'}`} onClick={() => onSelect(comment.id)}>
        <span className="map-node-dot"/><span className="map-node-label">{comment.author?.replace(/^u\//, '') ?? `Comment ${index + 1}`}</span>
      </button>)}
    </div>
    <p className="evidence-visual-note">{overview ? '' : 'Lines link comments with the phrase. '}{comments.length > visible.length ? `${visible.length} of ${comments.length} shown.` : ''}</p>
  </div>;
}
