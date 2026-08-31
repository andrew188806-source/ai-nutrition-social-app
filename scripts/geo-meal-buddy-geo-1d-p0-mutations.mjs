#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  GEO1DP0_MIGRATION, auditGeo1dp0Sources
} from "./geo-meal-buddy-geo-1d-p0-successor-manifest.mjs";

const root=process.cwd(); const read=(file)=>fs.readFileSync(path.join(root,file),"utf8");
const original=Object.freeze({
  migration:read(GEO1DP0_MIGRATION),
  runtime:read("supabase/functions/_shared/meal-buddy-card-api/runtime.ts"),
  cardTypes:read("supabase/functions/_shared/meal-buddy-card-api/types.ts"),
  candidateTypes:read("supabase/functions/_shared/meal-buddy-candidate-api/types.ts"),
  pool:read("supabase/migrations/20260817030000_meal_buddy_candidate_pool_authority.sql"),
  ui:read("apps/mobile/app/meal-buddies.tsx"),
  context:read("supabase/functions/_shared/meal-buddy-context/composeContextRanking.ts")
});

function violations(source){
  const failed=[...auditGeo1dp0Sources({
    [GEO1DP0_MIGRATION]:source.migration,
    "supabase/functions/_shared/meal-buddy-card-api/runtime.ts":source.runtime
  })];
  const rule=(name,pass)=>{if(!pass)failed.push(name);};
  const ownedDto=(source.cardTypes.match(/export type OwnedMealBuddyCardDto = Readonly<\{([\s\S]*?)\}>;/)??["",""])[1];
  const candidateDto=(source.candidateTypes.match(/export type MealBuddyCandidateDto = Readonly<\{([\s\S]*?)\}>;/)??["",""])[1];
  rule("public card DTO is branch-free",ownedDto.length>0&&!/branchId|branch_id/.test(ownedDto));
  rule("public candidate DTO is branch-free",candidateDto.length>0&&!/branchId|branch_id/.test(candidateDto));
  rule("person dedupe stays newest card per owner",
    /partition by compatible\.owner_user_id\s*order by/.test(source.pool)&&/owner_rank = 1/.test(source.pool));
  rule("Meal Context gets no manual branch authority",!/branchId|branch_id|manualBranch/.test(source.context));
  rule("Mobile has no branch or context picker",
    !/label=["'](?:分店|餐點類型|Meal Context)["']|branchSelector|manualContext/.test(source.ui));
  rule("binding insert is inside successor after frozen call",
    source.migration.indexOf("v_payload := social_internal.create_meal_buddy_card_from_recommendation(")
      < source.migration.indexOf("insert into social_internal.meal_buddy_card_branch_context"));
  rule("binding table is never populated from historical cards",
    !/insert into social_internal\.meal_buddy_card_branch_context[\s\S]{0,220}?select/i.test(source.migration));
  return failed;
}

const mutants=[
  ["accept arbitrary restaurant branch",(s)=>({...s,migration:s.migration.replace(
    "values (v_card_id, p_recommendation_restaurant_id, p_branch_id)",
    "values (v_card_id, p_recommendation_restaurant_id, 'arbitrary-branch')")})],
  ["select first branch by restaurant",(s)=>({...s,migration:s.migration.replace(
    "values (v_card_id, p_recommendation_restaurant_id, p_branch_id)",
    "select v_card_id, p_recommendation_restaurant_id, branch.id from public.restaurant_branches branch where branch.restaurant_id=p_recommendation_restaurant_id limit 1")})],
  ["remove card restaurant consistency",(s)=>({...s,migration:s.migration.replace(
    "foreign key (card_id, restaurant_id)","foreign key (card_id)")})],
  ["remove branch restaurant consistency",(s)=>({...s,migration:s.migration.replace(
    "foreign key (branch_id, restaurant_id)","foreign key (branch_id)")})],
  ["allow multiple branches per card",(s)=>({...s,migration:s.migration.replace(
    "primary key (card_id)","primary key (card_id, branch_id)")})],
  ["expose binding write to authenticated",(s)=>({...s,migration:s.migration.replace(
    "for insert to meal_buddy_card_write_authority","for insert to authenticated")})],
  ["grant client function execution",(s)=>({...s,migration:s.migration.replace(
    "to social_runtime_executor;","to authenticated;")})],
  ["remove forced RLS",(s)=>({...s,migration:s.migration.replace(
    "alter table social_internal.meal_buddy_card_branch_context force row level security;","")})],
  ["speculatively backfill history",(s)=>({...s,migration:s.migration.replace(
    "commit;","insert into social_internal.meal_buddy_card_branch_context select id,restaurant_id,'branch-a' from public.meal_buddy_cards;\ncommit;")})],
  ["card commits when binding is skipped",(s)=>({...s,migration:s.migration.replace(
    "and p_branch_id is not null","and false")})],
  ["binding attempted before card creation",(s)=>({...s,migration:s.migration.replace(
    "v_payload := social_internal.create_meal_buddy_card_from_recommendation(",
    "insert into social_internal.meal_buddy_card_branch_context(card_id,restaurant_id,branch_id) values(v_card_id,p_recommendation_restaurant_id,p_branch_id);\n  v_payload := social_internal.create_meal_buddy_card_from_recommendation(")})],
  ["runtime bypasses atomic successor",(s)=>({...s,runtime:s.runtime.replace(
    "create_meal_buddy_card_from_recommendation_with_branch_context",
    "create_meal_buddy_card_from_recommendation")})],
  ["public owned card exposes branch",(s)=>({...s,cardTypes:s.cardTypes.replace(
    "sourceCardRef: string;","sourceCardRef: string; branchId: string;")})],
  ["public candidate exposes branch",(s)=>({...s,candidateTypes:s.candidateTypes.replace(
    "candidateRef: string;","candidateRef: string; branch_id: string;")})],
  ["person dedupe becomes branch-level",(s)=>({...s,pool:s.pool.replace(
    "partition by compatible.owner_user_id","partition by compatible.owner_user_id, compatible.restaurant_id")})],
  ["Meal Context manually accepts branch",(s)=>({...s,context:s.context+"\nconst manualBranch = input.branchId;"})],
  ["Mobile adds branch selector",(s)=>({...s,ui:s.ui+"\n<LabeledInput label=\"分店\" />"})]
];

const baselineFailures=violations(original); const survivors=[];
for(const [name,mutate] of mutants){
  const killedBy=violations(mutate(original)); const killed=killedBy.length>0;
  console.log(`${killed?"KILLED":"SURVIVED"} ${name}${killed?` -> ${killedBy.join(", ")}`:""}`);
  if(!killed)survivors.push(name);
}
console.log(JSON.stringify({suite:"geo-meal-buddy-geo-1d-p0-mutations",
  mutants:mutants.length,killed:mutants.length-survivors.length,survivors,baselineFailures,
  repositoryBytesModified:false,networkUsed:false,databaseUsed:false,productionTouched:false},null,2));
if(baselineFailures.length||survivors.length)process.exitCode=1;
