#!/usr/bin/env node
// GQA-6R C-5/C-6 fixture smoke: deterministic [DEMO] specification, canonical shape, idempotent planning and
// the Development-only hard stop. Offline: no network, no Supabase project, no credential.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  CATALOGUE_TARGET, DEVELOPMENT_PROJECT_REF, MEAL_BUDDY_TARGET, SECONDARY_INTERACTION_IDENTITY,
  assertDevelopmentTarget, buildCatalogueFixtures, buildManifest, buildMealBuddyFixtures, buildMealBuddyIdentity, catalogueRestaurantSql
} from "./gqa6r-demo-fixtures.mjs";
import { MANIFEST_PATH, planCataloguePool } from "./gqa6r-ensure-demo-catalogue-pool.mjs";
import { defaultTargetSlot, handoffPlan, measureMealBuddyPool, planMealBuddyPool } from "./gqa6r-ensure-meal-buddy-demo-pool.mjs";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) });

// Selectable, active 'food' tags in Development (read-only inventory 2026-09-27); mappings must target these.
const SELECTABLE_FOOD = new Set(`food.dessert_drinks.afternoon_tea food.dessert_drinks.bubble_tea food.dessert_drinks.cake food.dessert_drinks.coffee food.dessert_drinks.dessert food.dessert_drinks.ice_cream food.dining_style.brunch food.dining_style.buffet food.dining_style.fine_dining food.dining_style.late_night food.dining_style.street_food food.ingredient_style.cheese food.ingredient_style.meat_lover food.ingredient_style.seafood food.ingredient_style.spicy_food food.ingredient_style.vegetarian_food food.international.indian food.international.mexican food.international.southeast_asian food.international.thai food.international.vietnamese food.japanese.izakaya food.japanese.japanese_cuisine food.japanese.ramen food.japanese.sashimi food.japanese.sushi food.japanese.yakiniku food.korean.korean_bbq food.korean.korean_cuisine food.korean.korean_fried_chicken food.taiwanese_chinese.hong_kong food.taiwanese_chinese.hotpot food.taiwanese_chinese.sichuan food.taiwanese_chinese.stir_fry food.taiwanese_chinese.taiwanese_snacks food.western.american food.western.french food.western.italian food.western.pasta food.western.pizza food.western.steak`.split(" "));

// ---- C-6 catalogue fixtures
const restaurants = buildCatalogueFixtures();
const items = restaurants.flatMap((r) => r.items);
check("C6-1 twenty Demo restaurants with three Demo items each (60)", restaurants.length === CATALOGUE_TARGET.restaurants && restaurants.every((r) => r.items.length === 3) && items.length === 60);
const ids = [...restaurants.flatMap((r) => [r.id, r.branch.id, r.menu.id, ...r.categories.map((c) => c.id), ...r.items.flatMap((i) => [i.id, i.branch_menu_item_id, i.nutrition_id])])];
check("C6-2 every fixture id is unique and deterministic", new Set(ids).size === ids.length && JSON.stringify(buildCatalogueFixtures()) === JSON.stringify(restaurants));
check("C6-3 every user-facing name carries the visible [DEMO] prefix", restaurants.every((r) => [r.label, r.branch.label, r.menu.label, ...r.categories.map((c) => c.label), ...r.items.map((i) => i.label)].every((l) => l.startsWith("[DEMO] "))));
check("C6-4 ownership is consistent: each item's category belongs to its own restaurant's menu; one branch per restaurant",
  restaurants.every((r) => r.items.every((i) => r.categories.some((c) => c.id === i.category_id))));
check("C6-5 nutrition values are within plausible accepted ranges; prices are 2-decimal TWD",
  items.every((i) => i.nutrition.calories >= 250 && i.nutrition.calories <= 900 && i.nutrition.protein >= 5 && i.nutrition.protein <= 70 && i.nutrition.fiber >= 0 && i.nutrition.fiber <= 20
    && /^\d{2,3}\.\d{2}$/.test(i.price)));
