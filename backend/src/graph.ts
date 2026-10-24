import {ApiFault,type Model,type Platform,sha,stable,validate} from './core';
import {checkGraph} from './invariants';
export interface Person {nativeId:string|null;handle?:string|null;displayName?:string|null;profile?:Model<'AuthorProfile'>}
export interface RecordItem {
 nativeId:string|null;text:string;author?:Person|null;parentNativeId?:string|null;topLevel?:boolean;
 timestamp?:string|number|null;estimated?:boolean;url?:string|null;metrics?:Model<'Engagement'>;contentStatus?:Model<'CommentNode'>['contentStatus'];
}
export interface DiscussionData {
 root:RecordItem & {nativeId:string;title?:string|null};comments:RecordItem[];
 reportedCount:number|null;truncated:boolean|null;exhaustive?:boolean;limitations:string[];sortOrder:string;
 actorRuns:Model<'ActorRun'>[];collectedAt:string;sourceSnapshotRef:string;
}
export function timestamp(raw:RecordItem['timestamp'],estimated=false):{createdAt:string|null;timestampPrecision:'exact'|'estimated'|'unknown'} {
 // Epoch values are explicitly seconds. Ambiguous local/relative strings stay unknown.
 const value=typeof raw==='number'?raw*1000:typeof raw==='string'&&(/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)||/ GMT| \+\d{4} /.test(raw))?Date.parse(raw):NaN;
 if(!Number.isFinite(value))return {createdAt:null,timestampPrecision:'unknown'};
 try{return {createdAt:new Date(value).toISOString(),timestampPrecision:estimated?'estimated':'exact'};}catch{return {createdAt:null,timestampPrecision:'unknown'};}
}
export async function fingerprint(g:Omit<Model<'GraphEnvelope'>,'graphFingerprint'>|Model<'GraphEnvelope'>) {
 const {graphFingerprint:_,...body}=g as Model<'GraphEnvelope'>;return sha(body);
}
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
export async function normalize(investigationId:string,platform:Platform,url:string,data:DiscussionData,maxComments:number):Promise<Model<'GraphEnvelope'>> {
 const nodes=new Map<string,Model<'GraphNode'>>();const edges:Model<'GraphEdge'>[]=[];
 function author(person:Person|null|undefined):string|null {
   if(!person||['[deleted]','[removed]','anonymous'].includes(person.handle?.toLowerCase()??'')||(!person.nativeId&&!person.handle))return null;
   const id=`${platform}:author:${person.nativeId??'handle:'+person.handle}`;
   if(!nodes.has(id))nodes.set(id,{id,type:'author',platform,nativeId:person.nativeId,handle:person.handle??null,displayName:person.displayName??null,identityQuality:person.nativeId?'provider_id':'handle',...(person.profile?{profile:person.profile}:{})});
   return id;
 }
 const rootId=`${platform}:discussion:${data.root.nativeId}`;
 nodes.set(rootId,{id:rootId,type:'discussion',nativeId:data.root.nativeId,platform,kind:platform==='reddit'?'post':platform==='x'?'tweet':'video',url,title:data.root.title??null,text:data.root.text,contentScope:['youtube','tiktok'].includes(platform)?'metadata_text_only':'post_text',authorId:author(data.root.author),...timestamp(data.root.timestamp,data.root.estimated),metrics:data.root.metrics??{}});
 const records=new Map<string,RecordItem>();
 // Deterministic duplicate winner: lexicographically first canonical source record.
 for(const c of [...data.comments].sort((a,b)=>compare(stable(a),stable(b)))){
   const native=c.nativeId??`synthetic:${await sha(c)}`;
   if(!records.has(native))records.set(native,c);
 }
 const retained=[...records.entries()].sort(([a],[b])=>compare(a,b)).slice(0,maxComments);
 const retainedIds=new Set(retained.map(([id])=>id));let missingParents=0;
 for(const [native,c] of retained){
   const id=`${platform}:comment:${native}`;const parent=c.parentNativeId??null;
   const parentId=c.topLevel===true||parent===data.root.nativeId?rootId:parent&&retainedIds.has(parent)?`${platform}:comment:${parent}`:null;
   if(!parentId)missingParents++;
   const n:Model<'CommentNode'>={id,type:'comment',platform,nativeId:c.nativeId,idQuality:c.nativeId?'provider_id':'synthetic',authorId:author(c.author),parentId,nativeParentId:parent,text:c.text,...timestamp(c.timestamp,c.estimated),sourceTimestamp:c.timestamp==null?null:String(c.timestamp),url:c.url??null,metrics:c.metrics??{},contentStatus:c.contentStatus??'unknown'};
   nodes.set(id,n);if(n.authorId)edges.push({from:n.authorId,to:id,type:'AUTHORED'});if(parentId)edges.push({from:id,to:parentId,type:'REPLIES_TO'});
 }
 const capped=records.size>retained.length;
 const limitations=[...data.limitations];
 if(capped)limitations.push('Configured comment cap reached; graph is partial.');
 if(missingParents)limitations.push(`${missingParents} comments have unavailable parents; native parents preserved without dangling edges.`);
 if([...nodes.values()].some(n=>n.type!=='author'&&n.timestampPrecision!=='exact'))limitations.push('Some source times are estimated or unavailable.');
 const body={schemaVersion:'1.0.0' as const,investigationId,graphRevision:1,platform,rootId,nodes:[...nodes.values()].sort((a,b)=>compare(a.id,b.id)),edges:edges.sort((a,b)=>compare(stable(a),stable(b))),coverage:{retrievedCommentCount:retained.length,reportedCommentCount:data.reportedCount,truncated:capped?true:data.truncated,completeness:data.exhaustive&&!capped&&!missingParents&&data.truncated===false?'complete' as const:capped||data.truncated===true||missingParents>0?'partial' as const:'unknown' as const,sortOrder:data.sortOrder,collectedAt:data.collectedAt,sourceSnapshotRef:data.sourceSnapshotRef,actorRuns:data.actorRuns,limitations}};
 const graph=validate('GraphEnvelope',{...body,graphFingerprint:await fingerprint(body)});checkGraph(graph);return graph;
}
export function nativeString(value:unknown):string|null {
 if(value==null||value==='')return null;
 if(typeof value==='string')return value;
 if(typeof value==='number'&&Number.isSafeInteger(value))return String(value);
 throw new ApiFault(500,'PROVIDER_INVALID_DATA','Provider identifier is not losslessly representable');
}
