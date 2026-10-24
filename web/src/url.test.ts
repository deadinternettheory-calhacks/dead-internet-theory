import { parsePostUrl, parsePrefixPath } from './url';
import vercel from '../vercel.json';
import { describe, expect, it } from 'vitest';

describe('post URL validation',()=>{
 it.each([
  ['https://x.com/example/status/123456789', 'x'],
  ['https://twitter.com/example/status/123456789?s=20', 'x'],
  ['https://www.reddit.com/r/example/comments/abc123/post/', 'reddit'],
  ['https://www.tiktok.com/@example/video/7653941272524115231', 'tiktok'],
  ['https://www.youtube.com/watch?v=jDtG_pwIIv0', 'youtube'],
  ['https://youtu.be/jDtG_pwIIv0?si=share', 'youtube'],
  ['https://www.youtube.com/shorts/jDtG_pwIIv0', 'youtube'],
  ['https://m.youtube.com/watch?v=jDtG_pwIIv0', 'youtube'],
 ])('recognizes %s as %s', (url, platform) => {
  const result=parsePostUrl(url); expect(result.ok&&result.platform).toBe(platform);
 });
 it.each(['https://youtube.com.evil.test/watch?v=jDtG_pwIIv0','https://tiktok.com.evil.test/@a/video/123','https://user:password@www.youtube.com/watch?v=jDtG_pwIIv0','https://www.tiktok.com:8443/@a/video/123'])('rejects unsafe platform lookalikes: %s',url=>expect(parsePostUrl(url).ok).toBe(false));
 it('accepts Reddit',()=>expect(parsePostUrl(' https://www.reddit.com/r/example/comments/abc123/post/ ').ok).toBe(true));
 it('rejects unsupported domains and unsafe protocols',()=>{ expect(parsePostUrl('https://facebook.com/post/1').ok).toBe(false); expect(parsePostUrl('https://reddit.com.evil.test/post').ok).toBe(false); expect(parsePostUrl('javascript:alert(1)').ok).toBe(false); });
 it('rejects invalid URLs',()=>expect(parsePostUrl('not a url').ok).toBe(false));
 it('keeps query parameters',()=>{const result=parsePostUrl('https://reddit.com/r/a/comments/abc?context=3');expect(result.ok&&result.url.search).toBe('?context=3')});
 it('rejects double-encoded input as a bad URL',()=>expect(parsePostUrl(encodeURIComponent('https://reddit.com/r/a/comments/b')).ok).toBe(false));
});
describe('raw prefix parsing',()=>{
 it('preserves a YouTube video query through a raw prefix route',()=>{const result=parsePrefixPath('/https://www.youtube.com/watch','?v=jDtG_pwIIv0&si=share');expect(result.ok&&result.platform).toBe('youtube');expect(result.ok&&result.url.searchParams.get('v')).toBe('jDtG_pwIIv0')});
 it('recognizes an encoded TikTok prefix route',()=>{const result=parsePrefixPath('/'+encodeURIComponent('https://www.tiktok.com/@example/video/7653941272524115231'));expect(result.ok&&result.platform).toBe('tiktok')});
 it('extracts nested protocol/path/query',()=>{const result=parsePrefixPath('/https://reddit.com/r/a/comments/b?context=3');expect(result.ok&&result.url.href).toBe('https://reddit.com/r/a/comments/b?context=3')});
 it('accepts a deliberately encoded complete link',()=>{const result=parsePrefixPath('/'+encodeURIComponent('https://reddit.com/r/a/comments/b?context=3'));expect(result.ok&&result.url.href).toBe('https://reddit.com/r/a/comments/b?context=3')});
 it('keeps encoded fragments in the canonical shortcut form',()=>{const result=parsePrefixPath('/'+encodeURIComponent('https://reddit.com/r/a/comments/b#comment'));expect(result.ok&&result.url.hash).toBe('#comment')});
 it('rejects malformed prefix safely',()=>expect(parsePrefixPath('/https%3A%2F%2F%25ZZ').ok).toBe(false));
 it('serves direct routes from the SPA entry point',()=>expect(vercel.rewrites).toContainEqual({source:'/(.*)',destination:'/'}));
});
