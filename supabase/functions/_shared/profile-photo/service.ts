import {defineSocialRuntimeExecutorStatement as sql,type SocialRuntimeExecutorTransport} from '../social-runtime-transport/executorTransactionTransport.ts';
import {normalizePhoto,decodeBase64} from './imageCodec.ts';
import {parsePhotoResponse,type PhotoRequest,type PhotoResponse} from '../../../../packages/shared/src/domain/profile-photo.ts';
const ISOLATION=sql`set transaction isolation level read committed`;
const BIND=sql`select pg_catalog.set_config('request.jwt.claim.sub',$1::text,true)`;
const STATE=sql<{value:unknown}>`select platform_identity_internal.state($1::uuid) as value`;
const RECOVERY=sql<{value:unknown}>`select platform_identity_internal.removal_state($1::uuid) as value`;
const PREVIEW=sql<{value:unknown}>`select platform_identity_internal.preview($1::uuid,$2::uuid) as value`;
const PUT=sql<{value:unknown}>`select platform_identity_internal.put($1::uuid,$2::uuid,$3::uuid,$4::bytea,$5::bytea,$6::smallint,$7::smallint) as value`;
const REMOVE=sql<{value:unknown}>`select platform_identity_internal.remove($1::uuid,$2::uuid,$3::uuid,$4::bytea) as value`;
export class ProfilePhotoService {
 constructor(private transport:SocialRuntimeExecutorTransport){}
 async execute(actor:string,request:PhotoRequest):Promise<PhotoResponse>{
  const query=async(statement:typeof STATE,args:readonly unknown[],kind:'state'|'preview'='state')=>this.transport.withTransaction(async tx=>{
   await tx.query(ISOLATION);await tx.query(BIND,[actor]);const rows=await tx.query(statement,args);if(rows.length!==1)throw Error('invalid_photo_response');
   const value=parsePhotoResponse({version:'private-avatar-v1',[kind]:rows[0].value});if(!value)throw Error('invalid_photo_response');return value;
  });
  if(request.operation==='state')return query(STATE,[actor]);
  if(request.operation==='removal-state')return query(RECOVERY,[actor]);
  if(request.operation==='preview')return query(PREVIEW,[actor,request.revision],'preview');
  // Never ask the client for a digest or trust client dimensions. The digest describes THIS payload.
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([request.operation,request.expectedRevision,request.requestId,request.operation==='put'?request.jpegBase64:null]))));
  if(request.operation==='remove')return query(REMOVE,[actor,request.expectedRevision,request.requestId,digest]);
  await query(STATE,[actor]); // cheap current core check before bounded CPU work; put rechecks under locks.
  const input=decodeBase64(request.jpegBase64);try{const media=await normalizePhoto(input);return await query(PUT,[actor,request.expectedRevision,request.requestId,digest,media.bytes,media.width,media.height]);}finally{input.fill(0);}
 }
}
