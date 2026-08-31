#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const policyPath = path.join(root,
  "packages/shared/src/domain/candidate-ingredient-avoidance/ingredientAvoidanceContentEligibility.ts");
const repositoryPath = path.join(root,
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts");
const evidencePath = path.join(root,
  "apps/mobile/features/consumer-meals/adapters/supabaseRecommendationIngredientAvoidanceEvidenceReader.ts");
const mapperPath = path.join(root,
  "apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.ts");
const tempRoot = fs.mkdtempSync(path.join(process.platform === "win32" ? os.tmpdir() : "/tmp",
  "recommendation-rec-d-"));

const mutations = Object.freeze({
  conflict_include: [policyPath,
    'return Object.freeze({ state: "known_ingredient_avoidance_conflict", eligible: false });',
    'return Object.freeze({ state: "known_ingredient_avoidance_conflict", eligible: true });'],
  unknown_include: [policyPath,
    'return Object.freeze({ state: "ingredient_avoidance_coverage_unknown", eligible: false });',
    'return Object.freeze({ state: "ingredient_avoidance_coverage_unknown", eligible: true });'],
  partial_include: [policyPath,
    'return Object.freeze({ state: "ingredient_avoidance_coverage_partial", eligible: false });',
    'return Object.freeze({ state: "ingredient_avoidance_coverage_partial", eligible: true });'],
  complete_exclude: [policyPath,
    'state: "complete_no_known_ingredient_avoidance_conflict",\n    eligible: true',
    'state: "complete_no_known_ingredient_avoidance_conflict",\n    eligible: false'],
  unresolved_as_empty: [policyPath,
    'return Object.freeze({ state: "unresolved_governed_avoidance" });',
    'return Object.freeze({ state: "no_active_governed_avoidance" });'],
  unavailable_as_empty: [policyPath,
    'return Object.freeze({ state: "authority_unavailable" });',
    'return Object.freeze({ state: "no_active_governed_avoidance" });'],
  missing_fact_known_absent: [policyPath,
    'if (input.coverageState === "unknown") {',
    'if (input.coverageState === "unknown" && input.knownPresentIngredientAvoidanceKeys.length > 0) {'],
  branch_to_restaurant: [evidencePath,
    'facts.filter((fact) => fact.candidateId === candidate.candidateId)',
    'facts.filter((fact) => fact.restaurantId === candidate.restaurantId)'],
  settings_failure_fallback: [repositoryPath,
    ': { status: "unavailable" });',
    ': { status: "available", ingredientAvoidanceKeys: [], unresolvedSelectionCount: 0 });'],
  evidence_failure_fallback: [repositoryPath,
    'if (authority.status !== "available") {\n        return {\n          status: "read_failed",\n          errorCode: "next_meal_ingredient_avoidance_authority_unavailable"\n        };\n      }',
    'if (authority.status !== "available") {\n        return Object.freeze({ status: "available", candidates, summary: Object.freeze({ status: "not_applied" }) });\n      }'],
  allergy_survivor_bypass: [repositoryPath,
    'this.applyIngredientAvoidanceEligibility(\n        allergyResult.candidates\n      )',
    'this.applyIngredientAvoidanceEligibility(\n        mapped\n      )'],
  eligibility_after_ranking: [repositoryPath,
    'ingredientAvoidanceResult.candidates,\n        input.nutritionRanking,',
    'allergyResult.candidates,\n        input.nutritionRanking,'],
  lane_a_reintroduces_excluded: [repositoryPath,
    'const tasteResult = await this.applyTasteRanking(ranked, input);',
    'const tasteResult = await this.applyTasteRanking({ ...ranked, candidates: mapped }, input);'],
  lane_b_reintroduces_excluded: [repositoryPath,
    'const candidates = tasteResult.candidates.slice(0, outputLimit);',
    'const candidates = [...tasteResult.candidates, ...mapped].slice(0, outputLimit);'],
  entitlement_reorders: [mapperPath,
    'const clipped = Array.from(recommendation.candidates).slice(0, visibleLimit);',
    'const clipped = Array.from(recommendation.candidates).slice(0, visibleLimit).reverse();'],
  raw_private_key_leak: [repositoryPath,
    'policyVersion: policy.policyVersion\n        })',
    'policyVersion: policy.policyVersion, privateIngredientAvoidanceKeys: userState.ingredientAvoidanceKeys\n        })'],
  religious_claim: [mapperPath,
    'isSampleData: true,',
    'isSampleData: true, halalCompliant: true,'],
  legacy_fallback: [repositoryPath,
    'const settings = await this.options.ingredientAvoidanceSettingsReader.loadCurrentUser();',
    'const settings = await this.options.ingredientAvoidanceSettingsReader.loadCurrentUser(); // dietary_restrictions legacy fallback']
});
const mutationName = process.env.RECD_MUTATION ?? "";
const mutation = mutationName ? mutations[mutationName] : undefined;
if (mutationName && !mutation) throw new Error(`Unknown REC-D mutation: ${mutationName}`);
const TARGET_NOT_FOUND = 97;
const compilerOptions = {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true,
  esModuleInterop: true, skipLibCheck: true, outDir: tempRoot, rootDir: root
};
const host = ts.createCompilerHost(compilerOptions); const baseRead = host.readFile.bind(host);
host.readFile = (fileName) => {
  const source = baseRead(fileName);
  if (!source || !mutation || path.normalize(fileName) !== path.normalize(mutation[0])) return source;
  if (!source.includes(mutation[1])) {
    console.error(`RECD_MUTATION_TARGET_NOT_FOUND ${mutationName}`); process.exit(TARGET_NOT_FOUND);
  }
  return source.replace(mutation[1], mutation[2]);
};
const targets = [policyPath, repositoryPath, evidencePath, mapperPath];
const program = ts.createProgram(targets, compilerOptions, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: (file) => file, getCurrentDirectory: () => root, getNewLine: () => "\n"
}));
program.emit();

