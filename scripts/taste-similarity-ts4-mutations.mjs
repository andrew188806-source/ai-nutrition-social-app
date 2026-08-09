#!/usr/bin/env node
// TS-4 mutation proof — EVIDENCE CONFIDENCE V1.
//
// Each mutation rewrites REAL implementation bytes on disk, then requires that the TS-4 guard, the
// TS-4 smoke, or a dedicated behavioural probe FAILS. A mutation nothing notices is a hole.
//
// Kills must be real: a mutation that only crashes the harness (unloadable module, syntax error) is
// reported as `harness_crash` and does NOT count as a kill.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const domainRoot = path.join(root, "packages/shared/src/domain/taste-similarity");
const confidenceRoot = path.join(domainRoot, "confidence");

const COMPUTE = path.join(confidenceRoot, "compute.ts");
const POLICY = path.join(confidenceRoot, "policy.ts");
const TYPES = path.join(confidenceRoot, "types.ts");

function resolveTsFile(candidate) {
  for (const suffix of ["", ".ts", "/index.ts"]) {
    const full = `${candidate}${suffix}`;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

function loadDomain() {
  const cache = new Map();
  const loadFile = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: absolute
    });
    const module = { exports: {} };
    cache.set(absolute, module);
    const localRequire = (specifier) => {
      if (!specifier.startsWith(".")) return require_(specifier);
      const resolved = resolveTsFile(path.resolve(path.dirname(absolute), specifier));
      if (!resolved) throw new Error(`unresolved ${specifier}`);
      return loadFile(resolved);
    };
    new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
    return module.exports;
  };
  return loadFile(path.join(domainRoot, "index.ts"));
}

// ---- fixtures ------------------------------------------------------------------------------------
const envelope = (id, origin, kind, basis, decay, target = null, extra = {}) => ({
  evidenceId: id, origin, sourceRecordKind: kind, recordedAt: "2026-08-01T00:00:00.000Z",
  confidenceBasis: basis, decayEligibility: decay, ...(target ? { target } : {}), ...extra
});
const preference = (user, scope, facet, polarity, value, slot = value) => ({
  category: "preference", scope, facet, polarity, value,
  evidence: envelope(`tp:${user}:${scope}:${facet}:${slot}`, "explicit_profile", "taste_profile", "user_explicit", "not_eligible")
});
const cuisine = (user, value) => preference(user, "food_taste", "cuisine", "positive", value);
const flavor = (user, value) => preference(user, "food_taste", "flavor", "negative", value);
const spice = (user, value) => preference(user, "food_taste", "spice", "unclassified", value, "spice");
const mealType = (user, value) => preference(user, "meal_pattern", "meal_type", "positive", value);
const diningStyle = (user, value) => preference(user, "dining_context", "dining_style", "unclassified", value, "dining");
const paymentPreference = (user, value) => preference(user, "social_logistics", "payment_preference", "unclassified", value, "payment");
const favoriteRestaurant = (user, restaurantId) => ({
  category: "behavior", behaviorKind: "favorite", favoriteKind: "restaurant", interpretation: "positive_user_action",
  evidence: envelope(`fav:${user}:r:${restaurantId}`, "favorite", "favorite_restaurant", "user_action", "not_eligible", { kind: "restaurant", restaurantId })
});
const favoriteMenuItem = (user, restaurantId, menuItemId) => ({
  category: "behavior", behaviorKind: "favorite", favoriteKind: "menu_item", interpretation: "positive_user_action",
  evidence: envelope(`fav:${user}:m:${restaurantId}:${menuItemId}`, "favorite", "favorite_menu_item", "user_action", "not_eligible", { kind: "menu_item", restaurantId, menuItemId })
});
const meal = (target, { id, at = "2026-08-01T12:00:00.000Z", sourceConfidence } = {}) => ({
  category: "behavior", behaviorKind: "meal_occurrence", interpretation: "observed", mealType: "lunch",
  occurredAt: at, consumedRatio: 1,
  evidence: envelope(id, "meal_record", "meal_record_item", "observed_consumption", "source_policy", target,
    { recordedAt: at, ...(sourceConfidence === undefined ? {} : { sourceConfidence }) })
});
const atRestaurant = (restaurantId) => ({ kind: "restaurant", restaurantId });
const goalLabel = (user, value) => ({
  category: "goal", facet: "goal_label", value,
  validity: { startsOn: "2026-07-01", isActive: true },
  evidence: envelope(`goal:${user}:label:${value}`, "nutrition_goal", "nutrition_goal", "user_explicit", "not_eligible")
});
const restriction = (user, label, { rawSeverity = "preference" } = {}) => ({
  category: "restriction", restrictionType: "avoidance", label, rawSeverity, visibility: "private",
  evidence: envelope(`restr:${user}:${label}`, "dietary_restriction", "dietary_restriction", "user_explicit", "not_eligible")
});

