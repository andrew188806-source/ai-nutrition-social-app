#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";

const root = process.cwd();
const require_ = Module.createRequire(import.meta.url);
const ts = require_("typescript");
require_.extensions[".ts"] = function (module, filename) {
  const out = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, isolatedModules: true },
    fileName: filename
  });
  module._compile(out.outputText, filename);
};
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith(".") && parent?.filename) {
    const base = path.resolve(path.dirname(parent.filename), request);
    for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), base]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
  }
  return originalResolve.call(this, request, parent, ...rest);
};

const shared = path.join(root, "supabase/functions/_shared/next-meal-geo-api");
const meals = path.join(root, "apps/mobile/features/consumer-meals");
const { composeNextMealGeoCandidates } = require_(path.join(shared, "compose.ts"));
const { parseNextMealGeoRequest } = require_(path.join(shared, "request.ts"));
const { NEXT_MEAL_GEO_RADIUS_METERS, NEXT_MEAL_GEO_BRANCH_LIMIT } = require_(path.join(shared, "policy.ts"));
const { SupabaseConsumerNextMealRecommendationRepository } = require_(path.join(meals, "adapters/supabaseConsumerNextMealRecommendationRepository.ts"));
const { parseSupabaseNextMealGeoResponse } = require_(path.join(meals, "adapters/supabaseNextMealGeoRows.ts"));
const { ConsumerNextMealRecommendationService } = require_(path.join(meals, "consumerNextMealRecommendationService.ts"));

