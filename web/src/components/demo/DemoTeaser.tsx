import { TransitionLink } from '../TransitionLink';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, FlaskConical, Quote } from 'lucide-react';

import { exampleReport as report } from '../../demo/report';
import { HighlightedText, sharedPhrases } from '../evidence/phrases';

const comments = report.axes.find(a => a.axis === 'semantic_coordination')!.evidence.filter(e => e.source === 'discussion').slice(0, 3);
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
    <div className="home-demo-copy"><span className="synthetic-label"><FlaskConical size={14} aria-hidden="true"/>Synthetic example</span>
      <h2 id="home-demo-title">Same thread.<br/><span>Familiar words.</span></h2>
      <p>A few recommendations start to echo each other. Follow the wording, timing, and account-history evidence in one interactive example.</p>
      <TransitionLink className="home-demo-link" to="/example?play=1">Explore this example <ArrowRight size={17} aria-hidden="true"/></TransitionLink><small>Ready instantly · explore at your pace</small>
    </div>
    <div className="home-demo-preview" aria-label="Sample comments from the synthetic demo">
      <div className="teaser-preview-heading"><span><Quote size={14} aria-hidden="true"/>A phrase worth a closer look</span><span>{comments.length} cited comments</span></div>
      {comments.map((comment, index) => <button type="button" className={`teaser-comment${active === index ? ' is-active' : ''}`} key={comment.id}
        aria-pressed={active === index} onClick={() => setActive(index)} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)}>
        <span className="teaser-comment-meta"><span className="teaser-avatar">{index + 1}</span>{comment.author}<span>example comment</span></span>
        <span className="teaser-comment-text"><HighlightedText text={comment.text} phrase={phrase}/></span>
      </button>)}
      <p className="teaser-preview-note">Shared wording is an observation. It does not prove coordination.</p>
    </div>
  </section>;
}
