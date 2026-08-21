#!/usr/bin/env node
// SR-2G-G deterministic local smoke. It executes the real handoff builder, request validator and
// write runtime with a local transaction stub. No network, database, credentials or repository
// mutation is used.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(result); if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}

const cache = new Map();
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
const fromRoot = (relative) => load(path.join(root, relative));
const handoff = fromRoot("apps/mobile/features/next-meal-prototype/nextMealBuddyPrefill.ts");
const mobileCreate = fromRoot("apps/mobile/features/meal-buddy-card-create/types.ts");
const validate = fromRoot("supabase/functions/_shared/meal-buddy-card-api/validate.ts");
const runtime = fromRoot("supabase/functions/_shared/meal-buddy-card-api/runtime.ts");
const contextRanking = fromRoot("supabase/functions/_shared/meal-buddy-context/composeContextRanking.ts");
const exposure = fromRoot("supabase/functions/_shared/social-exposure/applySocialExposure.ts");

const IDs = Object.freeze({
  hotpot: ["branch-item-hotpot", "menu-hotpot", "restaurant-a", "branch-a"],
  sushi: ["branch-item-sushi", "menu-sushi", "restaurant-a", "branch-a"],
  ramen: ["branch-item-ramen", "menu-ramen", "restaurant-b", "branch-b"],
  unmapped: ["branch-item-salad", "menu-salad", "restaurant-c", "branch-c"]
});
const MAPPING = new Map([
  ["menu-hotpot", "food.taiwanese_chinese.hotpot"],
  ["menu-sushi", "food.japanese.sushi"],
  ["menu-ramen", "food.japanese.ramen"]
]);
function candidate(kind, display = kind) {
  const [branchMenuItemId, menuItemId, restaurantId, branchId] = IDs[kind];
  return {
    prototypeId: `candidate-${kind}`, source: "canonical_mock", isSampleData: false, ordinal: 0,
    isBestRecommendation: true, mealName: display, restaurantName: `display-${restaurantId}`,
    areaLabel: "台北", tags: ["localized-display-only"], reasonSummary: "display reason", reasonDetails: [],
    branchMenuItemId, menuItemId, restaurantId, branchId
  };
}
const now = new Date("2026-08-21T04:00:00.000Z");
const built = (kind, display) => handoff.buildU1NextMealBuddyPrefill(candidate(kind, display));
const hotpot = built("hotpot", "完全不同的翻譯");
const sushi = built("sushi", "Sushi display");
const ramen = built("ramen", "ラーメン表示");
const unmapped = built("unmapped", "No category text");

check("01 selected live recommendation preserves exactly the canonical identity", hotpot.selectedRecommendation.menuItemId === "menu-hotpot");
check("02 display tags are not copied into the authority handoff", !Object.hasOwn(hotpot, "foodCategory") && !Object.hasOwn(hotpot, "foodContextTagKey"));
check("03 locale changes do not change selected identity", built("hotpot", "Hot Pot").selectedRecommendation.menuItemId === hotpot.selectedRecommendation.menuItemId);
check("04 hotpot request carries no caller context", !Object.hasOwn(mobileCreate.buildRecommendationMealBuddyCardCreateRequest(hotpot, now), "foodContextTagKey"));
check("05 sushi selection does not fall back to the first recommendation", mobileCreate.buildRecommendationMealBuddyCardCreateRequest(sushi, now).selectedRecommendation.menuItemId === "menu-sushi");
check("06 ramen selection does not reuse stale sushi identity", mobileCreate.buildRecommendationMealBuddyCardCreateRequest(ramen, now).selectedRecommendation.menuItemId === "menu-ramen");
check("07 sample/display-only recommendation has null canonical handoff", handoff.buildU1NextMealBuddyPrefill({ ...candidate("hotpot"), isSampleData: true }).selectedRecommendation === null);

function body(prefill) {
  return mobileCreate.buildRecommendationMealBuddyCardCreateRequest(prefill, now);
}
for (const [index, prefill] of [hotpot, sushi, ramen, unmapped].entries()) {
  check(`08.${index + 1} selected recommendation request validates`, validate.validateMealBuddyCardCreateRequest(body(prefill), now).ok);
}
check("09 explicit context cannot override recommendation derivation",
  !validate.validateMealBuddyCardCreateRequest({ ...body(hotpot), foodContextTagKey: "food.japanese.sushi" }, now).ok);
check("10 cross-restaurant request fails closed",
  !validate.validateMealBuddyCardCreateRequest({ ...body(hotpot), restaurantId: "restaurant-b" }, now).ok);
check("11 unknown selected-recommendation key fails closed",
  !validate.validateMealBuddyCardCreateRequest({ ...body(hotpot), selectedRecommendation: { ...hotpot.selectedRecommendation, displayName: "火鍋" } }, now).ok);

