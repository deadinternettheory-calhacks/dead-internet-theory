export function AboutPage() {
  return <main className="about-main">
    <h1>How it works</h1>
    <section className="about-section">
      <h2>What is Dead Internet Theory?</h2>
      <p>Dead Internet Theory suggests that much of today's internet is driven by bots and AI-generated content rather than real people. This site does not currently analyze posts because its analysis service is not connected.</p>
    </section>
    <section className="about-section">
      <h2>What is astroturfing?</h2>
      <p>Astroturfing is when someone secretly coordinates accounts or people to make an opinion, product, or idea seem more popular than it really is. Imagine dozens of seemingly independent users praising the same product, but they're all working for the company selling it.</p>
    </section>
    <section className="about-section">
      <h2>How does the checker work?</h2>
      <p>Paste a public post link. The site accepts supported Reddit and X (Twitter) links, but its analysis service is not connected, so it does not analyze comments, accounts, or activity yet.</p>
    </section>
    <section className="about-section">
      <h2>Does a high score prove manipulation?</h2>
      <p>No. The site does not currently generate a score because its analysis service is not connected. Any future score would be an estimate, not proof; real users can show similar patterns.</p>
    </section>
    <section className="about-section">
      <h2>What platforms work?</h2>
      <p>The site accepts Reddit and X (Twitter) links, but checking is not available yet. TikTok and YouTube are not available.</p>
    </section>
    <p className="about-disclaimer">Results are estimates based on public signals. They are not proof of coordinated activity.</p>
  </main>;
}