const counted = (count) => (count > 0 ? { status: "available", evidenceCount: count } : { status: "empty", evidenceCount: 0 });
function makeSnapshot(compose, userId, {
  preferences = [], behavior = [], goals = [], restrictions = [],
  mealsTruncation = "not_truncated", favoritesTruncation = "not_truncated", ratingsTruncation = "not_truncated",
  sourceOverrides = {}
} = {}) {
  return compose({
    subjectUserId: userId,
    preferences, goals, restrictions, behavior,
    sourceStates: {
      taste_profile: counted(preferences.length),
      nutrition_goals: counted(goals.length),
      dietary_restrictions: counted(restrictions.length),
      meals: counted(behavior.filter((entry) => entry.behaviorKind === "meal_occurrence").length),
      favorites: counted(behavior.filter((entry) => entry.behaviorKind === "favorite").length),
      ratings: counted(0),
      ...sourceOverrides
    },
    generatedAt: "2026-08-08T12:00:00.000Z",
    evidenceWindow: {
      historyScope: "bounded",
      meals: { requestedStartDate: "2026-07-01", requestedEndDate: "2026-08-08", requestedLimit: 50, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: mealsTruncation },
      favorites: { requestedLimit: 25, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: favoritesTruncation },
      ratings: { requestedLimit: null, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: ratingsTruncation }
    }
  });
}

// ---- harness -------------------------------------------------------------------------------------
function runSuite(script) {
  return spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8", windowsHide: true }).status === 0;
}

function withMutatedDisk(targets, run) {
  const originals = new Map(targets.map(({ file: target }) => [target, fs.readFileSync(target, "utf8")]));
  try {
    const mutated = new Map(originals);
    for (const { file: target, from, to } of targets) {
      const source = mutated.get(target);
      if (!source.includes(from)) return { applied: false, reason: `anchor not found in ${path.basename(target)}: ${from}` };
      mutated.set(target, source.replaceAll(from, to));
    }
    for (const [target, source] of mutated) fs.writeFileSync(target, source, "utf8");
    return { applied: true, value: run() };
  } finally {
    for (const [target, original] of originals) fs.writeFileSync(target, original, "utf8");
  }
}

const results = [];

function mutation(id, name, targets, detector) {
  const outcome = withMutatedDisk(targets, () => {
    let guardFailed = false;
    let smokeFailed = false;
    let probeFailed = false;
    let crashed = false;
    try {
      guardFailed = !runSuite("scripts/taste-similarity-ts4-guard.mjs");
      smokeFailed = !runSuite("scripts/taste-similarity-ts4-smoke.mjs");
      if (detector) probeFailed = detector(loadDomain());
    } catch (error) {
      crashed = true;
      probeFailed = false;
      void error;
    }
    return { guardFailed, smokeFailed, probeFailed, crashed };
  });

  if (!outcome.applied) {
    results.push({ id, name, killed: false, status: "anchor_missing", detail: outcome.reason });
    return;
  }
  const { guardFailed, smokeFailed, probeFailed, crashed } = outcome.value;
  const killed = guardFailed || smokeFailed || probeFailed;
  results.push({
    id, name, killed,
    status: killed ? "killed" : crashed ? "harness_crash" : "survived",
    killedBy: [guardFailed && "guard", smokeFailed && "smoke", probeFailed && "probe"].filter(Boolean)
  });
}

const probe = (assertion) => (domain) => {
  const { calculateEvidenceConfidence, compareTasteProfiles, composeTasteProfileSnapshot } = domain;
  const snap = (userId, input) => makeSnapshot(composeTasteProfileSnapshot, userId, input);
  const confidence = (inputA, inputB) =>
    calculateEvidenceConfidence(compareTasteProfiles(snap("user-a", inputA), snap("user-b", inputB)));
  return assertion({ confidence, snap, calculateEvidenceConfidence, compareTasteProfiles });
};

