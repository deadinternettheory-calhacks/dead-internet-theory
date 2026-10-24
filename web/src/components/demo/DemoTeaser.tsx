import { TransitionLink } from '../TransitionLink';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Quote } from 'lucide-react';

import { exampleReport as report } from '../../demo/report';
import { HighlightedText, sharedPhrases } from '../evidence/phrases';

// Cited similar-wording comments when there are any; otherwise the thread's first recommendations.
const similar = report.axes.find(a => a.axis === 'semantic_coordination')?.evidence.filter(e => e.source === 'discussion') ?? [];
const comments = (similar.length >= 2 ? similar : report.comments.filter(c => c.isRecommendation)).slice(0, 3);
const phrase = sharedPhrases(comments)[0];

export function DemoTeaser() {
  const section = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (!section.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { threshold: 0.15 });
    observer.observe(section.current);
    return () => observer.disconnect();
  }, []);
  return <section className="home-demo-section" ref={section} data-visible={visible} aria-labelledby="home-demo-title">
    <div className="home-demo-copy">
      <h2 id="home-demo-title">A real thread.<br/><span>Every recommendation, checked.</span></h2>
      <p>A real r/BuyItForLife question about chef’s knives. Follow the wording, timing, and account-history evidence behind its score.</p>
      <TransitionLink className="home-demo-link" to="/example?play=1">Explore this example <ArrowRight size={17} aria-hidden="true"/></TransitionLink><small>Ready instantly · explore at your pace</small>
    </div>
    <div className="home-demo-preview" aria-label="Sample comments from the example thread">
      <div className="teaser-preview-heading"><span><Quote size={14} aria-hidden="true"/>{phrase ? 'A repeated phrase' : 'Recommendations in this thread'}</span><span>{comments.length} cited comments</span></div>
      {comments.map((comment, index) => <button type="button" className={`teaser-comment${active === index ? ' is-active' : ''}`} key={comment.id}
        aria-pressed={active === index} onClick={() => setActive(index)} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)}>
        <span className="teaser-comment-meta"><span className="teaser-avatar">{index + 1}</span>{comment.author}<span>comment</span></span>
        <span className="teaser-comment-text"><HighlightedText text={comment.text} phrase={phrase}/></span>
      </button>)}
    </div>
  </section>;
}