async function execute(prefill) {
  const request = validate.validateMealBuddyCardCreateRequest(body(prefill), now).value;
  let parameters;
  const transport = {
    async withTransaction(operation) {
      return await operation({
        async query(_statement, params) {
          parameters = params;
          const context = MAPPING.get(params[12]) ?? null;
          return [{ payload: { ok: true, card: {
            id: `card-${params[12]}`, card_type: params[1], intention_type: params[2],
            restaurant_id: params[3], area: params[4], dining_date: params[5], meal_period: params[6],
            preferred_time: params[7], created_at: now.toISOString(), expires_at: "2026-08-22T14:00:00.000Z",
            food_context_tag_key: context
          }, counts: { general: 0, restaurant: 1 } } }];
        }
      });
    }
  };
  const outcome = await runtime.createOwnedCard(transport, "00000000-0000-4000-8000-000000000001", request, { general: 1, restaurant: 1 });
  return { outcome, parameters };
}

const executions = await Promise.all([hotpot, sushi, ramen, unmapped].map(execute));
check("12 hotpot mapping reaches stored card context", executions[0].outcome.card.food_context_tag_key === "food.taiwanese_chinese.hotpot");
check("13 sushi mapping reaches stored card context", executions[1].outcome.card.food_context_tag_key === "food.japanese.sushi");
check("14 ramen mapping reaches stored card context", executions[2].outcome.card.food_context_tag_key === "food.japanese.ramen");
check("15 unmapped recommendation still creates a null-context card", executions[3].outcome.ok && executions[3].outcome.card.food_context_tag_key === null);
check("16 runtime sends the selected menu item, not Profile food interests", executions[0].parameters[12] === "menu-hotpot" && executions[0].parameters.length === 15);
check("17 identical canonical selection produces identical context", (await execute(built("sushi", "另一個名稱"))).outcome.card.food_context_tag_key === executions[1].outcome.card.food_context_tag_key);

const legacy = {
  cardType: "general", intentionType: "chat_first", restaurantId: null, area: null,
  diningDate: "2026-08-21", mealPeriod: "dinner", preferredTime: null
};
const legacyValidation = validate.validateMealBuddyCardCreateRequest(legacy, now);
check("18 existing seven-key direct card creation remains valid", legacyValidation.ok && legacyValidation.value.selectedRecommendation === null);
check("19 direct creation defaults to null context", legacyValidation.ok && legacyValidation.value.foodContextTagKey === null);

const ui = fs.readFileSync(path.join(root, "apps/mobile/app/meal-buddies.tsx"), "utf8");
check("20 product Mobile exposes no category/context picker", !ui.includes('label="餐點類型"') && !/foodContextTagKey/.test(ui));
check("21 product Mobile sends selectedRecommendation through the real create adapter", ui.includes("createRecommendationMealBuddyCard(request)"));
const authoritySources = [
  "apps/mobile/features/next-meal-prototype/nextMealBuddyPrefill.ts",
  "apps/mobile/features/meal-buddy-card-create/types.ts",
  "supabase/migrations/20260821010000_meal_buddy_recommendation_context_handoff.sql"
].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
check("22 no localized-name matching heuristic exists in handoff or mapping authority", !/includes\(["'`](火鍋|壽司|拉麵)/.test(authoritySources));
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260821010000_meal_buddy_recommendation_context_handoff.sql"), "utf8");
check("23 mapping remains visible to the NOBYPASSRLS write authority", migration.includes("create policy meal_buddy_menu_item_food_context_mapping_write_authority_read") && migration.includes("for select to meal_buddy_card_write_authority using (true)"));

const pipelineIds = Object.freeze({
  neutral: "00000000-0000-4000-8000-000000000001",
  matched: "00000000-0000-4000-8000-000000000002",
  unsupported: "00000000-0000-4000-8000-000000000003",
  neutralB: "00000000-0000-4000-8000-000000000004"
});
const pipelineCandidates = [pipelineIds.neutral, pipelineIds.matched, pipelineIds.unsupported, pipelineIds.neutralB]
  .map((candidateUserId) => ({
    candidateUserId,
    result: { status: "adapted", versions: {}, taste: { similarity: { status: "not_scored", reason: "no_comparable_evidence" } } }
  }));
const pipelineResult = contextRanking.composeMealBuddyContextRanking({
  candidates: pipelineCandidates,
  contextByCandidateUserId: new Map([
    [pipelineIds.neutral, "neutral"],
    [pipelineIds.matched, executions[0].outcome.card.food_context_tag_key === MAPPING.get("menu-hotpot") ? "matched" : "unsupported"],
    [pipelineIds.unsupported, "unsupported"],
    [pipelineIds.neutralB, "neutral"]
  ])
});
check("24 derived context enters the frozen SR-2G-F bucket-before-Taste pipeline", pipelineResult.policyVersion === "social-ranking-v1" && pipelineResult.ordered[0].candidateUserId === pipelineIds.matched);
check("25 frozen SR-2B remains the sole exposure cap", exposure.applySocialExposure(pipelineResult, { class: "free" }).exposed.length === 3);

console.log(JSON.stringify({ suite: "social-candidate-sr2g-g-smoke", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false }, null, 2));
if (failures.length) process.exitCode = 1;
