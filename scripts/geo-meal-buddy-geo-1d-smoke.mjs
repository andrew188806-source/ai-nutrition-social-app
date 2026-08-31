#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root=process.cwd(), require_=createRequire(import.meta.url), ts=require_("typescript");
const checks=[],failures=[];
function check(name,pass,detail){const item={name,pass:Boolean(pass),...(pass||detail===undefined?{}:{detail})};checks.push(item);if(!item.pass)failures.push(item);console.log(`${item.pass?"PASS":"FAIL"} ${String(checks.length).padStart(2,"0")} ${name}`);}
const npmStubs=new Map([["npm:@supabase/supabase-js@2",{createClient:()=>({})}],["npm:postgres@3.4.7",{default:()=>({})}]]);
globalThis.Deno=globalThis.Deno??{env:{get:()=>undefined},serve:()=>{}};
const cache=new Map();
const resolveFile=(candidate)=>[candidate,`${candidate}.ts`,`${candidate}.mjs`,path.join(candidate,"index.ts")].find((entry)=>fs.existsSync(entry)&&fs.statSync(entry).isFile());
function load(absolute){if(cache.has(absolute))return cache.get(absolute).exports;const raw=fs.readFileSync(absolute,"utf8");const{outputText}=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,allowJs:true},fileName:absolute.endsWith(".mjs")?`${absolute.slice(0,-4)}.js`:absolute});const module={exports:{}};cache.set(absolute,module);const localRequire=(specifier)=>{if(npmStubs.has(specifier))return npmStubs.get(specifier);if(!specifier.startsWith("."))return require_(specifier);const resolved=resolveFile(path.resolve(path.dirname(absolute),specifier));if(!resolved)throw new Error(`unresolved import: ${specifier}`);return load(resolved);};new Function("require","module","exports",outputText)(localRequire,module,module.exports);return module.exports;}
const fromRoot=(file)=>load(path.join(root,file));
const composeModule=fromRoot("supabase/functions/_shared/meal-buddy-candidate-api/compose.ts");
const requestModule=fromRoot("supabase/functions/_shared/meal-buddy-candidate-api/request.ts");
const candidateRef=fromRoot("supabase/functions/_shared/social-candidate-ref/index.ts");
const cardRef=fromRoot("supabase/functions/_shared/meal-buddy-card-ref/index.ts");
const handlerModule=fromRoot("supabase/functions/meal-buddy-candidate-list/handler.ts");

const ACTOR="00000000-0000-4000-8000-0000000000aa",SOURCE_CARD="00000000-0000-4000-9000-0000000000a1";
const owner=(i)=>`00000000-0000-4000-8000-${String(i).padStart(12,"0")}`;
const card=(i)=>`00000000-0000-4000-9000-${String(i).padStart(12,"0")}`;
const restaurant=(i)=>`restaurant-${i}`,branch=(i)=>`branch-${i}`;
const OWNERS=Array.from({length:12},(_,i)=>owner(i+1));
const EMPTY_SOURCES=Object.freeze({dietary_restrictions:{rows:[]},favorite_menu_items:{rows:[]},favorite_restaurants:{rows:[]},meal_record_items:{rows:[]},meal_records:{rows:[]},nutrition_goals:{rows:[]},taste_profiles:{rows:[]}});
const tastePayload=(ids)=>({actor:{user_id:ACTOR,sources:EMPTY_SOURCES},authorized_candidate_user_ids:[...ids],candidates:ids.map((user_id)=>({user_id,sources:EMPTY_SOURCES}))});
const poolRow=(ownerUserId,index,state="neutral")=>({candidate_owner_user_id:ownerUserId,candidate_card_id:card(index+1),card_type:"restaurant",intention_type:"eat_together",restaurant_id:restaurant(index+1),restaurant_name:`Restaurant ${index+1}`,dining_date:"2026-09-03",meal_period:"dinner",context_state:state});
const allContexts=(owners=OWNERS)=>new Map(owners.map((_,i)=>[card(i+1),{restaurantId:restaurant(i+1),branchId:branch(i+1)}]));
const allNearby=(count=OWNERS.length)=>Array.from({length:count},(_,i)=>({branch_id:branch(i+1),restaurant_id:restaurant(i+1),distance_meters:i===0?5000:1000+i}));

