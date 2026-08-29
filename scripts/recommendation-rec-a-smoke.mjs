#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const featureRoot = path.join(root, "apps", "mobile", "features");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "recommendation-rec-a-"));
const rankerPath = path.join(featureRoot, "consumer-meals", "nextMealNutritionRanker.ts");
const servicePath = path.join(featureRoot, "consumer-meals", "consumerNextMealRecommendationService.ts");
const repositoryPath = path.join(featureRoot, "consumer-meals", "adapters", "supabaseConsumerNextMealRecommendationRepository.ts");
const mapperPath = path.join(featureRoot, "next-meal-prototype", "mapCanonicalToU1NextMeal.ts");
const policyPath = path.join(featureRoot, "consumer-meals", "nutritionRankingPolicy.ts");

const mutations = Object.freeze({
  reward_overage: [rankerPath, "improvement - addedOveragePenalty", "improvement + addedOveragePenalty"],
  allow_zero_goal: [rankerPath, "value > 0 ? value : null", "value >= 0 ? value : null"],
  reverse_tie_break: [rankerPath, "left.candidate.candidateId.localeCompare(right.candidate.candidateId)", "right.candidate.candidateId.localeCompare(left.candidate.candidateId)"],
  sum_dimensions: [rankerPath, "weightTotal > 0 ? weightedTotal / weightTotal : 0", "weightedTotal"],
  ignore_policy_weights: [rankerPath, "* entry.weight", "* 1"],
  ignore_policy_dimensions: [rankerPath, "for (const entry of policy.dimensions)", "for (const entry of DEFAULT_NUTRITION_RANKING_POLICY.dimensions)"],
  drop_applied_policy_identity: [rankerPath, "appliedPolicyId: policy.policyId", "appliedPolicyId: \"\""],
  trust_invalid_policy: [policyPath, "isNutritionRankingPolicy(candidate) ? candidate : DEFAULT_NUTRITION_RANKING_POLICY", "candidate"],
  skip_goal_read: [servicePath, "const dailyGoals = await readDailyGoals(this.options.nutritionGoalsReader, date);", "const dailyGoals = null;"],
  remove_pre_rank_order: [repositoryPath, ".order(\"candidate_id\", { ascending: true })", ""],
  preferred_hint_overrides_exposure: [mapperPath,
    "const clipped = Array.from(recommendation.candidates).slice(0, visibleLimit);",
    "const clipped = [...recommendation.candidates.filter((candidate) => candidate.menuItemId === preferredMenuItemId), ...recommendation.candidates.filter((candidate) => candidate.menuItemId !== preferredMenuItemId)].slice(0, visibleLimit);"]
});

const mutationName = process.env.RECA_MUTATION;
const mutation = mutationName ? mutations[mutationName] : undefined;
if (mutationName && !mutation) throw new Error(`Unknown REC-A mutation: ${mutationName}`);

const compilerOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
  strict: true,
  esModuleInterop: true,
  skipLibCheck: true,
  declaration: false,
  sourceMap: false,
  outDir: tempRoot,
  rootDir: root
};
const host = ts.createCompilerHost(compilerOptions);
const baseReadFile = host.readFile.bind(host);
host.readFile = (fileName) => {
  const source = baseReadFile(fileName);
  if (!source || !mutation || path.normalize(fileName) !== path.normalize(mutation[0])) return source;
  // A missing target must NOT look like a killed mutant. Exiting non-zero for any reason is what the
  // runner counts as "killed", so a mutation whose anchor drifted out of the source would otherwise
  // report as a pass while testing nothing. This exit code is reserved and the runner treats it as
  // an ERROR, never as a kill.
  if (!source.includes(mutation[1])) {
    console.error(`RECA_MUTATION_TARGET_NOT_FOUND ${mutationName}`);
    process.exit(97);
  }
  return source.replace(mutation[1], mutation[2]);
};

