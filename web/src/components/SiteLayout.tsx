import React, { useState } from 'react';
import { ArrowRight, ArrowUpRight, Link2, Activity, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { parsePostUrl } from '../url';
import { Button } from './ui/button';

export function BrandWordmark() {
  return <Link className="brand" to="/" aria-label="dead internet theory, home"><span className="network-mark" aria-hidden="true"><i/><i/><i/></span><span>dead internet theory</span></Link>;
}
export function SiteHeader() {
  return <header className="header"><div className="header-inner"><BrandWordmark/><nav aria-label="Main navigation"><Link className="desktop-link" to="/about">How it works</Link><Link to="/about">About</Link></nav></div></header>;
}
export function SiteFooter() {
  return <footer className="footer"><div className="footer-main"><span>{String.fromCharCode(169)} 2026 Dead Internet Theory</span><nav><Link to="/about">How it works</Link><span aria-hidden="true">{String.fromCharCode(183)}</span><Link to="/about">About</Link></nav></div><p>Results are estimates based on available public signals. They are not proof of coordinated activity.</p></footer>;
}
function InlineError({ children }: { children: string }) { return <p className="inline-error" role="alert">{children}</p>; }
export function PostUrlInput({ onSubmit }: { onSubmit: (url: string) => void }) {
  const [value, setValue] = useState(''); const [error, setError] = useState('');
  function submit(event: React.FormEvent) {
    event.preventDefault(); const result = parsePostUrl(value);
    if (!result.ok) { setError(result.reason === 'empty' ? 'Paste a post link to get started.' : "We can't analyze this link yet. Try a supported Reddit or X post."); return; }
    setError(''); onSubmit(result.url.href);
  }
  return <form className="search-form" onSubmit={submit} noValidate><label className="sr-only" htmlFor="post-url">Paste a Reddit or X post link</label><div className="input-wrap"><Link2 size={20} aria-hidden="true"/><input id="post-url" type="url" value={value} onChange={event => { setValue(event.target.value); if (error) setError(''); }} placeholder="Paste a Reddit or X post link" aria-invalid={!!error} aria-describedby={error ? 'url-error' : undefined}/></div>{error && <div id="url-error"><InlineError>{error}</InlineError></div>}<Button type="submit">Analyze Post <ArrowRight size={18} aria-hidden="true"/></Button></form>;
}
export function ShortcutExplanation() {
  return <div className="shortcut"><p>Shortcut: Add <code>deadinternettheory.us/</code> before a post link to check it instantly.</p><div className="example">deadinternettheory.us/https://reddit.com/...</div><p className="fragment-note">Browsers do not send unencoded #fragments to the site. To preserve one, encode the full post link in the shortcut path, for example: <code>deadinternettheory.us/https%3A%2F%2Freddit.com%2Fr%2F...%23...</code>.</p></div>;
}
export function SupportedPlatforms() {
  return <div className="platforms"><span>Check posts from</span><p>Reddit <b>{String.fromCharCode(183)}</b> X / Twitter <span className="planned">(checking is not available yet)</span></p></div>;
}
const steps = [{ icon: Link2, title: 'Share a post', body: 'Paste a link to a public social media post.' }, { icon: Activity, title: 'We examine the activity', body: 'We look for patterns that may suggest coordinated or unusual engagement.' }, { icon: Search, title: 'Review the evidence', body: 'Get a clear summary of what stood out and why it matters.' }];
export function HowItWorks() {
  return <section className="how-section"><h2>Look beyond the likes.</h2><div className="steps">{steps.map(({ icon: Icon, title, body }) => <article className="step" key={title}><Icon size={22} strokeWidth={1.7} aria-hidden="true"/><h3>{title}</h3><p>{body}</p></article>)}</div></section>;
}
export function PostSummaryCard({ url }: { url: string }) {
  const parsed = parsePostUrl(url);
  return <article className="card summary-card"><span className="platform-label">{parsed.ok ? (parsed.platform === 'reddit' ? 'REDDIT' : 'X / TWITTER') : 'POST LINK'}</span><h2 className="url-title">Submitted post link</h2><p className="url-display">{url}</p>{parsed.ok && <a className="original-link" href={parsed.url.href} target="_blank" rel="noopener noreferrer">View original post <ArrowUpRight size={16}/></a>}</article>;
}
