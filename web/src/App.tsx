import { useEffect, useLayoutEffect, useRef } from 'react';
import { BrowserRouter, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { SiteFooter, SiteHeader } from './components/SiteLayout';
import { AboutPage } from './pages/AboutPage';
import { AnalysisPage, UnsupportedPrefixPage } from './pages/AnalysisPage';
import { HomePage } from './pages/HomePage';
import { parsePrefixPath } from './url';
import '@fontsource-variable/inter';
import './styles.css';
function RouterView() {
  const location = useLocation();
  if (location.pathname === '/about' || location.pathname === '/about/') return <Navigate to="/#how-it-works" replace/>;
  if (location.pathname === '/example' || location.pathname === '/example/') return <Navigate to="/" replace/>;
  if (location.pathname === '/analysis' || location.pathname === '/analysis/') return <AnalysisPage url={new URLSearchParams(location.search).get('url') || ''}/>;
  if (location.pathname !== '/') { const parsed = parsePrefixPath(location.pathname, location.search); return parsed.ok ? <AnalysisPage url={parsed.url.href}/> : <UnsupportedPrefixPage/>; }
  return <HomePage/>;
}
function HashScroll() {
  const location = useLocation();
  const { hash, pathname } = location;
  useEffect(() => {
    const fromScrollSpy = (location.state as { scrollSpy?: boolean } | null | undefined)?.scrollSpy;
    if (!hash || fromScrollSpy) return;
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }, [hash, pathname, location.state]);
  return null;
}
function RouteScroll() {
  const { pathname, hash } = useLocation();
  const previous = useRef(pathname);
  useLayoutEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const heading = document.querySelector<HTMLElement>('main h1');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }, [pathname, hash]);
  return null;
}
function SectionUrlSync() {
  const navigate = useNavigate();
  const lastScrollY = useRef(0);
  useEffect(() => {
    lastScrollY.current = window.scrollY;
    let frame = 0;
    const syncUrlToScroll = () => {
      const scrollY = window.scrollY;
      const direction = Math.sign(scrollY - lastScrollY.current);
      lastScrollY.current = scrollY;
      const section = document.getElementById('how-it-works');
      if (!section || window.location.pathname !== '/') return;

      const sectionTop = section.getBoundingClientRect().top;
      const isSectionInUrl = window.location.hash === '#how-it-works';
      const sectionIsActive = isSectionInUrl
        ? !(direction < 0 && sectionTop > window.innerHeight * 0.55)
        : sectionTop < window.innerHeight * 0.35;
      const nextHash = sectionIsActive ? '#how-it-works' : '';
      if (window.location.hash === nextHash) return;

      navigate({ pathname: '/', hash: nextHash }, {
        replace: true,
        preventScrollReset: true,
        state: { scrollSpy: true },
      });
    };
    const onScroll = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        syncUrlToScroll();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [navigate]);
  return null;
}
export default function App() {
  return <BrowserRouter><HashScroll/><RouteScroll/><SectionUrlSync/><div className="site-shell"><SiteHeader/><RouterView/><SiteFooter/></div></BrowserRouter>;
}