const requireFromTemp = createRequire(path.join(tempRoot, "scripts", "rec-d-loader.js"));
const authority = requireFromTemp(
  "../packages/shared/src/domain/candidate-ingredient-avoidance/ingredientAvoidanceContentEligibility.js");
const { SupabaseConsumerNextMealRecommendationRepository } = requireFromTemp(
  "../apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.js");
const {
  SupabaseRecommendationIngredientAvoidanceEvidenceReader,
  SUPABASE_CANDIDATE_INGREDIENT_AVOIDANCE_FACTS_VIEW,
  SUPABASE_CANDIDATE_INGREDIENT_AVOIDANCE_COVERAGE_VIEW
} = requireFromTemp(
  "../apps/mobile/features/consumer-meals/adapters/supabaseRecommendationIngredientAvoidanceEvidenceReader.js");
const { mapCanonicalToU1NextMeal } = requireFromTemp(
  "../apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.js");

const source = new Map(targets.map((file) => {
  let value = fs.readFileSync(file, "utf8");
  if (mutation && path.normalize(file) === path.normalize(mutation[0])) {
    value = value.replace(mutation[1], mutation[2]);
  }
  return [file, value];
}));
const checks = [];
const expect = (pass, name, detail) => checks.push({ pass: Boolean(pass), name,
  ...(pass || detail === undefined ? {} : { detail }) });

const policy = authority.DEFAULT_INGREDIENT_AVOIDANCE_CONTENT_ELIGIBILITY_POLICY;
expect(policy.policyId === "tastkind.ingredient_avoidance.content_eligibility"
  && policy.policyVersion === 1, "P01 exact policy identity");
expect(policy.taxonomyId === "tastkind-ingredient-avoidance-v1"
  && policy.taxonomyVersion === 1, "P02 exact frozen taxonomy identity");
expect(authority.isIngredientAvoidanceContentEligibilityPolicy(policy),
  "P03 default policy validates");
expect(policy.knownConflict === "exclude" && policy.unknownCoverage === "exclude"
  && policy.partialCoverage === "exclude" && policy.completeNoKnownConflict === "eligible",
  "P04 exact binary fail-closed decisions");

const resolve = (keys, unresolved = 0) => authority.resolveIngredientAvoidanceUserAuthorityState({
  status: "available", ingredientAvoidanceKeys: keys, unresolvedSelectionCount: unresolved
});
expect(resolve([]).state === "no_active_governed_avoidance",
  "U01 empty governed set is neutral");
expect(resolve(["pork"]).state === "active_governed_avoidance",
  "U02 one exact governed key is active");
expect(resolve(["pork", "beef", "coriander"]).ingredientAvoidanceKeys.length === 3,
  "U03 all three exact governed keys remain active");
