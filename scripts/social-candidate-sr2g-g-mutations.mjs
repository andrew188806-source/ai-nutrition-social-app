#!/usr/bin/env node
// SR-2G-G in-memory mutation contract. Repository bytes are read only; every mutant is applied to
// a string/model copy and must violate at least one product or authority invariant.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const original = Object.freeze({
  migration: read("supabase/migrations/20260821010000_meal_buddy_recommendation_context_handoff.sql"),
  handoff: read("apps/mobile/features/next-meal-prototype/nextMealBuddyPrefill.ts"),
  ui: read("apps/mobile/app/meal-buddies.tsx"),
  validate: read("supabase/functions/_shared/meal-buddy-card-api/validate.ts"),
  runtime: read("supabase/functions/_shared/meal-buddy-card-api/runtime.ts"),
  create: read("apps/mobile/features/meal-buddy-card-create/createRecommendationMealBuddyCard.ts"),
  smoke: read("scripts/social-candidate-sr2g-g-smoke.mjs")
});

function violations(source) {
  const failed = [];
  const require = (name, condition) => { if (!condition) failed.push(name); };
  require("no category picker", !source.ui.includes('label="餐點類型"'));
  require("Mobile has no arbitrary context input", !source.ui.includes("foodContextTagKey"));
  require("handoff keeps selected branch/menu/restaurant identity",
    ["branchMenuItemId", "menuItemId", "restaurantId", "branchId"].every((key) => source.handoff.includes(key)));
  require("sample recommendation is never trusted", source.handoff.includes("!recommendation.isSampleData"));
  require("no first-item or Profile-interest substitution", !/recommendations?\[0\]|foodInterestTags|selectedEatingTags/.test(source.handoff));
  require("selected identity and explicit context are mutually exclusive", source.validate.includes("recommendation && foodContextTagKey !== null"));
  require("restaurant identity must equal the selection", source.validate.includes("restaurantId.value !== recommendation.restaurantId"));
  require("the request object is closed", source.validate.includes("keys.length !== RECOMMENDATION_KEYS.length"));
  require("runtime invokes the atomic successor", source.runtime.includes("create_meal_buddy_card_from_recommendation"));
  require("runtime forwards selected menu identity", source.runtime.includes("request.selectedRecommendation?.menuItemId ?? null"));
  require("mapping points into canonical food taxonomy", source.migration.includes("references public.social_interest_catalog (tag_key, namespace)"));
  require("mapping is data-driven by menu identity", source.migration.includes("mapping.menu_item_id = item.id"));
  require("mapping supports retirement", source.migration.includes("retired_at") && source.migration.includes("mapping.active"));
  require("mapping RLS permits only the write authority", source.migration.includes("create policy meal_buddy_menu_item_food_context_mapping_write_authority_read") && source.migration.includes("for select to meal_buddy_card_write_authority using (true)"));
  require("missing mapping remains null", source.migration.includes("v_derived_context := null"));
  require("decisive fixtures pin hotpot, sushi and ramen independently",
    source.smoke.includes('["menu-hotpot", "food.taiwanese_chinese.hotpot"]')
    && source.smoke.includes('["menu-sushi", "food.japanese.sushi"]')
    && source.smoke.includes('["menu-ramen", "food.japanese.ramen"]'));
  require("cross-restaurant branch/menu relation is validated",
    source.migration.includes("branch_item.restaurant_id = p_recommendation_restaurant_id")
    && source.migration.includes("p_restaurant_id is distinct from p_recommendation_restaurant_id"));
  require("inactive menu identity fails closed", source.migration.includes("item.status = 'active'") && source.migration.includes("menu.status = 'published'"));
  require("no localized matching", !/ilike|similar to|to_tsvector|(?:item|mapping)\.name\s*=|name\.includes/i.test(source.migration + source.handoff));
  require("no profile interests become source context", !/social_profile_interest_selection|foodInterestTags/.test(source.migration + source.handoff));
  require("real Mobile uses the authenticated production repository", source.ui.includes("createRecommendationMealBuddyCard(request)"));
  require("adapter never handles credentials or actor ids", !/service[_-]?role|authorization|ownerUserId|actorUserId/i.test(source.create));
  return failed;
}

