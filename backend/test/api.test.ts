import {convexTest} from 'convex-test';
import {anyApi} from 'convex/server';
import {SignJWT} from 'jose';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import schema from '../convex/schema';
import {validate,type Model} from '../src/core';
import analysisFixture from '../../contracts/examples/analysis-submission.json';
import {deliver} from '../src/outbound';
vi.mock('../src/outbound',async original=>({...await original<typeof import('../src/outbound')>(),deliver:vi.fn().mockResolvedValue(undefined)}));
const modules={...import.meta.glob('../convex/**/*.ts'),'../convex/_generated/marker.ts':async()=>({})};
let t:ReturnType<typeof convexTest<typeof schema.tables>>;
let frontend:string,inference:string,other:string,scoped:string;
async function token(sub:string,role:string,investigations?:string[]){return new SignJWT({role,investigations}).setProtectedHeader({alg:'HS256'}).setSubject(sub).setIssuer('dit-backend').setAudience('dit-v1').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_JWT_SECRET));}
async function call(method:string,path:string,body?:unknown,bearer=frontend,key='test-key-0001'){
 const r=await t.fetch(path,{method,headers:{authorization:`Bearer ${bearer}`,'content-type':'application/json','idempotency-key':key},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const value=await r.json();if(r.status>=400)validate('ApiError',value);return {status:r.status,value};
}
const create=()=>call('POST','/v1/investigations',{sourceUrl:'https://www.reddit.com/r/example/comments/demo/'});
async function drain(){await t.finishAllScheduledFunctions(()=>vi.runAllTimers());}
async function ready(){const {value}=await create();await drain();return value.investigationId as string;}
beforeEach(async()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T00:00:00Z'));vi.stubEnv('AUTH_JWT_SECRET','test-only-secret-'.repeat(4));vi.stubEnv('PROVIDER_MODE','fixture');vi.mocked(deliver).mockReset().mockResolvedValue(undefined);t=convexTest(schema,modules) as typeof t;frontend=await token('alice','frontend');inference=await token('worker','inference',['*']);other=await token('bob','frontend');scoped=await token('scoped','inference',[]);});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
it('mock consumer completes all eight REST operations and validates every model',async()=>{
 const c=await create();expect(c.status).toBe(202);validate('InvestigationResource',c.value);const id=c.value.investigationId;
 expect((await call('GET',`/v1/investigations/${id}/graph`)).status).toBe(409);
 expect((await call('GET',`/v1/investigations/${id}/analysis`)).value.error.code).toBe('ANALYSIS_NOT_READY');
 await drain();expect(deliver).toHaveBeenCalledTimes(1);const event=validate('InvestigationReadyEvent',vi.mocked(deliver).mock.calls[0][0]);expect(event.investigationId).toBe(id);
 const resource=await call('GET',`/v1/investigations/${id}`);validate('InvestigationResource',resource.value);expect(resource.value.ingestionStatus).toBe('completed');expect(resource.value.analysisStatus).toBe('running');
 const g=await call('GET',`/v1/investigations/${id}/graph`,undefined,inference);expect(g.status).toBe(200);validate('GraphEnvelope',g.value);
 const req={authors:[{authorId:'reddit:author:t2_alex',anchorCommentId:'reddit:comment:t1_a'},{authorId:'reddit:author:t2_ben',anchorCommentId:'reddit:comment:t1_b'}],limit:10,windowDays:14,fallback:'most_recent'};
 const e=await call('POST',`/v1/investigations/${id}/enrichments`,req,inference);expect(e.status).toBe(202);validate('EnrichmentJob',e.value);await drain();
 const job=await call('GET',`/v1/investigations/${id}/enrichments/${e.value.enrichmentId}`);expect(job.status).toBe(200);validate('EnrichmentJob',job.value);expect(job.value.results).toHaveLength(2);
 const submission={...analysisFixture,graphFingerprint:g.value.graphFingerprint,usedEnrichmentIds:[e.value.enrichmentId]};
 const a=await call('POST',`/v1/investigations/${id}/analysis`,submission,inference);expect(a.status).toBe(201);validate('AnalysisReceipt',a.value);
 const replay=await call('POST',`/v1/investigations/${id}/analysis`,submission,inference);expect(replay).toEqual(a);
 const result=await call('GET',`/v1/investigations/${id}/analysis`);expect(result.status).toBe(200);validate('AnalysisResource',result.value);expect(result.value.result).toEqual(submission);
 expect((await call('GET',`/v1/investigations/${id}/graph`)).value).toEqual(g.value);
 const cap=await call('GET','/v1/capabilities');expect(cap.status).toBe(200);validate('CapabilityResponse',cap.value);
});
it('atomically deduplicates concurrent POSTs, replays original queued result, and conflicts on changed body',async()=>{
 const [a,b]=await Promise.all([create(),create()]);expect(a).toEqual(b);await drain();expect(await create()).toEqual(a);
 expect((await call('POST','/v1/investigations',{sourceUrl:'https://x.com/synthetic/status/100'})).status).toBe(409);
 const invs=await t.run(ctx=>ctx.db.query('investigations').collect());expect(invs).toHaveLength(1);
});
it('requires valid credentials, operation role, investigation ownership and scope before idempotency replay',async()=>{
 const id=(await create()).value.investigationId;
 expect((await call('GET',`/v1/investigations/${id}`,undefined,'bad')).status).toBe(401);
 expect((await call('GET',`/v1/investigations/${id}`,undefined,other)).status).toBe(403);
 expect((await call('GET',`/v1/investigations/${id}`,undefined,scoped)).status).toBe(403);
 expect((await call('POST','/v1/investigations',{sourceUrl:'https://x.com/a/status/1'},inference)).status).toBe(403);
 expect((await call('POST',`/v1/investigations/${id}/enrichments`,{},frontend)).status).toBe(403);
 expect((await call('POST',`/v1/investigations/${id}/analysis`,{},frontend)).status).toBe(403);
 await drain();
});
it.each(['short','\u00e9'.repeat(8),'x'.repeat(129)])('rejects invalid idempotency header %s',async key=>expect((await call('POST','/v1/investigations',{sourceUrl:'https://x.com/a/status/1'},frontend,key)).status).toBe(400));
it('validates anchors, duplicates, malformed and stale analysis, foreign histories and invented evidence',async()=>{
 const id=await ready();const base=`/v1/investigations/${id}`;
 const pair={authorId:'reddit:author:t2_alex',anchorCommentId:'reddit:comment:t1_a'};
 const request={authors:[pair,pair],limit:10,windowDays:14,fallback:'most_recent'};
 expect((await call('POST',base+'/enrichments',request,inference)).value.error.code).toBe('DUPLICATE_AUTHOR_ANCHOR');
 expect((await call('POST',base+'/enrichments',{...request,authors:[{...pair,anchorCommentId:'reddit:comment:t1_b'}]},inference)).value.error.code).toBe('ANCHOR_AUTHOR_MISMATCH');
 expect((await call('POST',base+'/enrichments',{...request,authors:[{...pair,authorId:'reddit:author:invented'}]},inference)).value.error.code).toBe('UNKNOWN_AUTHOR');
 expect((await call('POST',base+'/analysis',{},inference)).status).toBe(422);
 expect((await call('POST',base+'/analysis',analysisFixture,inference)).value.error.code).toBe('STALE_GRAPH_REVISION');
 const graph=(await call('GET',base+'/graph')).value;
 const submission={...analysisFixture,graphFingerprint:graph.graphFingerprint};
 expect((await call('POST',base+'/analysis',submission,inference)).value.error.code).toBe('INVALID_EVIDENCE_REF');
 const noHist={...submission,usedEnrichmentIds:[],clusters:[]};
 expect((await call('POST',base+'/analysis',{...noHist,subject:{...noHist.subject,evidenceRefs:['reddit:comment:invented']}},inference)).value.error.code).toBe('INVALID_EVIDENCE_REF');
 expect((await call('POST',base+'/analysis',{...noHist,sentiment:{...noHist.sentiment,analyzedCommentCount:99}},inference)).value.error.code).toBe('INVALID_ANALYSIS');
 expect((await call('POST',base+'/analysis',noHist,inference)).status).toBe(201);
 expect((await call('POST',base+'/analysis',noHist,inference,'new-analysis-key')).value.error.code).toBe('ANALYSIS_ALREADY_SUBMITTED');
});
it('retries event delivery at least once, reuses stable event identity, and does not recollect graph',async()=>{
 const {ApiFault}=await import('../src/core');vi.mocked(deliver).mockRejectedValueOnce(new ApiFault(500,'EVENT_DELIVERY_FAILED','retry',true));
 const id=await ready();expect(deliver).toHaveBeenCalledTimes(2);expect(vi.mocked(deliver).mock.calls[0]).toEqual(vi.mocked(deliver).mock.calls[1]);
 expect((await call('GET',`/v1/investigations/${id}`)).value.analysisStatus).toBe('running');
 expect(await t.run(ctx=>ctx.db.query('graphs').collect())).toHaveLength(1);
});
it('fails unknown fixture sources truthfully and does not queue inference',async()=>{
 const r=await call('POST','/v1/investigations',{sourceUrl:'https://www.reddit.com/r/example/comments/missing/'});await drain();
 const inv=(await call('GET',`/v1/investigations/${r.value.investigationId}`)).value;expect(inv.ingestionStatus).toBe('failed');expect(inv.analysisStatus).toBe('waiting_for_graph');expect(deliver).not.toHaveBeenCalled();
});
it('enforces rate and graph size boundaries',async()=>{
 vi.stubEnv('POSTS_PER_HOUR','1');expect((await create()).status).toBe(202);expect((await call('POST','/v1/investigations',{sourceUrl:'https://x.com/synthetic/status/100'},frontend,'second-create')).status).toBe(429);await drain();
 vi.stubEnv('MAX_GRAPH_BYTES','1000');const id=(await create()).value.investigationId;expect((await call('GET',`/v1/investigations/${id}/graph`)).status).toBe(413);
});
it.each(['youtube','tiktok'])('returns unsupported history for %s without a provider call',async platform=>{
 const {fixtureUrls}=await import('../src/fixture');const r=await call('POST','/v1/investigations',{sourceUrl:fixtureUrls[platform as 'youtube'|'tiktok']});await drain();
 const base=`/v1/investigations/${r.value.investigationId}`;const graph=(await call('GET',base+'/graph')).value as Model<'GraphEnvelope'>;
 const anchor=graph.nodes.find(n=>n.type==='comment'&&n.authorId) as Model<'CommentNode'>;
 const e=await call('POST',base+'/enrichments',{authors:[{authorId:anchor.authorId,anchorCommentId:anchor.id}],limit:10,windowDays:14,fallback:'most_recent'},inference);await drain();
 const job=(await call('GET',base+'/enrichments/'+e.value.enrichmentId)).value;expect(job.results[0].status).toBe('unsupported');expect(job.results[0].coverage.actorRunIds).toEqual([]);
});
