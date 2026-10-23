import type {ConsumerAuthPort} from '../consumer-auth';
import {parsePhotoResponse,type PhotoRequest,type PhotoResponse} from '../../../../packages/shared/src/domain/profile-photo';
import type {StrangerClient} from '../stranger-exposure/repository';
export type PhotoPort={execute(actor:string,request:PhotoRequest):Promise<PhotoResponse>;canPut:boolean};
// Outcome provenance is local to the real adapter. An arbitrary Error message is not proof of rollback.
export class PhotoRequestError extends Error {constructor(public code:string,public outcome:'not_sent'|'refused'|'unknown'='unknown'){super(code);}}
const definiteStatus:Record<string,number>={invalid_request:400,authentication_required:401,owner_or_core_required:403,state_changed:409,request_reused:400,photo_missing:410,invalid_photo:422,retryable_failure:503};
export class ProfilePhotoRepository implements PhotoPort {
 constructor(private auth:ConsumerAuthPort,private client:StrangerClient,public canPut:boolean){}
 async execute(actor:string,request:PhotoRequest):Promise<PhotoResponse>{
  if(request.operation==='put'&&!this.canPut)throw new PhotoRequestError('upload_unavailable','not_sent');
  // No network mutation has been dispatched at either preflight check.
  let token:string;try{const current=await this.auth.getCurrentSession();if(!current.ok||current.value?.user.userId!==actor)throw Error();
   const sdk=await this.client.auth.getSession();if(sdk.error||sdk.data.session?.user.id!==actor)throw Error();
   token=sdk.data.session.access_token;
  }catch{throw new PhotoRequestError('authentication_required','not_sent');}
  return this.dispatched(actor,request,token);
 }
 private async dispatched(actor:string,request:PhotoRequest,token:string):Promise<PhotoResponse>{
  let result;try{result=await this.client.functions.invoke('profile-photo',{body:request,headers:{Authorization:'Bearer '+token},timeout:15000});}
  catch{throw new PhotoRequestError('outcome_unknown','unknown');}
  if(result.error){let code='outcome_unknown',outcome:'refused'|'unknown'='unknown';try{const context=(result.error as {context?:Response}).context;if(context){const value=await context.clone().json();if(typeof value.error?.code==='string'){code=value.error.code;if(definiteStatus[code]===context.status)outcome='refused';}}}catch{}throw new PhotoRequestError(code,outcome);}
  // A successful response can already represent a committed mutation. Losing Auth now is NOT rollback.
  try{const after=await this.auth.getCurrentSession();if(!after.ok||after.value?.user.userId!==actor)throw Error();}
  catch{throw new PhotoRequestError('authentication_required','unknown');}
  const value=parsePhotoResponse(result.data);if(!value||(request.operation==='preview'?!('preview' in value):!('state' in value)))throw new PhotoRequestError('invalid_server_response','unknown');return value;
 }
}
let binding:{auth:ConsumerAuthPort;client:StrangerClient;canPut:boolean}|null=null;
export function bindProfilePhotoRuntime(auth:ConsumerAuthPort,client:StrangerClient,canPut:boolean){binding={auth,client,canPut};}
export function clearProfilePhotoRuntime(){binding=null;}
export function createProfilePhotoRepository():PhotoPort|null{return binding?new ProfilePhotoRepository(binding.auth,binding.client,binding.canPut):null;}