const program = ts.createProgram([rankerPath, servicePath, repositoryPath, mapperPath], compilerOptions, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n"
  }));
}
program.emit();

const compiledFeatureRoot = path.join(tempRoot, "apps", "mobile", "features");
const requireFromTemp = createRequire(path.join(compiledFeatureRoot, "consumer-meals", "types.js"));
const ranker = requireFromTemp("./nextMealNutritionRanker.js");
const serviceModule = requireFromTemp("./consumerNextMealRecommendationService.js");
const repositoryModule = requireFromTemp("./adapters/supabaseConsumerNextMealRecommendationRepository.js");
const mapper = requireFromTemp("../next-meal-prototype/mapCanonicalToU1NextMeal.js");

const checks = [];
const check = (name, condition, detail) => {
  const result = { name, pass: Boolean(condition), ...(condition ? {} : { detail }) };
  checks.push(result);
  if (!condition) throw new Error(`${name}: ${JSON.stringify(detail ?? null)}`);
};

const goalRow = (patch = {}) => ({
  id: "goal-1", user_id: "user-1", goal_label: "daily",
  daily_calories_target: 1000, protein_target_g: 100,
  carbohydrates_target_g: 200, fat_target_g: 60, fiber_target_g: 30,
  starts_on: "2026-01-01", ends_on: null, is_active: true,
  created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
  ...patch
});
const candidate = (id, nutrition, menuItemId = `menu-${id}`) => ({
  candidateId: id, branchMenuItemId: id, menuItemId,
  restaurantId: `restaurant-${id}`, branchId: `branch-${id}`,
  mealName: id, restaurantName: `restaurant-${id}`, areaLabel: null, emoji: null,
  nutrition, tags: [],
  reason: { reasonSummary: "unranked", reasonBasis: "neutral_nutrition_fallback" },
  rankOrdinal: 0
});
const input = (dailyGoals, consumedTotals) => ({ dailyGoals, consumedTotals });

const allGoals = ranker.resolveActiveDailyNutritionGoals([goalRow()], "2026-08-27");
check("01 canonical active goal row resolves all five supported dimensions",
  JSON.stringify(Object.keys(allGoals ?? {})) === JSON.stringify(["calories", "protein", "carbohydrates", "fat", "fiber"]));
check("02 absent goal row is an explicit null fallback",
  ranker.resolveActiveDailyNutritionGoals([], "2026-08-27") === null);
check("03 null and zero goals are omitted without division by zero",
  ranker.resolveActiveDailyNutritionGoals([goalRow({ daily_calories_target: 0, protein_target_g: null })], "2026-08-27")?.calories === undefined);

for (const dimension of ["calories", "protein", "carbohydrates", "fat", "fiber"]) {
  const ranked = ranker.rankNextMealCandidatesByNutrition([
    candidate("low", { [dimension]: 20 }),
    candidate("high", { [dimension]: 80 })
  ], input({ [dimension]: 100 }, { [dimension]: 0 }));
  check(`dimension participates: ${dimension}`, ranked.candidates[0].candidateId === "high", ranked);
}

const beforeIntake = ranker.rankNextMealCandidatesByNutrition([
  candidate("large", { calories: 800 }), candidate("small", { calories: 200 })
], input({ calories: 1000 }, { calories: 0 }));
const afterIntake = ranker.rankNextMealCandidatesByNutrition([
  candidate("large", { calories: 800 }), candidate("small", { calories: 200 })
], input({ calories: 1000 }, { calories: 800 }));
check("09 changing Today Intake changes remaining gaps and ordering",
  beforeIntake.candidates[0].candidateId === "large" && afterIntake.candidates[0].candidateId === "small");

