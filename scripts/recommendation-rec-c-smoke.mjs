#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const sharedPath = path.join(root, "packages/shared/src/domain/candidate-allergen/allergyContentEligibility.ts");
const repositoryPath = path.join(root,
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts");
const evidencePath = path.join(root,
  "apps/mobile/features/consumer-meals/adapters/supabaseRecommendationAllergyEvidenceReader.ts");
const mapperPath = path.join(root,
  "apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.ts");
const tempRoot = fs.mkdtempSync(path.join(
  process.platform === "win32" ? os.tmpdir() : "/tmp",
  "recommendation-rec-c-"
));

const mutations = Object.freeze({
  conflict_include: [sharedPath,
    'return Object.freeze({ state: "known_allergen_conflict", eligible: false });',
    'return Object.freeze({ state: "known_allergen_conflict", eligible: true });'],
  unknown_include: [sharedPath,
    'return Object.freeze({ state: "allergen_coverage_unknown", eligible: false });',
    'return Object.freeze({ state: "allergen_coverage_unknown", eligible: true });'],
  partial_include: [sharedPath,
    'return Object.freeze({ state: "allergen_coverage_partial", eligible: false });',
    'return Object.freeze({ state: "allergen_coverage_partial", eligible: true });'],
  unresolved_as_empty: [sharedPath,
    'return Object.freeze({ state: "unresolved_user_allergy" });',
    'return Object.freeze({ state: "no_active_allergies" });'],
  missing_fact_known_absent: [sharedPath,
    'if (input.coverageState === "unknown") {',
    'if (input.coverageState === "unknown" && input.knownPresentAllergenKeys.length > 0) {'],
  branch_to_restaurant: [evidencePath,
    'facts.filter((fact) => fact.candidateId === candidate.candidateId)',
    'facts.filter((fact) => fact.restaurantId === candidate.restaurantId)'],
  reader_failure_fallback: [repositoryPath,
    'if (!settings.ok) {\n        return { status: "read_failed", errorCode: "next_meal_allergy_authority_unavailable" };\n      }',
    'if (!settings.ok) {\n        return Object.freeze({ status: "available", candidates, summary: Object.freeze({ status: "not_applied" }) });\n      }'],
  eligibility_after_ranking: [repositoryPath,
    'ingredientAvoidanceResult.candidates,\n        input.nutritionRanking,',
    'mapped,\n        input.nutritionRanking,'],
  lane_a_reintroduces_conflict: [repositoryPath,
    'const tasteResult = await this.applyTasteRanking(ranked, input);',
    'const tasteResult = await this.applyTasteRanking({ ...ranked, candidates: mapped }, input);'],
  lane_b_reintroduces_conflict: [repositoryPath,
    'const candidates = tasteResult.candidates.slice(0, outputLimit);',
    'const candidates = [...tasteResult.candidates, ...mapped].slice(0, outputLimit);'],
  entitlement_before_allergy: [mapperPath,
    'const clipped = Array.from(recommendation.candidates).slice(0, visibleLimit);',
    'const clipped = Array.from(recommendation.candidates).slice(0, visibleLimit).reverse();'],
  social_restriction_fallback: [repositoryPath,
    'const settings = await this.options.allergySettingsReader.loadCurrentUser();',
    'const settings = await this.options.allergySettingsReader.loadCurrentUser(); // dietary_restrictions social fallback'],
  raw_private_allergy_leak: [repositoryPath,
    'policyVersion: policy.policyVersion',
    'policyVersion: policy.policyVersion, privateAllergyKeys: userState.allergenKeys'],
  safe_flag_introduced: [mapperPath,
    'isSampleData: true,',
    'isSampleData: true, allergySafe: true,']
});
const mutationName = process.env.RECC_MUTATION ?? "";
const mutation = mutationName ? mutations[mutationName] : undefined;
if (mutationName && !mutation) throw new Error(`Unknown REC-C mutation: ${mutationName}`);
const TARGET_NOT_FOUND = 97;
const compilerOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
  strict: true,
  esModuleInterop: true,
  skipLibCheck: true,
  outDir: tempRoot,
  rootDir: root
};
const host = ts.createCompilerHost(compilerOptions);
const baseRead = host.readFile.bind(host);
host.readFile = (fileName) => {
  const source = baseRead(fileName);
  if (!source || !mutation || path.normalize(fileName) !== path.normalize(mutation[0])) return source;
  if (!source.includes(mutation[1])) {
    console.error(`RECC_MUTATION_TARGET_NOT_FOUND ${mutationName}`);
    process.exit(TARGET_NOT_FOUND);
  }
  return source.replace(mutation[1], mutation[2]);
};
const targets = [sharedPath, repositoryPath, evidencePath, mapperPath];
const program = ts.createProgram(targets, compilerOptions, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n"
  }));
}
program.emit();