expect(resolve([], 1).state === "unresolved_governed_avoidance",
  "U04 unresolved governed settings fail closed");
expect(authority.resolveIngredientAvoidanceUserAuthorityState({ status: "unavailable" }).state
  === "authority_unavailable", "U05 unavailable P1 authority stays explicit");

const evaluate = (facts, coverage, active = ["pork"]) =>
  authority.evaluateIngredientAvoidanceCandidateEligibility({
    activeIngredientAvoidanceKeys: active,
    knownPresentIngredientAvoidanceKeys: facts,
    coverageState: coverage,
    policy
  });
expect(!evaluate(["pork"], "complete").eligible
  && evaluate(["pork"], "complete").state === "known_ingredient_avoidance_conflict",
  "E01 known-present conflict excludes");
expect(!evaluate(["beef", "coriander"], "complete", ["pork", "coriander"]).eligible,
  "E02 any intersection among multiple keys excludes");
expect(evaluate(["beef"], "complete").eligible
  && evaluate(["beef"], "complete").state
    === "complete_no_known_ingredient_avoidance_conflict",
  "E03 complete no-conflict is eligible");
expect(!evaluate([], "unknown").eligible
  && evaluate([], "unknown").state === "ingredient_avoidance_coverage_unknown",
  "E04 unknown is excluded without known-absence inference");
expect(!evaluate(["beef"], "partial").eligible
  && evaluate(["beef"], "partial").state === "ingredient_avoidance_coverage_partial",
  "E05 partial non-conflict does not establish absence");
expect(!/halal|safe|religio|score|rank/i.test(JSON.stringify(evaluate(["beef"], "complete"))),
  "E06 evaluation exposes no claim score or rank");

const rows = [
  candidateRow("branch-a", "branch-a", "menu-shared", 900),
  candidateRow("branch-b", "branch-b", "menu-shared", 100),
  candidateRow("branch-c", "branch-c", "menu-c", 800),
  candidateRow("branch-d", "branch-d", "menu-d", 700),
  candidateRow("branch-e", "branch-e", "menu-e", 600)
];
const evidenceRows = {
  facts: [avoidanceRow(rows[0], { ingredient_avoidance_key: "pork" }),
    avoidanceRow(rows[2], { ingredient_avoidance_key: "coriander" }),
    avoidanceRow(rows[3], { ingredient_avoidance_key: "beef" })],
  coverage: [
    avoidanceRow(rows[0], { coverage_state: "complete" }),
    avoidanceRow(rows[1], { coverage_state: "complete" }),
    avoidanceRow(rows[2], { coverage_state: "complete" }),
    avoidanceRow(rows[3], { coverage_state: "partial" }),
    avoidanceRow(rows[4], { coverage_state: "unknown" })
  ]
};
const reader = new SupabaseRecommendationIngredientAvoidanceEvidenceReader(
  evidenceClient(evidenceRows.facts, evidenceRows.coverage)
);
const evidenceResult = await reader.readForCandidates(rows.map(toCandidate));
expect(evidenceResult.status === "available" && evidenceResult.evidence.length === 5,
  "D01 exact P0 projections resolve all candidate identities");
expect(evidenceResult.status === "available"
  && evidenceResult.evidence.find((entry) => entry.candidateId === "branch-a")
    ?.knownPresentIngredientAvoidanceKeys.includes("pork"),
  "D02 branch A keeps its pork fact");
expect(evidenceResult.status === "available"
  && evidenceResult.evidence.find((entry) => entry.candidateId === "branch-b")
    ?.knownPresentIngredientAvoidanceKeys.length === 0,
  "D03 same-menu branch B does not inherit branch A fact");
expect((await new SupabaseRecommendationIngredientAvoidanceEvidenceReader(
  evidenceClient(evidenceRows.facts, evidenceRows.coverage.slice(0, 4))
).readForCandidates(rows.map(toCandidate))).status === "unavailable",
  "D04 missing coverage fails closed");
expect((await new SupabaseRecommendationIngredientAvoidanceEvidenceReader(
  evidenceClient(evidenceRows.facts, evidenceRows.coverage, true)
).readForCandidates(rows.map(toCandidate))).status === "unavailable",
  "D05 P0 query failure fails closed");
const wrongDomain = evidenceRows.coverage.map((entry, index) => index === 0
  ? { ...entry, fact_domain: "allergen_content" } : entry);