function createTransport({owners=OWNERS,contexts=allContexts(owners),nearby=allNearby(owners.length),states=()=>"neutral",failAt=null,capture={}}={}){
 capture.calls=capture.calls??[];capture.params=capture.params??{};
 return{async withTransaction(operation){return await operation({query:async(statement,parameters)=>{
  const text=statement.text;
  if(text.includes("canonical_meal_buddy_context_candidates")){capture.calls.push("pool");capture.params.pool=[...parameters];return owners.map((id,i)=>poolRow(id,i,states(i)));}
  if(text.includes("read_meal_buddy_card_branch_context")){capture.calls.push("branch-context");capture.params.context=[...parameters];if(failAt==="context")throw new Error("geo_context_failure");return parameters[0].flatMap((id)=>{const value=contexts.get(id);return value?[{card_id:id,restaurant_id:value.restaurantId,branch_id:value.branchId}]:[];});}
  if(text.includes("narrow_branch_candidates")){capture.calls.push("geo-narrow");capture.params.geo=[...parameters];if(failAt==="narrow")throw new Error("geo_narrow_failure");return nearby;}
  if(text.includes("canonical_candidate_taste_sources")){capture.calls.push("taste");return[{payload:tastePayload(owners)}];}
  if(text.includes("project_exposed_social_profiles")){capture.calls.push("profile");return parameters[1].map((id,ordinal)=>({exposure_ordinal:ordinal,display_name:`Name ${id.slice(-2)}`,mascot_avatar_key:`mascot-${ordinal}`,public_bio:null,willing_to_chat:true}));}
  if(text.includes("project_public_social_interests")){capture.calls.push("interests");return[];}
  throw new Error(`unexpected statement: ${text}`);
 },abort:()=>{throw new Error("aborted");}});},async close(){}};
}
const entitlement=(plan="premium")=>({from:()=>({select:()=>({eq:()=>Promise.resolve({data:[{plan_code:plan,status:"active",valid_from:"2026-01-01T00:00:00.000Z",valid_until:null}],error:null})})})});
const CANDIDATE_KEY=candidateRef.decodeSocialCandidateRefKey(Buffer.alloc(32,7).toString("base64"));
const CARD_KEY=cardRef.decodeMealBuddyCardRefKey(Buffer.alloc(32,9).toString("base64"));
const candidateCipher=candidateRef.createSocialCandidateRefCipher(CANDIDATE_KEY),cardCipher=cardRef.createMealBuddyCardRefCipher(CARD_KEY);
const INSTANT=new Date(Date.now()-60000),ORIGIN=Object.freeze({latitude:25.033,longitude:121.5654});
async function compose(options={}){const capture=options.capture??{};return await composeModule.composeMealBuddyCandidateList({transport:createTransport({...options,capture}),entitlementRowSource:entitlement(options.plan??"premium"),candidateCipher,cardCipher,actorUserId:ACTOR,sourceCardId:SOURCE_CARD,requestInstant:INSTANT,geoOrigin:options.geoOrigin===undefined?null:options.geoOrigin});}
const names=(response)=>response.candidates.map((item)=>item.displayName);
const req=(body,headers={})=>new Request("https://edge.invalid/meal-buddy-candidate-list",{method:"POST",headers,body:JSON.stringify(body)});
const parse=(body,headers)=>requestModule.parseMealBuddyCandidateRequest(req(body,headers));
const threw=async(fn)=>{try{await fn();return false;}catch{return true;}};

