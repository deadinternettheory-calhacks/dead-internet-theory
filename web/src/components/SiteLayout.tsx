import React, { useState } from 'react';
import { ArrowRight, ArrowUpRight, Link2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { parsePostUrl } from '../url';
import { Button } from './ui/button';

export function BrandWordmark() {
  return <Link className="brand" to="/" aria-label="Dead Internet Theory, home"><span className="network-mark" aria-hidden="true"><i/><i/><i/></span><span>Dead Internet Theory</span></Link>;
}
export function SiteHeader() {
  return <header className="header"><div className="header-inner"><BrandWordmark/><nav aria-label="Main navigation"><Link to="/about">How it works</Link></nav></div></header>;
}
export function SiteFooter() {
  const pathname = useLocation().pathname;
  const isHome = pathname === '/';
  const isHowItWorks = pathname === '/about' || pathname === '/about/';
  return <footer className={`footer${isHome ? ' home-footer' : ''}`}><div className="footer-main"><span>© 2026 Dead Internet Theory</span></div>{!isHome && !isHowItWorks && <p>Results are estimates based on available public signals. They are not proof of coordinated activity.</p>}</footer>;
}
function InlineError({ children }: { children: string }) { return <p className="inline-error" role="alert">{children}</p>; }
export function PostUrlInput({ onSubmit }: { onSubmit: (url: string) => void }) {
  const [value, setValue] = useState(''); const [error, setError] = useState('');
  function submit(event: React.FormEvent) {
    event.preventDefault(); const result = parsePostUrl(value);
    if (!result.ok) { setError(result.reason === 'empty' ? 'Paste a post link to get started.' : "We can't analyze this link yet. Try a supported Reddit or X post."); return; }
    setError(''); onSubmit(result.url.href);
  }
  return <form className="search-form" onSubmit={submit} noValidate><label className="sr-only" htmlFor="post-url">Post link</label><div className="input-wrap"><Link2 size={20} aria-hidden="true"/><input id="post-url" type="url" value={value} onChange={event => { setValue(event.target.value); if (error) setError(''); }} placeholder="Paste a Reddit or X post link for signs of coordinated or artificial activity." aria-invalid={!!error} aria-describedby={error ? 'url-error' : undefined}/></div>{error && <div id="url-error"><InlineError>{error}</InlineError></div>}<Button type="submit">Analyze post <ArrowRight size={18} aria-hidden="true"/></Button></form>;
}
export function ShortcutExplanation() {
  return <p className="shortcut"><span>Tip:</span> Add <code>deadinternettheory.us/</code> before a post link to check it instantly.</p>;
}
export function PostSummaryCard({ url }: { url: string }) {
  const parsed = parsePostUrl(url);
  return <article className="card summary-card"><span className="platform-label">{parsed.ok ? (parsed.platform === 'reddit' ? 'REDDIT' : 'X / TWITTER') : 'POST LINK'}</span><h2 className="url-title">Submitted post link</h2><p className="url-display">{url}</p>{parsed.ok && <a className="original-link" href={parsed.url.href} target="_blank" rel="noopener noreferrer">View original post <ArrowUpRight size={16}/></a>}</article>;
}
