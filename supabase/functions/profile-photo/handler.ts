import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {createDenoSocialRuntimeExecutorTransport} from '../_shared/social-runtime-transport/denoPostgresExecutorTransport.ts';
import type {SocialRuntimeExecutorTransport} from '../_shared/social-runtime-transport/executorTransactionTransport.ts';
import {ProfilePhotoService} from '../_shared/profile-photo/service.ts';
import {parsePhotoRequest} from '../../../packages/shared/src/domain/profile-photo.ts';
import {loadConfig,type PhotoConfig} from './config.ts';
// Identity-only boundary: remove remains available when normal core reads/writes are forbidden.
export async function verifyOwner(request:Request,config:PhotoConfig):Promise<string|null>{const authorization=request.headers.get('Authorization');if(!authorization)return null;const client=createClient(config.supabaseUrl,config.supabaseAnonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await client.auth.getUser();if(error){if([400,401,403].includes(Number(error.status)))return null;throw Error('identity_service_unavailable');}return data.user?.id??null;}
export type PhotoDependencies={loadConfig:()=>PhotoConfig|null;verifyOwner:typeof verifyOwner;createTransport:()=>SocialRuntimeExecutorTransport};
const defaults:PhotoDependencies={loadConfig,verifyOwner,createTransport:createDenoSocialRuntimeExecutorTransport};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store','pragma':'no-cache'}});
export async function processPhotoRequest(request:Request,deps:PhotoDependencies=defaults):Promise<Response>{
 if(request.method!=='POST'||new URL(request.url).search||Array.from(request.headers.keys()).some(k=>/^x-(actor|user|owner|target|tier|premium|plan|now|clock|entitlement)/i.test(k)))return response({error:{code:'invalid_request'}},400);
 let parsed;try{const reader=request.body?.getReader();if(!reader)throw Error();let size=0,timedOut=false;const bodyTimer=setTimeout(()=>{timedOut=true;void reader.cancel().catch(()=>{});},3000);const chunks:Uint8Array[]=[];try{for(;;){const part=await reader.read();if(part.done){if(timedOut)throw Error('body_timeout');break;}size+=part.value.length;if(size>368640){await reader.cancel();throw Error();}chunks.push(part.value);}}finally{clearTimeout(bodyTimer);reader.releaseLock();}const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}parsed=parsePhotoRequest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all)));all.fill(0);}catch{return response({error:{code:'invalid_request'}},400);}
 if(!parsed)return response({error:{code:'invalid_request'}},400);
 const config=deps.loadConfig();if(!config)return response({error:{code:'service_unavailable'}},503);
 let actor;try{actor=await deps.verifyOwner(request,config);}catch{return response({error:{code:'service_unavailable'}},503);}if(!actor)return response({error:{code:'authentication_required'}},401);
 let transport:SocialRuntimeExecutorTransport|undefined;
 try{transport=deps.createTransport();return response(await new ProfilePhotoService(transport).execute(actor,parsed));}
 catch(error){const e=error as {code?:string;message?:string};const mutation=parsed.operation==='put'||parsed.operation==='remove';
 const code=e.message==='invalid_photo'?'invalid_photo':e.code==='42501'&&['PH1_VERIFIED_OWNER_REQUIRED','CONSUMER_CORE_ELIGIBILITY_REQUIRED','PH1_DELETION_PENDING'].includes(e.message??'')?'owner_or_core_required':e.code==='40001'?'state_changed':e.code==='22023'?'request_reused':e.code==='P0002'?'photo_missing':e.code==='40P01'||e.code==='55P03'?'retryable_failure':mutation?'outcome_unknown':'service_unavailable';
 return response({error:{code}},code==='invalid_photo'?422:code==='owner_or_core_required'?403:code==='state_changed'?409:code==='request_reused'?400:code==='photo_missing'?410:503);
 }finally{if(transport)try{await transport.close();}catch{/* No logs/body leakage. A committed result is not undone by connection cleanup. */}}
}