const requireFromTemp = createRequire(path.join(tempRoot, "scripts", "rec-c-loader.js"));
const authority = requireFromTemp("../packages/shared/src/domain/candidate-allergen/allergyContentEligibility.js");
const { SupabaseConsumerNextMealRecommendationRepository } =
  requireFromTemp("../apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.js");
const {
  SupabaseRecommendationAllergyEvidenceReader,
  SUPABASE_CANDIDATE_ALLERGEN_FACTS_VIEW,
  SUPABASE_CANDIDATE_ALLERGEN_COVERAGE_VIEW
} = requireFromTemp("../apps/mobile/features/consumer-meals/adapters/supabaseRecommendationAllergyEvidenceReader.js");
const { mapCanonicalToU1NextMeal } =
  requireFromTemp("../apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.js");

const source = new Map(targets.map((file) => {
  let value = fs.readFileSync(file, "utf8");
  if (mutation && path.normalize(file) === path.normalize(mutation[0])) {
    value = value.replace(mutation[1], mutation[2]);
  }
  return [file, value];
}));
const checks = [];
const expect = (pass, name, detail) =>
  checks.push({ pass: Boolean(pass), name, ...(pass || detail === undefined ? {} : { detail }) });

const policy = authority.DEFAULT_ALLERGY_CONTENT_ELIGIBILITY_POLICY;
expect(policy.policyId === "tastkind.allergy.content_eligibility" && policy.policyVersion === 1,
  "P01 exact policy identity");
expect(policy.taxonomyId === "tastkind-allergen-tw-v1" && policy.taxonomyVersion === 1,
  "P02 exact frozen taxonomy identity");
expect(authority.isAllergyContentEligibilityPolicy(policy), "P03 default policy validates");
expect(policy.knownConflict === "exclude" && policy.unknownCoverage === "exclude"
  && policy.partialCoverage === "exclude" && policy.completeNoKnownConflict === "eligible",
  "P04 exact fail-closed decisions");

expect(authority.resolveAllergyUserState({ allergenKeys: [], unresolvedSelectionCount: 0 }).state
  === "no_active_allergies", "U01 empty governed set is no-active");
expect(authority.resolveAllergyUserState({ allergenKeys: ["peanut"], unresolvedSelectionCount: 0 }).state
  === "active_allergies", "U02 one mapped Allergy is active");
expect(authority.resolveAllergyUserState({
  allergenKeys: ["peanut", "soy"], unresolvedSelectionCount: 0
}).allergenKeys.length === 2, "U03 multiple mapped Allergies remain active");
expect(authority.resolveAllergyUserState({
  allergenKeys: [], unresolvedSelectionCount: 1
}).state === "unresolved_user_allergy", "U04 unresolved settings fail closed");

const evaluate = (knownPresentAllergenKeys, coverageState, activeAllergenKeys = ["peanut"]) =>
  authority.evaluateAllergyCandidateEligibility({
    activeAllergenKeys, knownPresentAllergenKeys, coverageState, policy
  });
expect(evaluate(["peanut"], "complete").state === "known_allergen_conflict"
  && !evaluate(["peanut"], "complete").eligible, "E01 peanut conflict is excluded");
expect(evaluate(["soy", "peanut"], "complete", ["egg", "peanut"]).state
  === "known_allergen_conflict", "E02 one intersection among multiple facts excludes");
expect(evaluate(["soy"], "complete").state === "complete_no_known_conflict"
  && evaluate(["soy"], "complete").eligible, "E03 complete with no intersection is eligible");
expect(evaluate([], "unknown").state === "allergen_coverage_unknown"
  && !evaluate([], "unknown").eligible, "E04 unknown is excluded without treating absence as known");