check("C6-6 recommendation diversity: varied calories, protein and fibre across the pool",
  new Set(items.map((i) => i.nutrition.calories)).size >= 20 && new Set(items.map((i) => i.nutrition.protein)).size >= 10 && new Set(items.map((i) => i.nutrition.fiber)).size >= 5);
check("C6-7 allergens use canonical keys only", items.every((i) => i.allergens.every((a) => ["soy", "fish"].includes(a))));
check("C6-8 every Demo item maps to a selectable food context tag", items.every((i) => SELECTABLE_FOOD.has(i.food_context_tag_key)));
const sqlText = restaurants.map(catalogueRestaurantSql).join("\n");
check("C6-9 fixture SQL is additive and idempotent: inserts with on-conflict/not-exists only; no delete, no truncate, no DDL",
  !/\bdelete\b|\btruncate\b|\bdrop\b|\balter\b|\bcreate\b|\bgrant\b/i.test(sqlText.replace(/create_meal_buddy/g, ""))
  && (sqlText.match(/insert into/g) ?? []).length === (sqlText.match(/on conflict \(id\) do nothing|where not exists/g) ?? []).length
  && (sqlText.match(/^update /gm) ?? []).every(() => /update public\.menu_items set nutrition_id = '[^']+' where id = '[^']+' and nutrition_id is null;/.test(sqlText)));
check("C6-10 visibility is canonical: active restaurant/branch, published menu, active item, available branch item",
  /'active'\) on conflict/.test(sqlText) && /'published'\) on conflict/.test(sqlText) && /'available'\) on conflict/.test(sqlText));
check("C6-11 fictional nutrition is stored only as an AI estimate, never as restaurant-confirmed", /'ai_estimated', 'ai_estimated', true\)/.test(sqlText) && !/restaurant_verified|admin_verified/.test(sqlText));
check("C6-12 every restaurant's SQL is one transaction", restaurants.every((r) => { const s = catalogueRestaurantSql(r); return s.startsWith("begin;") && s.trim().endsWith("commit;"); }));
const none = planCataloguePool(new Map());
const full = planCataloguePool(new Map(restaurants.map((r) => [r.id, 3])));
const partial = planCataloguePool(new Map(restaurants.slice(0, 15).map((r) => [r.id, 3]).concat([[restaurants[15].id, 2]])));
check("C6-13 top-up plan creates only the shortfall and is a no-op when complete (idempotent)",
  none.incomplete.length === 20 && full.incomplete.length === 0 && full.eligibleRestaurants === 20 && full.eligibleItems === 60 && partial.incomplete.length === 5);

// ---- C-5 Meal Buddy fixtures
const buddies = buildMealBuddyFixtures();
const catalogue = buildCatalogueFixtures();
check("C5-1 twenty [DEMO] 飯友 identities, deterministic uuid ids, non-login, reserved example.com emails",
  buddies.length === MEAL_BUDDY_TARGET.eligibleCards && buddies.every((b, i) => b.label === `[DEMO] 飯友 ${String(i + 1).padStart(2, "0")}` && /^6a06d0e0-0000-4000-8000-\d{12}$/.test(b.id)
    && b.login_capable === false && /@example\.com$/.test(b.email)) && new Set(buddies.map((b) => b.id)).size === 20);
const traces = (b) => {
  const rec = b.card.recommendation;
  const r = catalogue.find((x) => x.id === rec.restaurant_id);
  const item = r?.items.find((i) => i.id === rec.menu_item_id);
  return Boolean(r && item && r.branch.id === rec.branch_id && r.menu.id === rec.menu_id && item.branch_menu_item_id === rec.branch_menu_item_id
    && item.food_context_tag_key === rec.expected_food_context_tag_key && rec.restaurant_label === r.label && rec.menu_item_label === item.label);
};
check("C5-2 every Demo card is a RESTAURANT card traced to a real Demo catalogue item (restaurant -> branch -> menu -> item -> branch item)",
  buddies.every((b) => b.card.card_type === "restaurant" && traces(b) && ["chat_first", "eat_together"].includes(b.card.intention_type)));