expect((await new SupabaseRecommendationIngredientAvoidanceEvidenceReader(
  evidenceClient(evidenceRows.facts, wrongDomain)
).readForCandidates(rows.map(toCandidate))).status === "unavailable",
  "D06 wrong domain cannot become avoidance evidence");
const wrongIdentity = evidenceRows.coverage.map((entry, index) => index === 0
  ? { ...entry, branch_id: "branch-b" } : entry);
expect((await new SupabaseRecommendationIngredientAvoidanceEvidenceReader(
  evidenceClient(evidenceRows.facts, wrongIdentity)
).readForCandidates(rows.map(toCandidate))).status === "unavailable",
  "D07 branch-offer identity mismatch fails closed");

let evidenceReadCount = 0;
const ingredientSettings = (keys, unresolved = 0, fail = false) => ({
  async loadCurrentUser() {
    return fail ? { ok: false, errorCode: "load_failed" } : { ok: true, value: {
      options: [], selectedIngredientAvoidanceKeys: keys, unresolvedSelectionCount: unresolved
    } };
  }
});
const allergySettings = (keys = []) => ({ async loadCurrentUser() { return { ok: true, value: {
  options: [], selectedAllergenKeys: keys, unresolvedSelectionCount: 0
} }; } });
const injectedEvidence = (status = "available", entries = evidenceResult.evidence) => ({
  async readForCandidates(candidates) { evidenceReadCount += 1;
    const ids = new Set(candidates.map((candidate) => candidate.candidateId));
    return status === "available"
      ? { status, evidence: entries.filter((entry) => ids.has(entry.candidateId)) }
      : { status: "unavailable" }; }
});
const allergyEvidence = (entries) => ({ async readForCandidates(candidates) {
  return { status: "available", evidence: entries ?? candidates.map((candidate) => ({
    candidateId: candidate.candidateId, knownPresentAllergenKeys: [], coverageState: "complete"
  })) };
} });
const runRepository = async ({ keys = [], unresolved = 0, settingsFail = false,
  evidenceStatus = "available", entries = evidenceResult.evidence, policyProvider,
  geo = false, allergyKeys = [], allergyEntries } = {}) => {
  const repository = new SupabaseConsumerNextMealRecommendationRepository({
    authPort: authPort(), restaurantMenuClient: candidateClient(rows),
    allergySettingsReader: allergySettings(allergyKeys),
    allergyEvidenceReader: allergyEvidence(allergyEntries),
    ingredientAvoidanceSettingsReader: ingredientSettings(keys, unresolved, settingsFail),
    ingredientAvoidanceEvidenceReader: injectedEvidence(evidenceStatus, entries),
    ...(policyProvider ? { ingredientAvoidanceEligibilityPolicyProvider: policyProvider } : {})
  });
  return repository.getRankedNextMealCandidates({ nutritionRanking: null,
    ...(geo ? { currentLocation: { latitude: 25.03, longitude: 121.56 } } : {}) });
};

evidenceReadCount = 0;
const neutral = await runRepository();
expect(neutral.status === "available"
  && neutral.candidates.map((entry) => entry.candidateId).join(",")
    === rows.map((entry) => entry.candidate_id).join(","),
  "R01 no-active REC-D preserves exact prior order");
expect(evidenceReadCount === 0 && neutral.ingredientAvoidanceEligibility.status === "not_applied",
  "R02 no-active REC-D skips P0 evidence entirely");
const active = await runRepository({ keys: ["pork"] });
expect(active.status === "available"
  && active.candidates.map((entry) => entry.candidateId).join(",") === "branch-b,branch-c",
  "R03 conflict partial and unknown are excluded before ranking");
expect(active.status === "available" && active.totalCandidateCount === 2
  && active.ingredientAvoidanceEligibility.policyId
    === "tastkind.ingredient_avoidance.content_eligibility",
  "R04 count and coarse policy identity describe survivors only");
expect((await runRepository({ keys: ["pork"], unresolved: 1 })).errorCode
  === "next_meal_ingredient_avoidance_unresolved_governed_avoidance",
  "R05 unresolved P1 settings fail closed");
expect((await runRepository({ settingsFail: true })).errorCode
  === "next_meal_ingredient_avoidance_authority_unavailable",
  "R06 unavailable P1 reader is not treated as empty settings");