expect(evaluate(["soy"], "partial").state === "allergen_coverage_partial"
  && !evaluate(["soy"], "partial").eligible, "E05 partial non-conflicting facts do not prove absence");
expect(!JSON.stringify(evaluate(["soy"], "complete")).match(/safe|allergen.?free/i),
  "E06 evaluation has no safety or allergen-free claim");

const rows = [
  candidateRow("branch-a", "branch-a", "menu-shared", 900),
  candidateRow("branch-b", "branch-b", "menu-shared", 100),
  candidateRow("branch-c", "branch-c", "menu-c", 800),
  candidateRow("branch-d", "branch-d", "menu-d", 700)
];
const evidenceRows = {
  facts: [allergenRow(rows[0], { allergen_key: "peanut" }), allergenRow(rows[2], { allergen_key: "soy" })],
  coverage: [
    allergenRow(rows[0], { coverage_state: "complete" }),
    allergenRow(rows[1], { coverage_state: "complete" }),
    allergenRow(rows[2], { coverage_state: "partial" }),
    allergenRow(rows[3], { coverage_state: "unknown" })
  ]
};
const evidenceReader = new SupabaseRecommendationAllergyEvidenceReader(
  evidenceClient(evidenceRows.facts, evidenceRows.coverage)
);
const evidenceResult = await evidenceReader.readForCandidates(rows.map(toCandidate));
expect(evidenceResult.status === "available" && evidenceResult.evidence.length === 4,
  "D01 P0 fact and coverage views resolve all candidate identities");
expect(evidenceResult.status === "available"
  && evidenceResult.evidence.find((entry) => entry.candidateId === "branch-a")
    ?.knownPresentAllergenKeys.includes("peanut"), "D02 branch A keeps its peanut fact");
expect(evidenceResult.status === "available"
  && evidenceResult.evidence.find((entry) => entry.candidateId === "branch-b")
    ?.knownPresentAllergenKeys.length === 0, "D03 same-menu branch B does not inherit branch A facts");
expect((await new SupabaseRecommendationAllergyEvidenceReader(
  evidenceClient(evidenceRows.facts, evidenceRows.coverage.slice(0, 3))
).readForCandidates(rows.map(toCandidate))).status === "unavailable",
  "D04 missing coverage fails closed");
expect((await new SupabaseRecommendationAllergyEvidenceReader(
  evidenceClient(evidenceRows.facts, evidenceRows.coverage, true)
).readForCandidates(rows.map(toCandidate))).status === "unavailable",
  "D05 P0 query failure fails closed");

let evidenceReadCount = 0;
const settingsReader = (keys, unresolved = 0, fail = false) => ({
  async loadCurrentUser() {
    return fail ? { ok: false, errorCode: "load_failed" } : {
      ok: true,
      value: { options: [], selectedAllergenKeys: keys, unresolvedSelectionCount: unresolved }
    };
  }
});
const injectedEvidence = (status = "available", entries = evidenceResult.evidence) => ({
  async readForCandidates() {
    evidenceReadCount += 1;
    return status === "available" ? { status, evidence: entries } : { status: "unavailable" };
  }
});
const runRepository = async ({
  keys = [], unresolved = 0, settingsFail = false, evidenceStatus = "available",
  entries = evidenceResult.evidence, policyProvider, geo = false
} = {}) => {
  const repository = new SupabaseConsumerNextMealRecommendationRepository({
    authPort: authPort(),
    restaurantMenuClient: candidateClient(rows),
    allergySettingsReader: settingsReader(keys, unresolved, settingsFail),
    ingredientAvoidanceSettingsReader: {
      loadCurrentUser: async () => ({
        ok: true,
        value: { options: [], selectedIngredientAvoidanceKeys: [], unresolvedSelectionCount: 0 }
      })
    },
    allergyEvidenceReader: injectedEvidence(evidenceStatus, entries),
    ...(policyProvider ? { allergyEligibilityPolicyProvider: policyProvider } : {})
  });
  return repository.getRankedNextMealCandidates({
    nutritionRanking: null,
    ...(geo ? { currentLocation: { latitude: 25.03, longitude: 121.56 } } : {})
  });
};

evidenceReadCount = 0;
const neutral = await runRepository();
expect(neutral.status === "available"
  && JSON.stringify(neutral.candidates.map((entry) => entry.candidateId))
    === JSON.stringify(rows.map((entry) => entry.candidate_id)),
  "R01 no-active Allergy preserves exact REC-B order");
