import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ThreadPreview } from '../analysis/report';
import './report.css';

/** Browse already-collected data while the independent analysis continues. */
export function ThreadPreviewCard({ preview }: { preview: ThreadPreview }) {
  const [shown, setShown] = useState(6);
  const { post } = preview;
  return <div className="report-view">
    <article className="card summary-card">
      <span className="platform-label">{post.platform.toUpperCase()} · COLLECTED POST</span>
      {post.title && <h2 className="url-title">{post.title}</h2>}
      {post.text && <p className="post-text">{post.text}</p>}
      {post.author && <p className="url-display">{post.author}</p>}
    </article>
    <section className="card thread-preview" aria-labelledby="thread-preview-heading">
      <div className="preview-heading"><h2 id="thread-preview-heading">Comments we collected</h2><span>{preview.collectedCount} collected</span></div>
      <p className="preview-hint">You can read the discussion while the analysis continues.</p>
      {preview.comments.length === 0 && <p className="empty-note">No visible comments were collected.</p>}
      <ul className="comment-list">{preview.comments.slice(0, shown).map(comment => <li key={comment.id} className={`comment-row${comment.isReply ? ' is-reply' : ''}`}>
        <p className="quote-meta">{comment.author ?? 'Unknown author'}{comment.isReply ? ' · reply' : ''}</p><blockquote>{comment.text}</blockquote>
      </li>)}</ul>
      {shown < preview.comments.length && <button type="button" className="preview-more" onClick={() => setShown(n => n + 6)}>Read more comments ({preview.comments.length - shown} remaining in preview) <ChevronDown size={15} aria-hidden="true"/></button>}
      {preview.moreCount > 0 && <p className="repeat-note">{preview.moreCount} additional visible comments are outside this preview.</p>}
    </section>
  </div>;
}
