import {type Model,validate,stable} from './core';
export interface CandidateSet {
 comments:Model<'HistoryComment'>[];status?:'unavailable'|'failed'|'unsupported';error?:Model<'ErrorDetail'>;
 profile?:Model<'AuthorProfile'>;coverage:Pick<Model<'HistoryCoverage'>,'candidateFetchedCount'|'providerTruncated'|'oldestFetchedAt'|'newestFetchedAt'|'collectedAt'|'sourceSnapshotRef'|'actorRunIds'|'limitations'>;
}
export function sample(pair:Model<'AuthorAnchor'>,anchor:Model<'CommentNode'>,rootNativeId:string,set:CandidateSet,windowDays:number,now=Date.now()):Model<'HistoryResult'> {
 const seen=new Set<string>();
 const usable=[...set.comments].sort((a,b)=>stable(a)<stable(b)?-1:stable(a)>stable(b)?1:0).filter(c=>{
   // Native ID is necessary for reliable deduplication. Unknown focal identity cannot prove exclusion.
   if(!c.nativeId||seen.has(c.nativeId))return false;seen.add(c.nativeId);
   return c.authorId===pair.authorId&&c.id!==anchor.id&&c.sourceDiscussionNativeId!==null&&c.sourceDiscussionNativeId!==rootNativeId&&c.createdAt!==null&&c.timestampPrecision!=='unknown'&&Number.isFinite(Date.parse(c.createdAt))&&Date.parse(c.createdAt)<=now;
 });
 const anchorTime=anchor.createdAt?Date.parse(anchor.createdAt):NaN;
 const delta=windowDays*86400000;
 const near=anchor.timestampPrecision==='exact'&&Number.isFinite(anchorTime)?usable.filter(c=>c.timestampPrecision==='exact'&&Math.abs(Date.parse(c.createdAt!)-anchorTime)<=delta):[];
 const byId=(a:string,b:string)=>a<b?-1:a>b?1:0;
 const recent=(a:Model<'HistoryComment'>,b:Model<'HistoryComment'>)=>Date.parse(b.createdAt!)-Date.parse(a.createdAt!)||byId(a.id,b.id);
 let comments=set.status?[]:near.length>=10?near.sort((a,b)=>Math.abs(Date.parse(a.createdAt!)-anchorTime)-Math.abs(Date.parse(b.createdAt!)-anchorTime)||recent(a,b)).slice(0,10):usable.sort(recent).slice(0,10);
 const strategy=comments.length===0?'none':near.length>=10?'temporal_nearest':'recent_fallback';
 const exactTimes=usable.filter(c=>c.timestampPrecision==='exact').map(c=>Date.parse(c.createdAt!));
 const reached=Number.isFinite(anchorTime)&&exactTimes.length>0?Math.min(...exactTimes)<=anchorTime-delta:null;
 const limitations=[...set.coverage.limitations];
 if(comments.some(c=>c.timestampPrecision==='estimated')||anchor.timestampPrecision!=='exact')limitations.push('Estimated or unavailable times prevent exact temporal sampling; fallback uses available dates.');
 if(reached===false)limitations.push('Collected candidates did not reach the start of the anchor window.');
 if(!comments.length)limitations.push('No usable collected candidates; this does not establish empty lifetime history.');
 if(set.status)comments=[];
 return validate('HistoryResult',{...pair,status:set.status??(comments.length===10?'complete':'partial'),strategy,comments,...(set.profile?{profile:set.profile}:{}),...(set.error?{error:set.error}:{}),coverage:{...set.coverage,requestedCount:10,returnedCount:comments.length,reachedAnchorWindow:reached,limitations}});
}