check("C5-2b no free-form meal context: the food context is server-derived from the item mapping and is a selectable food tag",
  buddies.every((b) => !("food_context_tag_key" in b.card) && b.card.food_context_derivation === "server: meal_buddy_menu_item_food_context_mapping"
    && SELECTABLE_FOOD.has(b.card.recommendation.expected_food_context_tag_key)));
const byRestaurant = new Map();
for (const b of buddies) byRestaurant.set(b.card.recommendation.restaurant_id, (byRestaurant.get(b.card.recommendation.restaurant_id) ?? 0) + 1);
check("C5-2c the 20 cards are distributed: 10 restaurants x 2 cards, 20 distinct menu items, 10 food contexts (never one restaurant/item)",
  byRestaurant.size === 10 && [...byRestaurant.values()].every((n) => n === 2)
  && new Set(buddies.map((b) => b.card.recommendation.menu_item_id)).size === 20 && new Set(buddies.map((b) => b.card.recommendation.expected_food_context_tag_key)).size === 10);
const slot = { diningDate: "2026-09-28", mealPeriod: "dinner" };
const boundCard = (b, over = {}) => ({ id: `c-${b.id}`, owner_user_id: b.id, card_type: "restaurant", restaurant_id: b.card.recommendation.restaurant_id, branch_id: b.card.recommendation.branch_id,
  food_context_tag_key: b.card.recommendation.expected_food_context_tag_key, dining_date: slot.diningDate, meal_period: slot.mealPeriod, active: true, ...over });
const empty = planMealBuddyPool(new Map(), slot);
check("C5-3 empty Development -> exactly 20 identities planned, each through canonical steps ending in a recommendation card", empty.actions.length === 20 && empty.eligibleAfter === 20
  && empty.actions.every((a) => ["create_auth_user", "insert_profile", "insert_participation", "create_recommendation_card"].every((s) => a.steps.includes(s))));
const handoff = handoffPlan(empty);
check("C5-3b the handoff create request is the canonical Edge contract carrying the item's exact recommendation identity",
  handoff.length === 20 && handoff.every((h, i) => h.create_request.edge_function === "meal-buddy-card-create" && h.create_request.cardType === "restaurant"
    && h.create_request.restaurantId === buddies[i].card.recommendation.restaurant_id
    && h.create_request.selectedRecommendation.branchMenuItemId === buddies[i].card.recommendation.branch_menu_item_id
    && h.create_request.selectedRecommendation.source === "canonical_next_meal" && !("foodContextTagKey" in h.create_request)));
const ready = new Map(buddies.map((b) => [b.id, { authUser: true, profile: true, participation: true, cards: [boundCard(b)], consumed: false }]));
check("C5-4 complete pool for the slot -> no action (idempotent rerun)", planMealBuddyPool(ready, slot).actions.length === 0);
const otherSlot = new Map(ready); otherSlot.set(buddies[0].id, { ...ready.get(buddies[0].id), cards: [boundCard(buddies[0], { id: "old", meal_period: "lunch" })] });
const retarget = planMealBuddyPool(otherSlot, slot);
check("C5-5 a Demo restaurant card for another slot is cancelled through the canonical primitive, then re-created for the slot",
  retarget.actions.length === 1 && JSON.stringify(retarget.actions[0].steps) === JSON.stringify([{ cancel: "old" }, "create_recommendation_card"]));
const consumed = new Map(ready); consumed.set(buddies[2].id, { ...ready.get(buddies[2].id), consumed: true });
const topUp = planMealBuddyPool(consumed, slot);
check("C5-6 a Demo buddy consumed by the tester is never reset; the pool tops up with the next ordinal (still catalogue-bound)", topUp.eligibleAfter === 20
  && topUp.actions.length === 1 && topUp.actions[0].identity.ordinal === 21 && !topUp.actions.some((a) => a.identity.id === buddies[2].id) && traces(topUp.actions[0].identity));
