import React, { useState } from 'react';
import { ArrowRight, ArrowUpRight, Link2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { parsePostUrl } from '../url';
import { Button } from './ui/button';
import { PLATFORM_LABEL } from '../platforms';

export function BrandWordmark() {
  return <Link className="brand" to="/" aria-label="Dead Internet Theory, home"><img className="brand-logo" src="/deadinternettheorylogo.png" alt=""/></Link>;
}
export function SiteHeader() {
  const { pathname, hash } = useLocation();
  const alreadyAtSection = pathname === '/' && hash === '#how-it-works';
  return <header className="header"><div className="header-inner"><BrandWordmark/><nav aria-label="Main navigation"><Link to="/#how-it-works" replace={alreadyAtSection}>How it works</Link></nav></div></header>;
}
export function SiteFooter() {
  return null;
}
function InlineError({ children }: { children: string }) { return <p className="inline-error" role="alert">{children}</p>; }
export function PostUrlInput({ onSubmit }: { onSubmit: (url: string) => void }) {
  const [value, setValue] = useState(''); const [error, setError] = useState('');
  function submit(event: React.FormEvent) {
    event.preventDefault(); const result = parsePostUrl(value);
    if (!result.ok) { setError(result.reason === 'empty' ? 'Paste a post link to get started.' : 'Use a public X, Reddit, TikTok, or YouTube post or video link.'); return; }
    setError(''); onSubmit(result.url.href);
  }
  return <form className="search-form" onSubmit={submit} noValidate><label className="sr-only" htmlFor="post-url">Post link</label><div className="input-wrap"><Link2 size={20} aria-hidden="true"/><input id="post-url" type="url" value={value} onChange={event => { const nextValue = event.target.value; setValue(nextValue); if (error && parsePostUrl(nextValue).ok) setError(''); }} placeholder="Paste a post or video link…" aria-invalid={!!error} aria-describedby={error ? 'url-error' : undefined}/></div>{error && <div id="url-error" className="form-error"><InlineError>{error}</InlineError></div>}<Button type="submit">Analyze post <ArrowRight size={18} aria-hidden="true"/></Button></form>;
}
export function ShortcutExplanation() {
  return <p className="shortcut">Or add <code>deadinternettheory.us/</code> before a post link to check it instantly.</p>;
}
export function PostSummaryCard({ url }: { url: string }) {
  const parsed = parsePostUrl(url);
  return <article className="card summary-card"><span className="platform-label">{parsed.ok ? PLATFORM_LABEL[parsed.platform].toUpperCase() : 'POST LINK'}</span><h2 className="url-title">Submitted post link</h2><p className="url-display">{url}</p>{parsed.ok && <a className="original-link" href={parsed.url.href} target="_blank" rel="noopener noreferrer">View original post <ArrowUpRight size={16}/></a>}</article>;
}
