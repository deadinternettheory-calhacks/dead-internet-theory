import { TransitionLink } from '../components/TransitionLink';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, ArrowDown } from 'lucide-react';
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

  return <main className="home-main"><section className="hero home-hero"><div className="hero-content"><GraveyardGlobe/>
    <h1>Is this conversation<br/><span>being manipulated?</span></h1><p className="home-hero-description">See the evidence behind the patterns.</p>
    <PostUrlInput onSubmit={url => navigate(`/analysis?url=${encodeURIComponent(url)}`)}/>
    <div className="home-hero-secondary"><TransitionLink className="home-play-demo" to="/example?play=1"><span><Play size={13} fill="currentColor" aria-hidden="true"/></span>Play demo<small>30 sec</small></TransitionLink><PlatformAvailability/></div>
    <ShortcutExplanation/>
  </div>{showExplanation && <Link className="explanation-cue" to="/#how-it-works"><span>How it works</span><ArrowDown size={18} aria-hidden="true"/></Link>}</section><DemoTeaser/><HowSteps/><AboutPage/></main>;
}
