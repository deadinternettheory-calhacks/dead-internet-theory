import { useNavigate } from 'react-router-dom';
import { HowItWorks, PostUrlInput, ShortcutExplanation, SupportedPlatforms } from '../components/SiteLayout';
export function HomePage() {
  const navigate = useNavigate();
  return <main><section className="hero"><h1>Is this post really as popular as it looks?</h1><p className="subtitle">Check whether the activity around a social media post shows signs of manipulation.</p><PostUrlInput onSubmit={url => navigate(`/analysis?url=${encodeURIComponent(url)}`)}/><ShortcutExplanation/><SupportedPlatforms/></section><HowItWorks/></main>;
}