const overage = ranker.rankNextMealCandidatesByNutrition([
  candidate("exact", { calories: 200 }), candidate("overshoot", { calories: 700 })
], input({ calories: 1000 }, { calories: 800 }));
check("10 exact gap fill outranks meaningful overage", overage.candidates[0].candidateId === "exact");
const alreadySatisfied = ranker.rankNextMealCandidatesByNutrition([
  candidate("less-overage", { protein: 10 }), candidate("more-overage", { protein: 50 })
], input({ protein: 100 }, { protein: 120 }));
check("11 satisfied nutrient creates no reward and new overage is penalized",
  alreadySatisfied.candidates[0].candidateId === "less-overage");

const equalContribution = ranker.rankNextMealCandidatesByNutrition([
  candidate("one-dimension", { calories: 100 }),
  candidate("two-dimensions", { calories: 75, protein: 75 })
], input({ calories: 100, protein: 100 }, { calories: 0, protein: 0 }));
check("12 available dimensions contribute by equal normalized average, not raw-unit sum",
  equalContribution.candidates[0].candidateId === "one-dimension");

const incomplete = ranker.rankNextMealCandidatesByNutrition([
  candidate("complete", { calories: 50, protein: 50 }),
  candidate("partial", { calories: 60 })
], input({ calories: 100, protein: 100 }, { calories: 0, protein: 0 }));
check("13 incomplete candidate macros are omitted rather than fabricated",
  incomplete.ranking.usableNutritionDimensions.includes("protein")
  && incomplete.candidates.find((item) => item.candidateId === "partial").reason.reasonBasis === "nutrition_gap");

const neutral = ranker.rankNextMealCandidatesByNutrition([
  candidate("candidate-b", {}), candidate("candidate-a", {})
], input({ calories: 100 }, { calories: 0 }));
check("14 no usable dimensions produces deterministic neutral candidate-ID order",
  neutral.ranking.rankingMode === "neutral_fallback"
  && neutral.candidates.map((item) => item.candidateId).join(",") === "candidate-a,candidate-b");
check("15 identical inputs are byte-stable",
  JSON.stringify(neutral) === JSON.stringify(ranker.rankNextMealCandidatesByNutrition([
    candidate("candidate-b", {}), candidate("candidate-a", {})
  ], input({ calories: 100 }, { calories: 0 }))));

const menuPromotionResult = {
  status: "available",
  recommendation: {
    candidates: [
      candidate("branch-other", { calories: 10 }, "menu-other"),
      candidate("branch-a", { calories: 10 }, "menu-shared"),
      candidate("branch-b", { calories: 10 }, "menu-shared")
    ],
    totalCandidateCount: 3, source: "supabase", dataProvenance: "live",
    context: {
      date: "2026-08-27", timezone: "Asia/Taipei", generatedAt: "2026-08-27T00:00:00.000Z",
      rankingMode: "nutrition_gap", nutritionGoalsApplied: true, todayIntakeApplied: true,
      usableNutritionDimensions: ["calories"], plannedMealCount: 0, plannedMealsAvailable: true,
      plannedMealsAppliedToRanking: false, geoStatus: "not_requested", geoApplied: false
    }
  }
};
const promoted = mapper.mapCanonicalToU1NextMeal(menuPromotionResult, "premium", 10, "menu-shared");
check("16 preferred identity cannot override the REC-B canonical exposure order",
  promoted.status === "success" && promoted.recommendation.candidates[0].menuItemId === "menu-other");
check("17 same menu at two branches remains two distinct branch-offer identities",
  promoted.status === "success"
  && promoted.recommendation.candidates.filter((item) => item.menuItemId === "menu-shared").map((item) => item.branchMenuItemId).join(",") === "branch-a,branch-b");
check("18 active and fallback UX context notes are mode-truthful",
  promoted.status === "success" && promoted.recommendation.contextNote.includes("每日營養目標"));