expect((await runRepository({ keys: ["pork"], evidenceStatus: "unavailable" })).errorCode
  === "next_meal_ingredient_avoidance_authority_unavailable",
  "R07 unavailable P0 authority does not run ranking");
expect((await runRepository({ keys: ["pork"], policyProvider: {
  getActiveIngredientAvoidanceContentEligibilityPolicy() { throw new Error("policy"); }
} })).errorCode === "next_meal_ingredient_avoidance_authority_unavailable",
  "R08 policy authority failure fails closed");
expect((await runRepository({ keys: ["pork"], entries: [] })).errorCode
  === "next_meal_ingredient_avoidance_authority_unavailable",
  "R09 incomplete evidence set fails closed");
const geoActive = await runRepository({ keys: ["pork"], geo: true });
expect(geoActive.status === "available"
  && geoActive.candidates.map((entry) => entry.candidateId).join(",") === "branch-b,branch-c",
  "R10 GEO candidates pass through the same REC-D gate");
const empty = await runRepository({ keys: ["pork"], entries: evidenceResult.evidence.map((entry) => ({
  ...entry, knownPresentIngredientAvoidanceKeys: ["pork"], coverageState: "complete"
})) });
expect(empty.status === "empty" && empty.reason === "ingredient_avoidance_eligibility",
  "R11 zero REC-D survivors remains an applied empty result");
const allergyEntries = rows.map((row) => ({ candidateId: row.candidate_id,
  knownPresentAllergenKeys: row.candidate_id === "branch-b" ? ["peanut"] : [],
  coverageState: "complete" }));
const combined = await runRepository({ keys: ["pork"], allergyKeys: ["peanut"], allergyEntries });
expect(combined.status === "available"
  && combined.candidates.map((entry) => entry.candidateId).join(",") === "branch-c",
  "R12 REC-D receives only earlier REC-C Allergy survivors");
expect(active.status === "available" && !JSON.stringify(active).match(/"pork"|"beef"|"coriander"/),
  "R13 recommendation result leaks no private selected keys or facts");

const availableResult = active.status === "available" ? { status: "available", recommendation: {
  candidates: active.candidates, totalCandidateCount: active.totalCandidateCount,
  source: "supabase", dataProvenance: "live", context: {
    date: "2026-08-31", timezone: "Asia/Taipei", generatedAt: "2026-08-31T00:00:00Z",
    rankingMode: active.ranking.rankingMode, nutritionGoalsApplied: false,
    todayIntakeApplied: false, usableNutritionDimensions: [],
    appliedPolicyId: active.ranking.appliedPolicyId,
    appliedPolicyVersion: active.ranking.appliedPolicyVersion,
    tasteRankingStatus: "unavailable", plannedMealCount: 0, plannedMealsAvailable: true,
    plannedMealsAppliedToRanking: false, geoStatus: "not_requested", geoApplied: false,
    allergyEligibilityStatus: "not_applied",
    ingredientAvoidanceEligibilityStatus: "applied",
    appliedIngredientAvoidancePolicyId: active.ingredientAvoidanceEligibility.policyId,
    appliedIngredientAvoidancePolicyVersion: active.ingredientAvoidanceEligibility.policyVersion
  }
} } : null;
const presentation = mapCanonicalToU1NextMeal(availableResult, "free", 1);
expect(presentation.status === "success" && presentation.recommendation.candidates.length === 1
  && presentation.recommendation.candidates[0].prototypeId === "branch-b",
  "X01 entitlement clips only the post-filter order");
expect(presentation.status === "success" && /我不吃的食物/.test(presentation.recommendation.contextNote)
  && !/清真|宗教|安全|保證|halal/i.test(presentation.recommendation.contextNote),
  "X02 applied explanation is coarse and truthful");
expect(mapCanonicalToU1NextMeal({ status: "empty", source: "supabase", date: "2026-08-31",
  geoStatus: "applied", reason: "ingredient_avoidance_eligibility" }, "free", 1)
  .message.includes("我不吃的食物"), "X03 REC-D empty copy does not widen GEO");
expect(mapCanonicalToU1NextMeal({ status: "read_failed", source: "supabase",
  errorCode: "next_meal_ingredient_avoidance_unresolved_governed_avoidance" }, "free", 1)
  .message.includes("個人設定"), "X04 unresolved copy points to the existing settings surface");
