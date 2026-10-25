import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown } from 'lucide-react';
import { PostUrlInput, ShortcutExplanation } from '../components/SiteLayout';
import { AboutPage } from './AboutPage';
import { GraveyardGlobe } from '../components/GraveyardGlobe/GraveyardGlobe';
import { HowSteps } from '../components/demo/HowSteps';
import './home.css';
import { PlatformAvailability } from '../components/PlatformAvailability';
export function HomePage() {
  const navigate = useNavigate();
  const [showExplanation, setShowExplanation] = useState(false);

  useEffect(() => {
    let timeout = 0;
    const canShowCue = () => window.scrollY === 0 && document.documentElement.scrollHeight > window.innerHeight;
    const scheduleCue = () => {
      window.clearTimeout(timeout);
      setShowExplanation(false);
      timeout = window.setTimeout(() => setShowExplanation(canShowCue()), 5000);
    };
    const activityEvents: Array<keyof WindowEventMap> = ['scroll', 'mousemove', 'pointerdown', 'touchstart', 'keydown', 'focusin', 'click'];
    activityEvents.forEach(event => window.addEventListener(event, scheduleCue, { passive: event !== 'keydown' }));
    scheduleCue();
    return () => {
      window.clearTimeout(timeout);
      activityEvents.forEach(event => window.removeEventListener(event, scheduleCue));
    };
  }, []);

  return <main className="home-main"><section className="hero home-hero"><div className="hero-content"><GraveyardGlobe/><div className="hero-details">
    <h1>Is this conversation being <span data-text="manipulated?">manipulated?</span></h1>
    <PostUrlInput onSubmit={url => navigate(`/analysis?url=${encodeURIComponent(url)}`)}/>
    <ShortcutExplanation/>
  </div></div><div className="home-hero-secondary"><PlatformAvailability/></div>{showExplanation && <Link className="explanation-cue" to="/#how-it-works"><span>Scroll for more</span><ArrowDown size={18} aria-hidden="true"/></Link>}</section><HowSteps/><AboutPage/></main>;
}
