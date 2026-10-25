import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown } from 'lucide-react';
import { PostUrlInput, ShortcutExplanation } from '../components/SiteLayout';
import { AboutPage } from './AboutPage';
import { GraveyardGlobe } from '../components/GraveyardGlobe/GraveyardGlobe';
import { DemoTeaser } from '../components/demo/DemoTeaser';
import { HowSteps } from '../components/demo/HowSteps';
import './home.css';
import { PlatformAvailability } from '../components/PlatformAvailability';
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

  return <main className="home-main"><section className="hero home-hero"><div className="hero-content"><GraveyardGlobe/><div className="hero-details">
    <h1>Is this conversation being <span data-text="manipulated?">manipulated?</span></h1>
    <PostUrlInput onSubmit={url => navigate(`/analysis?url=${encodeURIComponent(url)}`)}/>
    <ShortcutExplanation/>
  </div></div><div className="home-hero-secondary"><PlatformAvailability/></div>{showExplanation && <Link className="explanation-cue" to="/#how-it-works"><span>How it works</span><ArrowDown size={18} aria-hidden="true"/></Link>}</section><DemoTeaser/><HowSteps/><AboutPage/></main>;
}