const mutants = [
  ["add manual context picker", (s) => ({ ...s, ui: `${s.ui}\n<LabeledInput label=\"餐點類型\" />` })],
  ["send arbitrary context from Mobile", (s) => ({ ...s, ui: `${s.ui}\nconst foodContextTagKey = input;` })],
  ["drop selected menu item", (s) => ({ ...s, handoff: s.handoff.replaceAll("menuItemId", "removedMenuIdentity") })],
  ["trust sample data", (s) => ({ ...s, handoff: s.handoff.replace("!recommendation.isSampleData", "true") })],
  ["use first recommendation", (s) => ({ ...s, handoff: `${s.handoff}\nconst chosen = recommendations[0];` })],
  ["use Profile food interests", (s) => ({ ...s, handoff: `${s.handoff}\nconst context = foodInterestTags[0];` })],
  ["allow context override", (s) => ({ ...s, validate: s.validate.replace("recommendation && foodContextTagKey !== null", "false") })],
  ["allow restaurant mismatch", (s) => ({ ...s, validate: s.validate.replace("restaurantId.value !== recommendation.restaurantId", "false") })],
  ["open recommendation object", (s) => ({ ...s, validate: s.validate.replace("keys.length !== RECOMMENDATION_KEYS.length", "false") })],
  ["call frozen caller-context writer directly", (s) => ({ ...s, runtime: s.runtime.replace("create_meal_buddy_card_from_recommendation", "create_meal_buddy_card_with_context") })],
  ["drop runtime menu identity", (s) => ({ ...s, runtime: s.runtime.replace("request.selectedRecommendation?.menuItemId ?? null", "null") })],
  ["duplicate taxonomy", (s) => ({ ...s, migration: s.migration.replace("references public.social_interest_catalog (tag_key, namespace)", "references public.meal_context_enum (tag_key, namespace)") })],
  ["map by localized name", (s) => ({ ...s, migration: s.migration.replace("mapping.menu_item_id = item.id", "mapping.name = item.name") })],
  ["accept retired mapping", (s) => ({ ...s, migration: s.migration.replaceAll("retired_at", "removed_retirement") })],
  ["hide mappings from NOBYPASSRLS function owner", (s) => ({ ...s, migration: s.migration.replace("for select to meal_buddy_card_write_authority using (true)", "for select to postgres using (true)") })],
  ["fabricate missing fallback", (s) => ({ ...s, migration: s.migration.replace("v_derived_context := null", "v_derived_context := 'food.japanese.ramen'") })],
  ["block creation when mapping is absent", (s) => ({ ...s, migration: s.migration.replace("v_derived_context := null", "raise exception 'MAPPING_REQUIRED'") })],
  ["map sushi to ramen in decisive fixture", (s) => ({ ...s, smoke: s.smoke.replace('["menu-sushi", "food.japanese.sushi"]', '["menu-sushi", "food.japanese.ramen"]') })],
  ["map hotpot to sushi in decisive fixture", (s) => ({ ...s, smoke: s.smoke.replace('["menu-hotpot", "food.taiwanese_chinese.hotpot"]', '["menu-hotpot", "food.japanese.sushi"]') })],
  ["allow cross-restaurant spoof", (s) => ({ ...s, migration: s.migration.replace("branch_item.restaurant_id = p_recommendation_restaurant_id", "true") })],
  ["accept inactive menu", (s) => ({ ...s, migration: s.migration.replace("item.status = 'active'", "true") })],
  ["handle service credential in Mobile", (s) => ({ ...s, create: `${s.create}\nconst serviceRole = credential;` })]
];

const baselineFailures = violations(original);
const survivors = [];
for (const [name, mutate] of mutants) {
  const killedBy = violations(mutate(original));
  const killed = killedBy.length > 0;
  console.log(`${killed ? "KILLED" : "SURVIVED"} ${name}${killed ? ` -> ${killedBy.join(", ")}` : ""}`);
  if (!killed) survivors.push(name);
}
console.log(JSON.stringify({ suite: "social-candidate-sr2g-g-mutations", mutants: mutants.length, killed: mutants.length - survivors.length, survivors, baselineFailures, repositoryBytesModified: false, networkUsed: false, databaseUsed: false }, null, 2));
if (baselineFailures.length || survivors.length) process.exitCode = 1;
