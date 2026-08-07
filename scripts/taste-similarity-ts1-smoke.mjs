import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const sourceRoot = path.join(root, "packages", "shared", "src", "domain", "taste-similarity");
const temporaryRoot = process.platform === "win32" ? os.tmpdir() : "/tmp";
const tempRoot = fs.mkdtempSync(path.join(temporaryRoot, "taste-similarity-ts1-smoke-"));
const outRoot = path.join(tempRoot, "taste-similarity");
const checks = [];

function expect(condition, name, details = "contract assertion failed") {
  if (!condition) throw new Error(`${name}: ${details}`);
  checks.push({ name, pass: true });
  console.log(`PASS ${name}`);
}

function expectThrows(operation, name) {
  let threw = false;
  try {
    operation();
  } catch {
    threw = true;
  }
  expect(threw, name, "expected canonical normalization to reject the input");
}

function explicitEvidence(evidenceId) {
  return {
    evidenceId,
    origin: "explicit_profile",
    sourceRecordKind: "taste_profile",
    confidenceBasis: "user_explicit",
    decayEligibility: "not_eligible"
  };
}

function goalEvidence(evidenceId) {
  return {
    evidenceId,
    origin: "nutrition_goal",
    sourceRecordKind: "nutrition_goal",
    confidenceBasis: "user_explicit",
    decayEligibility: "not_eligible",
    updatedAt: "2026-08-08T10:00:00Z"
  };
}

function restrictionEvidence(evidenceId) {
  return {
    evidenceId,
    origin: "dietary_restriction",
    sourceRecordKind: "dietary_restriction",
    confidenceBasis: "user_explicit",
    decayEligibility: "not_eligible"
  };
}

