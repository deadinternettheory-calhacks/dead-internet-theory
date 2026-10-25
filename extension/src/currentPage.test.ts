import { expect, it } from 'vitest';
import { isCurrentPagePost } from './currentPage';
import manifest from '../public/manifest.json';

it.each([
  'https://www.reddit.com/r/Coffee/comments/abc123/best_machine/',
  'https://old.reddit.com/r/Coffee/comments/abc123/',
  'https://www.tiktok.com/@example/video/1234567890123456789',
  'https://www.tiktok.com/t/ZExample/', 'https://vm.tiktok.com/ZExample/', 'https://vt.tiktok.com/ZExample/',
  'https://www.youtube.com/watch?v=jDtG_pwIIv0&t=30s',
  'https://m.youtube.com/watch?v=jDtG_pwIIv0',
  'https://youtube.com/shorts/jDtG_pwIIv0', 'https://youtu.be/jDtG_pwIIv0?si=example',
])('accepts a supported post/video: %s', url => expect(isCurrentPagePost(url)).toBe(true));

it.each([
  '', 'not a URL', 'chrome://newtab/', 'file:///post.html',
  'https://www.reddit.com/', 'https://www.reddit.com/r/Coffee/', 'https://www.reddit.com/user/example',
  'https://www.tiktok.com/@example', 'https://www.youtube.com/', 'https://www.youtube.com/@example',
  'https://www.youtube.com/watch?v=invalid', 'https://youtu.be/', 'https://x.com/example/status/12345',
  'https://example.com/watch?v=jDtG_pwIIv0', 'https://reddit.com.evil.test/r/Coffee/comments/abc123/',
  'https://user:password@www.reddit.com/r/Coffee/comments/abc123/',
  'https://www.reddit.com:8443/r/Coffee/comments/abc123/', 'http://www.reddit.com/r/Coffee/comments/abc123/',
])('rejects unsupported pages without fetching them: %s', url => expect(isCurrentPagePost(url)).toBe(false));

it('allows URL reads after tab changes without adding social-site host access', () => {
  expect(manifest.permissions).toContain('tabs');
  expect(manifest.host_permissions).toEqual(['https://www.deadinternettheory.us/*']);
});
