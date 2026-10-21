import type {StrangerSettings,StrangerCandidate,StrangerRequest} from '../../../../packages/shared/src/domain/stranger-exposure';
import type {MealBuddySourceCard} from '../meal-buddy-candidates/types';
import type {StrangerRepository} from './repository';
export type StrangerState={phase:'loading'|'ready'|'error';settings:StrangerSettings|null;cards:readonly MealBuddySourceCard[];candidates:readonly StrangerCandidate[]|null;profile:StrangerCandidate|null;busy:boolean;error:string|null;identityBlocked:boolean;sent:boolean};
const initial=():StrangerState=>({phase:'loading',settings:null,cards:[],candidates:null,profile:null,busy:false,error:null,identityBlocked:false,sent:false});
export class StrangerController{
 private state=initial();private epoch=0;private alive=true;private listeners=new Set<(s:StrangerState)=>void>();private writing=false;
 constructor(private repository:StrangerRepository|null,readonly actor:string){}
 activate(){if(!this.alive){this.alive=true;this.epoch++;this.state=initial();}}
 isActive=()=>this.alive;
 getState=()=>this.state;
 subscribe=(listener:(s:StrangerState)=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
 private publish(s:Partial<StrangerState>){if(!this.alive)return;this.state={...this.state,...s};for(const l of this.listeners)l(this.state);}
 dispose(){this.alive=false;this.epoch++;this.listeners.clear();}
 async load(){return this.run({operation:'read'},true);}
 async set(enabled:boolean){if(!this.state.settings||this.writing)return;return this.run({operation:'set',enabled,revision:this.state.settings.revision},true);}
 async discover(sourceCardRef:string,geoOrigin?:{latitude:number;longitude:number}){if(!this.state.settings?.enabled||this.writing)return;return this.run({operation:'discover',sourceCardRef,...(geoOrigin?{geoOrigin}:{})});}
 async profile(ref:string){if(this.writing)return;return this.run({operation:'profile',ref});}
 async send(ref:string){if(this.writing)return;return this.run({operation:'send',ref});}
 private async run(request:StrangerRequest,refreshCards=false){
  if(!this.alive||this.writing)return;
  const writing=request.operation==='set'||request.operation==='send';if(writing)this.writing=true;
  const epoch=++this.epoch;this.publish({phase:'loading',busy:writing,error:null,candidates:null,profile:null,sent:false});
  try{if(!this.repository)throw Error('service_unavailable');const result=await this.repository.execute(this.actor,request);if(!this.alive||epoch!==this.epoch)return;
   if('settings' in result){this.publish({settings:result.settings,cards:[]});if(refreshCards&&result.settings.enabled&&result.settings.identity==='mascot_ready'){const cards=await this.repository.cards(this.actor);if(!this.alive||epoch!==this.epoch)return;this.publish({cards});}}
   else if('candidates' in result)this.publish({candidates:result.candidates,identityBlocked:result.identityBlocked});
   else if('profile' in result)this.publish({profile:result.profile});
   else this.publish({sent:true});
   this.publish({phase:'ready'});
  }catch(error){if(this.alive&&epoch===this.epoch)this.publish({phase:'error',error:error instanceof Error?error.message:'request_failed',cards:[],candidates:null,profile:null});}
  finally{if(writing)this.writing=false;if(this.alive&&epoch===this.epoch)this.publish({busy:false});}
 }
}
