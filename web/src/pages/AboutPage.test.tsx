import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AboutPage } from './AboutPage';

describe('How it works page', () => {
  const markup = renderToStaticMarkup(<AboutPage />);

  it('renders the title and five FAQ headings in order', () => {
    expect(markup).toContain('<h1>How it works</h1>');
    const questions = [...markup.matchAll(/<h2>(.*?)<\/h2>/g)].map((match) => match[1]);
    expect(questions).toEqual([
      'What is Dead Internet Theory?',
      'What is astroturfing?',
      'How does the checker work?',
      'Does a high score prove manipulation?',
      'What platforms work?',
    ]);
  });

  it('states that checking is unavailable and places the disclaimer after a divider', () => {
    expect(markup).toContain('analysis service is not connected');
    expect(markup).toContain('does not currently generate a score');
    expect(markup).toContain('TikTok and YouTube are not available.');
    expect(markup).toContain('<p class="about-disclaimer">Results are estimates based on public signals. They are not proof of coordinated activity.</p>');
    expect(markup.indexOf('about-disclaimer')).toBeGreaterThan(markup.lastIndexOf('</h2>'));
  });
});