const expired = new Map(ready); expired.set(buddies[4].id, { ...ready.get(buddies[4].id), cards: [boundCard(buddies[4], { id: "x", active: false })] });
check("C5-7 an expired Demo card is replaced by a new canonical card (expiry rules untouched)", JSON.stringify(planMealBuddyPool(expired, slot).actions.map((a) => a.steps)) === JSON.stringify([["create_recommendation_card"]]));
const at = (iso) => defaultTargetSlot(new Date(iso));
check("C5-8 default slot follows Asia/Taipei meal periods", at("2026-09-27T23:30:00Z").mealPeriod === "breakfast" && at("2026-09-28T03:00:00Z").mealPeriod === "lunch"
  && at("2026-09-28T09:00:00Z").mealPeriod === "dinner" && at("2026-09-28T14:00:00Z").mealPeriod === "late_night" && at("2026-09-27T23:30:00Z").diningDate === "2026-09-28");
check("C5-9 the secondary interaction identity is the only login-capable Demo identity and holds no credential in the repo",
  SECONDARY_INTERACTION_IDENTITY.login_capable === true && SECONDARY_INTERACTION_IDENTITY.label === "[DEMO] Secondary Interaction Test" && /never stored/.test(SECONDARY_INTERACTION_IDENTITY.credential_location));
// ---- Planner correction: >=20 identities, >=20 active eligible cards, >=20 identities with their OWN card
const allItems = new Set(catalogue.flatMap((r) => r.items.map((i) => i.id)));
const m = (st, items = allItems) => measureMealBuddyPool(st, slot, items);
const fullPool = m(ready);
check("C5-P1 a complete pool measures 20/20/20, zero owner mismatches, 10 restaurants / 20 items / 10 contexts -> PASS",
  fullPool.DEMO_MEAL_BUDDY_IDENTITIES === 20 && fullPool.DEMO_ACTIVE_ELIGIBLE_MEAL_BUDDY_CARDS === 20 && fullPool.DEMO_IDENTITIES_WITH_OWN_ELIGIBLE_CARD === 20 && fullPool.OWNER_MISMATCHES === 0
  && fullPool.DISTINCT_POOL_RESTAURANTS === 10 && fullPool.DISTINCT_POOL_MENU_ITEMS === 20 && fullPool.DISTINCT_POOL_FOOD_CONTEXTS === 10 && fullPool.DEMO_MEAL_BUDDY_POOL === "PASS", fullPool);
const shared = new Map(buddies.map((b, i) => [b.id, { ...ready.get(b.id), cards: i === 0 ? ready.get(b.id).cards : [] }]));
const sharedM = m(shared);
check("C5-P2 twenty users and one shared card -> FAIL (1 eligible card, 1 identity with its own card)",
  sharedM.DEMO_MEAL_BUDDY_IDENTITIES === 20 && sharedM.DEMO_ACTIVE_ELIGIBLE_MEAL_BUDDY_CARDS === 1 && sharedM.DEMO_IDENTITIES_WITH_OWN_ELIGIBLE_CARD === 1 && sharedM.DEMO_MEAL_BUDDY_POOL === "FAIL", sharedM);
const foreign = new Map(buddies.map((b) => [b.id, { ...ready.get(b.id), cards: [boundCard(b, { owner_user_id: "00000000-0000-4000-8000-000000000001" })] }]));
const foreignM = m(foreign);
check("C5-P3 cards owned by an unrelated fixture authority never count and are reported as owner mismatches -> FAIL",
  foreignM.DEMO_ACTIVE_ELIGIBLE_MEAL_BUDDY_CARDS === 0 && foreignM.OWNER_MISMATCHES === 20 && foreignM.DEMO_MEAL_BUDDY_POOL === "FAIL", foreignM);