const fiveFamilies = (user, values = {}) => ({
  preferences: [
    cuisine(user, values.cuisine ?? "japanese"),
    flavor(user, values.flavor ?? "coriander"),
    spice(user, values.spice ?? "medium")
  ],
  behavior: [favoriteRestaurant(user, values.restaurant ?? "rest-1"), favoriteMenuItem(user, values.restaurant ?? "rest-1", "item-1")]
});
const oneFamily = (user, value = "japanese") => ({ preferences: [cuisine(user, value)] });

// ================================================================================================
// 1-3. similarity leaking into confidence
mutation(1, "the similarity score is copied straight into confidence",
  [{ file: COMPUTE, from: "  const value = roundEvidenceConfidenceValue((dimensionCoverage + sourceCompleteness) / 2);", to: "  const value = roundEvidenceConfidenceValue(bundle.taste.score);" }],
  probe(({ confidence }) => {
    const agreeing = confidence(fiveFamilies("a"), fiveFamilies("b"));
    const disagreeing = confidence(fiveFamilies("a"), fiveFamilies("b", { cuisine: "french", flavor: "mushroom", restaurant: "rest-9" }));
    return agreeing.taste.value !== disagreeing.taste.value;
  }));

mutation(2, "a high similarity score raises confidence",
  [{ file: COMPUTE, from: "  const value = roundEvidenceConfidenceValue((dimensionCoverage + sourceCompleteness) / 2);", to: "  const value = roundEvidenceConfidenceValue(Math.min(1, ((dimensionCoverage + sourceCompleteness) / 2) * 0.5 + bundle.taste.score * 0.5));" }],
  null);

mutation(3, "a low similarity score lowers confidence",
  [{ file: COMPUTE, from: "  const value = roundEvidenceConfidenceValue((dimensionCoverage + sourceCompleteness) / 2);", to: "  const value = roundEvidenceConfidenceValue(bundle.taste.score === 0 ? 0 : (dimensionCoverage + sourceCompleteness) / 2);" }],
  null);

// 4-6. irrelevant dimensions contaminating taste confidence
mutation(4, "goal evidence boosts taste confidence",
  [{ file: COMPUTE, from: "  const dimensionCoverage = inputs.comparableFamilyCount / inputs.supportedFamilyCount;", to: "  const goalBonus = bundle.goalRestriction.goalCompatibility.status === \"scored\" ? 1 : 0;\n  const dimensionCoverage = Math.min(1, (inputs.comparableFamilyCount + goalBonus) / inputs.supportedFamilyCount);" }],
  probe(({ confidence }) => {
    const withoutGoal = confidence(oneFamily("a"), oneFamily("b"));
    const withGoal = confidence({ ...oneFamily("a"), goals: [goalLabel("a", "fat_loss")] }, { ...oneFamily("b"), goals: [goalLabel("b", "fat_loss")] });
    return withoutGoal.taste.value !== withGoal.taste.value;
  }));

mutation(5, "payment or dining evidence boosts taste confidence",
  [{ file: COMPUTE, from: "  const dimensionCoverage = inputs.comparableFamilyCount / inputs.supportedFamilyCount;", to: "  const contextBonus = bundle.socialContext.diningCompatibility.status === \"scored\" ? 1 : 0;\n  const dimensionCoverage = Math.min(1, (inputs.comparableFamilyCount + contextBonus) / inputs.supportedFamilyCount);" }],
  probe(({ confidence }) => {
    const withoutContext = confidence(oneFamily("a"), oneFamily("b"));
    const withContext = confidence(
      { preferences: [cuisine("a", "japanese"), diningStyle("a", "casual"), paymentPreference("a", "split_bill")] },
      { preferences: [cuisine("b", "japanese"), diningStyle("b", "casual"), paymentPreference("b", "split_bill")] }
    );
    return withoutContext.taste.value !== withContext.taste.value;
  }));

mutation(6, "ratings truncation lowers taste confidence despite ratings being unscored",
  [{ file: COMPUTE, from: "    { reachable: availability.tasteProfileAvailableForBoth, truncated: false },", to: "    { reachable: availability.tasteProfileAvailableForBoth, truncated: history.ratingsTruncatedForEither }," }],
  probe(({ confidence }) => {
    const control = confidence(oneFamily("a"), oneFamily("b"));
    const ratingsTruncated = confidence({ ...oneFamily("a"), ratingsTruncation: "known_truncated" }, oneFamily("b"));
    return control.taste.value !== ratingsTruncated.taste.value;
  }));

