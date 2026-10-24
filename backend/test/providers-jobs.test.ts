import {it,expect,vi,afterEach} from 'vitest';
import {convexTest} from 'convex-test';
import {anyApi} from 'convex/server';
import schema from '../convex/schema';
import {Apify,plan,mapRecord,discussion,historySets,liveGate,advance,verification} from '../src/providers';
import {publicAddress} from '../src/outbound';
import {iso,limits} from '../src/core';
const modules={...import.meta.glob('../convex/**/*.ts'),'../convex/_generated/marker.ts':async()=>({})};
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
it.each(['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','0.0.0.0','224.0.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1'])('blocks private/reserved SSRF address %s',address=>expect(publicAddress(address)).toBe(false));
it('permits public unicast addresses',()=>{expect(publicAddress('8.8.8.8')).toBe(true);expect(publicAddress('2606:4700:4700::1111')).toBe(true);});
it('starts Apify asynchronously with spend/time caps, polls persisted run IDs and pages bounded datasets without URL credentials',async()=>{
 const mock=vi.fn().mockResolvedValueOnce({status:201,body:{data:{id:'run',status:'RUNNING'}}}).mockResolvedValueOnce({status:200,body:{data:{id:'run',status:'SUCCEEDED',defaultDatasetId:'data'}}}).mockResolvedValueOnce({status:200,body:[{id:'1'}]});
 const api=new Apify('server-only-test-token',mock);
 await api.start('clearpath/reddit-post-comments-bulk-scraper',{postUrl:'synthetic'});await api.poll('run');expect(await api.items('data',100,50)).toEqual([{id:'1'}]);
 expect(mock.mock.calls[0][0]).toContain('waitForFinish=0');expect(mock.mock.calls[0][0]).toContain('maxTotalChargeUsd=0.25');expect(mock.mock.calls[2][0]).toContain('offset=100&limit=50');expect(mock.mock.calls.every(([url])=>!url.includes('server-only-test-token'))).toBe(true);
});
it('classifies retryable provider failures and inaccessible datasets',async()=>{
 await expect(new Apify('token',vi.fn().mockResolvedValue({status:429,body:{}})).poll('run')).rejects.toMatchObject({retryable:true});
 await expect(new Apify('token',vi.fn().mockResolvedValue({status:403,body:{}})).poll('run')).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE',retryable:false});
});
it('fails closed without approved authorization, retention and runtime evidence',async()=>{
 expect(()=>liveGate('reddit')).toThrow();vi.stubEnv('PROVIDER_MODE','live');vi.stubEnv('PROVIDER_AUTHORIZATION_APPROVED','true');vi.stubEnv('RETENTION_POLICY_REF','review-required');expect(()=>liveGate('reddit')).toThrow('runtime evidence');expect(Object.values(verification).every(v=>!v.runtimeVerified)).toBe(true);
});
it('batches Reddit repeated author lookup plans, separates X root and authored searches and never fetches video histories',()=>{
 const authors=[{id:'reddit:author:a',type:'author',nativeId:'a',platform:'reddit',handle:'alice',displayName:null,identityQuality:'provider_id'},{id:'reddit:author:b',type:'author',nativeId:'b',platform:'reddit',handle:'ben',displayName:null,identityQuality:'provider_id'}] as const;
 const reddit=plan('reddit','history',undefined,[...authors]);expect(reddit).toHaveLength(1);expect(reddit[0].input).toMatchObject({usernames:['alice','ben'],contentType:'comments',maxItemsPerUser:150});
 const x=plan('x','discussion','https://x.com/synthetic/status/100');expect(x.map(t=>t.role)).toEqual(['root','discussion']);expect(plan('x','history',undefined,[...authors])[0].input).toMatchObject({searchTerms:['from:alice']});expect(plan('youtube','history')).toEqual([]);expect(plan('tiktok','history')).toEqual([]);
});
it('maps candidate platform fields without precision loss, fabricated metrics or audiovisual claims',()=>{
 const youtube=mapRecord('youtube',{commentId:'abc',authorChannelId:'channel',publishedAt:'2026-10-23T00:00:00Z',text:'metadata'});expect(youtube.estimated).toBe(true);expect(youtube.metrics).toEqual({});
 const x=mapRecord('x',{id:'9007199254740999999',author:{id:'10'},inReplyToId:'11',text:'reply'});expect(x.nativeId).toBe('9007199254740999999');expect(x.parentNativeId).toBe('11');
 const tiktok=mapRecord('tiktok',{commentId:'1',parentCommentId:'2',replyToCommentId:'3'});expect(tiktok.parentNativeId).toBe('3');
 expect(()=>discussion('x','https://x.com/synthetic/status/100',[{actor:'test',input:{},role:'discussion',rows:[{id:'reply',inReplyToId:'root',text:'reply'}],offset:1,done:true,truncated:false}])).toThrow('original discussion root');
});
it('concurrency leases persist, stale results are ignored and recovery is bounded',async()=>{
 vi.useFakeTimers();const t=convexTest(schema,modules);vi.stubEnv('MAX_ACTIVE_JOBS','1');
 const now=Date.now();await t.run(async ctx=>{for(const key of ['one','two'])await ctx.db.insert('jobs',{key,status:'queued',due:now,data:{kind:'test',target:key,payload:{},status:'queued',due:now,attempt:0,lease:null}});});
 const first=await t.mutation(anyApi.jobs.claim,{key:'one'});expect(first).not.toBeNull();expect(await t.mutation(anyApi.jobs.claim,{key:'two'})).toBeNull();
 await t.mutation(anyApi.jobs.settle,{key:'one',token:'wrong-token',outcome:{delivered:true}});expect((await t.run(async ctx=>(await ctx.db.query('jobs').withIndex('key',q=>q.eq('key','one')).unique())!.data)).status).toBe('running');
 vi.setSystemTime(now+62000);const recovered=await t.mutation(anyApi.jobs.claim,{key:'one'});expect(recovered.job.attempt).toBe(1);expect(recovered.job.token).not.toBe(first.job.token);
 await t.mutation(anyApi.jobs.settle,{key:'one',token:recovered.job.token,outcome:{delivered:true}});await t.finishAllScheduledFunctions(()=>vi.runAllTimers());
});
it('reserves run budgets atomically and refuses ambiguous duplicate starts',async()=>{
 vi.useFakeTimers();const t=convexTest(schema,modules);vi.stubEnv('APIFY_DAILY_BUDGET_CENTS','25');
 await t.run(ctx=>ctx.db.insert('jobs',{key:'job',status:'running',due:Date.now(),data:{status:'running',token:'token'}}));
 const args={key:'job',token:'token',operation:'run:0'};expect(await t.mutation(anyApi.jobs.reserve,args)).toBe(true);expect(await t.mutation(anyApi.jobs.reserve,args)).toBe(false);expect(await t.mutation(anyApi.jobs.reserve,{...args,operation:'run:1'})).toBe(false);
});