const wrongSlot = new Map(buddies.map((b) => [b.id, { ...ready.get(b.id), cards: [boundCard(b, { meal_period: "lunch" })] }]));
const expiredAll = new Map(buddies.map((b) => [b.id, { ...ready.get(b.id), cards: [boundCard(b, { active: false })] }]));
check("C5-P4 cards for another meal period, or expired/cancelled cards, are not eligible -> FAIL",
  m(wrongSlot).DEMO_ACTIVE_ELIGIBLE_MEAL_BUDDY_CARDS === 0 && m(expiredAll).DEMO_ACTIVE_ELIGIBLE_MEAL_BUDDY_CARDS === 0 && m(wrongSlot).DEMO_MEAL_BUDDY_POOL === "FAIL");
const nineteen = new Map(ready); nineteen.set(buddies[7].id, { ...ready.get(buddies[7].id), participation: false });
check("C5-P5 an identity that is not an authorized candidate (opted out) does not count; 19 owned cards -> FAIL, and the plan tops up",
  m(nineteen).DEMO_IDENTITIES_WITH_OWN_ELIGIBLE_CARD === 19 && m(nineteen).DEMO_MEAL_BUDDY_POOL === "FAIL"
  && planMealBuddyPool(nineteen, slot).actions.some((a) => a.identity.id === buddies[7].id && a.steps.includes("insert_participation")));
check("C5-P6 an empty Development measures 0/0/0 -> FAIL", m(new Map()).DEMO_MEAL_BUDDY_POOL === "FAIL" && m(new Map()).DEMO_MEAL_BUDDY_IDENTITIES === 0);
const general = new Map(buddies.map((b) => [b.id, { ...ready.get(b.id), cards: [boundCard(b, { card_type: "general", restaurant_id: null, branch_id: null })] }]));
const freeForm = new Map(buddies.map((b) => [b.id, { ...ready.get(b.id), cards: [boundCard(b, { food_context_tag_key: "food.western.steak" })] }]));
const noBranch = new Map(buddies.map((b) => [b.id, { ...ready.get(b.id), cards: [boundCard(b, { branch_id: null })] }]));
check("C5-P7 general cards, free-form/mismatched food contexts, and cards without the exact branch binding never count -> FAIL",
  [general, freeForm, noBranch].every((st) => m(st).DEMO_ACTIVE_ELIGIBLE_MEAL_BUDDY_CARDS === 0 && m(st).DEMO_MEAL_BUDDY_POOL === "FAIL"));
const withdrawn = new Set([...allItems].filter((id) => !/^gqa6r-demo-item-0[1-5]-/.test(id)));
check("C5-P8 cards whose bound item is no longer recommendation-eligible never count (5 restaurants withdrawn -> 10 cards) -> FAIL",
  m(ready, withdrawn).DEMO_ACTIVE_ELIGIBLE_MEAL_BUDDY_CARDS === 10 && m(ready, withdrawn).DEMO_MEAL_BUDDY_POOL === "FAIL");
const oneRestaurant = new Map(buddies.map((b) => [b.id, { ...ready.get(b.id), cards: b.card.recommendation.restaurant_id === "gqa6r-demo-restaurant-01" ? [boundCard(b)] : [] }]));
check("C5-P9 a pool concentrated on one restaurant cannot pass the distribution floor", m(oneRestaurant).DISTINCT_POOL_RESTAURANTS === 1 && m(oneRestaurant).DEMO_MEAL_BUDDY_POOL === "FAIL");
const buddySource = fs.readFileSync(path.join(root, "scripts/gqa6r-ensure-meal-buddy-demo-pool.mjs"), "utf8");
const apiSource = fs.readFileSync(path.join(root, "scripts/gqa6r-development-api.mjs"), "utf8");
check("C5-10 the Meal Buddy utility is read-only: no write, no Auth credential handling, no card insert, no privileged grant",
  !/fixtureWriteSql|admin\/users|api-keys|service_role|password|grant_type|insert into|social_internal\.(create|cancel)/.test(buddySource)
  && /refusing: this utility is read-only/.test(buddySource) && !/api-keys|reveal=true/.test(apiSource));

