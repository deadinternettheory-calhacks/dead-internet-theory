// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AboutPage } from './AboutPage';

describe('How it works page', () => {
  const markup = renderToStaticMarkup(<AboutPage />);
  const container = document.createElement('div');
  container.innerHTML = markup;
  const text = container.textContent ?? '';

  it('renders the homepage section and five FAQ headings in order', () => {
    expect(markup).toContain('id="how-it-works"');
    expect(markup).toContain('<h2 id="how-it-works-heading">How it works</h2>');
    const questions = [...markup.matchAll(/<h3>(.*?)<\/h3>/g)].map((match) => match[1]);
    expect(questions).toEqual([
      'What is Dead Internet Theory?',
      'What is astroturfing?',
      'How does the checker work?',
      'Does a high score prove manipulation?',
      'What platforms work?',
    ]);
  });

  it('renders the requested copy in order and places the disclaimer after a divider', () => {
    expect(text).toContain('Dead Internet Theory suggests that much of today\'s internet is driven by bots and AI-generated content rather than real people. Our website helps you investigate suspicious activity and find signs of manipulation.');
    expect(text).toContain('Paste a public post link. We analyze patterns in comments, accounts, and activity to identify potential signs of coordination and explain what we find.');
    expect(text).toContain('No. A high score suggests suspicious activity, but it\'s not proof. Real users can show similar patterns.');
    expect(text).toContain('Reddit is live. X (Twitter), TikTok, and YouTube are planned.');
    expect(markup).toContain('<p class="about-disclaimer">Results are estimates based on public signals. They are not proof of coordinated activity.</p>');
    expect(markup.indexOf('about-disclaimer')).toBeGreaterThan(markup.lastIndexOf('</h3>'));
  });
});
