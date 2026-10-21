import type {SocialRuntimeReadPort} from '../social-runtime-transport/readPort.ts';
import {defineSocialRuntimeExecutorStatement as sql,type SocialRuntimeExecutorTransaction} from '../social-runtime-transport/executorTransactionTransport.ts';
import {scopedReadPort} from './transactionScope.ts';
import {createStrangerCipher,type StrangerClaims} from './refs.ts';
import {composeMealBuddyCandidateFacts} from '../meal-buddy-candidate-api/compose.ts';
import {parseCard} from '../meal-buddy-candidate-api/readCandidateCards.ts';
import {parsePayload} from '../social-candidate-api/readCandidateTasteSources.ts';
import {resolveSocialEntitlement} from '../social-exposure/resolveEntitlement.ts';
import {toCardDto,toInterestsDto} from '../meal-buddy-candidate-api/toCandidateDto.ts';
import {createMealBuddyCardRefCipher} from '../meal-buddy-card-ref/index.ts';
import {createMealBuddyRelationshipRefCipher} from '../meal-buddy-relationship-ref/index.ts';
import type {StrangerRequest,StrangerResponse,StrangerCandidate} from '../../../../packages/shared/src/domain/stranger-exposure.ts';
const BIND=sql`select pg_catalog.set_config('request.jwt.claim.sub',$1::text,true)`;
const SETTINGS=sql<{value:{enabled:boolean;revision:string|null}}>`select stranger_internal.settings($1::uuid,$2::boolean,$3::uuid) as value`;
const POOL=sql<{value:Record<string,unknown>[]}>`select stranger_internal.pool($1::uuid,$2::uuid) as value`;
const TASTE=sql<{value:unknown}>`select stranger_internal.taste($1::uuid,$2::uuid,$3::uuid[]) as value`;
const PLAN=sql<{value:unknown}>`select stranger_internal.plan_rows($1::uuid,$2::uuid) as value`;
const CHECK=sql`select stranger_internal.check_pair($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid)`;
const SEND=sql<{value:{replay:boolean;rows:{relation_id:string;relative_state:string}[]}}>`select stranger_internal.send($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid) as value`;
const VERSION='stranger-exposure-v1' as const;
export type StrangerConfig={supabaseUrl:string;supabaseAnonKey:string;strangerKey:Uint8Array;cardKey:Uint8Array;relationshipKey:Uint8Array};
export class StrangerExposureService{
 constructor(private transport:SocialRuntimeReadPort,private config:StrangerConfig){}
 async execute(actor:string,request:StrangerRequest):Promise<StrangerResponse>{
  return this.transport.withTransaction(async tx=>{
   await tx.query(BIND,[actor]);
   const now=new Date();
   const plan=async(target:string)=>{
    const rows=await tx.query(PLAN,[actor,target]);if(rows.length!==1)throw Error('server_unavailable');
    return resolveSocialEntitlement({from:()=>({select:()=>({eq:async()=>({data:rows[0].value,error:null})})})},target,now);
   };
   if(request.operation==='read'||request.operation==='set'){
    const r=await tx.query(SETTINGS,[actor,request.operation==='set'?request.enabled:null,request.operation==='set'?request.revision:null]);
    if(r.length!==1)throw Error('server_unavailable');
    let identity:'mascot_ready'|'photo_unavailable'|'ineligible'|'not_evaluated'|'unavailable'='not_evaluated';
    // A failed SQL qualification is isolated so withdrawal can still commit. Infrastructure and
    // malformed entitlements never masquerade as Free or a successful eligibility result.
    try{if(r[0].value.enabled){const scoped=scopedReadPort(tx);const entitlement=await scoped.withTransaction(()=>plan(actor));identity=entitlement.class==='free'?'mascot_ready':'photo_unavailable';}}
    catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='42501')identity='ineligible';else identity='unavailable';}
    return {policyVersion:VERSION,settings:{...r[0].value,identity}};
   }
   const cipher=createStrangerCipher(this.config.strangerKey);
   const params=(c:StrangerClaims)=>[actor,c.target,c.source,c.card,c.actorRevision,c.targetRevision];
   if(request.operation==='send'){
    const claims=await cipher.open(actor,request.ref,now);
    const result=await tx.query(SEND,params(claims));const value=result[0]?.value;
    if(result.length!==1||!value||value.rows?.length!==1)throw Error('server_unavailable');
    if(!value.replay){if((await plan(actor)).class!=='free'||(await plan(claims.target)).class!=='free')throw Error('photo_unavailable');await tx.query(CHECK,params(claims));}
    const row=value.rows[0];if(!['outgoing_pending','incoming_pending','accepted'].includes(row.relative_state))throw Error('server_unavailable');
    return {policyVersion:VERSION,relationshipRef:await createMealBuddyRelationshipRefCipher(this.config.relationshipKey).seal(actor,row.relation_id,now),state:row.relative_state as 'outgoing_pending'|'incoming_pending'|'accepted'};
   }
   let selectedRef:StrangerClaims|null=null;
   let source:string;
   if(request.operation==='profile'){selectedRef=await cipher.open(actor,request.ref,now);source=selectedRef.source;await tx.query(CHECK,params(selectedRef));}
   else source=(await createMealBuddyCardRefCipher(this.config.cardKey).open(actor,'source',request.sourceCardRef,now)).cardId;
   // POOL acquires actor/target shared exposure locks before any private Taste read.
   const rows=await tx.query(POOL,[actor,source]);if(rows.length!==1||!Array.isArray(rows[0].value))throw Error('server_unavailable');
   const current=await tx.query(SETTINGS,[actor,null,null]);const actorRevision=current[0]?.value.revision;if(!actorRevision)throw Error('server_unavailable');
   if((await plan(actor)).class!=='free')throw Error('photo_unavailable');
   let identityBlocked=false;
   const selected:import('../meal-buddy-candidate-api/types.ts').MealBuddySelectedCard[]=[];const revisions=new Map<string,string>();
   for(const row of rows[0].value){const card=parseCard({...row,dining_date:String(row.dining_date)} as never);if(typeof row.revision!=='string')throw Error('server_unavailable');
    if((await plan(card.ownerUserId)).class==='premium'){identityBlocked=true;continue;}
    selected.push(card);revisions.set(card.ownerUserId,row.revision);
   }
   const port=scopedReadPort(tx);
   let tasteIds:string[]=[];
   const facts=await composeMealBuddyCandidateFacts({transport:port,entitlementRowSource:{from:()=>({select:()=>({eq:async()=>({data:(await tx.query(PLAN,[actor,actor]))[0].value,error:null})})})},actorUserId:actor,sourceCardId:source,requestInstant:now,geoOrigin:request.operation==='discover'?request.geoOrigin??null:null,readers:{cards:async()=>selected,taste:async(_transport,_actor,selectedOwnerIds)=>{
    tasteIds=[...selectedOwnerIds];const read=await tx.query(TASTE,[actor,source,tasteIds]);if(read.length!==1)throw Error('server_unavailable');return parsePayload(read[0].value);
   }}});
   const candidates:StrangerCandidate[]=[];
   if(facts)for(const profile of facts.projection.candidates){
    const target=facts.exposure.exposed[profile.exposureIndex].candidateUserId,card=facts.cardByOwner.get(target)!;
    const claims={target,source,card:card.cardId,actorRevision,targetRevision:revisions.get(target)!};
    await tx.query(CHECK,params({...claims,issued:now.getTime(),expires:now.getTime()+86400000}));
    if(!profile.mascotAvatarKey)throw Error('server_unavailable');
    candidates.push({ref:await cipher.seal(actor,claims,now),label:'匿名飯友',mascotAvatarKey:profile.mascotAvatarKey,card:toCardDto(card),interests:toInterestsDto(facts.interestRows.filter(x=>x.exposure_ordinal===profile.exposureIndex))});
   }
   if(selectedRef){const index=facts?.projection.candidates.findIndex(p=>facts.exposure.exposed[p.exposureIndex].candidateUserId===selectedRef!.target)??-1;if(index<0)throw Error('candidate_unavailable');return {policyVersion:VERSION,profile:candidates[index]};}
   return {policyVersion:VERSION,candidates,identityBlocked};
  });
 }
}