try {
  const sourceFiles = fs.readdirSync(sourceRoot).filter((file) => file.endsWith(".ts")).map((file) => path.join(sourceRoot, file));
  const program = ts.createProgram(sourceFiles, {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    outDir: outRoot,
    rootDir: sourceRoot
  });
  const emit = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emit.diagnostics);
  expect(diagnostics.length === 0, "TS-1 production modules compile", diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("\n"));
  const requireFromTemp = createRequire(path.join(outRoot, "index.js"));
  const domain = requireFromTemp("./index.js");

  const cuisine = domain.normalizePreferenceEvidence({
    category: "preference", scope: "food_taste", facet: "cuisine", polarity: "positive",
    value: "  Cafe\u0301 cuisine  ", evidence: explicitEvidence("preference:cuisine:cafe")
  });
  expect(cuisine.category === "preference" && cuisine.scope === "food_taste" && cuisine.facet === "cuisine" && cuisine.polarity === "positive", "cuisine is positive food-taste preference");
  expect(cuisine.value === "Café cuisine", "Unicode NFC and trim normalize cuisine value");

  const disliked = domain.normalizePreferenceEvidence({
    category: "preference", scope: "food_taste", facet: "flavor", polarity: "negative",
    value: "  bitter  ", evidence: explicitEvidence("preference:flavor:bitter")
  });
  expect(disliked.category === "preference" && disliked.polarity === "negative", "disliked flavor remains negative preference");

  const spice = domain.normalizePreferenceEvidence({
    category: "preference", scope: "food_taste", facet: "spice", polarity: "neutral",
    value: " medium ", evidence: explicitEvidence("preference:spice")
  });
  expect(spice.scope === "food_taste" && spice.facet === "spice" && spice.value === "medium", "categorical spice preference is preserved without numeric inference");

  const mealPattern = domain.normalizePreferenceEvidence({
    category: "preference", scope: "meal_pattern", facet: "meal_type", polarity: "positive",
    value: " lunch ", evidence: explicitEvidence("preference:meal:lunch")
  });
  const dining = domain.normalizePreferenceEvidence({
    category: "preference", scope: "dining_context", facet: "dining_style", polarity: "neutral",
    value: " casual ", evidence: explicitEvidence("preference:dining:casual")
  });
  const payment = domain.normalizePreferenceEvidence({
    category: "preference", scope: "social_logistics", facet: "payment_preference", polarity: "neutral",
    value: " split_bill ", evidence: explicitEvidence("preference:payment:split")
  });
  expect(mealPattern.scope === "meal_pattern", "meal-pattern scope remains explicit");
  expect(dining.scope === "dining_context", "dining-context scope remains explicit");
  expect(payment.scope === "social_logistics" && payment.scope !== cuisine.scope, "payment is social logistics and cannot become food taste");

  expectThrows(() => domain.normalizePreferenceEvidence({ ...payment, scope: "food_taste" }), "invalid scope/facet combination is rejected");
  expectThrows(() => domain.normalizePreferenceEvidence({ ...disliked, category: "restriction" }), "disliked preference cannot normalize as restriction");
  expectThrows(() => domain.normalizeUnicodeText(" \t "), "empty normalized text is rejected");
  expectThrows(() => domain.normalizeOpaqueCanonicalId("   "), "empty canonical ID is rejected");

  const values = domain.normalizeStringSet([" beta ", "Cafe\u0301", "alpha", "Café", "beta"]);
  expect(JSON.stringify(values) === JSON.stringify(["Café", "alpha", "beta"]), "string normalization dedupes and orders deterministically");
  expect(JSON.stringify(domain.normalizeStringSet(values)) === JSON.stringify(values), "string-set normalization is idempotent");

  const validity = { startsOn: "2026-08-01", endsOn: "2026-09-01", isActive: true };
  const goalLabel = domain.normalizeGoalEvidence({
    category: "goal", facet: "goal_label", value: " high protein ", validity,
    evidence: goalEvidence("goal:label")
  });
  const calorieGoal = domain.normalizeGoalEvidence({
    category: "goal", facet: "daily_calories_target", value: 2100, unit: "kcal", validity,
    evidence: goalEvidence("goal:calories")
  });
  const proteinGoal = domain.normalizeGoalEvidence({
    category: "goal", facet: "protein_target_g", value: 130, unit: "g", validity,
    evidence: goalEvidence("goal:protein")
  });
  expect(goalLabel.category === "goal" && goalLabel.value === "high protein" && !("polarity" in goalLabel), "categorical goal has no preference polarity");
  expect(calorieGoal.value === 2100 && calorieGoal.unit === "kcal", "calorie goal preserves scalar and unit");
  expect(proteinGoal.value === 130 && proteinGoal.unit === "g", "macro goal preserves scalar and unit");
  expect(calorieGoal.evidence.privacyClassification === "sensitive_internal", "exact scalar goal is sensitive internal evidence");

  const softRestriction = domain.normalizeRestrictionEvidence({
    category: "restriction", restrictionType: " dietary ", label: " shellfish ", rawSeverity: " preference ", visibility: "private",
    evidence: restrictionEvidence("restriction:soft")
  });
  const unknownRestriction = domain.normalizeRestrictionEvidence({
    category: "restriction", restrictionType: "allergy", label: "peanut", rawSeverity: "severe", visibility: "future_circle",
    evidence: restrictionEvidence("restriction:unknown")
  });
  expect(softRestriction.enforcement === "soft", "severity preference maps to soft restriction");
  expect(unknownRestriction.enforcement === "unclassified", "unknown severity does not become hard or soft");
  expect(unknownRestriction.rawSeverity === "severe", "unknown severity raw value is preserved");
  expect(unknownRestriction.visibility.classification === "unknown" && unknownRestriction.visibility.rawValue === "future_circle", "unknown visibility is preserved additively");
  expect(softRestriction.visibility.classification === "known" && softRestriction.visibility.value === "private", "known restriction visibility is preserved");
  expect(unknownRestriction.category === "restriction" && !("polarity" in unknownRestriction), "restriction never converts to positive or negative preference");
  expect(unknownRestriction.evidence.privacyClassification === "sensitive_internal", "raw restriction is sensitive internal evidence");

  const restaurantFavorite = domain.normalizeBehavioralEvidence({
    category: "behavior", behaviorKind: "favorite", favoriteKind: "restaurant", interpretation: "positive_user_action",
    evidence: {
      evidenceId: "favorite:restaurant:1", origin: "favorite", sourceRecordKind: "favorite_restaurant",
      confidenceBasis: "user_action", decayEligibility: "not_eligible",
      recordedAt: "2026-08-01T12:00:00Z", target: { kind: "restaurant", restaurantId: "  REST-Aa/01  " }
    }
  });
  const menuFavorite = domain.normalizeBehavioralEvidence({
    category: "behavior", behaviorKind: "favorite", favoriteKind: "menu_item", interpretation: "positive_user_action",
    evidence: {
      evidenceId: "favorite:item:1", origin: "favorite", sourceRecordKind: "favorite_menu_item",
      confidenceBasis: "user_action", decayEligibility: "not_eligible",
      target: { kind: "menu_item", restaurantId: "rest-1", branchId: " branch-1 ", menuItemId: " item-1 " }
    }
  });
  expect(restaurantFavorite.evidence.target.restaurantId === "REST-Aa/01", "opaque restaurant ID is trimmed without case or name inference");
  expect(menuFavorite.evidence.target.kind === "menu_item" && menuFavorite.evidence.target.menuItemId === "item-1", "canonical menu-item favorite preserves target identity");
  expectThrows(() => domain.normalizeBehavioralEvidence({
    ...restaurantFavorite,
    evidence: { ...restaurantFavorite.evidence, origin: "explicit_profile" }
  }), "favorite rejects non-Favorites origin authority");

  const meal = domain.normalizeBehavioralEvidence({
    category: "behavior", behaviorKind: "meal_occurrence", interpretation: "observed", mealType: "lunch",
    occurredAt: "2026-08-08T12:30:00+08:00", consumedRatio: 0.75,
    evidence: {
      evidenceId: "meal:item:1", origin: "meal_record", sourceRecordKind: "meal_record_item",
      recordedAt: "2026-08-08T12:30:00+08:00", confidenceBasis: "observed_consumption",
      sourceConfidence: 0.82, decayEligibility: "source_policy",
      target: { kind: "menu_item", restaurantId: "rest-1", branchId: "branch-1", menuItemId: "item-1" }
    }
  });
  const freeformMeal = domain.normalizeBehavioralEvidence({
    category: "behavior", behaviorKind: "meal_occurrence", interpretation: "observed", mealType: "future_brunch",
    occurredAt: "2026-08-07T10:00:00Z", consumedRatio: 1,
    evidence: {
      evidenceId: "meal:item:freeform", origin: "meal_record", sourceRecordKind: "meal_record_item",
      confidenceBasis: "observed_consumption", decayEligibility: "source_policy", target: null
    }
  });
  expect(meal.interpretation === "observed" && !("polarity" in meal), "meal occurrence is observed behavior, not automatic positive taste");
  expect(meal.evidence.sourceConfidence === 0.82 && !("tasteConfidence" in meal.evidence), "source confidence is preserved without taste interpretation");
  expect(meal.evidence.target.menuItemId === "item-1" && meal.consumedRatio === 0.75, "meal occurrence preserves canonical IDs and consumed ratio");
  expect(freeformMeal.evidence.target === null, "meal occurrence without canonical ID remains targetless");
  expect(freeformMeal.mealType.classification === "unknown" && freeformMeal.mealType.rawValue === "future_brunch", "unknown meal type is preserved");

  const rating = domain.normalizeBehavioralEvidence({
    category: "behavior", behaviorKind: "rating", ratingKind: "menu_item", interpretation: "scalar_evaluation_unclassified",
    ratingValue: 4.25,
    feedback: { taste: " savory ", portion: " just right ", price: " fair ", repurchase: " maybe ", dislikeReasons: [" too oily ", "too oily", "salty"] },
    evidence: {
      evidenceId: "rating:item:1", origin: "rating", sourceRecordKind: "menu_item_rating",
      recordedAt: "2026-08-08T13:00:00Z", confidenceBasis: "user_action", decayEligibility: "source_policy",
      target: { kind: "menu_item", restaurantId: "rest-1", menuItemId: "item-1" }
    }
  });
  expect(rating.ratingValue === 4.25 && rating.interpretation === "scalar_evaluation_unclassified", "rating scalar is preserved without threshold classification");
  expect(JSON.stringify(rating.feedback.dislikeReasons) === JSON.stringify(["salty", "too oily"]), "rating reasons normalize, dedupe, and order deterministically");
  expect(rating.feedback.taste === "savory" && rating.feedback.repurchase === "maybe", "rating structured feedback remains raw categorical evidence");
  expect(rating.evidence.privacyClassification === "sensitive_internal", "private rating is sensitive internal evidence");
  expectThrows(() => domain.normalizeBehavioralEvidence({
    ...rating,
    evidence: { ...rating.evidence, origin: "favorite" }
  }), "rating rejects non-Ratings origin authority");

  const normalizedAgain = domain.normalizeTasteEvidence(meal);
  expect(JSON.stringify(normalizedAgain) === JSON.stringify(meal), "single-evidence normalization is idempotent");
  const list = domain.normalizeTasteEvidenceList([payment, cuisine, disliked, cuisine, rating, meal]);
  expect(list.length === 5 && list.map((entry) => entry.evidence.evidenceId).join(",") === [
    "meal:item:1", "preference:cuisine:cafe", "preference:flavor:bitter", "preference:payment:split", "rating:item:1"
  ].join(","), "evidence list dedupes identical IDs and orders deterministically");
  expect(JSON.stringify(domain.normalizeTasteEvidenceList(list)) === JSON.stringify(list), "evidence-list normalization is idempotent");
  expectThrows(() => domain.normalizeTasteEvidenceList([cuisine, { ...cuisine, value: "different" }]), "conflicting duplicate evidence IDs fail closed");

  console.log(JSON.stringify({
    status: "passed",
    phase: "TS-1A + TS-1B Canonical Taste Evidence Smoke",
    totalChecks: checks.length,
    checks,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    productionTouched: false,
    tasteProfileSnapshotDefined: false,
    similarityScoreImplemented: false
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    phase: "TS-1A + TS-1B Canonical Taste Evidence Smoke",
    reason: error instanceof Error ? error.message : String(error),
    checks
  }, null, 2));
  process.exitCode = 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
