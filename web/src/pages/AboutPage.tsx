import { IdleGhost } from '../components/AnalysisPlayground/IdleGhost';

export function AboutPage() {
  return <section className="how-it-works" id="how-it-works" aria-labelledby="how-it-works-heading">
    <h2 id="how-it-works-heading">How it works</h2>
    <IdleGhost/>
    <section className="about-section">
      <h3>What is Dead Internet Theory?</h3>
      <p>Dead Internet Theory suggests that much of today's internet is driven by bots and AI-generated content rather than real people. Our website helps you investigate suspicious activity and find signs of manipulation.</p>
    </section>
    <section className="about-section">
      <h3>What is astroturfing?</h3>
      <p>Astroturfing is when someone secretly coordinates accounts or people to make an opinion, product, or idea seem more popular than it really is. Imagine dozens of seemingly independent users praising the same product, but they're all working for the company selling it.</p>
    </section>
    <section className="about-section">
      <h3>How does the checker work?</h3>
      <p>Paste a public post link. We analyze patterns in comments, accounts, and activity to identify potential signs of coordination and explain what we find.</p>
    </section>
    <section className="about-section">
      <h3>Does a high score prove manipulation?</h3>
      <p>No. A high score suggests suspicious activity, but it's not proof. Real users can show similar patterns.</p>
    </section>
    <section className="about-section">
      <h3>What platforms work?</h3>
      <p>Use a public post or video link from X (Twitter), Reddit, TikTok, or YouTube. Current availability is shown with the post form.</p>
    </section>
    <p className="about-disclaimer">Results are estimates based on public signals. They are not proof of coordinated activity.</p>
  </section>;
}
