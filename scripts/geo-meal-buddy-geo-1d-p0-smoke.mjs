#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd(); const require_ = createRequire(import.meta.url);
const ts = require_("typescript"); const cache = new Map();
const resolveFile = (candidate) => [candidate, `${candidate}.ts`, path.join(candidate, "index.ts")]
  .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
function load(absolute) {
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: absolute
  });
  const module = { exports: {} }; cache.set(absolute, module);
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) return require_(specifier);
    const resolved = resolveFile(path.resolve(path.dirname(absolute), specifier));
    if (!resolved) throw new Error(`unresolved import: ${specifier}`);
    return load(resolved);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}
const runtime = load(path.join(root, "supabase/functions/_shared/meal-buddy-card-api/runtime.ts"));
const migration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260903010000_meal_buddy_card_branch_context_authority.sql"), "utf8");
const types = fs.readFileSync(path.join(root,
  "supabase/functions/_shared/meal-buddy-card-api/types.ts"), "utf8");
const candidateTypes = fs.readFileSync(path.join(root,
  "supabase/functions/_shared/meal-buddy-candidate-api/types.ts"), "utf8");
const pool = fs.readFileSync(path.join(root,
  "supabase/migrations/20260817030000_meal_buddy_candidate_pool_authority.sql"), "utf8");
const context = fs.readFileSync(path.join(root,
  "supabase/functions/_shared/meal-buddy-context/composeContextRanking.ts"), "utf8");

const checks=[]; const failures=[];
function check(name, pass, detail) {
  const item={name,pass:Boolean(pass),...(pass||detail===undefined?{}:{detail})};
  checks.push(item); if(!item.pass) failures.push(item);
  console.log(`${item.pass?"PASS":"FAIL"} ${String(checks.length).padStart(2,"0")} ${name}`);
}

const recommendation = Object.freeze({
  cardType: "restaurant", intentionType: "chat_first", restaurantId: "restaurant-a",
  area: "台北", diningDate: "2026-09-03", mealPeriod: "dinner", preferredTime: null,
  foodContextTagKey: null,
  selectedRecommendation: Object.freeze({
    source: "canonical_next_meal", branchMenuItemId: "offer-a", menuItemId: "menu-a",
    restaurantId: "restaurant-a", branchId: "branch-a"
  })
});
let captured;
const transport = {
  async withTransaction(operation) {
    return await operation({
      async query(statement, params) {
        captured={statement:statement.text,params};
        return [{payload:{ok:true,card:{
          id:"00000000-0000-4000-8000-0000000000c1",card_type:"restaurant",
          intention_type:"chat_first",restaurant_id:"restaurant-a",area:"台北",
          dining_date:"2026-09-03",meal_period:"dinner",preferred_time:null,
          created_at:"2026-09-03T00:00:00.000Z",expires_at:"2026-09-04T14:00:00.000Z",
          food_context_tag_key:"food.japanese.sushi"
        },counts:{general:0,restaurant:1}}}];
      }
    });
  }
};
const result=await runtime.createOwnedCard(transport,"00000000-0000-4000-8000-0000000000a1",
  recommendation,{general:1,restaurant:1});

check("01 recommendation create succeeds through real runtime",result.ok===true);
check("02 runtime calls only the atomic branch-context successor",
  captured.statement.includes("create_meal_buddy_card_from_recommendation_with_branch_context")
  && !/create_meal_buddy_card_from_recommendation\(/.test(captured.statement));
check("03 exact Branch A occupies the frozen branch parameter",captured.params[14]==="branch-a");
check("04 exact branch-offer menu and restaurant tuple is preserved",
  JSON.stringify(captured.params.slice(11,15))===JSON.stringify(["offer-a","menu-a","restaurant-a","branch-a"]));
check("05 actor is server composition input rather than request identity",
  captured.params[0]==="00000000-0000-4000-8000-0000000000a1");
check("06 public runtime card result contains no branch identity",
  !Object.hasOwn(result.card,"branch_id")&&!Object.hasOwn(result.card,"branchId"));
check("07 exact binding table is private social_internal state",
  migration.includes("create table social_internal.meal_buddy_card_branch_context"));
check("08 card and branch must agree on restaurant through composite FKs",
  migration.includes("foreign key (card_id, restaurant_id)")
  && migration.includes("foreign key (branch_id, restaurant_id)"));
check("09 Branch A is inserted directly and no Branch B chooser exists",
  migration.includes("values (v_card_id, p_recommendation_restaurant_id, p_branch_id)")
  && !/first_value|limit 1|order by branch/.test(migration));
check("10 duplicate binding is structurally impossible",
  migration.includes("meal_buddy_card_branch_context_pkey primary key (card_id)"));
check("11 card and binding are in one atomic database function",
  migration.indexOf("v_payload := social_internal.create_meal_buddy_card_from_recommendation(")
    < migration.indexOf("insert into social_internal.meal_buddy_card_branch_context"));
check("12 failed or quota card result cannot insert a binding",
  migration.includes("v_payload ->> 'ok' = 'true' and p_branch_id is not null"));
check("13 historical cards are not backfilled",!/insert into social_internal\.meal_buddy_card_branch_context[\s\S]{0,200}?select/.test(migration));
check("14 exact server read seam returns only card restaurant branch",
  /returns table \(card_id uuid, restaurant_id text, branch_id text\)/.test(migration));
check("15 anonymous and authenticated clients receive no direct access",
  /from public, anon, authenticated, authenticator, service_role, social_runtime_executor/.test(migration));
const ownedDto=(types.match(/export type OwnedMealBuddyCardDto = Readonly<\{([\s\S]*?)\}>;/)??["",""])[1];
const candidateDto=(candidateTypes.match(/export type MealBuddyCandidateDto = Readonly<\{([\s\S]*?)\}>;/)??["",""])[1];
check("16 public owned-card DTO remains branch-free",ownedDto.length>0&&!/branchId|branch_id/.test(ownedDto));
check("17 public candidate DTO remains branch-free",candidateDto.length>0&&!/branchId|branch_id/.test(candidateDto));
check("18 person-level one-card-per-owner dedupe remains frozen",
  /partition by compatible\.owner_user_id/.test(pool)&&/owner_rank = 1/.test(pool));
check("19 Meal Context remains bucket-only and untouched",
  /composeMealBuddyContextRanking/.test(context)&&!/branchId|branch_id/.test(context));
check("20 P0 performs no GEO filtering or distance work",
  !/narrow_branch_candidates|within_radius|distance_meters|haversine/i.test(migration));
check("21 no manual branch or Meal Context selector was introduced",
  !/branch selector|manual branch|manual context/i.test(migration));
check("22 source migration remains one transaction",/^begin;/m.test(migration)&&/^commit;/m.test(migration));

console.log(JSON.stringify({suite:"geo-meal-buddy-geo-1d-p0-smoke",total:checks.length,
  passed:checks.length-failures.length,failed:failures.length,failures,
  networkUsed:false,databaseUsed:false,credentialsUsed:false,productionTouched:false},null,2));
if(failures.length) process.exitCode=1;
