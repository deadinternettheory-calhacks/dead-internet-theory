import { useNavigate } from 'react-router-dom';
import { PostUrlInput, ShortcutExplanation } from '../components/SiteLayout';
export function HomePage() {
  const navigate = useNavigate();
  return <main className="home-main"><section className="hero"><h1>Is this conversation being manipulated?</h1><PostUrlInput onSubmit={url => navigate(`/analysis?url=${encodeURIComponent(url)}`)}/><ShortcutExplanation/></section></main>;
}