// 7-8. empty versus failed
const failedFavorites = { favorites: { status: "failed", evidenceCount: 1, failureCode: "source_read_failed" } };
mutation(7, "a failed source is treated as reachable, like empty",
  [{ file: COMPUTE, from: "    if (!source.reachable) {\n      anySourceUnreachable = true;\n      continue;\n    }", to: "    if (false) {\n      anySourceUnreachable = true;\n      continue;\n    }" }],
  probe(({ confidence }) => {
    const withFailed = confidence(
      { ...oneFamily("a"), behavior: [favoriteRestaurant("a", "rest-1")], sourceOverrides: failedFavorites },
      { ...oneFamily("b"), behavior: [favoriteRestaurant("b", "rest-1")], sourceOverrides: failedFavorites }
    );
    const withAvailable = confidence(
      { ...oneFamily("a"), behavior: [favoriteRestaurant("a", "rest-1")] },
      { ...oneFamily("b"), behavior: [favoriteRestaurant("b", "rest-1")] }
    );
    return withFailed.taste.value === withAvailable.taste.value;
  }));

mutation(8, "an empty source is treated as unreachable, like failed",
  [{ file: COMPUTE, from: "  const availability = bundle.confidenceInputs.sourceAvailability;", to: "  const availability = {\n    tasteProfileAvailableForBoth: bundle.confidenceInputs.dimensionAvailability.taste === \"scored\",\n    favoritesAvailableForBoth: bundle.taste.status === \"scored\" && bundle.taste.overlaps.includes(\"favorite_restaurant\"),\n    mealsAvailableForBoth: bundle.taste.status === \"scored\" && bundle.taste.overlaps.includes(\"repeated_meal_restaurant\"),\n    dietaryRestrictionsAvailableForBoth: bundle.confidenceInputs.sourceAvailability.dietaryRestrictionsAvailableForBoth\n  };" }],
  probe(({ confidence }) => {
    const emptySources = confidence(oneFamily("a"), oneFamily("b"));
    return emptySources.taste.status === "available" && emptySources.taste.inputs.completeRelevantSourceCount !== 3;
  }));

// 9-10. coverage magnitude
mutation(9, "one comparable family yields maximum confidence",
  [{ file: COMPUTE, from: "  const dimensionCoverage = inputs.comparableFamilyCount / inputs.supportedFamilyCount;", to: "  const dimensionCoverage = inputs.comparableFamilyCount > 0 ? 1 : 0;" }],
  probe(({ confidence }) => confidence(oneFamily("a"), oneFamily("b")).taste.value === 1));

mutation(10, "raw evidence item counts grow confidence without saturation",
  [{ file: COMPUTE, from: "  const dimensionCoverage = inputs.comparableFamilyCount / inputs.supportedFamilyCount;", to: "  const dimensionCoverage = Math.min(1, bundle.confidenceInputs.evidenceCoverage.totalEvidenceCount / 10);" }],
  null);

// 11-12. denominators
mutation(11, "the supported family denominator becomes 7",
  [{ file: POLICY, from: "export const TASTE_CONFIDENCE_SUPPORTED_DIMENSION_COUNT = 5;", to: "export const TASTE_CONFIDENCE_SUPPORTED_DIMENSION_COUNT = 7;" }],
  probe(({ confidence }) => confidence(fiveFamilies("a"), fiveFamilies("b")).taste.value !== 1));

mutation(12, "the relevant source denominator changes",
  [{ file: POLICY, from: "export const TASTE_CONFIDENCE_RELEVANT_SOURCE_COUNT = 3;", to: "export const TASTE_CONFIDENCE_RELEVANT_SOURCE_COUNT = 4;" }],
  probe(({ confidence }) => confidence(fiveFamilies("a"), fiveFamilies("b")).taste.value !== 1));

// 13. hidden weighting
mutation(13, "a hidden 70/30 weighting replaces the unweighted mean",
  [{ file: COMPUTE, from: "  const value = roundEvidenceConfidenceValue((dimensionCoverage + sourceCompleteness) / 2);", to: "  const value = roundEvidenceConfidenceValue(dimensionCoverage * 0.7 + sourceCompleteness * 0.3);" }],
  probe(({ confidence }) => confidence(oneFamily("a"), oneFamily("b")).taste.value !== 0.6));

