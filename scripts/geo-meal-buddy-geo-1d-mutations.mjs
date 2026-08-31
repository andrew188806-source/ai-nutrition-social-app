#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { GEO1D_PRODUCT_PATHS, auditGeo1dSources } from "./geo-meal-buddy-geo-1d-successor-manifest.mjs";
const root=process.cwd(),read=(file)=>fs.readFileSync(path.join(root,file),"utf8");
const original=Object.fromEntries(GEO1D_PRODUCT_PATHS.map((file)=>[file,read(file)]));
original["supabase/functions/_shared/geo-api/repository.ts"]=read("supabase/functions/_shared/geo-api/repository.ts");
original.migrationAdded=false;
const C="supabase/functions/_shared/meal-buddy-candidate-api/compose.ts",R="supabase/functions/_shared/meal-buddy-candidate-api/readCandidateCards.ts",T="supabase/functions/_shared/meal-buddy-candidate-api/types.ts",M="apps/mobile/app/meal-buddies.tsx",H="apps/mobile/features/meal-buddy-candidates/useMealBuddyRealCandidates.ts";
function violations(source){const failed=[...auditGeo1dSources(source)];const rule=(name,pass)=>{if(!pass)failed.push(name);};const compose=source[C],readSource=source[R];const pipeline=compose.slice(compose.indexOf("const baseSelectedCards"));
 rule("GEO result is the ranking pool",/const selectedCards = geoApplication\.cards/.test(pipeline));
 rule("ranking map contains only survivors",/selectedCards\.map\(\(card\) => \[card\.ownerUserId, card\]\)/.test(pipeline));
 rule("one owner remains one selected card",/owners\.size !== cards\.length/.test(readSource));
 rule("radius is exact imported policy",/radiusMeters: NEXT_MEAL_GEO_RADIUS_METERS,/.test(compose));
 rule("outside candidates cannot bypass membership",!/nearbyExactBindings\.has[^;]*\|\| true/.test(compose));
 rule("distance does not sort survivors",!/survivors\.sort/.test(compose));
 rule("location changes re-evaluate selected card",/if \(isLiveMode && selectedSourceCardRef !== null\) void runForRef\(selectedSourceCardRef\);/.test(source[H]));
 rule("no migration added",source.migrationAdded===false);
 return [...new Set(failed)];}