let goalsRead = 0;
const repoCandidates = [candidate("large", { calories: 800 }), candidate("small", { calories: 200 })];
const makeRepository = (handler) => ({ source: "mock", dataProvenance: "sample", getRankedNextMealCandidates: handler });
const availableResult = (rankingInput, sourceCandidates = repoCandidates) => {
  const ranked = ranker.rankNextMealCandidatesByNutrition(sourceCandidates, rankingInput);
  return { status: "available", candidates: ranked.candidates, totalCandidateCount: ranked.candidates.length, ranking: ranked.ranking };
};
const intakeService = (consumedCalories) => ({ getCurrentUserTodayIntakeOverview: async () => ({ ok: true, value: {
  calculatedNutrition: { calories: consumedCalories, protein: 0, carbohydrates: 0, fat: 0, fiber: null },
  mealCount: consumedCalories > 0 ? 1 : 0, actualConsumedStatus: consumedCalories > 0 ? "available" : "empty",
  plannedMealsStatus: "empty", plannedMeals: []
} }) });
const service = new serviceModule.ConsumerNextMealRecommendationService({
  repository: makeRepository(async (repositoryInput) => availableResult(repositoryInput.nutritionRanking)),
  intakeOverviewService: intakeService(800),
  nutritionGoalsReader: { readCurrentUserNutritionGoals: async () => { goalsRead += 1; return { status: "available", rows: [goalRow()] }; } },
  clock: { now: () => new Date("2026-08-27T12:00:00.000Z") }
});
const serviceResult = await service.getCurrentUserNextMealRecommendation();
check("19 recommendation service actually reads canonical daily goals", goalsRead === 1);
check("20 service applies Today Intake to the downstream pure ranker",
  serviceResult.status === "available" && serviceResult.recommendation.candidates[0].candidateId === "small"
  && serviceResult.recommendation.context.todayIntakeApplied === true);
check("21 planned meals remain explicitly excluded",
  serviceResult.status === "available" && serviceResult.recommendation.context.plannedMealsAppliedToRanking === false);

const fallbackService = new serviceModule.ConsumerNextMealRecommendationService({
  repository: makeRepository(async (repositoryInput) => availableResult(repositoryInput.nutritionRanking)),
  intakeOverviewService: intakeService(0),
  nutritionGoalsReader: { readCurrentUserNutritionGoals: async () => ({ status: "empty", rows: [] }) },
  clock: { now: () => new Date("2026-08-27T12:00:00.000Z") }
});
const fallbackResult = await fallbackService.getCurrentUserNextMealRecommendation();
check("22 missing goals use explicit non-personalized neutral fallback",
  fallbackResult.status === "available" && fallbackResult.recommendation.context.rankingMode === "neutral_fallback"
  && fallbackResult.recommendation.context.nutritionGoalsApplied === false);

const intakeFailure = new serviceModule.ConsumerNextMealRecommendationService({
  repository: makeRepository(async () => { throw new Error("repository must not run"); }),
  intakeOverviewService: { getCurrentUserTodayIntakeOverview: async () => ({ ok: false, error: { code: "meal_read_failed" } }) },
  clock: { now: () => new Date("2026-08-27T12:00:00.000Z") }
});
check("23 intake failure remains fail-closed",
  (await intakeFailure.getCurrentUserNextMealRecommendation()).status === "intake_unavailable");

let zeroNearbyCalls = 0;
const zeroNearbyService = new serviceModule.ConsumerNextMealRecommendationService({
  repository: makeRepository(async () => { zeroNearbyCalls += 1; return { status: "empty" }; }),
  intakeOverviewService: intakeService(0),
  nutritionGoalsReader: { readCurrentUserNutritionGoals: async () => ({ status: "available", rows: [goalRow()] }) },
  clock: { now: () => new Date("2026-08-27T12:00:00.000Z") }
});
const zeroNearby = await zeroNearbyService.getCurrentUserNextMealRecommendation({ currentLocation: { latitude: 25, longitude: 121 } });
check("24 GEO zero-nearby remains applied empty without broadening",
  zeroNearby.status === "empty" && zeroNearby.geoStatus === "applied" && zeroNearbyCalls === 1);