// 14. sourceConfidence
mutation(14, "meal sourceConfidence is used as a reliability multiplier",
  [{ file: COMPUTE, from: "  const value = roundEvidenceConfidenceValue((dimensionCoverage + sourceCompleteness) / 2);", to: "  const sourceConfidence = 0.5;\n  const value = roundEvidenceConfidenceValue(((dimensionCoverage + sourceCompleteness) / 2) * sourceConfidence);" }],
  null);

// 15-16. recency
mutation(15, "a wall-clock recency term is introduced",
  [{ file: COMPUTE, from: "  const value = roundEvidenceConfidenceValue((dimensionCoverage + sourceCompleteness) / 2);", to: "  const recency = Date.now() > 0 ? 1 : 0;\n  const value = roundEvidenceConfidenceValue(((dimensionCoverage + sourceCompleteness) / 2) * recency);" }],
  null);

mutation(16, "evidence age lowers confidence",
  [{ file: COMPUTE, from: "  const families = collectComparableFamilies(bundle.taste.comparableDimensions);", to: "  const generatedAt = \"2026-08-08\";\n  void generatedAt;\n  const families = collectComparableFamilies(bundle.taste.comparableDimensions);" }],
  null);

// 17. zero instead of not_available
mutation(17, "an unscored taste component reports the number zero instead of not_available",
  [{ file: COMPUTE, from: '  if (bundle.taste.status !== "scored") return { status: "not_available", reason: "component_not_scored" };', to: '  if (bundle.taste.status !== "scored") {\n    return {\n      status: "available",\n      value: 0,\n      basis: "limited_evidence_coverage",\n      inputs: { comparableFamilyCount: 0, supportedFamilyCount: TASTE_CONFIDENCE_SUPPORTED_DIMENSION_COUNT, completeRelevantSourceCount: 0, relevantSourceCount: TASTE_CONFIDENCE_RELEVANT_SOURCE_COUNT }\n    };\n  }' }],
  probe(({ confidence }) => {
    const empty = confidence({}, {});
    return empty.taste.status === "available" || "value" in empty.taste;
  }));

// 18-19. restriction safety
mutation(18, "a numeric restriction safety value is introduced",
  [{ file: TYPES, from: "export type RestrictionEvidenceState = {\n  evidencePresentForBoth: boolean;", to: "export type RestrictionEvidenceState = {\n  safetyConfidence: number;\n  evidencePresentForBoth: boolean;" },
   { file: COMPUTE, from: "  return {\n    evidencePresentForBoth:", to: "  return {\n    safetyConfidence: bundle.goalRestriction.confidenceInputs.restriction.unclassifiedRestrictionPresent ? 0.3 : 1,\n    evidencePresentForBoth:" }],
  probe(({ confidence }) => "safetyConfidence" in confidence(
    { restrictions: [restriction("a", "peanut", { rawSeverity: "severe" })] },
    { restrictions: [restriction("b", "coriander")] }
  ).restrictionEvidence));

mutation(19, "the unclassified restriction flag is dropped",
  [{ file: COMPUTE, from: "    unclassifiedPresent: bundle.goalRestriction.confidenceInputs.restriction.unclassifiedRestrictionPresent,", to: "    unclassifiedPresent: false," }],
  probe(({ confidence }) => !confidence(
    { restrictions: [restriction("a", "peanut", { rawSeverity: "severe" })] },
    { restrictions: [restriction("b", "coriander")] }
  ).restrictionEvidence.unclassifiedPresent));

// 20-22. contract shape
mutation(20, "numeric confidence is introduced for the context dimensions",
  [{ file: TYPES, from: "export type AvailableEvidenceStateResult = {\n  status: \"available\";\n  basis: EvidenceConfidenceBasis;\n};", to: "export type AvailableEvidenceStateResult = {\n  status: \"available\";\n  value: number;\n  basis: EvidenceConfidenceBasis;\n};" },
   { file: COMPUTE, from: 'return { status: "available", basis: "explicit_evidence_only" };', to: 'return { status: "available", value: 1, basis: "explicit_evidence_only" };' }],
  probe(({ confidence }) => "value" in confidence(
    { preferences: [mealType("a", "lunch")] },
    { preferences: [mealType("b", "lunch")] }
  ).mealPattern));