const mutate=(file,old,replacement)=>(s)=>{const value=s[file];if(!value.includes(old))return {...s,__stale:`${file}: ${old}`};return {...s,[file]:value.replace(old,replacement)};};
const mutants=[
 ["no-location incorrectly blocks Social",mutate(C,'if (geoOrigin === null) return Object.freeze({ status: "not_applied", cards: selectedCards });','if (geoOrigin === null) return Object.freeze({ status: "empty", cards: Object.freeze([]) });')],
 ["denied location incorrectly becomes applied",mutate(M,'location.state.phase === "available" ? location.state.position : null','location.state.phase === "denied" ? location.state.position : null')],
 ["unbound card is treated as restaurant-wide",mutate(C,'return context !== undefined\n        && nearbyExactBindings.has(`${context.restaurantId}\\u0000${context.branchId}`);','return context === undefined || nearbyExactBindings.has(`${context.restaurantId}\\u0000${context.branchId}`);')],
 ["first branch is selected directly",mutate(R,'from social_internal.read_meal_buddy_card_branch_context($1::uuid[])','from social_internal.meal_buddy_card_branch_context where card_id = any ($1::uuid[])')],
 ["nearest binding substitutes for selected card",mutate(C,'const context = contexts.get(card.cardId);','const context = contexts.values().next().value;')],
 ["unknown branch coordinate is treated as inside",mutate(C,'return context !== undefined\n        && nearbyExactBindings.has(`${context.restaurantId}\\u0000${context.branchId}`);','return context !== undefined;')],
 ["outside-radius candidate survives",mutate(C,'&& nearbyExactBindings.has(`${context.restaurantId}\\u0000${context.branchId}`);','&& (nearbyExactBindings.has(`${context.restaurantId}\\u0000${context.branchId}`) || true);')],
 ["5000m boundary becomes exclusive",mutate(C,'radiusMeters: NEXT_MEAL_GEO_RADIUS_METERS,','radiusMeters: NEXT_MEAL_GEO_RADIUS_METERS - 1,')],
 ["applied empty falls back non-Geo",mutate(C,'if (contexts.size === 0) return Object.freeze({ status: "empty", cards: Object.freeze([]) });','if (contexts.size === 0) return Object.freeze({ status: "fallback", cards: selectedCards });')],
 ["infrastructure failure is interpreted as applied empty",mutate(C,'return Object.freeze({ status: "fallback", cards: selectedCards });','return Object.freeze({ status: "empty", cards: Object.freeze([]) });')],
 ["fallback recursively retries GEO",mutate(C,'return Object.freeze({ status: "fallback", cards: selectedCards });','return applyMealBuddyGeoEligibility(transport, selectedCards, geoOrigin);')],
 ["Social-ineligible candidate can re-enter",mutate(C,'selectedCards.map((card) => [card.ownerUserId, card])','baseSelectedCards.map((card) => [card.ownerUserId, card])')],
 ["GEO-excluded candidate can re-enter ranking",mutate(C,'const selectedCards = geoApplication.cards;','const selectedCards = baseSelectedCards;')],
 ["alternate card is chosen because it is nearer",mutate(C,'const context = contexts.get(card.cardId);','const context = contexts.get(selectedCards[0].cardId);')],
 ["person dedupe permits card-level duplicates",mutate(R,'if (owners.size !== cards.length) return mealBuddyCandidateApiContractViolation();','if (owners.size > cards.length) return mealBuddyCandidateApiContractViolation();')],
 ["GEO is bypassed until after ranking",mutate(C,'const geoApplication = await applyMealBuddyGeoEligibility(transport, baseSelectedCards, geoOrigin);','const geoApplication = { status: "not_applied", cards: baseSelectedCards };')],
 ["distance order becomes Social order",mutate(C,'const survivors = Object.freeze(selectedCards.filter((card) => {','const survivors = Object.freeze(selectedCards.filter((card) => {').bind(null)],
 ["precise latitude leaks through candidate DTO",mutate(T,'candidateRef: string;','candidateRef: string; latitude: number;')],
 ["branch identity leaks through candidate DTO",mutate(T,'candidateRef: string;','candidateRef: string; branchId: string;')],
 ["manual Meal Context selector is introduced",mutate(M,'type MealBuddySection =','const contextPicker = "manualContext";\ntype MealBuddySection =')],
 ["a GEO-1D migration is added",(s)=>({...s,migrationAdded:true})],
 ["a second Haversine implementation appears",mutate(C,'const EMPTY: MealBuddyCandidateApiResponse','const haversine = () => Math.sin(1) * 6371000;\nconst EMPTY: MealBuddyCandidateApiResponse')],
 ["Mobile keeps previous candidates after location changes",mutate(H,'if (isLiveMode && selectedSourceCardRef !== null) void runForRef(selectedSourceCardRef);','if (false && selectedSourceCardRef !== null) void runForRef(selectedSourceCardRef);')]
];
// Correct the distance-order mutant with an exact insertion that changes bytes and introduces sort.
mutants[16]=["distance changes ranking",mutate(C,'return Object.freeze({ status: survivors.length === 0 ? "empty" : "applied", cards: survivors });','survivors.sort((a, b) => a.cardId.localeCompare(b.cardId));\n    return Object.freeze({ status: survivors.length === 0 ? "empty" : "applied", cards: survivors });')];
const baselineFailures=violations(original),survivors=[],stale=[];
for(const[name,operation]of mutants){const candidate=operation({...original});if(candidate.__stale){stale.push({name,anchor:candidate.__stale});console.log(`STALE ${name} -> ${candidate.__stale}`);continue;}const killedBy=violations(candidate);const killed=killedBy.length>0;console.log(`${killed?"KILLED":"SURVIVED"} ${name}${killed?` -> ${killedBy.join(", ")}`:""}`);if(!killed)survivors.push(name);}
console.log(JSON.stringify({suite:"geo-meal-buddy-geo-1d-mutations",mutants:mutants.length,killed:mutants.length-survivors.length-stale.length,survivors,stale,baselineFailures,repositoryBytesModified:false,networkUsed:false,databaseUsed:false,productionTouched:false},null,2));
if(baselineFailures.length||survivors.length||stale.length)process.exitCode=1;