// ---- manifest + Development-only hard stop
const manifestOnDisk = JSON.parse(fs.readFileSync(path.join(root, MANIFEST_PATH), "utf8"));
const generated = buildManifest({ mealBuddyCount: manifestOnDisk.demo_meal_buddy_identities.length });
check("C56-1 the committed manifest is exactly the deterministic specification", JSON.stringify(manifestOnDisk) === JSON.stringify(generated));
check("C56-2 the manifest targets only Development and records every fixture kind",
  manifestOnDisk.target_project === DEVELOPMENT_PROJECT_REF && manifestOnDisk.target_project_name === "tastkind-development"
  && ["DEMO_RESTAURANT", "DEMO_BRANCH", "DEMO_MENU", "DEMO_CATEGORY", "DEMO_MENU_ITEM", "DEMO_MEAL_BUDDY_IDENTITY", "DEMO_MEAL_BUDDY_CARD", "SECONDARY_INTERACTION_TEST_IDENTITY"]
    .every((kind) => JSON.stringify(manifestOnDisk).includes(`"${kind}"`)));
check("C56-3 the manifest holds no secret material", !/password|token|jwt|secret|service_role|api_key|totp/i.test(JSON.stringify(manifestOnDisk)));
let wrongRef = false, wrongName = false;
try { assertDevelopmentTarget({ ref: "abcdefghijklmnopqrst", projectName: "tastkind-development" }); } catch { wrongRef = true; }
try { assertDevelopmentTarget({ ref: DEVELOPMENT_PROJECT_REF, projectName: "tastkind-production" }); } catch { wrongName = true; }
check("C56-4 a non-Development ref or project name is refused", wrongRef && wrongName && assertDevelopmentTarget({ ref: DEVELOPMENT_PROJECT_REF, projectName: "tastkind-development" }));
const env = { ...process.env }; delete env.SUPABASE_ACCESS_TOKEN;
for (const utility of ["gqa6r-ensure-demo-catalogue-pool", "gqa6r-ensure-meal-buddy-demo-pool"]) {
  const r = spawnSync(process.execPath, [`scripts/${utility}.mjs`, "--apply"], { cwd: root, env, encoding: "utf8", timeout: 60000 });
  check(`C56-5 ${utility}: --apply is refused before any network call`, r.status !== 0 && /refusing: (--apply requires --confirm-development|this utility is read-only)/.test(r.stderr));
}
const catalogueSource = fs.readFileSync(path.join(root, "scripts/gqa6r-ensure-demo-catalogue-pool.mjs"), "utf8");
check("C56-6 the only writing utility verifies the Development target before any write; the Meal Buddy planner verifies before reading",
  catalogueSource.indexOf("verifyDevelopmentTarget(ref)") > 0 && catalogueSource.indexOf("verifyDevelopmentTarget(ref)") < catalogueSource.indexOf("fixtureWriteSql(ref, verifiedRef")
  && buddySource.indexOf("await verifyDevelopmentTarget(ref)") > 0 && buddySource.indexOf("await verifyDevelopmentTarget(ref)") < buddySource.indexOf("await readState(ref"));
check("C56-7 no app runtime imports the fixture utilities (never runs in Consumer runtime; no public seed endpoint)",
  !spawnSync("git", ["grep", "-l", "gqa6r-demo-fixtures\\|gqa6r-ensure-", "--", "apps", "supabase", "packages", "lib"], { cwd: root, encoding: "utf8" }).stdout.trim());

const failed = checks.filter((c) => !c.pass);
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.pass ? "" : `\n     detail: ${JSON.stringify(c.detail ?? null).slice(0, 300)}`}`);
console.log(JSON.stringify({ suite: "gqa6r-demo-fixtures-smoke", total: checks.length, passed: checks.length - failed.length, failed: failed.length, networkUsed: false }));
process.exitCode = failed.length ? 1 : 0;