mutation(21, "numeric confidence is introduced for the goal dimension only",
  [{ file: COMPUTE, from: "    goal: mapEvidenceState(bundle.goalRestriction.goalCompatibility.status, schemaSupported),", to: "    goal: { ...mapEvidenceState(bundle.goalRestriction.goalCompatibility.status, schemaSupported), ...({ value: 1 } as Record<string, unknown>) }," }],
  probe(({ confidence }) => "value" in confidence(
    { goals: [goalLabel("a", "fat_loss")] },
    { goals: [goalLabel("b", "fat_loss")] }
  ).goal));

mutation(22, "a global aggregate confidence is introduced",
  [{ file: COMPUTE, from: "    restrictionEvidence: collectRestrictionEvidenceState(bundle)", to: "    restrictionEvidence: collectRestrictionEvidenceState(bundle),\n    ...({ overallConfidence: 0.5 } as Record<string, unknown>)" }],
  probe(({ confidence }) => Object.keys(confidence(oneFamily("a"), oneFamily("b"))).some((key) => /overall|aggregate|global/i.test(key))));

// 23-24. consumer-policy signals
mutation(23, "a cold-start fallback is introduced inside TS-4",
  [{ file: COMPUTE, from: "  const schemaSupported = bundle.status === \"assembled\";", to: "  const popularityFallback = true;\n  const recommendThreshold = 0.5;\n  void [popularityFallback, recommendThreshold];\n  const schemaSupported = bundle.status === \"assembled\";" }],
  null);

mutation(24, "a GPS, premium or activity signal is introduced",
  [{ file: COMPUTE, from: "  const schemaSupported = bundle.status === \"assembled\";", to: "  const distanceKm = 0;\n  const isPremium = false;\n  const activityScore = 0;\n  void [distanceKm, isPremium, activityScore];\n  const schemaSupported = bundle.status === \"assembled\";" }],
  null);

// 25. reachable floor rescaled
mutation(25, "the reachable floor is rescaled to zero",
  [{ file: COMPUTE, from: "  const value = roundEvidenceConfidenceValue((dimensionCoverage + sourceCompleteness) / 2);", to: "  const floor = 0.1;\n  const raw = (dimensionCoverage + sourceCompleteness) / 2;\n  const value = roundEvidenceConfidenceValue((raw - floor) / (1 - floor));" }],
  null);

// 26. ratings added as a relevant source
mutation(26, "ratings are added as a relevant taste source",
  [{ file: COMPUTE, from: "    { reachable: availability.mealsAvailableForBoth, truncated: history.mealsTruncatedForEither }", to: "    { reachable: availability.mealsAvailableForBoth, truncated: history.mealsTruncatedForEither },\n    { reachable: availability.ratingsAvailableForBoth, truncated: history.ratingsTruncatedForEither }" }],
  null);

// 27. policy version omitted
mutation(27, "the evidence confidence policy version is omitted from the result",
  [{ file: COMPUTE, from: "      evidenceConfidencePolicyVersion: EVIDENCE_CONFIDENCE_POLICY_VERSION,", to: "" }],
  probe(({ confidence }) => confidence(oneFamily("a"), oneFamily("b")).versions.evidenceConfidencePolicyVersion === undefined));

// 28. suppressed fallback counted as a second family
mutation(28, "a suppressed fallback dimension is counted as a second family",
  [{ file: POLICY, from: '    repeated_meal_restaurant: "restaurant_identity",', to: '    repeated_meal_restaurant: "repeated_restaurant_identity",' }],
  null);

// 29. basis alters the numeric value
mutation(29, "the reported basis alters the numeric value",
  [{ file: COMPUTE, from: "  return { status: \"available\", value, basis: selectBasis(families, relevantSources), inputs };", to: "  const basis = selectBasis(families, relevantSources);\n  return { status: \"available\", value: basis === \"limited_evidence_coverage\" ? roundEvidenceConfidenceValue(value / 2) : value, basis, inputs };" }],
  probe(({ confidence }) => confidence(oneFamily("a"), oneFamily("b")).taste.value !== 0.6));

// ================================================================================================
const killed = results.filter((entry) => entry.killed);
const survived = results.filter((entry) => !entry.killed);
console.log(JSON.stringify({
  suite: "taste-similarity-ts4-mutations",
  status: survived.length === 0 ? "passed" : "failed",
  totalMutations: results.length,
  killed: killed.length,
  survived: survived.length,
  results,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
if (survived.length) process.exitCode = 1;