try{
 const nonGeoCapture={};const nonGeo=await compose({capture:nonGeoCapture});
 check("no location preserves frozen candidate set and order",JSON.stringify(names(nonGeo))===JSON.stringify([...OWNERS].sort().slice(0,10).map((id)=>`Name ${id.slice(-2)}`)));
 check("no location performs no branch or GEO read",JSON.stringify(nonGeoCapture.calls)===JSON.stringify(["pool","taste","profile","interests"]),nonGeoCapture.calls);
 const noGeoRequest=await parse({sourceCardRef:"mbc1.test"});
 check("no-location request is accepted as explicit not-applied",noGeoRequest.ok&&noGeoRequest.value.geoOrigin===null);
 const validRequest=await parse({sourceCardRef:"mbc1.test",geo:{latitude:ORIGIN.latitude,longitude:ORIGIN.longitude}});
 check("valid foreground coordinates are accepted",validRequest.ok&&validRequest.value.geoOrigin.latitude===ORIGIN.latitude);
 check("malformed half, extra and out-of-range Geo are rejected",!(await parse({sourceCardRef:"mbc1.test",geo:{latitude:25}})).ok&&!(await parse({sourceCardRef:"mbc1.test",geo:{latitude:25,longitude:121,radiusMeters:1}})).ok&&!(await parse({sourceCardRef:"mbc1.test",geo:{latitude:91,longitude:121}})).ok);
 check("actor branch radius and coordinate headers remain forbidden",requestModule.carriesMealBuddyCandidateAuthorityInput(req({sourceCardRef:"mbc1.test"},{"x-branch-id":"x"}))&&requestModule.carriesMealBuddyCandidateAuthorityInput(req({sourceCardRef:"mbc1.test"},{"x-latitude":"25"})));

 const geoCapture={};const applied=await compose({geoOrigin:ORIGIN,capture:geoCapture});
 check("valid location applies exact P0 context then GEO before Taste",JSON.stringify(geoCapture.calls.slice(0,4))===JSON.stringify(["pool","branch-context","geo-narrow","taste"]),geoCapture.calls);
 check("canonical GEO query receives foreground point frozen 5000m and limit 200",JSON.stringify(geoCapture.params.geo)===JSON.stringify([ORIGIN.latitude,ORIGIN.longitude,5000,200]),geoCapture.params.geo);
 check("exactly 5000m remains eligible",applied.candidates.some((item)=>item.card.restaurant?.restaurantId===restaurant(1)));
 const oneInside=await compose({geoOrigin:ORIGIN,nearby:[{branch_id:branch(2),restaurant_id:restaurant(2),distance_meters:4999}]});
 check("inside survives while outside candidates are excluded",oneInside.candidates.length===1&&oneInside.candidates[0].card.restaurant?.restaurantId===restaurant(2));
 const wrongBranch=await compose({geoOrigin:ORIGIN,nearby:[{branch_id:"branch-other",restaurant_id:restaurant(1),distance_meters:10}]});
 check("same restaurant alternate branch cannot satisfy selected-card binding",wrongBranch.candidates.length===0);
 const unbound=allContexts();unbound.delete(card(1));
 const unboundGeo=await compose({geoOrigin:ORIGIN,contexts:unbound,nearby:allNearby()});
 check("unbound historical selected card is excluded only when GEO applies",unboundGeo.candidates.length===10&&nonGeo.candidates.length===10&&!names(unboundGeo).includes("Name 01"));
 const unknownCoordinate=await compose({geoOrigin:ORIGIN,nearby:allNearby().filter((row)=>row.branch_id!==branch(1))});
 check("bound branch with unknown coordinates is excluded",unknownCoordinate.candidates.length===10&&!names(unknownCoordinate).includes("Name 01"));
 const emptyCapture={};const empty=await compose({geoOrigin:ORIGIN,nearby:[],capture:emptyCapture});
 check("successful zero-nearby is honest applied empty",empty.candidates.length===0);
 check("applied empty never enters non-GEO ranking or fallback",JSON.stringify(emptyCapture.calls)===JSON.stringify(["pool","branch-context","geo-narrow"]),emptyCapture.calls);
 const fallbackCapture={};const fallback=await compose({geoOrigin:ORIGIN,failAt:"narrow",capture:fallbackCapture});
 check("GEO infrastructure failure falls back once to frozen non-GEO result",JSON.stringify(names(fallback))===JSON.stringify(names(nonGeo))&&fallbackCapture.calls.filter((item)=>item==="geo-narrow").length===1);
 const contextFallback=await compose({geoOrigin:ORIGIN,failAt:"context"});
 check("private context authority failure also uses one non-GEO fallback",JSON.stringify(names(contextFallback))===JSON.stringify(names(nonGeo)));
 const socialOwners=OWNERS.slice(1);const nearbyBlocked=[{branch_id:branch(1),restaurant_id:restaurant(1),distance_meters:1},...allNearby().slice(1)];
 const socialFirst=await compose({geoOrigin:ORIGIN,owners:socialOwners,contexts:allContexts(socialOwners),nearby:nearbyBlocked});
 check("nearby candidate absent from Social pool cannot re-enter",!names(socialFirst).includes("Name 01"));
 const onlySecond=await compose({geoOrigin:ORIGIN,nearby:[{branch_id:branch(2),restaurant_id:restaurant(2),distance_meters:1}]});
 check("GEO-excluded candidate cannot re-enter through Taste exposure or projection",onlySecond.candidates.length===1&&names(onlySecond)[0]==="Name 02");
 check("duplicate person/card selection remains a contract violation",await threw(()=>compose({owners:[OWNERS[0],OWNERS[0]],contexts:allContexts([OWNERS[0],OWNERS[0]])})));
 const contextOrder=await compose({geoOrigin:ORIGIN,nearby:allNearby(),states:(i)=>i===11?"matched":"neutral"});
 check("Meal Context remains automatic and downstream of GEO",names(contextOrder)[0]==="Name 12");
 const reversedGeo=await compose({geoOrigin:ORIGIN,nearby:[...allNearby()].reverse()});
 check("GEO row distance order does not alter Social Taste order",JSON.stringify(names(reversedGeo))===JSON.stringify(names(applied)));
 const seven=allNearby(7);const premiumSeven=await compose({geoOrigin:ORIGIN,nearby:seven});const freeSeven=await compose({geoOrigin:ORIGIN,nearby:seven,plan:"free"});
 check("3 and 10 exposure caps apply after complete GEO narrowing",premiumSeven.candidates.length===7&&freeSeven.candidates.length===3&&JSON.stringify(names(freeSeven))===JSON.stringify(names(premiumSeven).slice(0,3)));
 const serialized=JSON.stringify(applied);
 check("public response leaks no location branch distance or Geo status",!/latitude|longitude|branch|distance|geoStatus|geo_status/i.test(serialized));
 check("public candidate/card DTO shape remains frozen",applied.candidates.every((item)=>JSON.stringify(Object.keys(item).sort())===JSON.stringify(["candidateCardRef","candidateRef","card","displayName","interests","mascotAvatarKey","publicBio","willingToChat"])));
 check("branch reader receives only exact frozen selected card ids",geoCapture.params.context.length===1&&JSON.stringify(geoCapture.params.context[0])===JSON.stringify(OWNERS.map((_,i)=>card(i+1))));

 const SOURCE_REF=await cardCipher.seal(ACTOR,"source",SOURCE_CARD,INSTANT);const handlerCapture={};
 const dependencies={loadConfig:()=>({ok:true,value:{supabaseUrl:"https://dev.invalid",supabaseAnonKey:"anon",candidateRefKey:CANDIDATE_KEY,cardRefKey:CARD_KEY}}),authenticateCaller:async()=>({ok:true,value:{userId:ACTOR,userScopedClient:entitlement()}}),createTransport:()=>createTransport({capture:handlerCapture})};
 const response=await handlerModule.processMealBuddyCandidateListRequest(req({sourceCardRef:SOURCE_REF,geo:{latitude:ORIGIN.latitude,longitude:ORIGIN.longitude}}),dependencies);
 check("actual authenticated handler wires parsed Geo into canonical composition",response.status===200&&handlerCapture.calls.includes("geo-narrow"));
 const mobile=fs.readFileSync(path.join(root,"apps/mobile/app/meal-buddies.tsx"),"utf8")+fs.readFileSync(path.join(root,"apps/mobile/features/meal-buddy-candidates/adapters/supabaseMealBuddyCandidateRepository.ts"),"utf8");
 check("denied idle failed unsupported and signed-out states send no Geo",/state\.phase === "available" \? location\.state\.position : null/.test(mobile));
 check("Mobile request carries only source ref plus optional coordinate axes",/body = geoContext === null[\s\S]*\{ sourceCardRef \}[\s\S]*geo: \{ latitude: geoContext\.latitude, longitude: geoContext\.longitude \}/.test(mobile));
 const unchangedPaths=["supabase/functions/_shared/meal-buddy-relationship-api","supabase/functions/_shared/meal-buddy-chat-api","apps/mobile/features/meal-buddy-relationships","apps/mobile/features/meal-buddy-chat"];
 check("invite relationship and chat authority remains outside implementation",unchangedPaths.every((candidate)=>!mobile.includes(`from \"${candidate}`)));

 console.log(JSON.stringify({suite:"geo-meal-buddy-geo-1d-smoke",total:checks.length,passed:checks.length-failures.length,failed:failures.length,failures,networkUsed:false,databaseUsed:false,credentialsUsed:false,productionTouched:false},null,2));
 process.exit(failures.length?1:0);
}catch(error){console.log(JSON.stringify({suite:"geo-meal-buddy-geo-1d-smoke",error:error.message,stack:error.stack},null,2));process.exit(1);}
