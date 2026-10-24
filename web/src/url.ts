import type { Platform } from './api/contract';
export type UrlResult = {ok:true; url:URL; platform:Platform} | {ok:false; reason:'empty'|'invalid'|'unsupported'};
const supported: Record<string,Platform> = {'reddit.com':'reddit','www.reddit.com':'reddit','old.reddit.com':'reddit','redd.it':'reddit','x.com':'x','www.x.com':'x','twitter.com':'x','www.twitter.com':'x','youtube.com':'youtube','www.youtube.com':'youtube','m.youtube.com':'youtube','youtu.be':'youtube','tiktok.com':'tiktok','www.tiktok.com':'tiktok'};
export function parsePostUrl(value:string):UrlResult {
 const input=value.trim(); if(!input) return {ok:false,reason:'empty'};
 try { const url=new URL(input); if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port) return {ok:false,reason:'unsupported'}; const platform=supported[url.hostname.toLowerCase()]; if(!platform) return {ok:false,reason:'unsupported'}; if(url.hostname==='m.youtube.com') url.hostname='www.youtube.com'; return {ok:true,url,platform}; } catch { return {ok:false,reason:'invalid'}; }
}
export function parsePrefixPath(pathname:string,search=''):UrlResult {
 const raw=pathname.startsWith('/')?pathname.slice(1):pathname;
 try {
   const target=/^https?:\/\//i.test(raw)?raw:decodeURIComponent(raw);
   if(!/^https?:\/\//i.test(target)) return {ok:false,reason:'invalid'};
   return parsePostUrl(target+search);
 } catch { return {ok:false,reason:'invalid'}; }
}
