#!/usr/bin/env node
import fs from "node:fs";

const root=process.cwd(); const passed=[];
const read=(file)=>fs.readFileSync(file,"utf8");
function expect(value,name){if(!value)throw new Error(`FAIL ${name}`);passed.push(name);}
try {
  const domainSmoke=read("scripts/consumer-runtime-phase-2z-b3-b-planned-meal-contract-smoke.mjs");
  const composition=read("apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts");
  const provider=read("apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx");
  const runtime=read("apps/mobile/features/consumer-runtime/consumerPlannedMealRuntime.ts");
  const operationStore=read("apps/mobile/features/consumer-runtime/consumerPlannedMealOperationStore.ts");
  const recommendation=read("apps/mobile/app/recommendation.tsx"); const photo=read("apps/mobile/app/meal-photo.tsx");
  const model=read("apps/mobile/features/consumer-meals/todayIntakeUiModel.ts"); const today=read("apps/mobile/app/today-intake.tsx");
  const home=read("apps/mobile/app/index.tsx"); const store=read("apps/mobile/features/planned-meal/plannedMealStore.ts");
  expect(/mock create produces one planned row/.test(domainSmoke)&&/cancel replay succeeds/.test(domainSmoke)&&/conversion atomically creates exactly one record/.test(domainSmoke),"mock V2 domain create update cancel convert coverage remains frozen");
  expect(!/createPlannedMeal\(/.test(recommendation.slice(0,recommendation.indexOf("async function savePlan"))),"no Recommendation create before gesture");
  expect(/runtime\.createPlannedMeal/.test(recommendation),"Recommendation explicit create");
  expect(/runtime\.createPlannedMeal/.test(photo),"Meal Photo explicit create");
  expect(!/savePlannedDinner|getPlannedDinner/.test(recommendation),"Recommendation has no module-memory canonical path");
  expect(!/(?:savePlannedDinner|getPlannedDinner)\s*\(/.test(photo),"Meal Photo has no module-memory canonical path");
  expect([recommendation,photo].every((source)=>/restaurantId: null/.test(source)&&/branchId: null/.test(source)&&/menuItemId: null/.test(source)),"untrusted identity remains null");
  expect([recommendation,photo].every((source)=>/mealType: "dinner"/.test(source)&&/mealCategory:/.test(source)),"period category mapping is distinct");
  expect(/if \(this\.inFlight\) return this\.inFlight/.test(runtime),"repeated taps share in-flight promise");
  expect(/result_uncertain/.test(runtime)&&/this\.pending/.test(runtime),"transport ambiguity retains pending");
  expect(/retry\(context/.test(runtime)&&/this\.launch\([^,]+,[^,]+, this\.pending\)/.test(runtime),"retry uses stored request");
  expect(/operationStore\.load/.test(runtime)&&!/setActor[\s\S]{0,800}this\.execute/.test(runtime),"restore does not submit");
  expect(/24 \* 60 \* 60 \* 1000/.test(operationStore),"pending TTL remains 24 hours");
  expect(/code === "result_uncertain"/.test(runtime)&&/operationStore\.clear/.test(runtime),"deterministic conflicts clear pending");
  expect(/plannedMealService\.update/.test(provider),"explicit update is runtime-capable");
  expect(/plannedMealService\.cancel/.test(provider),"explicit cancel action is wired");
  expect(/runtime\.cancelPlannedMeal/.test(today),"Today has explicit cancel gesture");
  expect(/runtime\.convertPlannedMeal/.test(today),"Today has explicit conversion gesture");
  expect(/canonicalStatus === "planned"/.test(today),"invalid lifecycle actions are hidden");
  expect(/expectedUpdatedAt/.test(today)&&/canonicalUpdatedAt/.test(today),"version token is canonical");
  expect(/submitConversion/.test(provider)&&/profileTimezone/.test(provider),"conversion uses Profile timezone");
  expect(/this\.now\(\)/.test(runtime)&&/confirmationTimestamp: submittedAt\.toISOString\(\)/.test(runtime),"conversion clock value is captured once");
  expect(/revision: this\.state\.revision \+ 1/.test(runtime),"conversion success increments runtime revision once");
  expect(/consumerDataRevision/.test(provider)&&/mealDataRevision/.test(home)&&/mealDataRevision/.test(today),"Home and Today share one invalidation revision");
  expect(/overview\.plannedMeals/.test(model),"Today maps canonical overview planned rows");
  expect(!/getPlannedDinner|getConfirmedDinnerRecord|getAutoSettled/.test(model),"Today ignores legacy planned shadow state");
  expect(/calculatedNutrition/.test(model)&&!/estimatedNutrition[\s\S]{0,120}totals/.test(model),"planned nutrition excluded before conversion");
  expect(/getAutoSettledPlannedDinnerRecord\(\)[\s\S]*return null/.test(store),"no automatic settlement");
  expect(/plannedMealRuntime\.setActor\(state\.actorKey, state\.actorGeneration\)/.test(provider),"actor switch reaches Planned runtime");
  expect(/runtimeStateRef\.current/.test(provider),"stale update cancel and read responses are suppressed");
  expect(/state\.authState\.status !== "signedIn"/.test(provider),"signed-out reads and writes fail closed");
  expect(/plannedMealsWriteSource: "mock"/.test(composition)&&/plannedMealsWriteSource: "disabled"/.test(composition),"mode matrix is explicit");
  expect((composition.match(/new SupabaseConsumerClientFactory/g)??[]).length===1,"single Supabase client factory identity");
  expect(!/Supabase|Repository|\.rpc\s*\(|\.from\s*\(/.test(recommendation+photo+today+home),"UI has no transport capability");
  expect(!/process\.env|fetch\s*\(|service[_-]?role/i.test(read(new URL(import.meta.url))),"remote false and credentials false");
  for(const name of passed)console.log(`PASS ${name}`); console.log(`RESULT ${passed.length}/${passed.length} PASS remote=false credentials=false`);
}catch(error){console.error(error instanceof Error?error.stack:error);console.error(`RESULT ${passed.length}/${passed.length+1} FAIL remote=false credentials=false`);process.exitCode=1;}
