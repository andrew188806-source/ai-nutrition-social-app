import {createClient} from 'npm:@supabase/supabase-js@2';
import {createDenoSocialRuntimeExecutorTransport} from '../_shared/social-runtime-transport/denoPostgresExecutorTransport.ts';
import type {SocialRuntimeExecutorTransport} from '../_shared/social-runtime-transport/executorTransactionTransport.ts';
import {StrangerExposureService,type StrangerConfig} from '../_shared/stranger-exposure/service.ts';
import {parseStrangerRequest,parseStrangerResponse} from '../../../packages/shared/src/domain/stranger-exposure.ts';
import {loadConfig} from './config.ts';
// Identity-only verification permits stop even after social consent withdrawal. All disclosures and
// new opt-ins are additionally authorized by the actual DB actor/adult/consent authority.
export async function verifyIdentity(request:Request,url:string,anon:string):Promise<string|null>{
 const authorization=request.headers.get('Authorization');if(!authorization)return null;
 const client=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.auth.getUser();return error?null:data.user?.id??null;
}
export type Dependencies={loadConfig:()=>StrangerConfig|null;verifyIdentity:typeof verifyIdentity;createTransport:()=>SocialRuntimeExecutorTransport};
const defaults:Dependencies={loadConfig,verifyIdentity,createTransport:createDenoSocialRuntimeExecutorTransport};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export async function processStrangerExposureRequest(request:Request,deps:Dependencies=defaults):Promise<Response>{
 if(request.method!=='POST'||new URL(request.url).search||Array.from(request.headers.keys()).some(x=>/^x-(actor|user|candidate|target|tier|premium|plan|now|clock|limit|entitlement)/i.test(x)))return response({error:{code:'invalid_request'}},400);
 let parsed;try{const reader=request.body?.getReader();if(!reader)throw Error();let bytes=0;const chunks=[];try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>4096){await reader.cancel();throw Error();}chunks.push(part.value);}}finally{reader.releaseLock();}const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}parsed=parseStrangerRequest(JSON.parse(new TextDecoder().decode(all)));}catch{return response({error:{code:'invalid_request'}},400);}
 if(!parsed)return response({error:{code:'invalid_request'}},400);
 const config=deps.loadConfig();if(!config)return response({error:{code:'server_unavailable'}},503);
 let actor;try{actor=await deps.verifyIdentity(request,config.supabaseUrl,config.supabaseAnonKey);}catch{return response({error:{code:'server_unavailable'}},503);}
 if(!actor)return response({error:{code:'authentication_required'}},401);
 const transport=deps.createTransport();
 try{const value=await new StrangerExposureService(transport,config).execute(actor,parsed);if(!parseStrangerResponse(value))throw Error('invalid_response');return response(value);}
 catch(error){const e=error as {code?:string;message?:string};
  const code=e.code==='40001'?'state_changed':e.code==='42501'?'exposure_or_social_access_required':e.code==='22023'?'source_unavailable':e.message==='photo_unavailable'?'photo_unavailable':(e.message==='invalid_ref'||/_ref_contract_violated$/.test(e.message??''))?'invalid_ref':e.message==='candidate_unavailable'?'candidate_unavailable':'server_unavailable';
  return response({error:{code}},code==='server_unavailable'?503:code==='state_changed'?409:code==='invalid_ref'?400:code==='source_unavailable'||code==='candidate_unavailable'?410:403);
 }finally{await transport.close();}
}