let geoFallbackCalls = 0;
let firstRankingInput;
const geoFallbackService = new serviceModule.ConsumerNextMealRecommendationService({
  repository: makeRepository(async (repositoryInput) => {
    geoFallbackCalls += 1;
    firstRankingInput ??= repositoryInput.nutritionRanking;
    return geoFallbackCalls === 1
      ? { status: "read_failed", errorCode: "next_meal_geo_service_unavailable" }
      : availableResult(repositoryInput.nutritionRanking);
  }),
  intakeOverviewService: intakeService(800),
  nutritionGoalsReader: { readCurrentUserNutritionGoals: async () => ({ status: "available", rows: [goalRow()] }) },
  clock: { now: () => new Date("2026-08-27T12:00:00.000Z") }
});
const geoFallback = await geoFallbackService.getCurrentUserNextMealRecommendation({ currentLocation: { latitude: 25, longitude: 121 } });
check("25 GEO infrastructure fallback reuses the identical downstream nutrition input",
  geoFallback.status === "available" && geoFallback.recommendation.context.geoStatus === "unavailable"
  && geoFallbackCalls === 2 && firstRankingInput.dailyGoals.calories === 1000);

const row = (index, calories) => ({
  candidate_id: `candidate-${String(index).padStart(3, "0")}`,
  restaurant_id: `restaurant-${index}`, branch_id: `branch-${index}`, menu_item_id: `menu-${index}`,
  meal_name: `meal-${index}`, restaurant_name: `restaurant-${index}`, branch_name: `branch-${index}`,
  district: null, public_image_url: null, calories, protein: null, carbohydrates: null, fat: null, fiber: null,
  nutrition_source_public: "restaurant_verified", nutrition_updated_at: "2026-08-27T00:00:00.000Z", availability: "available"
});
const rows = Array.from({ length: 101 }, (_, index) => row(index, index === 100 ? 100 : 900));
const ranges = [];
let orderedByCandidateId = false;
let geoRequestBody;
const menuClient = {
  from: () => ({ select: () => ({ order: (column, options) => {
    orderedByCandidateId = column === "candidate_id" && options.ascending === true;
    return { range: async (from, to) => { ranges.push([from, to]); return { data: rows.slice(from, to + 1), error: null }; } };
  } }) }),
  functions: { invoke: async (_name, options) => { geoRequestBody = options.body; return ({ data: {
    version: "next-meal-geo-v1", status: "available", geoCandidateCount: 2,
    candidates: [row(0, 900), row(100, 100)]
  }, error: null }); } }
};
const liveRepository = new repositoryModule.SupabaseConsumerNextMealRecommendationRepository({
  authPort: { getCurrentSession: async () => ({ ok: true, value: { user: { userId: "user-1" } } }) },
  restaurantMenuClient: menuClient,
  allergySettingsReader: {
    loadCurrentUser: async () => ({
      ok: true,
      value: { options: [], selectedAllergenKeys: [], unresolvedSelectionCount: 0 }
    })
  }
});
const repositoryInput = { nutritionRanking: input({ calories: 100 }, { calories: 0 }) };
const nonGeo = await liveRepository.getRankedNextMealCandidates(repositoryInput);
check("26 non-GEO retrieval orders and pages before post-rank output limiting",
  orderedByCandidateId && JSON.stringify(ranges) === JSON.stringify([[0, 99], [100, 199]]));
check("27 a better candidate beyond the former first 50 rows is not discarded",
  nonGeo.status === "available" && nonGeo.candidates[0].candidateId === "candidate-100"
  && nonGeo.totalCandidateCount === 101 && nonGeo.candidates.length === 50);
const geo = await liveRepository.getRankedNextMealCandidates({
  ...repositoryInput, candidatePoolLimit: 1, currentLocation: { latitude: 25, longitude: 121 }
});
check("28 GEO and non-GEO use the same downstream nutrition ranker before output clipping",
  geo.status === "available" && geo.candidates[0].candidateId === "candidate-100"
  && geo.candidates.length === 1 && geoRequestBody.candidatePoolLimit === 50
  && geo.ranking.rankingMode === nonGeo.ranking.rankingMode);