const checks = []; const failures = [];
const check = (name, ok, detail) => {
  const result = { name, pass: Boolean(ok), ...(ok ? {} : { detail }) };
  checks.push(result); if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 500)}`);
};

const row = (candidateId, branchId, restaurantId, calories = 500, menuItemId = `menu-${candidateId}`) => ({
  candidate_id: candidateId, restaurant_id: restaurantId, branch_id: branchId,
  menu_item_id: menuItemId, meal_name: `Meal ${candidateId}`, restaurant_name: `Restaurant ${restaurantId}`,
  branch_name: `Branch ${branchId}`, district: "大安區", public_image_url: null, calories,
  protein: 20, carbohydrates: 50, fat: 10, fiber: 5,
  nutrition_source_public: "platform_reviewed", nutrition_updated_at: "2026-08-27T00:00:00.000Z",
  availability: "available"
});
const request = Object.freeze({ origin: Object.freeze({ latitude: 25.033, longitude: 121.565 }), candidatePoolLimit: 50 });

// GEO-1A narrowing is the only branch eligibility answer, and only its identities reach the view.
{
  const asked = [];
  const response = await composeNextMealGeoCandidates({
    request,
    geoRepository: {
      async narrowBranchCandidates(query) {
        asked.push(query);
        return [{ branchId: "near-a", restaurantId: "restaurant-a", distanceMeters: 120 }];
      }
    },
    candidateSource: {
      async readForBranches(branchIds, limit) {
        asked.push({ branchIds, limit });
        return [row("offer-near", "near-a", "restaurant-a")];
      }
    }
  });
  check("GEO-1A receives the recommendation-owned radius and canonical limit",
    asked[0].radiusMeters === NEXT_MEAL_GEO_RADIUS_METERS && asked[0].limit === NEXT_MEAL_GEO_BRANCH_LIMIT, asked[0]);
  check("only GEO-eligible branch identities reach the canonical offer source",
    asked[1].branchIds.join(",") === "near-a" && asked[1].limit === 50, asked[1]);
  check("a nearby eligible branch enters the candidate flow",
    response.status === "available" && response.candidates[0].candidate_id === "offer-near", response);
  check("distance is not returned to recommendation ranking",
    !JSON.stringify(response).includes("distanceMeters") && !JSON.stringify(response).includes("120"));
}

// Out-of-radius and UNKNOWN branches are absent from the GEO-1A result, so they never reach a join.
{
  let sourceCalled = false;
  const response = await composeNextMealGeoCandidates({
    request,
    geoRepository: { async narrowBranchCandidates() { return []; } },
    candidateSource: { async readForBranches() { sourceCalled = true; return []; } }
  });
  check("out-of-radius and UNKNOWN branches do not reach the offer source",
    response.status === "empty" && response.geoCandidateCount === 0 && !sourceCalled, response);
}

// Branch offer identity remains branch-specific. Two branches of one restaurant are two offers.
{
  const response = await composeNextMealGeoCandidates({
    request,
    geoRepository: { async narrowBranchCandidates() { return [
      { branchId: "branch-b", restaurantId: "restaurant-shared", distanceMeters: 200 },
      { branchId: "branch-a", restaurantId: "restaurant-shared", distanceMeters: 100 }
    ]; } },
    candidateSource: { async readForBranches() { return [
      row("offer-b", "branch-b", "restaurant-shared", 510, "menu-shared"),
      row("offer-a", "branch-a", "restaurant-shared", 510, "menu-shared")
    ]; } }
  });
  check("multiple nearby branches preserve distinct branch-offer identities",
    response.candidates.length === 2 && new Set(response.candidates.map((item) => item.branch_id)).size === 2);
  check("branch-offer mapping order is deterministic",
    response.candidates.map((item) => item.candidate_id).join(",") === "offer-a,offer-b");
}

{
  const duplicate = row("offer-one", "branch-one", "restaurant-one");
  const response = await composeNextMealGeoCandidates({
    request,
    geoRepository: { async narrowBranchCandidates() { return [
      { branchId: "branch-one", restaurantId: "restaurant-one", distanceMeters: 1 }
    ]; } },
    candidateSource: { async readForBranches() { return [duplicate, { ...duplicate }]; } }
  });
  check("identical join fan-out collapses without duplicate meals", response.candidates.length === 1);
}

{
  let rejected = false;
  try {
    await composeNextMealGeoCandidates({
      request,
      geoRepository: { async narrowBranchCandidates() { return [
        { branchId: "branch-one", restaurantId: "restaurant-one", distanceMeters: 1 }
      ]; } },
      candidateSource: { async readForBranches() { return [row("offer-bad", "branch-other", "restaurant-one")]; } }
    });
  } catch { rejected = true; }
  check("cross-branch offer leakage fails closed", rejected);
}

// Exact request grammar: coordinates and a bounded pool limit, never actor or radius authority.
{
  const parsed = await parseNextMealGeoRequest(new Request("https://example.test", {
    method: "POST", body: JSON.stringify({ latitude: 25.03, longitude: 121.56, candidatePoolLimit: 20 })
  }));
  check("valid request-scoped coordinates parse", parsed.ok && parsed.value.candidatePoolLimit === 20);
  for (const body of [
    { latitude: 25.03, longitude: 121.56, radiusMeters: 999 },
    { latitude: 25.03, longitude: 121.56, actorUserId: "someone" },
    { latitude: null, longitude: 121.56 },
    { latitude: 25.03, longitude: 121.56, candidatePoolLimit: 51 }
  ]) {
    const outcome = await parseNextMealGeoRequest(new Request("https://example.test", { method: "POST", body: JSON.stringify(body) }));
    check(`request authority input is rejected: ${Object.keys(body).at(-1)}`, !outcome.ok, body);
  }
}

// Mobile invokes Geo only when a current location exists, then applies the existing calorie rank.
{
  const calls = [];
  const client = {
    functions: { async invoke(name, options) {
      calls.push({ kind: "function", name, body: options.body });
      return { data: { version: "next-meal-geo-v1", status: "available", geoCandidateCount: 2,
        candidates: [row("offer-z", "branch-z", "restaurant-z", 530), row("offer-a", "branch-a", "restaurant-a", 510)] }, error: null };
    } },
    from() { calls.push({ kind: "view" }); throw new Error("direct view must not run"); }
  };
  const repository = new SupabaseConsumerNextMealRecommendationRepository({
    authPort: { async getCurrentSession() { return { ok: true, value: { user: { userId: "actor" } } }; } },
    restaurantMenuClient: client
  });
  const result = await repository.getRankedNextMealCandidates({
    nutritionRanking: { dailyGoals: { calories: 520 }, consumedTotals: { calories: 0 } },
    currentLocation: { latitude: 25.03, longitude: 121.56 }
  });
  check("Geo-enabled Mobile uses the authenticated Edge boundary only",
    calls.length === 1 && calls[0].kind === "function" && calls[0].name === "next-meal-geo-candidates", calls);
  check("REC-A nutrition-gap ranking remains downstream of Geo",
    result.status === "available" && result.candidates.map((item) => item.candidateId).join(",") === "offer-a,offer-z");
}

{
  const calls = [];
  const repository = new SupabaseConsumerNextMealRecommendationRepository({
    authPort: { async getCurrentSession() { return { ok: true, value: { user: { userId: "actor" } } }; } },
    restaurantMenuClient: {
      functions: { async invoke() { calls.push("function"); return { data: null, error: {} }; } },
      from() { calls.push("view"); return { select() { return { order() { return { async range() {
        return { data: [row("offer-direct", "branch-direct", "restaurant-direct")], error: null };
      } }; } }; } }; }
    }
  });
  const result = await repository.getRankedNextMealCandidates({
    nutritionRanking: { dailyGoals: { calories: 520 }, consumedTotals: { calories: 0 } }
  });
  check("location-unavailable path preserves the existing non-Geo view read",
    result.status === "available" && calls.join(",") === "view", calls);
}

const intakeService = { async getCurrentUserTodayIntakeOverview() { return { ok: true, value: {
  calculatedNutrition: { calories: 400, protein: 20 }, mealCount: 1, actualConsumedStatus: "available",
  plannedMealsStatus: "empty", plannedMeals: []
} }; } };
const candidate = {
  candidateId: "offer", branchMenuItemId: "offer", menuItemId: "menu", restaurantId: "restaurant",
  branchId: "branch", mealName: "Meal", restaurantName: "Restaurant", nutrition: { calories: 500 },
  tags: [], reason: { reasonSummary: "reason", reasonBasis: "neutral_nutrition_fallback" }, rankOrdinal: 0
};
const neutralRanking = { rankingMode: "neutral_fallback", nutritionGoalsApplied: false,
  todayIntakeApplied: false, usableNutritionDimensions: [] };

{
  const calls = [];
  const service = new ConsumerNextMealRecommendationService({
    repository: { source: "supabase", dataProvenance: "live", async getRankedNextMealCandidates(input) {
      calls.push(input);
      return input.currentLocation
        ? { status: "read_failed", errorCode: "next_meal_geo_service_unavailable" }
        : { status: "available", candidates: [candidate], totalCandidateCount: 1, ranking: neutralRanking };
    } }, intakeOverviewService: intakeService,
    nutritionGoalsReader: { async readCurrentUserNutritionGoals() { return { status: "empty", rows: [] }; } },
    clock: { now: () => new Date("2026-08-27T00:00:00.000Z") }
  });
  const result = await service.getCurrentUserNextMealRecommendation({ currentLocation: { latitude: 25, longitude: 121 } });
  check("Geo backend failure falls back once to the existing recommendation path",
    calls.length === 2 && calls[0].currentLocation && !calls[1].currentLocation, calls);
  check("fallback is internally distinguished from location unavailability",
    result.status === "available" && result.recommendation.context.geoStatus === "unavailable", result);
}

{
  let calls = 0;
  const service = new ConsumerNextMealRecommendationService({
    repository: { source: "supabase", dataProvenance: "live", async getRankedNextMealCandidates() {
      calls += 1; return { status: "empty" };
    } }, intakeOverviewService: intakeService,
    nutritionGoalsReader: { async readCurrentUserNutritionGoals() { return { status: "empty", rows: [] }; } },
    clock: { now: () => new Date("2026-08-27T00:00:00.000Z") }
  });
  const result = await service.getCurrentUserNextMealRecommendation({ currentLocation: { latitude: 25, longitude: 121 } });
  check("zero nearby candidates remains a clean Geo empty result without broadening",
    calls === 1 && result.status === "empty" && result.geoStatus === "applied", result);
}

check("Mobile rejects an unexpected server field shape",
  parseSupabaseNextMealGeoResponse({ version: "next-meal-geo-v1", status: "available", geoCandidateCount: 1,
    candidates: [{ ...row("offer", "branch", "restaurant"), calories: "500" }] }) === null);

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const integrationCode = [
  ...fs.readdirSync(shared).map((file) => read(`supabase/functions/_shared/next-meal-geo-api/${file}`)),
  read("supabase/functions/next-meal-geo-candidates/handler.ts"),
  read("apps/mobile/app/recommendation.tsx"),
  read("apps/mobile/features/consumer-meals/consumerNextMealRecommendationService.ts")
].join("\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");
check("integration contains no second distance formula",
  !/haversine|Math\.(?:sin|cos|asin|atan2|sqrt)|6371\b|toRadians|deg2rad/i.test(integrationCode));
check("integration never geocodes during recommendation",
  !/restaurant-geocoding|restaurant-geocode-dispatch|geocodeOnRequest|resolveDuringRanking/.test(integrationCode));
check("precise coordinates are neither persisted nor logged",
  !/AsyncStorage|SecureStore|storage\.setItem|console\.|logger\./.test(integrationCode));
check("no background watcher or task is introduced",
  !/watchPosition|BackgroundPermissions|TaskManager|geofenc/i.test(integrationCode));
check("the recommendation screen mounts the frozen GEO-1B hook and permission card",
  /useConsumerLocation/.test(read("apps/mobile/app/recommendation.tsx"))
  && /ConsumerLocationPermissionCard/.test(read("apps/mobile/app/recommendation.tsx")));

console.log("\n" + JSON.stringify({
  suite: "geo-recommendation-geo-1c-smoke",
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((item) => item.name),
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
