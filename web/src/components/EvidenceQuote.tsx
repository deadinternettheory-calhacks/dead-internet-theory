import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { EvidenceItem } from '../analysis/report';

export function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
}

/** Synthetic fixtures have invented URLs on real domains. Never link to them. */
export function SourceLink({ url, synthetic, children }: { url: string | null; synthetic: boolean; children: ReactNode }) {
  if (synthetic || !url || !/^https:\/\//i.test(url)) return null;
  return <a className="text-link" href={url} target="_blank" rel="noopener noreferrer">{children} <ArrowUpRight size={14} aria-hidden="true"/></a>;
}

export function EvidenceQuote({ item, synthetic }: { item: EvidenceItem; synthetic: boolean }) {
  const time = formatTime(item.createdAt);
  return <li className="evidence-quote">
    <p className="quote-meta">{item.author ?? 'Unknown author'}{time ? ` · ${time}` : ''}{item.source === 'history' ? ' · from this account’s other comments' : ''}</p>
    <blockquote>{item.text}</blockquote>
    <SourceLink url={item.url} synthetic={synthetic}>View source</SourceLink>
  </li>;
}