const scopeSource = [
  fs.readFileSync(rankerPath, "utf8"), fs.readFileSync(servicePath, "utf8"),
  fs.readFileSync(repositoryPath, "utf8")
].join("\n");
const repositorySource = fs.readFileSync(repositoryPath, "utf8");
const forbiddenAllergyRankingAuthority = [
  /\b(?:allergy|allergen|restriction)[A-Za-z0-9_]*(?:score|rank|weight|bonus|penalty|lane)\b/i,
  /\b(?:score|rank|weight|bonus|penalty|lane)[A-Za-z0-9_]*(?:allergy|allergen|restriction)\b/i,
  /\b(?:allergy|allergen|restriction)[ _-]+(?:score|ranking weight|rank weight|bonus|penalty|lane)\b/i,
  /\b(?:score|ranking weight|rank weight|bonus|penalty|lane)[ _-]+(?:allergy|allergen|restriction)\b/i
];
check("29 Allergy is pre-ranking eligibility and never REC-A/B ranking authority",
  !/tasteScore|similarityScore|dietaryRestriction|foodContext|distanceMeters[^\n]*(?:score|sort|rank)|geocodeOnRequest/.test(scopeSource)
  && forbiddenAllergyRankingAuthority.every((pattern) => !pattern.test(scopeSource))
  && repositorySource.indexOf("this.applyAllergyEligibility(mapped)")
    < repositorySource.indexOf("rankNextMealCandidatesByNutrition("));
check("30 fixed 520 is absent from the canonical REC-A runtime", !/\b520\b/.test(scopeSource));

// ---- nutrition ranking policy boundary ----------------------------------------------------------
const policyModule = requireFromTemp("./nutritionRankingPolicy.js");
const defaultPolicy = policyModule.DEFAULT_NUTRITION_RANKING_POLICY;

check("31 the shipped default policy is identified and versioned",
  defaultPolicy.policyId === "tastkind.nutrition.balanced_gap" && defaultPolicy.policyVersion === 1);
check("32 default policy v1 enables the five dimensions at equal contribution",
  defaultPolicy.dimensions.length === 5
  && defaultPolicy.dimensions.every((entry) => entry.weight === 1 && entry.overagePenaltyWeight === 1));
check("33 the applied policy identity is reported in the ranking summary",
  ranker.rankNextMealCandidatesByNutrition([candidate("a", { calories: 10 })],
    input({ calories: 100 }, { calories: 0 })).ranking.appliedPolicyId === "tastkind.nutrition.balanced_gap");

// A policy that disables a dimension must actually stop ranking on it.
const caloriesOnly = Object.freeze({
  policyId: "test.calories_only", policyVersion: 2, targetStrategy: "remaining_daily_gap",
  dimensions: [Object.freeze({ dimension: "calories", weight: 1, overagePenaltyWeight: 1 })]
});
const narrowed = ranker.rankNextMealCandidatesByNutrition([
  candidate("protein-rich", { calories: 10, protein: 90 }),
  candidate("calorie-rich", { calories: 90, protein: 10 })
], input({ calories: 100, protein: 100 }, { calories: 0, protein: 0 }), caloriesOnly);
check("34 a policy that disables a dimension stops ranking on it",
  narrowed.candidates[0].candidateId === "calorie-rich"
  && JSON.stringify(narrowed.ranking.usableNutritionDimensions) === JSON.stringify(["calories"])
  && narrowed.ranking.appliedPolicyId === "test.calories_only"
  && narrowed.ranking.appliedPolicyVersion === 2);