expect(evidenceReadCount === 0 && neutral.allergyEligibility.status === "not_applied",
  "R02 no-active Allergy is neutral and skips P0 reads");
const active = await runRepository({ keys: ["peanut"] });
expect(active.status === "available"
  && JSON.stringify(active.candidates.map((entry) => entry.candidateId)) === JSON.stringify(["branch-b"]),
  "R03 conflict, partial, and unknown are removed before ranking");
expect(active.status === "available" && active.totalCandidateCount === 1
  && active.allergyEligibility.policyId === "tastkind.allergy.content_eligibility",
  "R04 ranking count and policy identity describe only survivors");
expect((await runRepository({ keys: ["peanut"], unresolved: 1 })).errorCode
  === "next_meal_allergy_unresolved_user_allergy", "R05 unresolved settings do not run REC-B");
expect((await runRepository({ settingsFail: true })).errorCode
  === "next_meal_allergy_authority_unavailable", "R06 P1 reader failure does not run REC-B");
expect((await runRepository({ keys: ["peanut"], evidenceStatus: "unavailable" })).errorCode
  === "next_meal_allergy_authority_unavailable", "R07 P0 fact/coverage failure does not run REC-B");
expect((await runRepository({
  keys: ["peanut"], policyProvider: { getActiveAllergyContentEligibilityPolicy() { throw new Error(); } }
})).errorCode === "next_meal_allergy_authority_unavailable", "R08 policy failure does not run REC-B");
expect((await runRepository({ keys: ["peanut"], entries: [] })).errorCode
  === "next_meal_allergy_authority_unavailable", "R09 incomplete evidence set fails closed");
const geoActive = await runRepository({ keys: ["peanut"], geo: true });
expect(geoActive.status === "available"
  && geoActive.candidates.map((entry) => entry.candidateId).join(",") === "branch-b",
  "R10 GEO candidates pass through the same pre-ranking Allergy gate");

const empty = await runRepository({
  keys: ["peanut"],
  entries: evidenceResult.evidence.map((entry) => ({
    ...entry, knownPresentAllergenKeys: ["peanut"], coverageState: "complete"
  }))
});
expect(empty.status === "empty" && empty.reason === "allergy_eligibility",
  "X01 zero eligible candidates remains an Allergy empty result");
const availableResult = active.status === "available" ? {
  status: "available",
  recommendation: {
    candidates: active.candidates,
    totalCandidateCount: active.totalCandidateCount,
    source: "supabase",
    dataProvenance: "live",
    context: {
      date: "2026-08-29", timezone: "Asia/Taipei", generatedAt: "2026-08-29T00:00:00Z",
      rankingMode: active.ranking.rankingMode,
      nutritionGoalsApplied: false, todayIntakeApplied: false, usableNutritionDimensions: [],
      appliedPolicyId: active.ranking.appliedPolicyId,
      appliedPolicyVersion: active.ranking.appliedPolicyVersion,
      tasteRankingStatus: "unavailable", plannedMealCount: 0, plannedMealsAvailable: true,
      plannedMealsAppliedToRanking: false, geoStatus: "not_requested", geoApplied: false,
      allergyEligibilityStatus: "applied",
      appliedAllergyPolicyId: active.allergyEligibility.policyId,
      appliedAllergyPolicyVersion: active.allergyEligibility.policyVersion
    }
  }
} : null;
const presentation = mapCanonicalToU1NextMeal(availableResult, "free", 1);
expect(presentation.status === "success" && presentation.recommendation.candidates.length === 1
  && presentation.recommendation.candidates[0].prototypeId === "branch-b",
  "X02 entitlement clips only the post-filter order");
expect(presentation.status === "success" && /交叉接觸/.test(presentation.recommendation.contextNote)
  && !/安全|allergen.?free/i.test(presentation.recommendation.contextNote),
  "X03 surviving-card notice is coarse and carries cross-contact caution");
