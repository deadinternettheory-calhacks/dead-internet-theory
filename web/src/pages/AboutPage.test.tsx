import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AboutPage } from './AboutPage';

describe('How it works page', () => {
  const markup = renderToStaticMarkup(<AboutPage />);

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

  it('describes current support accurately and places the disclaimer after a divider', () => {
    expect(markup).toContain('Our website helps you investigate suspicious activity and find signs of manipulation.');
    expect(markup).toContain('Those integrations are not yet verified as operational.');
    expect(markup).toContain('A high score, if provided, would suggest suspicious activity, but it would not be proof.');
    expect(markup).toContain('TikTok and YouTube are not supported by the current checker.');
    expect(markup).toContain('<p class="about-disclaimer">Results are estimates based on public signals. They are not proof of coordinated activity.</p>');
    expect(markup.indexOf('about-disclaimer')).toBeGreaterThan(markup.lastIndexOf('</h3>'));
  });
});
