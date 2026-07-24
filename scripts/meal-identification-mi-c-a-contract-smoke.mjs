#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const contractPath = "apps/mobile/features/meal-identification/finalizationContract.ts";
const contractSource = fs.readFileSync(path.join(root, contractPath), "utf8");
const output = ts.transpileModule(contractSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true
  }
}).outputText;
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${output}\n})`, {
  filename: path.join(root, contractPath)
})(
  (request) => {
    throw new Error(`MI-C-A smoke refused runtime dependency: ${request}`);
  },
  module,
  module.exports
);

const {
  buildMealIdentificationFinalization,
  MEAL_IDENTIFICATION_FINALIZATION_VERSION,
  projectMealIdentificationFinalizationToMealWrite,
  validateMealIdentificationFinalizationCommand
} = module.exports;

const checks = [];
function expect(condition, name) {
  if (!condition) throw new Error(`FAIL [${name}]`);
  checks.push(name);
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

const catalogCandidate = {
  kind: "catalog_item",
  identity: {
    restaurantId: "restaurant-1",
    branchId: "branch-1",
    menuId: "menu-1",
    menuCategoryId: "category-1",
    menuItemId: "menu-item-1",
    branchMenuItemId: "branch-menu-item-1"
  },
  source: "supabase",
  restaurantName: "好初健康碗",
  branchName: "信義店",
  branchContext: "信義區 · 測試路 1 號",
  menuName: "午餐菜單",
  menuCategoryName: "健康碗",
  mealItemName: "雞胸高蛋白碗",
  price: 180,
  availability: "available",
  nutritionProvenance: "ai_estimated",
  confidence: 0.91,
  matchReason: "catalog_name_context_match",
  tags: ["高蛋白"]
};

const originalAnalysis = {
  status: "available",
  detectedItemNames: ["AI 雞胸餐"],
  model: { name: "local-smoke-model", version: "v1" },
  photoReferences: ["photo-ref-1"],
  estimatedNutrition: {
    calories: 520,
    protein: 38,
    carbohydrates: 54,
    fat: 14
  },
  confidence: 0.82,
  analyzedAt: "2026-07-24T04:00:00.000Z"
};

const baseInput = {
  version: MEAL_IDENTIFICATION_FINALIZATION_VERSION,
  recordTiming: "current",
  occurredAt: "2026-07-24T04:05:00.000Z",
  originalAnalysis,
  selection: {
    kind: "catalog_selection",
    confirmationStatus: "confirmed",
    sourceContext: "dine_in",
    candidate: catalogCandidate
  },
  corrections: [
    {
      correctedAt: "2026-07-24T04:01:00.000Z",
      correctionReason: "使用者修正名稱",
      detail: {
        correctionType: "name_change",
        before: "AI 雞胸餐",
        after: "雞胸高蛋白碗"
      }
    },
    {
      correctedAt: "2026-07-24T04:02:00.000Z",
      correctionReason: "使用者修正營養",
      detail: {
        correctionType: "nutrition_override",
        before: { calories: 500 },
        after: { calories: 520 }
      }
    }
  ],
  mealWrite: {
    selectedMealPeriod: "午餐",
    mealName: "雞胸高蛋白碗",
    portion: "1 份",
    nutrition: { calories: 520, protein: 38 },
    isSelfCooked: false,
    wasUserCorrected: true
  }
};

try {
  const callerBefore = JSON.stringify(baseInput);
  const confirmed = buildMealIdentificationFinalization(baseInput);
  expect(confirmed.ok, "confirmed Catalog finalization succeeds");
  const command = confirmed.value;

  expect(
    Object.values(command.selection.identity).every(
      (value) => typeof value === "string" && value.length > 0
    ),
    "confirmed Catalog preserves all six IDs"
  );
  expect(
    JSON.stringify(command.selection.candidateSnapshot) ===
      JSON.stringify(catalogCandidate),
    "confirmed Catalog preserves candidate snapshot"
  );
  expect(
    command.selection.catalogSource === "supabase",
    "confirmed Catalog preserves Catalog source"
  );
  expect(
    command.selection.identityClaimStatus === "pending_server_validation",
    "Catalog IDs remain a pending server-validation claim"
  );
  expect(
    command.selection.sourceContext === "dine_in",
    "confirmed source context is preserved as provenance"
  );
  expect(
    JSON.stringify(baseInput) === callerBefore,
    "builder does not mutate caller input"
  );

  const originalBeforeMutationAttempt = JSON.stringify(command.originalAnalysis);
  let mutationRejected = false;
  try {
    command.originalAnalysis.detectedItemNames.push("mutated");
  } catch {
    mutationRejected = true;
  }
  expect(
    mutationRejected &&
      JSON.stringify(command.originalAnalysis) === originalBeforeMutationAttempt,
    "original analysis snapshot is immutable"
  );
  expect(
    command.originalAnalysis.detectedItemNames[0] === "AI 雞胸餐" &&
      command.corrections[0].detail.after === "雞胸高蛋白碗",
    "correction event does not overwrite original analysis"
  );
  expect(
    command.corrections.map((event) => event.ordinal).join(",") === "0,1" &&
      command.corrections.map((event) => event.correctedAt).join(",") ===
        "2026-07-24T04:01:00.000Z,2026-07-24T04:02:00.000Z",
    "multiple corrections preserve caller-provided append order"
  );
  expect(
    Object.isFrozen(command.corrections) &&
      Object.isFrozen(command.corrections[0]) &&
      Object.isFrozen(command.corrections[0].detail),
    "correction events are immutable local snapshots"
  );

  const confirmedProjection =
    projectMealIdentificationFinalizationToMealWrite(command);
  expect(confirmedProjection.ok, "confirmed finalization projects to meal-write draft");
  expect(
    confirmedProjection.value.trustedCanonicalIdentity.restaurantId ===
      "restaurant-1" &&
      confirmedProjection.value.trustedCanonicalIdentity.branchId ===
        "branch-1" &&
      confirmedProjection.value.trustedCanonicalIdentity.menuId === "menu-1" &&
      confirmedProjection.value.trustedCanonicalIdentity.menuItemId ===
        "menu-item-1",
    "confirmed projection carries only supported canonical identity fields"
  );
  expect(
    !("menuCategoryId" in confirmedProjection.value.trustedCanonicalIdentity) &&
      !(
        "branchMenuItemId" in
        confirmedProjection.value.trustedCanonicalIdentity
      ),
    "projection does not smuggle unsupported Catalog IDs into meal-write draft"
  );
  expect(
    confirmedProjection.value.originalDetectedName === "AI 雞胸餐",
    "projection uses preserved original detected name"
  );
  expect(
    Object.isFrozen(confirmedProjection.value),
    "meal-write projection is an immutable pure value"
  );

  const unavailableOriginal = {
    status: "unavailable",
    detectedItemNames: [],
    model: null,
    photoReferences: [],
    estimatedNutrition: null,
    confidence: null,
    analyzedAt: null
  };
  const unresolvedCommands = new Map();
  for (const reason of [
    "manual",
    "self_cooked",
    "none_of_the_above",
    "catalog_unavailable"
  ]) {
    const isSelfCooked = reason === "self_cooked";
    const unresolvedInput = {
      version: MEAL_IDENTIFICATION_FINALIZATION_VERSION,
      recordTiming: "current",
      occurredAt: "2026-07-24T04:05:00.000Z",
      originalAnalysis:
        reason === "manual" ? clone(originalAnalysis) : clone(unavailableOriginal),
      selection: {
        kind: "personal_unresolved_selection",
        sourceContext: isSelfCooked ? "self_cooked" : "unknown",
        candidate: {
          kind: "personal_unresolved",
          identity: nullIdentity(),
          source: reason,
          restaurantName: "好初健康碗",
          mealItemName: "雞胸高蛋白碗"
        }
      },
      corrections: [],
      mealWrite: {
        selectedMealPeriod: "午餐",
        mealName: "雞胸高蛋白碗",
        portion: null,
        nutrition: { calories: 500 },
        isSelfCooked,
        wasUserCorrected: true
      }
    };
    const result = buildMealIdentificationFinalization(unresolvedInput);
    expect(result.ok, `${reason} unresolved finalization succeeds`);
    expect(
      Object.values(result.value.selection.identity).every(
        (value) => value === null
      ),
      `${reason} unresolved keeps all six Catalog IDs null`
    );
    const projection =
      projectMealIdentificationFinalizationToMealWrite(result.value);
    expect(
      projection.ok &&
        projection.value.trustedCanonicalIdentity === null,
      `${reason} unresolved meal-write projection keeps canonical identity null`
    );
    unresolvedCommands.set(reason, result.value);
  }

  expect(
    unresolvedCommands.get("catalog_unavailable").selection.reason ===
      "catalog_unavailable" &&
      unresolvedCommands.get("none_of_the_above").selection.reason ===
        "none_of_the_above",
    "catalog_unavailable and none_of_the_above remain distinct"
  );
  expect(
    unresolvedCommands.get("manual").selection.restaurantName ===
      catalogCandidate.restaurantName &&
      unresolvedCommands.get("manual").selection.mealItemName ===
        catalogCandidate.mealItemName &&
      Object.values(unresolvedCommands.get("manual").selection.identity).every(
        (value) => value === null
      ),
    "matching display text never restores prior Catalog identity"
  );
  expect(
    unresolvedCommands.get("self_cooked").selection.sourceContext ===
      "self_cooked" &&
      Object.values(
        unresolvedCommands.get("self_cooked").selection.identity
      ).every((value) => value === null),
    "source context is preserved without creating identity"
  );
  expect(
    unresolvedCommands.get("manual").originalAnalysis.detectedItemNames[0] ===
      "AI 雞胸餐" &&
      Object.values(unresolvedCommands.get("manual").selection.identity).every(
        (value) => value === null
      ),
    "AI name does not create Catalog identity"
  );
  expect(
    unresolvedCommands.get("manual").originalAnalysis.confidence === 0.82 &&
      Object.values(unresolvedCommands.get("manual").selection.identity).every(
        (value) => value === null
      ),
    "AI confidence does not create Catalog identity"
  );

  for (const directEvidenceKind of [
    "alias_selection",
    "gps_selection",
    "distance_selection",
    "ai_suggestion_selection",
    "free_text_selection"
  ]) {
    const invalid = clone(baseInput);
    invalid.selection = {
      kind: directEvidenceKind,
      identity: clone(catalogCandidate.identity),
      sourceContext: "unknown"
    };
    const result = buildMealIdentificationFinalization(invalid);
    expect(
      !result.ok && result.error.code === "invalid_selection",
      `${directEvidenceKind} cannot create Catalog identity`
    );
  }

  const pending = clone(baseInput);
  pending.selection.confirmationStatus = "pending";
  const pendingResult = buildMealIdentificationFinalization(pending);
  expect(
    !pendingResult.ok &&
      pendingResult.error.code === "catalog_not_confirmed",
    "unconfirmed Catalog candidate fails closed"
  );

  for (const key of Object.keys(catalogCandidate.identity)) {
    const incomplete = clone(baseInput);
    delete incomplete.selection.candidate.identity[key];
    const result = buildMealIdentificationFinalization(incomplete);
    expect(
      !result.ok && result.error.code === "invalid_catalog_identity",
      `Catalog claim missing ${key} fails closed`
    );
  }

  const nullCatalogId = clone(baseInput);
  nullCatalogId.selection.candidate.identity.restaurantId = null;
  const nullCatalogResult =
    buildMealIdentificationFinalization(nullCatalogId);
  expect(
    !nullCatalogResult.ok &&
      nullCatalogResult.error.code === "invalid_catalog_identity",
    "null Catalog ID fails closed"
  );

  const undefinedCatalogId = clone(baseInput);
  undefinedCatalogId.selection.candidate.identity.branchId = undefined;
  const undefinedCatalogResult =
    buildMealIdentificationFinalization(undefinedCatalogId);
  expect(
    !undefinedCatalogResult.ok &&
      undefinedCatalogResult.error.code === "invalid_catalog_identity",
    "undefined Catalog ID fails closed"
  );

  const blankCatalogId = clone(baseInput);
  blankCatalogId.selection.candidate.identity.menuItemId = "   ";
  const blankCatalogResult =
    buildMealIdentificationFinalization(blankCatalogId);
  expect(
    !blankCatalogResult.ok &&
      blankCatalogResult.error.code === "invalid_catalog_identity",
    "blank Catalog ID fails closed"
  );

  const unresolvedWithIdentity = {
    version: MEAL_IDENTIFICATION_FINALIZATION_VERSION,
    recordTiming: "current",
    occurredAt: "2026-07-24T04:05:00.000Z",
    originalAnalysis: clone(unavailableOriginal),
    selection: {
      kind: "personal_unresolved_selection",
      sourceContext: "unknown",
      candidate: {
        kind: "personal_unresolved",
        identity: { ...nullIdentity(), menuItemId: "forged-menu-item" },
        source: "manual",
        restaurantName: "文字餐廳",
        mealItemName: "文字餐點"
      }
    },
    corrections: [],
    mealWrite: {
      selectedMealPeriod: "午餐",
      mealName: "文字餐點",
      portion: null,
      nutrition: {},
      isSelfCooked: false,
      wasUserCorrected: true
    }
  };
  const unresolvedIdentityResult =
    buildMealIdentificationFinalization(unresolvedWithIdentity);
  expect(
    !unresolvedIdentityResult.ok &&
      unresolvedIdentityResult.error.code === "unresolved_identity_present",
    "unresolved selection carrying any Catalog ID fails closed"
  );

  const unsupportedReason = clone(unresolvedWithIdentity);
  unsupportedReason.selection.candidate.identity = nullIdentity();
  unsupportedReason.selection.candidate.source = "guessed_by_ai";
  const unsupportedReasonResult =
    buildMealIdentificationFinalization(unsupportedReason);
  expect(
    !unsupportedReasonResult.ok &&
      unsupportedReasonResult.error.code === "invalid_unresolved_reason",
    "unsupported unresolved reason fails closed"
  );

  const missingVersion = clone(baseInput);
  delete missingVersion.version;
  const missingVersionResult =
    buildMealIdentificationFinalization(missingVersion);
  expect(
    !missingVersionResult.ok &&
      missingVersionResult.error.code === "unsupported_version",
    "missing contract version fails closed"
  );

  const unsupportedVersion = clone(baseInput);
  unsupportedVersion.version = "meal-identification-finalization-v999";
  const unsupportedVersionResult =
    buildMealIdentificationFinalization(unsupportedVersion);
  expect(
    !unsupportedVersionResult.ok &&
      unsupportedVersionResult.error.code === "unsupported_version",
    "unsupported contract version fails closed"
  );

  const unavailableWithInventedProvider = clone(baseInput);
  unavailableWithInventedProvider.originalAnalysis = {
    ...clone(unavailableOriginal),
    model: { name: "invented", version: "invented" }
  };
  const inventedProviderResult =
    buildMealIdentificationFinalization(unavailableWithInventedProvider);
  expect(
    !inventedProviderResult.ok &&
      inventedProviderResult.error.code === "invalid_original_analysis",
    "unavailable analysis cannot invent provider provenance"
  );

  const invalidCorrection = clone(baseInput);
  invalidCorrection.corrections[0].correctedAt = null;
  const invalidCorrectionResult =
    buildMealIdentificationFinalization(invalidCorrection);
  expect(
    !invalidCorrectionResult.ok &&
      invalidCorrectionResult.error.code === "invalid_correction_event",
    "malformed correction event fails closed"
  );

  const tamperedCommand = clone(command);
  tamperedCommand.corrections[1].ordinal = 0;
  const tamperedCommandResult =
    validateMealIdentificationFinalizationCommand(tamperedCommand);
  expect(
    !tamperedCommandResult.ok &&
      tamperedCommandResult.error.code === "invalid_correction_event",
    "correction append order tampering fails closed"
  );

  const semanticConflict = clone(baseInput);
  semanticConflict.mealWrite.isSelfCooked = true;
  const semanticConflictResult =
    buildMealIdentificationFinalization(semanticConflict);
  expect(
    !semanticConflictResult.ok &&
      semanticConflictResult.error.code === "semantic_conflict",
    "conflicting selection and source semantics fail closed"
  );

  const deterministicA = buildMealIdentificationFinalization(clone(baseInput));
  const deterministicB = buildMealIdentificationFinalization(clone(baseInput));
  expect(
    JSON.stringify(deterministicA) === JSON.stringify(deterministicB),
    "same input produces deterministic finalization output"
  );

  const forbiddenTransportPattern =
    /(?:from\s+["'][^"']*(?:supabase|expo-location)|\bfetch\s*\(|XMLHttpRequest|WebSocket|AsyncStorage|\.rpc\s*\(|\.from\s*\(|\.(?:insert|update|delete|upsert)\s*\()/;
  expect(
    !forbiddenTransportPattern.test(contractSource),
    "contract contains no network database location or storage transport"
  );
  expect(
    !/\bDate\.now\s*\(|\bMath\.random\s*\(/.test(contractSource),
    "contract uses no clock randomness or implicit global generation"
  );

  const result = {
    status: "passed",
    phase: "Meal Identification MI-C-A Finalization Local Contract",
    contractVersion: MEAL_IDENTIFICATION_FINALIZATION_VERSION,
    checkCount: checks.length,
    checks,
    deterministic: true,
    networkRequestUsed: false,
    databaseReadUsed: false,
    databaseWriteUsed: false,
    storageWriteUsed: false,
    rpcInvoked: false,
    credentialsUsed: false,
    migrationExecuted: false,
    runtimeConnected: false
  };
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        phase: "Meal Identification MI-C-A Finalization Local Contract",
        checkCount: checks.length,
        checks,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exit(1);
}
