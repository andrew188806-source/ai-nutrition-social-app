import type {ConsumerAuthPort} from '../consumer-auth';
import {parsePhotoResponse,type PhotoRequest,type PhotoResponse} from '../../../../packages/shared/src/domain/profile-photo';
import type {StrangerClient} from '../stranger-exposure/repository';
export type PhotoPort={execute(actor:string,request:PhotoRequest):Promise<PhotoResponse>;canPut:boolean};
export class PhotoRequestError extends Error {constructor(public code:string){super(code);}}
export class ProfilePhotoRepository implements PhotoPort {
 constructor(private auth:ConsumerAuthPort,private client:StrangerClient,public canPut:boolean){}
 async execute(actor:string,request:PhotoRequest):Promise<PhotoResponse>{
  if(request.operation==='put'&&!this.canPut)throw new PhotoRequestError('upload_unavailable');
  const current=await this.auth.getCurrentSession();if(!current.ok||current.value?.user.userId!==actor)throw new PhotoRequestError('authentication_required');
  const sdk=await this.client.auth.getSession();if(sdk.error||sdk.data.session?.user.id!==actor)throw new PhotoRequestError('authentication_required');
  const result=await this.client.functions.invoke('profile-photo',{body:request,headers:{Authorization:'Bearer '+sdk.data.session.access_token},timeout:15000});
  if(result.error){let code='outcome_unknown';try{const context=(result.error as {context?:Response}).context;if(context){const value=await context.clone().json();if(typeof value.error?.code==='string')code=value.error.code;}}catch{}throw new PhotoRequestError(code);}
  // Auth may have changed while the request was in flight. Never publish its pixels to a new actor.
  const after=await this.auth.getCurrentSession();if(!after.ok||after.value?.user.userId!==actor)throw new PhotoRequestError('authentication_required');
  const value=parsePhotoResponse(result.data);if(!value||(request.operation==='preview'?!('preview' in value):!('state' in value)))throw new PhotoRequestError('invalid_server_response');return value;
 }
}
let binding:{auth:ConsumerAuthPort;client:StrangerClient;canPut:boolean}|null=null;
export function bindProfilePhotoRuntime(auth:ConsumerAuthPort,client:StrangerClient,canPut:boolean){binding={auth,client,canPut};}
export function clearProfilePhotoRuntime(){binding=null;}
export function createProfilePhotoRepository():PhotoPort|null{return binding?new ProfilePhotoRepository(binding.auth,binding.client,binding.canPut):null;}
