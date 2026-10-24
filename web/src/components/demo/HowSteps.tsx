import { Link2, ScanLine, Quote } from 'lucide-react';

const STEPS = [
  { icon: Link2, title: 'Start with a post', text: 'Paste a public Reddit link. We collect the available discussion within our limits.' },
  { icon: ScanLine, title: 'Look for patterns', text: 'Explore repeated wording, unusual timing, and the available account-history samples.' },
  { icon: Quote, title: 'Follow the evidence', text: 'Read the comments behind each finding, along with coverage and limitations.' },
];
export function HowSteps() {
  return <section className="home-how-steps" aria-labelledby="home-steps-heading"><span className="demo-eyebrow">A CLOSER LOOK, IN THREE STEPS</span><h2 id="home-steps-heading">Look beyond the likes.</h2>
    <ol>{STEPS.map(({ icon: Icon, title, text }, index) => <li key={title}><div className="how-step-meta"><span>0{index + 1}</span><Icon size={21} aria-hidden="true"/></div><h3>{title}</h3><p>{text}</p></li>)}</ol>
  </section>;
}
