import { parsePostUrl, parsePrefixPath } from './url';
import vercel from '../vercel.json';
import { describe, expect, it } from 'vitest';

describe('post URL validation',()=>{
 it('accepts Reddit',()=>expect(parsePostUrl(' https://www.reddit.com/r/example/comments/abc123/post/ ').ok).toBe(true));
 it('rejects unsupported domains and unsafe protocols',()=>{ expect(parsePostUrl('https://facebook.com/post/1').ok).toBe(false); expect(parsePostUrl('https://reddit.com.evil.test/post').ok).toBe(false); expect(parsePostUrl('javascript:alert(1)').ok).toBe(false); });
 it('rejects invalid URLs',()=>expect(parsePostUrl('not a url').ok).toBe(false));
 it('keeps query parameters',()=>{const result=parsePostUrl('https://reddit.com/r/a/comments/abc?context=3');expect(result.ok&&result.url.search).toBe('?context=3')});
 it('rejects double-encoded input as a bad URL',()=>expect(parsePostUrl(encodeURIComponent('https://reddit.com/r/a/comments/b')).ok).toBe(false));
});
describe('raw prefix parsing',()=>{
 it('extracts nested protocol/path/query',()=>{const result=parsePrefixPath('/https://reddit.com/r/a/comments/b?context=3');expect(result.ok&&result.url.href).toBe('https://reddit.com/r/a/comments/b?context=3')});
 it('accepts a deliberately encoded complete link',()=>{const result=parsePrefixPath('/'+encodeURIComponent('https://reddit.com/r/a/comments/b?context=3'));expect(result.ok&&result.url.href).toBe('https://reddit.com/r/a/comments/b?context=3')});
 it('keeps encoded fragments in the canonical shortcut form',()=>{const result=parsePrefixPath('/'+encodeURIComponent('https://reddit.com/r/a/comments/b#comment'));expect(result.ok&&result.url.hash).toBe('#comment')});
 it('rejects malformed prefix safely',()=>expect(parsePrefixPath('/https%3A%2F%2F%25ZZ').ok).toBe(false));
 it('serves direct routes from the SPA entry point',()=>expect(vercel.rewrites).toContainEqual({source:'/(.*)',destination:'/'}));
});
