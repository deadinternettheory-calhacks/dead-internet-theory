import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PostUrlInput, ShortcutExplanation } from '../components/SiteLayout';
import { AboutPage } from './AboutPage';
export function HomePage() {
  const navigate = useNavigate();
  const [showExplanation, setShowExplanation] = useState(false);

  useEffect(() => {
    let hasScrolled = false;
    const timeout = window.setTimeout(() => {
      if (!hasScrolled) setShowExplanation(true);
    }, 3000);
    const hideOnScroll = () => {
      hasScrolled = true;
      window.clearTimeout(timeout);
      setShowExplanation(false);
    };
    window.addEventListener('scroll', hideOnScroll, { passive: true });
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('scroll', hideOnScroll);
    };
  }, []);

  return <main className="home-main"><section className="hero"><div className="hero-content"><h1>Is this conversation being manipulated?</h1><PostUrlInput onSubmit={url => navigate(`/analysis?url=${encodeURIComponent(url)}`)}/><ShortcutExplanation/></div>{showExplanation && <Link className="explanation-cue" to="/#how-it-works"><span>Explanation</span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14m-7-7 7 7 7-7"/></svg></Link>}</section><AboutPage/></main>;
}
