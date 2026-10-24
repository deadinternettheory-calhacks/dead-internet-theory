import type { Source } from '../analysis/sources';

/** One compact "Research:" line with linked papers. */
export function Sources({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return <p className="signal-sources"><span>Research:</span> {sources.map((s, i) => <span key={s.label}>{i > 0 && ' · '}{s.url
    ? <a href={s.url} target="_blank" rel="noopener noreferrer" title={s.title}>{s.label}</a>
    : <cite title={s.title}>{s.label}</cite>}</span>)}</p>;
}