// Weights must change the ORDER, or they are decorative.
const proteinHeavy = Object.freeze({
  policyId: "test.protein_heavy", policyVersion: 1, targetStrategy: "remaining_daily_gap",
  dimensions: [
    Object.freeze({ dimension: "calories", weight: 1, overagePenaltyWeight: 1 }),
    Object.freeze({ dimension: "protein", weight: 9, overagePenaltyWeight: 1 })
  ]
});
const weighted = ranker.rankNextMealCandidatesByNutrition([
  candidate("calorie-rich", { calories: 90, protein: 10 }),
  candidate("protein-rich", { calories: 10, protein: 90 })
], input({ calories: 100, protein: 100 }, { calories: 0, protein: 0 }), proteinHeavy);
check("35 per-dimension weights change the resulting order",
  weighted.candidates[0].candidateId === "protein-rich");

// The overage penalty must be a parameter, not a constant.
const overageInput = input({ calories: 100 }, { calories: 90 });
const forgiving = Object.freeze({
  policyId: "test.forgiving", policyVersion: 1, targetStrategy: "remaining_daily_gap",
  dimensions: [Object.freeze({ dimension: "calories", weight: 1, overagePenaltyWeight: 0 })]
});
const strict = Object.freeze({ ...forgiving, policyId: "test.strict",
  dimensions: [Object.freeze({ dimension: "calories", weight: 1, overagePenaltyWeight: 5 })] });
const big = candidate("big", { calories: 200 });
const small = candidate("small", { calories: 10 });
check("36 the overage penalty is a policy parameter, not a constant",
  ranker.rankNextMealCandidatesByNutrition([big, small], overageInput, forgiving)
    .candidates[0].candidateId === "big"
  && ranker.rankNextMealCandidatesByNutrition([big, small], overageInput, strict)
    .candidates[0].candidateId === "small");

check("37 an invalid policy degrades to the default instead of corrupting ranking",
  policyModule.resolveNutritionRankingPolicy(null).policyId === "tastkind.nutrition.balanced_gap"
  && policyModule.resolveNutritionRankingPolicy({ policyId: "x", policyVersion: 1,
       targetStrategy: "remaining_daily_gap",
       dimensions: [{ dimension: "calories", weight: -1, overagePenaltyWeight: 1 }] })
       .policyId === "tastkind.nutrition.balanced_gap"
  && policyModule.resolveNutritionRankingPolicy({ policyId: "x", policyVersion: 1,
       targetStrategy: "per_meal_allocation", dimensions: [] })
       .policyId === "tastkind.nutrition.balanced_gap");
check("38 a fixed policy, goals, intake and candidate set rank deterministically",
  JSON.stringify(ranker.rankNextMealCandidatesByNutrition([big, small], overageInput, strict))
  === JSON.stringify(ranker.rankNextMealCandidatesByNutrition([big, small], overageInput, strict)));
check("39 the default provider answers with the shipped default policy",
  policyModule.createDefaultNutritionRankingPolicyProvider()
    .getActiveNutritionRankingPolicy().policyId === defaultPolicy.policyId);
// Asserted as an EXACT key set rather than a keyword scan: `nutritionGoalsApplied` is a boolean
// flag, not a goal value, so a keyword scan would reject the correct contract.
check("40 the ranking summary carries policy identity only, never weights, goals or scores",
  JSON.stringify(Object.keys(narrowed.ranking).sort()) === JSON.stringify([
    "appliedPolicyId", "appliedPolicyVersion", "nutritionGoalsApplied",
    "rankingMode", "todayIntakeApplied", "usableNutritionDimensions"
  ])
  && typeof narrowed.ranking.nutritionGoalsApplied === "boolean"
  && typeof narrowed.ranking.todayIntakeApplied === "boolean");

console.log(JSON.stringify({
  status: "passed", suite: "recommendation-rec-a-smoke",
  total: checks.length, passed: checks.filter((item) => item.pass).length,
  failed: checks.filter((item) => !item.pass).length,
  checks, migration: null, networkUsed: false, databaseUsed: false, productionTouched: false
}, null, 2));
