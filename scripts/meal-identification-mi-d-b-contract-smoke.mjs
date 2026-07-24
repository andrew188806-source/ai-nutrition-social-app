#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const contractPath = "apps/mobile/features/meal-identification/finalizationContract.ts";
const adapterPath = "apps/mobile/features/analysis/mealIdentificationFinalizationAdapter.ts";

function loadCommonJs(relativePath, dependency) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relativePath), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, {
    filename: path.join(root, relativePath)
  })(
    (request) => {
      if (request === "../meal-identification") return dependency;
      throw new Error(`MI-D-B smoke refused runtime dependency: ${request}`);
    },
    module,
    module.exports
  );
  return module.exports;
}

const contract = loadCommonJs(contractPath, {});
const {
  buildAnalysisMealIdentificationFinalizationDraft,
  mapMealIdentificationFinalizationUiError
} = loadCommonJs(adapterPath, contract);
const screen = fs.readFileSync(path.join(root, "apps/mobile/app/analysis.tsx"), "utf8");
const runtimeProvider = fs.readFileSync(
  path.join(root, "apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx"),
  "utf8"
);
const i18n = fs.readFileSync(path.join(root, "lib/i18n/zh-TW.ts"), "utf8");
const checks = [];

function expect(condition, name) {
  if (!condition) throw new Error(`FAIL ${name}`);
  checks.push(name);
  console.log(`PASS ${name}`);
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function nullIdentity() {
  return {
    restaurantId: null,
    branchId: null,
    menuId: null,
    menuCategoryId: null,
    menuItemId: null,
    branchMenuItemId: null
  };
}

const candidate = {
  kind: "catalog_item",
  identity: {
    restaurantId: "restaurant-1",
    branchId: "branch-1",
    menuId: "menu-1",
    menuCategoryId: "category-1",
    menuItemId: "item-1",
    branchMenuItemId: "branch-item-1"
  },
  source: "supabase",
  restaurantName: "好初健康碗",
  branchName: "信義店",
  branchContext: "信義區",
  menuName: "午餐",
  menuCategoryName: "健康碗",
  mealItemName: "雞胸碗",
  price: 180,
  availability: "available",
  nutritionProvenance: "restaurant_confirmed",
  confidence: 0.9,
  matchReason: "catalog_match",
  tags: ["高蛋白"]
};
const base = {
  selectedMealPeriod: "午餐（第二餐）",
  restaurantName: "好初健康碗",
  mealName: "雞胸碗",
  sourceContext: "dine_in",
  selectedCandidate: candidate,
  catalogConfirmed: true,
  isSelfCooked: false,
  nutritionSummary: {
    calories: 520,
    protein: 38,
    carbohydrates: 54,
    fat: 14,
    portion: "1 份",
    ingredientSummary: "雞胸、糙米",
    balanceScore: 82
  },
  nutritionRefreshed: false,
  correctionCompleted: false,
  correctedRows: {},
  preMealPhotoIds: ["pre-photo-1"],
  analysisAvailability: "available",
  observedAt: "2026-07-24T04:00:00.000Z"
};

const confirmed = buildAnalysisMealIdentificationFinalizationDraft(base);
expect(confirmed.ok, "confirmed adapter input succeeds");
expect(confirmed.value.mealType === "lunch", "localized meal period maps to canonical meal type");
expect(
  JSON.stringify(confirmed.value.finalization.selection.identity) ===
    JSON.stringify(candidate.identity),
  "confirmed flow preserves all six Catalog IDs verbatim"
);
expect(
  confirmed.value.finalization.selection.candidateSnapshot ===
    confirmed.value.finalization.selection.candidateSnapshot &&
    JSON.stringify(confirmed.value.finalization.selection.candidateSnapshot) ===
      JSON.stringify(candidate),
  "confirmed flow preserves the complete candidate snapshot"
);
expect(
  confirmed.value.finalization.originalAnalysis.model === null &&
    confirmed.value.finalization.originalAnalysis.confidence === null &&
    confirmed.value.finalization.originalAnalysis.photoReferences[0] === "pre-photo-1",
  "available analysis preserves real photo reference without fake provenance"
);

const incomplete = clone(base);
delete incomplete.selectedCandidate.identity.branchMenuItemId;
expect(
  !buildAnalysisMealIdentificationFinalizationDraft(incomplete).ok,
  "incomplete confirmed Catalog identity fails before runtime"
);
const pending = clone(base);
pending.catalogConfirmed = false;
expect(
  !buildAnalysisMealIdentificationFinalizationDraft(pending).ok,
  "unconfirmed Catalog candidate fails before runtime"
);

for (const reason of [
  "manual",
  "self_cooked",
  "none_of_the_above",
  "catalog_unavailable"
]) {
  const unresolved = clone(base);
  unresolved.selectedCandidate = {
    kind: "personal_unresolved",
    identity: nullIdentity(),
    source: reason,
    restaurantName: reason === "self_cooked" ? "" : "私人輸入",
    mealItemName: "自訂餐點"
  };
  unresolved.sourceContext = reason === "self_cooked" ? "self_cooked" : "unknown";
  unresolved.isSelfCooked = reason === "self_cooked";
  unresolved.catalogConfirmed = false;
  const result = buildAnalysisMealIdentificationFinalizationDraft(unresolved);
  expect(
    result.ok &&
      result.value.finalization.selection.reason === reason &&
      Object.values(result.value.finalization.selection.identity).every((value) => value === null),
    `${reason} unresolved maps with six null Catalog IDs`
  );
}

const unavailable = clone(base);
unavailable.analysisAvailability = "unavailable";
const unavailableResult = buildAnalysisMealIdentificationFinalizationDraft(unavailable);
expect(
  unavailableResult.ok &&
    unavailableResult.value.finalization.originalAnalysis.status === "unavailable" &&
    unavailableResult.value.finalization.originalAnalysis.detectedItemNames.length === 0 &&
    unavailableResult.value.finalization.originalAnalysis.photoReferences.length === 0 &&
    unavailableResult.value.finalization.originalAnalysis.estimatedNutrition === null &&
    unavailableResult.value.finalization.originalAnalysis.analyzedAt === null,
  "unavailable analysis claims no provider or photo evidence"
);

expect(confirmed.value.finalization.corrections.length === 0, "zero corrections map to empty array");
const one = clone(base);
one.correctedRows = { "ingredients-雞胸": true };
const oneResult = buildAnalysisMealIdentificationFinalizationDraft(one);
expect(
  oneResult.ok &&
    oneResult.value.finalization.corrections.length === 1 &&
    oneResult.value.finalization.corrections[0].ordinal === 0,
  "one correction receives ordinal zero"
);
const multiple = clone(base);
multiple.correctedRows = {
  "ingredients-雞胸": true,
  "portions-1 份": true,
  "cooking-added": true
};
const multipleResult = buildAnalysisMealIdentificationFinalizationDraft(multiple);
expect(
  multipleResult.ok &&
    multipleResult.value.finalization.corrections.map((item) => item.ordinal).join(",") === "0,1,2" &&
    multipleResult.value.finalization.corrections.map((item) => item.detail.after.rowKey).join(",") ===
      "ingredients-雞胸,portions-1 份,cooking-added",
  "multiple corrections preserve user insertion order"
);
expect(
  multipleResult.value.finalization.originalAnalysis.detectedItemNames[0] === "雞胸碗",
  "corrections do not overwrite original analysis snapshot"
);

for (const invalidNutrition of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
  const invalid = clone(base);
  invalid.nutritionSummary.calories = invalidNutrition;
  expect(
    !buildAnalysisMealIdentificationFinalizationDraft(invalid).ok,
    `invalid nutrition ${String(invalidNutrition)} fails before runtime`
  );
}
const unsupportedPeriod = clone(base);
unsupportedPeriod.selectedMealPeriod = "深夜神秘餐";
expect(
  !buildAnalysisMealIdentificationFinalizationDraft(unsupportedPeriod).ok,
  "unsupported meal period fails before runtime"
);

const errorCases = {
  finalization_authentication_required: "authentication",
  finalization_authentication_failed: "authentication",
  finalization_invalid_input: "invalid",
  finalization_unsupported_contract_version: "invalid",
  finalization_forbidden_field: "invalid",
  finalization_catalog_identity_rejected: "catalog",
  finalization_identity_invariant_violation: "invariant",
  finalization_analysis_invariant_violation: "invariant",
  finalization_correction_invariant_violation: "invariant",
  finalization_idempotency_conflict: "conflict",
  finalization_ownership_or_authorization_rejected: "authorization",
  finalization_response_malformed: "generic",
  finalization_transport_failed: "generic",
  unexpected_raw_database_error: "generic"
};
for (const [code, expected] of Object.entries(errorCases)) {
  expect(
    mapMealIdentificationFinalizationUiError(code) === expected,
    `${code} maps to safe ${expected} UI`
  );
}
expect(
  !/SQLSTATE|SELECT |INSERT |UPDATE |DELETE |stack trace|credential|schema/i.test(
    i18n.slice(i18n.indexOf("mealIdentificationFinalization:"), i18n.indexOf("mealPhotoTitle:"))
  ),
  "typed and unknown UI copy leaks no raw database detail"
);

expect(
  screen.includes("consumerRuntime.finalizeMealIdentification(adapted.value)") &&
    !/consumerRuntime\.createMealRecord\s*\(/.test(screen),
  "primary UI action uses only MI-C-D finalization runtime"
);
expect(
  screen.includes("consumerRuntime.retryPendingMealIdentificationFinalization()") &&
    !/consumerRuntime\.retryPendingMealRecord\s*\(/.test(screen),
  "recoverable retry uses only the frozen pending intent"
);
expect(
  /finalizationInvocationRef\.current[\s\S]*status === "submitting"/.test(screen),
  "double submit is synchronously guarded"
);
expect(
  /onPress=\{finalizing \? undefined : onOpenMealLog\}/.test(screen) &&
    /function renderSuccessActions\(\) \{[\s\S]*status === "submitting"[\s\S]*return null;/.test(screen),
  "all meal-finalization actions are unavailable while submitting"
);
expect(
  /const \[analysisObservedAt\] = useState\(\(\) => new Date\(\)\.toISOString\(\)\)/.test(screen) &&
    /observedAt: analysisObservedAt/.test(screen),
  "same UI intent keeps a stable observed timestamp"
);
expect(
  /conflictFingerprintRef\.current === fingerprint/.test(screen),
  "unchanged idempotency conflict cannot auto-mint a new intent"
);
expect(
  ["mealRecordId", "mealRecordItemId", "mealAnalysisId", "mealIdentificationFinalizationId", "mealCorrectionIds"]
    .every((name) => screen.includes(`!result.${name}`)),
  "success requires the complete validated stable-ID response"
);
expect(
  /setMealSaved\(true\)[\s\S]*router\.push\("\/today-intake"\)/.test(screen),
  "validated success preserves existing Today Intake navigation"
);
expect(
  /mealIdentificationFinalizationState\.finalizationDataRevision/.test(runtimeProvider) &&
    /mealDataRevision/.test(runtimeProvider),
  "canonical finalization revision remains included in Today Intake refresh"
);
expect(
  !/\.rpc\s*\(|\.from\s*\(|\buser_id\b/.test(screen),
  "UI performs no direct RPC table write or actor payload"
);

console.log(`RESULT ${checks.length}/${checks.length} PASS`);