expect(mapCanonicalToU1NextMeal({ status: "read_failed", source: "supabase",
  errorCode: "next_meal_ingredient_avoidance_authority_unavailable" }, "free", 1).retryable,
  "X05 unavailable authority is retryable and not an empty result");

const repositorySource = source.get(repositoryPath); const mapperSource = source.get(mapperPath);
expect(repositorySource.indexOf("applyAllergyEligibility(mapped)")
  < repositorySource.indexOf("applyIngredientAvoidanceEligibility("),
  "O01 REC-C Allergy remains earlier than REC-D");
expect(repositorySource.indexOf("applyIngredientAvoidanceEligibility(")
  < repositorySource.indexOf("rankNextMealCandidatesByNutrition("),
  "O02 REC-D remains before REC-A ranking");
expect(repositorySource.indexOf("rankNextMealCandidatesByNutrition(")
  < repositorySource.indexOf("this.applyTasteRanking(ranked, input)"),
  "O03 REC-A remains before REC-B Taste");
expect(mapperSource.includes("slice(0, visibleLimit)")
  && !mapperSource.includes(".slice(0, visibleLimit).reverse()"),
  "O04 entitlement remains a prefix");
expect(!/dietary_restrictions|restriction_type|legacy fallback|menu.?name|cuisine|keyword/i
  .test(repositorySource), "V01 no legacy or inferred evidence fallback");
expect(!/privateIngredientAvoidanceKeys|halalCompliant|religiousCompliance|avoidanceSafe/i
  .test(repositorySource + mapperSource), "V02 no private-key or compliance output");

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  suite: "recommendation-rec-d-smoke", status: failed.length ? "failed" : "passed",
  mutation: mutationName || null, total: checks.length,
  passed: checks.length - failed.length, failed: failed.length,
  failures: failed.map((entry) => ({ name: entry.name, detail: entry.detail })),
  networkUsed: false, databaseUsed: false, developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);

function candidateRow(candidateId, branchId, menuItemId, calories) {
  return { candidate_id: candidateId, restaurant_id: "restaurant-1", branch_id: branchId,
    menu_item_id: menuItemId, meal_name: candidateId, restaurant_name: "Restaurant",
    branch_name: branchId, district: "Da'an", public_image_url: null, calories,
    protein: 10, carbohydrates: 20, fat: 5, fiber: 2,
    nutrition_source_public: "restaurant_verified",
    nutrition_updated_at: "2026-08-31T00:00:00Z", availability: "available" };
}
function toCandidate(row, index) {
  return { candidateId: row.candidate_id, branchMenuItemId: row.candidate_id,
    menuItemId: row.menu_item_id, restaurantId: row.restaurant_id, branchId: row.branch_id,
    mealName: row.meal_name, restaurantName: row.restaurant_name,
    nutrition: { calories: row.calories }, tags: [],
    reason: { reasonSummary: "", reasonBasis: "neutral_nutrition_fallback",
      reasonCode: "neutral_nutrition_fallback", detailSummaries: [] }, rankOrdinal: index };
}
function avoidanceRow(row, patch) {
  return { candidate_id: row.candidate_id, restaurant_id: row.restaurant_id,
    branch_id: row.branch_id, menu_item_id: row.menu_item_id,
    taxonomy_id: "tastkind-ingredient-avoidance-v1", taxonomy_version: 1,
    fact_domain: "ingredient_avoidance_content", ...patch };
}
function evidenceClient(facts, coverage, fail = false) {
  return { from(view) { const data = view === SUPABASE_CANDIDATE_INGREDIENT_AVOIDANCE_FACTS_VIEW
    ? facts : view === SUPABASE_CANDIDATE_INGREDIENT_AVOIDANCE_COVERAGE_VIEW ? coverage : [];
    return { select() { return { in: async () => ({ data: fail ? null : data,
      error: fail ? { message: "failed" } : null }) }; } }; } };
}
function authPort() {
  return { async getCurrentSession() { return { ok: true, value: { accessToken: "test" } }; } };
}
function candidateClient(candidateRows) {
  return { from() { return { select() { return { order() { return {
    async range(from, to) { return { data: candidateRows.slice(from, to + 1), error: null }; }
  }; } }; } }; }, functions: { async invoke() { return { data: {
    version: "next-meal-geo-v1", status: "available",
    geoCandidateCount: candidateRows.length, candidates: candidateRows
  }, error: null }; } } };
}
