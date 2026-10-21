import type {ConsumerAuthPort} from '../consumer-auth';
import {parseStrangerResponse,type StrangerRequest,type StrangerResponse} from '../../../../packages/shared/src/domain/stranger-exposure';
import type {SupabaseMealBuddyClientLike} from '../meal-buddy-candidates/supabaseMealBuddyCandidateContracts';
import {SupabaseMealBuddySourceCardRepository} from '../meal-buddy-candidates/adapters/supabaseMealBuddySourceCardRepository';
export type StrangerClient={auth:{getSession():Promise<{data:{session:{access_token:string;user:{id:string}}|null};error:unknown}>};functions:{invoke(name:string,options:{body:unknown;headers:Record<string,string>;timeout:number}):Promise<{data:unknown;error:unknown}>}};
export class StrangerRepository{
 constructor(private auth:ConsumerAuthPort,private client:StrangerClient){}
 private async invoke(actor:string,name:string,body:unknown){
  const current=await this.auth.getCurrentSession();if(!current.ok||current.value?.user.userId!==actor)throw Error('authentication_required');
  const sdk=await this.client.auth.getSession();if(sdk.error||sdk.data.session?.user.id!==actor)throw Error('authentication_required');
  const token=sdk.data.session.access_token;
  const result=await this.client.functions.invoke(name,{body,headers:{Authorization:'Bearer '+token},timeout:15000});
  if(result.error){let code='request_failed';try{const context=(result.error as {context?:Response}).context;if(context){const value=await context.clone().json();if(typeof value.error?.code==='string')code=value.error.code;}}catch{}throw Error(code);}
  return result.data;
 }
 async execute(actor:string,request:StrangerRequest):Promise<StrangerResponse>{
  const response=parseStrangerResponse(await this.invoke(actor,'stranger-exposure',request));if(!response)throw Error('invalid_server_response');
  const valid=(request.operation==='read'||request.operation==='set')?'settings' in response:request.operation==='discover'?'candidates' in response:request.operation==='profile'?'profile' in response:'relationshipRef' in response;if(!valid)throw Error('invalid_server_response');return response;
 }
 async cards(actor:string){
  const invoke:SupabaseMealBuddyClientLike['functions']['invoke']=async<T=unknown>(name:string,options:{body:unknown})=>{try{return {data:await this.invoke(actor,name,options.body) as T,error:null};}catch(error){return {data:null,error:{message:error instanceof Error?error.message:'request_failed'}};}};
  const repository=new SupabaseMealBuddySourceCardRepository({authPort:this.auth,mealBuddyClient:{functions:{invoke}}});
  const result=await repository.listSourceCards();if(!result.ok)throw Error(result.error.code);return result.value;
 }
}
let binding:{auth:ConsumerAuthPort;client:StrangerClient}|null=null;
export const bindStrangerRuntime=(auth:ConsumerAuthPort,client:StrangerClient)=>{binding={auth,client};};
export const clearStrangerRuntime=()=>{binding=null;};
export const createStrangerRepository=()=>binding?new StrangerRepository(binding.auth,binding.client):null;
