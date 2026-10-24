// Node-only, pinned DNS connection. No redirects, arbitrary API hosts or cookies.
import {lookup} from 'node:dns/promises';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import {ApiFault} from './core';
export function publicAddress(address:string) {
 try {let ip=ipaddr.parse(address);if(ip.kind()==='ipv6'&&(ip as ipaddr.IPv6).isIPv4MappedAddress())ip=(ip as ipaddr.IPv6).toIPv4Address();return ip.range()==='unicast';}catch{return false;}
}
export async function outbound(url:string,options:{method?:string;body?:unknown;headers?:Record<string,string>;maxBytes?:number}={}) {
 const u=new URL(url);
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw new ApiFault(500,'OUTBOUND_BLOCKED','Invalid outbound destination');
 const addresses=await lookup(u.hostname,{all:true});
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new ApiFault(500,'OUTBOUND_BLOCKED','Outbound destination is not public');
 const selected=addresses[0];const body=options.body===undefined?undefined:JSON.stringify(options.body);
 return new Promise<{status:number;body:unknown}>((resolve,reject)=>{
   const req=https.request(u,{method:options.method??'GET',headers:{accept:'application/json',...(body?{'content-type':'application/json','content-length':String(Buffer.byteLength(body))}:{}),...options.headers},lookup:(_h,_o,cb)=>cb(null,selected.address,selected.family)},res=>{
     if((res.statusCode??500)>=300&&(res.statusCode??500)<400){res.destroy();reject(new ApiFault(500,'OUTBOUND_REDIRECT_BLOCKED','Provider redirects are not followed'));return;}
     if(!res.headers['content-type']?.toLowerCase().includes('application/json')){res.destroy();reject(new ApiFault(500,'PROVIDER_INVALID_DATA','Expected provider JSON response'));return;}
     const chunks:Buffer[]=[];let size=0;
     res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>(options.maxBytes??650_000))res.destroy(new ApiFault(500,'PROVIDER_SIZE_LIMIT','Provider response exceeds byte budget'));else chunks.push(chunk);});
     res.on('error',reject);res.on('end',()=>{try{resolve({status:res.statusCode??500,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))});}catch{reject(new ApiFault(500,'PROVIDER_INVALID_DATA','Invalid provider JSON'));}});
   });
   req.setTimeout(15000,()=>req.destroy(new ApiFault(500,'PROVIDER_TIMEOUT','Provider request timed out',true)));
   req.on('error',reject);if(body)req.write(body);req.end();
 });
}
export async function deliver(event:unknown) {
 const endpoint=process.env.INFERENCE_EVENT_URL;const token=process.env.INFERENCE_EVENT_TOKEN;
 if(!endpoint||!token)throw new ApiFault(500,'INFERENCE_NOT_CONFIGURED','Inference event consumer is not configured',true);
 const response=await outbound(endpoint,{method:'POST',body:event,headers:{authorization:`Bearer ${token}`}});
 if(response.status<200||response.status>=300)throw new ApiFault(500,'EVENT_DELIVERY_FAILED','Inference consumer did not acknowledge delivery',response.status===429||response.status>=500);
}
