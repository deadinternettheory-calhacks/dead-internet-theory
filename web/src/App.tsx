import { BrowserRouter, useLocation } from 'react-router-dom';
import { SiteFooter, SiteHeader } from './components/SiteLayout';
import { AboutPage } from './pages/AboutPage';
import { AnalysisPage, UnsupportedPrefixPage } from './pages/AnalysisPage';
import { HomePage } from './pages/HomePage';
import { parsePrefixPath } from './url';
import './styles.css';
function RouterView() {
  const location = useLocation();
  if (location.pathname === '/about' || location.pathname === '/about/') return <AboutPage/>;
  if (location.pathname === '/analysis' || location.pathname === '/analysis/') return <AnalysisPage url={new URLSearchParams(location.search).get('url') || ''}/>;
  if (location.pathname !== '/') { const parsed = parsePrefixPath(location.pathname, location.search); return parsed.ok ? <AnalysisPage url={parsed.url.href}/> : <UnsupportedPrefixPage/>; }
  return <HomePage/>;
}
export default function App() {
  return <BrowserRouter><div className="site-shell"><SiteHeader/><RouterView/><SiteFooter/></div></BrowserRouter>;
}