expect(mapCanonicalToU1NextMeal({
  status: "empty", source: "supabase", date: "2026-08-29",
  geoStatus: "applied", reason: "allergy_eligibility"
}, "free", 1).message.includes("交叉接觸"), "X04 Allergy empty copy does not widen GEO");
expect(mapCanonicalToU1NextMeal({
  status: "read_failed", source: "supabase",
  errorCode: "next_meal_allergy_unresolved_user_allergy"
}, "free", 1).message.includes("個人設定 → 飲食限制 → 過敏原"),
  "X05 unresolved copy points to the frozen settings path");

const repositorySource = source.get(repositoryPath);
const mapperSource = source.get(mapperPath);
expect(repositorySource.indexOf("applyAllergyEligibility(mapped)")
  < repositorySource.indexOf("rankNextMealCandidatesByNutrition("),
  "O01 Allergy filtering is before REC-A ranking");
expect(repositorySource.indexOf("rankNextMealCandidatesByNutrition(")
  < repositorySource.indexOf("this.applyTasteRanking(ranked, input)"),
  "O02 REC-A remains before REC-B Taste composition");
expect(mapperSource.includes("slice(0, visibleLimit)") && !mapperSource.includes(".slice(0, visibleLimit).reverse()"),
  "O03 entitlement is a prefix of post-filter order");
expect(!/dietary_restrictions|restriction_type|severity|social fallback/i.test(repositorySource),
  "V01 runtime has no legacy, severity, or Social fallback");
expect(!/privateAllergyKeys|allergySafe|allergenFree|allergen_free/.test(repositorySource + mapperSource),
  "V02 output exposes no private Allergy array or safety flag");
expect(!JSON.stringify(active).includes("peanut"), "V03 recommendation result leaks no active Allergy keys");

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  suite: "recommendation-rec-c-smoke",
  status: failed.length ? "failed" : "passed",
  mutation: mutationName || null,
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  failures: failed.map((entry) => ({ name: entry.name, detail: entry.detail })),
  networkUsed: false,
  databaseUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);

function candidateRow(candidateId, branchId, menuItemId, calories) {
  return {
    candidate_id: candidateId, restaurant_id: "restaurant-1", branch_id: branchId,
    menu_item_id: menuItemId, meal_name: candidateId, restaurant_name: "Restaurant",
    branch_name: branchId, district: "Da'an", public_image_url: null, calories,
    protein: 10, carbohydrates: 20, fat: 5, fiber: 2,
    nutrition_source_public: "restaurant_verified",
    nutrition_updated_at: "2026-08-29T00:00:00Z", availability: "available"
  };
}
function toCandidate(row, index) {
  return {
    candidateId: row.candidate_id, branchMenuItemId: row.candidate_id,
    menuItemId: row.menu_item_id, restaurantId: row.restaurant_id, branchId: row.branch_id,
    mealName: row.meal_name, restaurantName: row.restaurant_name,
    nutrition: { calories: row.calories }, tags: [],
    reason: { reasonSummary: "", reasonBasis: "neutral_nutrition_fallback",
      reasonCode: "neutral_nutrition_fallback", detailSummaries: [] },
    rankOrdinal: index
  };
}
function allergenRow(row, patch) {
  return {
    candidate_id: row.candidate_id, restaurant_id: row.restaurant_id,
    branch_id: row.branch_id, menu_item_id: row.menu_item_id,
    taxonomy_id: "tastkind-allergen-tw-v1", taxonomy_version: 1,
    fact_domain: "allergen_content", ...patch
  };
}
function evidenceClient(facts, coverage, fail = false) {
  return {
    from(view) {
      const data = view === SUPABASE_CANDIDATE_ALLERGEN_FACTS_VIEW ? facts
        : view === SUPABASE_CANDIDATE_ALLERGEN_COVERAGE_VIEW ? coverage : [];
      return { select() { return { in: async () => ({
        data: fail ? null : data, error: fail ? { message: "failed" } : null
      }) }; } };
    }
  };
}
function authPort() {
  return { async getCurrentSession() { return { ok: true, value: { accessToken: "test" } }; } };
}
function candidateClient(candidateRows) {
  return {
    from() {
      return { select() { return { order() { return {
        async range(from, to) { return { data: candidateRows.slice(from, to + 1), error: null }; }
      }; } }; } };
    },
    functions: {
      async invoke() {
        return { data: {
          version: "next-meal-geo-v1", status: "available",
          geoCandidateCount: candidateRows.length, candidates: candidateRows
        }, error: null };
      }
    }
  };
}
