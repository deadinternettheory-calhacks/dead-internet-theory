import { describe, expect, it } from 'vitest';
import { validateSourceUrl } from '../convex/lib/sourceUrl';

describe('server-side source URL validation', () => {
  it('accepts supported hosts and normalizes to https without fragments', () => {
    expect(validateSourceUrl('http://reddit.com/r/a/comments/b/x/#top')).toEqual({ ok: true, sourceUrl: 'https://reddit.com/r/a/comments/b/x/', platform: 'reddit' });
    expect(validateSourceUrl('https://x.com/u/status/1')).toMatchObject({ ok: true, platform: 'x' });
    expect(validateSourceUrl('https://youtu.be/abc')).toMatchObject({ ok: true, platform: 'youtube' });
    expect(validateSourceUrl('https://www.tiktok.com/@u/video/1')).toMatchObject({ ok: true, platform: 'tiktok' });
  });

  it('rejects unsupported, credentialed, ported and non-web URLs', () => {
    for (const bad of ['https://evil.example/x', 'https://user:pw@reddit.com/r/a', 'https://reddit.com:8443/r/a', 'javascript:alert(1)', 'ftp://reddit.com/x', 'not a url', 'https://reddit.com.evil.example/']) {
      expect(validateSourceUrl(bad).ok, bad).toBe(false);
    }
  });
});
