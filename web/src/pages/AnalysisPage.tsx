import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ServiceUnavailable, UnsupportedLinkState } from '../components/AnalysisStates';
import { PostSummaryCard } from '../components/SiteLayout';
import { parsePostUrl } from '../url';
export function AnalysisPage({ url }: { url: string }) {
  const valid = parsePostUrl(url);
  return <main className="analysis-main"><Link className="back-link" to="/">{String.fromCharCode(8592)} Check another post</Link>{valid.ok ? <><PostSummaryCard url={url}/><ServiceUnavailable/></> : <UnsupportedLinkState/>}<div className="bottom-cta"><h2>Have another post to check?</h2><Link className="primary-button link-button" to="/">Analyze another post <ArrowRight size={18}/></Link></div></main>;
}
export function UnsupportedPrefixPage() {
  return <main className="analysis-main"><Link className="back-link" to="/">{String.fromCharCode(8592)} Check another post</Link><UnsupportedLinkState/><div className="bottom-cta"><Link className="primary-button link-button" to="/">Try another link <ArrowRight size={18}/></Link></div></main>;
}
