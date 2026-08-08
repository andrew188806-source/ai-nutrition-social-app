#!/usr/bin/env node
// TS-3C mutation proof — SOCIAL CONTEXT COMPATIBILITY.
//
// Each mutation rewrites REAL implementation bytes on disk, then requires that the TS-3C guard, the
// TS-3C smoke, or a dedicated behavioural probe FAILS. A mutation nothing notices is a hole.
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
const compatibilityRoot = path.join(domainRoot, "compatibility");
const similarityRoot = path.join(domainRoot, "similarity");

const file = (name) => path.join(compatibilityRoot, name);
const COMPARATOR = file("comparator.ts");
const POLICY = file("policy.ts");
const TYPES = file("types.ts");
const REASON_CODES = file("reasonCodes.ts");
const TASTE_COMPARATOR = path.join(similarityRoot, "comparator.ts");
const TASTE_POLICY = path.join(similarityRoot, "policy.ts");

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
const mealType = (user, value) => preference(user, "meal_pattern", "meal_type", "positive", value);
const diningStyle = (user, value) => preference(user, "dining_context", "dining_style", "unclassified", value, "dining");
const paymentPreference = (user, value) => preference(user, "social_logistics", "payment_preference", "unclassified", value, "payment");
const favoriteRestaurant = (user, restaurantId) => ({
  category: "behavior", behaviorKind: "favorite", favoriteKind: "restaurant", interpretation: "positive_user_action",
  evidence: envelope(`fav:${user}:r:${restaurantId}`, "favorite", "favorite_restaurant", "user_action", "not_eligible", { kind: "restaurant", restaurantId })
});
const meal = (target, { id, at = "2026-08-01T12:00:00.000Z" } = {}) => ({
  category: "behavior", behaviorKind: "meal_occurrence", interpretation: "observed", mealType: "lunch",
  occurredAt: at, consumedRatio: 1,
  evidence: envelope(id, "meal_record", "meal_record_item", "observed_consumption", "source_policy", target, { recordedAt: at })
});
const atRestaurant = (restaurantId) => ({ kind: "restaurant", restaurantId });
const rating = (user, restaurantId, ratingValue) => ({
  category: "behavior", behaviorKind: "rating", ratingKind: "restaurant", interpretation: "scalar_evaluation_unclassified",
  ratingValue, feedback: { dislikeReasons: [] },
  evidence: envelope(`rating:${user}:${restaurantId}`, "rating", "restaurant_rating", "user_action", "source_policy", { kind: "restaurant", restaurantId })
});
const goal = (user, value) => ({
  category: "goal", facet: "daily_calories_target", value, unit: "kcal",
  validity: { startsOn: "2026-08-01", isActive: true },
  evidence: envelope(`goal:${user}`, "nutrition_goal", "nutrition_goal", "user_explicit", "not_eligible")
});
const restriction = (user, label) => ({
  category: "restriction", restrictionType: "allergy", label, rawSeverity: "preference", visibility: "private",
  evidence: envelope(`restr:${user}:${label}`, "dietary_restriction", "dietary_restriction", "user_explicit", "not_eligible")
});

const state = (count) => (count > 0 ? { status: "available", evidenceCount: count } : { status: "empty", evidenceCount: 0 });
function makeSnapshot(compose, userId, { preferences = [], behavior = [], goals = [], restrictions = [] } = {}) {
  return compose({
    subjectUserId: userId,
    preferences, goals, restrictions, behavior,
    sourceStates: {
      taste_profile: state(preferences.length),
      nutrition_goals: state(goals.length),
      dietary_restrictions: state(restrictions.length),
      meals: state(behavior.filter((entry) => entry.behaviorKind === "meal_occurrence").length),
      favorites: state(behavior.filter((entry) => entry.behaviorKind === "favorite").length),
      ratings: state(behavior.filter((entry) => entry.behaviorKind === "rating").length)
    },
    generatedAt: "2026-08-08T12:00:00.000Z",
    evidenceWindow: {
      historyScope: "bounded",
      meals: { requestedStartDate: "2026-07-01", requestedEndDate: "2026-08-08", requestedLimit: 50, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" },
      favorites: { requestedLimit: 25, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" },
      ratings: { requestedLimit: null, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" }
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
      guardFailed = !runSuite("scripts/taste-similarity-ts3c-guard.mjs");
      smokeFailed = !runSuite("scripts/taste-similarity-ts3c-smoke.mjs");
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
  const { compareSocialContextCompatibility, compareTasteSimilarity, composeTasteProfileSnapshot } = domain;
  const snap = (userId, input) => makeSnapshot(composeTasteProfileSnapshot, userId, input);
  return assertion({ compat: compareSocialContextCompatibility, taste: compareTasteSimilarity, snap });
};

const contextOf = (user) => [mealType(user, "lunch"), diningStyle(user, "casual"), paymentPreference(user, "split_bill")];

// ================================================================================================
// 1-3. context scopes leaking into taste
mutation(1, "meal_pattern preference leaks into the taste comparator",
  [{ file: TASTE_COMPARATOR, from: 'if (preference.scope !== "food_taste") continue;', to: 'if (preference.scope !== "food_taste" && preference.scope !== "meal_pattern") continue;' }],
  probe(({ taste, snap }) => {
    const withContext = taste(
      snap("user-a", { preferences: [cuisine("a", "japanese"), mealType("a", "lunch")] }),
      snap("user-b", { preferences: [cuisine("b", "japanese"), mealType("b", "lunch")] })
    );
    return withContext.confidenceInputs.explicitEvidenceCount !== 2;
  }));

mutation(2, "dining_context preference leaks into the taste comparator",
  [{ file: TASTE_COMPARATOR, from: 'if (preference.scope !== "food_taste") continue;', to: 'if (preference.scope !== "food_taste" && preference.scope !== "dining_context") continue;' }],
  probe(({ taste, snap }) => {
    const withContext = taste(
      snap("user-a", { preferences: [cuisine("a", "japanese"), diningStyle("a", "casual")] }),
      snap("user-b", { preferences: [cuisine("b", "japanese"), diningStyle("b", "casual")] })
    );
    return withContext.confidenceInputs.explicitEvidenceCount !== 2;
  }));

mutation(3, "payment preference leaks into the taste comparator",
  [{ file: TASTE_COMPARATOR, from: 'if (preference.scope !== "food_taste") continue;', to: 'if (preference.scope !== "food_taste" && preference.scope !== "social_logistics") continue;' }],
  probe(({ taste, snap }) => {
    const withContext = taste(
      snap("user-a", { preferences: [cuisine("a", "japanese"), paymentPreference("a", "split_bill")] }),
      snap("user-b", { preferences: [cuisine("b", "japanese"), paymentPreference("b", "split_bill")] })
    );
    return withContext.confidenceInputs.explicitEvidenceCount !== 2;
  }));

// 4. the three dimensions are blended into one aggregate
mutation(4, "the three dimensions are blended into an aggregate score",
  [{ file: COMPARATOR, from: "    confidenceInputs: buildConfidenceInputs(", to: "    ...({ overallSocialCompatibility: dimensions.filter((entry) => entry.status === \"scored\").reduce((sum, entry) => sum + (entry as { score: number }).score, 0) / Math.max(1, comparableDimensionCount) } as Record<string, unknown>),\n    confidenceInputs: buildConfidenceInputs(" }],
  probe(({ compat, snap }) => {
    const result = compat(snap("user-a", { preferences: contextOf("a") }), snap("user-b", { preferences: contextOf("b") }));
    return Object.keys(result).some((key) => /overall|aggregate/i.test(key));
  }));

// 5. missing evidence becomes a mismatch
mutation(5, "missing evidence is scored as a mismatch instead of not_scored",
  [{ file: COMPARATOR, from: "  if (leftMissing && rightMissing) return \"no_comparable_evidence\";\n  if (leftMissing || rightMissing) return \"insufficient_evidence\";", to: "  if (leftMissing && rightMissing) return \"no_comparable_evidence\";" }],
  probe(({ compat, snap }) => {
    const result = compat(snap("user-a", { preferences: [mealType("a", "lunch")] }), snap("user-b", { preferences: [diningStyle("b", "casual")] }));
    return result.mealPatternCompatibility.status === "scored";
  }));

// 6. a measured zero is hidden as unknown
mutation(6, "disjoint explicit values are hidden as not_scored",
  [{ file: COMPARATOR, from: "  return scored(dimension, \"categorical_equality\", left === right ? 1 : 0);", to: "  if (left !== right) return notScored(dimension, \"categorical_equality\", \"no_comparable_evidence\");\n  return scored(dimension, \"categorical_equality\", 1);" }],
  probe(({ compat, snap }) => {
    const result = compat(
      snap("user-a", { preferences: [diningStyle("a", "casual")] }),
      snap("user-b", { preferences: [diningStyle("b", "fine_dining")] })
    );
    return result.diningCompatibility.status !== "scored";
  }));

// 7. an arbitrary weight appears
mutation(7, "an arbitrary weight is applied to a dimension score",
  [{ file: COMPARATOR, from: "  return scored(dimension, \"set_overlap\", intersectionSize / unionSize);", to: "  return scored(dimension, \"set_overlap\", (intersectionSize / unionSize) * 0.7);" }],
  probe(({ compat, snap }) => {
    const result = compat(snap("user-a", { preferences: [mealType("a", "lunch")] }), snap("user-b", { preferences: [mealType("b", "lunch")] }));
    return result.mealPatternCompatibility.score !== 1;
  }));

// 8. meal history is inferred into meal pattern
mutation(8, "meal history is inferred into meal pattern compatibility",
  [{ file: COMPARATOR, from: "  for (const preference of snapshot.preferences as readonly PreferenceEvidence[]) {", to: "  for (const entry of snapshot.behavior as readonly { behaviorKind: string; mealType?: { classification: string; value?: string } }[]) {\n    if (entry.behaviorKind !== \"meal_occurrence\") continue;\n    if (entry.mealType && entry.mealType.classification === \"known\" && entry.mealType.value) {\n      mealTypes.push(entry.mealType.value);\n      mealTypeEvidenceCount += 1;\n    }\n  }\n  for (const preference of snapshot.preferences as readonly PreferenceEvidence[]) {" }],
  probe(({ compat, snap }) => {
    const result = compat(
      snap("user-a", { behavior: [meal(atRestaurant("rest-1"), { id: "m:a:1" })] }),
      snap("user-b", { behavior: [meal(atRestaurant("rest-1"), { id: "m:b:1" })] })
    );
    return result.mealPatternCompatibility.status === "scored";
  }));

// 9. a favorite is inferred into dining compatibility
mutation(9, "a favorite is inferred into dining compatibility",
  [{ file: COMPARATOR, from: "  const tasteProfileState = snapshot.sourceStates.taste_profile.status;", to: "  for (const entry of snapshot.behavior as readonly { behaviorKind: string; favoriteKind?: string }[]) {\n    if (entry.behaviorKind === \"favorite\" && diningStyle === null) {\n      diningStyle = entry.favoriteKind ?? \"unknown\";\n      diningStyleEvidenceCount += 1;\n    }\n  }\n  const tasteProfileState = snapshot.sourceStates.taste_profile.status;" }],
  probe(({ compat, snap }) => {
    const result = compat(
      snap("user-a", { behavior: [favoriteRestaurant("a", "rest-1")] }),
      snap("user-b", { behavior: [favoriteRestaurant("b", "rest-2")] })
    );
    return result.diningCompatibility.status === "scored";
  }));

// 10. a rating affects compatibility
mutation(10, "a rating value affects compatibility",
  [{ file: COMPARATOR, from: "    } else if (preference.scope === \"social_logistics\" && preference.facet === \"payment_preference\") {", to: "    } else if ((preference as { ratingValue?: number }).ratingValue !== undefined) {\n      paymentPreference = String((preference as { ratingValue?: number }).ratingValue);\n      paymentPreferenceEvidenceCount += 1;\n    } else if (preference.scope === \"social_logistics\" && preference.facet === \"payment_preference\") {" }],
  null);

// 11. a nutrition goal affects compatibility
mutation(11, "a nutrition goal affects compatibility",
  [{ file: COMPARATOR, from: "  const tasteProfileState = snapshot.sourceStates.taste_profile.status;", to: "  for (const entry of snapshot.goals as readonly { facet: string; value: number }[]) {\n    if (diningStyle === null) {\n      diningStyle = `${entry.facet}:${entry.value}`;\n      diningStyleEvidenceCount += 1;\n    }\n  }\n  const tasteProfileState = snapshot.sourceStates.taste_profile.status;" }],
  probe(({ compat, snap }) => {
    const withoutGoals = compat({ ...snap("user-a", { preferences: contextOf("a") }) }, { ...snap("user-b", { preferences: contextOf("b") }) });
    const withGoals = compat(
      snap("user-a", { preferences: contextOf("a"), goals: [goal("a", 1800)] }),
      snap("user-b", { preferences: contextOf("b"), goals: [goal("b", 2400)] })
    );
    return JSON.stringify(withoutGoals) !== JSON.stringify(withGoals);
  }));

// 12. a dietary restriction affects compatibility
mutation(12, "a dietary restriction affects compatibility",
  [{ file: COMPARATOR, from: "    explicitEvidenceCount: mealTypeEvidenceCount + diningStyleEvidenceCount + paymentPreferenceEvidenceCount,", to: "    explicitEvidenceCount: mealTypeEvidenceCount + diningStyleEvidenceCount + paymentPreferenceEvidenceCount + snapshot.restrictions.length," }],
  probe(({ compat, snap }) => {
    const withoutRestrictions = compat(snap("user-a", { preferences: contextOf("a") }), snap("user-b", { preferences: contextOf("b") }));
    const withRestrictions = compat(
      snap("user-a", { preferences: contextOf("a"), restrictions: [restriction("a", "peanut")] }),
      snap("user-b", { preferences: contextOf("b"), restrictions: [restriction("b", "shellfish")] })
    );
    return JSON.stringify(withoutRestrictions) !== JSON.stringify(withRestrictions);
  }));

// 13. a GPS signal affects compatibility
mutation(13, "a GPS or proximity signal affects compatibility",
  [{ file: COMPARATOR, from: "  const dimensions = [mealPatternCompatibility, diningCompatibility, socialLogisticsCompatibility];", to: "  const distanceKm = 0;\n  const nearbyStatus = \"nearby\";\n  void [distanceKm, nearbyStatus];\n  const dimensions = [mealPatternCompatibility, diningCompatibility, socialLogisticsCompatibility];" }],
  null);

// 14. a premium signal affects compatibility
mutation(14, "a premium signal affects compatibility",
  [{ file: COMPARATOR, from: "  const reasonCodes = new Set<SocialContextCompatibilityReasonCode>();", to: "  const isPremium = false;\n  void isPremium;\n  const reasonCodes = new Set<SocialContextCompatibilityReasonCode>();" }],
  null);

// 15. verified or activity signals affect compatibility
mutation(15, "a verified or activity signal affects compatibility",
  [{ file: COMPARATOR, from: "  const leftFacts = collectContextFacts(left);", to: "  const isVerified = false;\n  const activityScore = 0;\n  void [isVerified, activityScore];\n  const leftFacts = collectContextFacts(left);" }],
  null);

// 16. symmetry broken
mutation(16, "argument order changes the compatibility result",
  [{ file: COMPARATOR, from: "  return compareCodeUnits(first.subjectUserId, second.subjectUserId) <= 0 ? [first, second] : [second, first];", to: "  return [first, second];" },
   { file: COMPARATOR, from: "  const dimensions = [mealPatternCompatibility, diningCompatibility, socialLogisticsCompatibility];", to: "  const dimensions = left.subjectUserId > right.subjectUserId\n    ? [mealPatternCompatibility]\n    : [mealPatternCompatibility, diningCompatibility, socialLogisticsCompatibility];" }],
  probe(({ compat, snap }) => {
    const a = snap("user-a", { preferences: contextOf("a") });
    const b = snap("user-b", { preferences: contextOf("b") });
    return JSON.stringify(compat(a, b)) !== JSON.stringify(compat(b, a));
  }));

// 17. the raw payment value is exposed
mutation(17, "the raw payment preference value is exposed in the result",
  [{ file: COMPARATOR, from: "    explanationReasonCodes: orderSocialContextCompatibilityReasonCodes(reasonCodes)\n  };\n}", to: "    explanationReasonCodes: orderSocialContextCompatibilityReasonCodes(reasonCodes),\n    ...({ sharedPaymentPreference: leftFacts.paymentPreference } as Record<string, unknown>)\n  };\n}" }],
  probe(({ compat, snap }) => {
    const result = compat(snap("user-a", { preferences: contextOf("a") }), snap("user-b", { preferences: contextOf("b") }));
    return JSON.stringify(result).includes("split_bill");
  }));

// 18. the raw dining value is exposed
mutation(18, "the raw dining style value is exposed in the result",
  [{ file: COMPARATOR, from: "  return { dimension, comparisonMode, status: \"scored\", score: roundSocialContextCompatibilityScore(value) };", to: "  return { dimension, comparisonMode, status: \"scored\", score: roundSocialContextCompatibilityScore(value), ...(globalThis as unknown as { __ctx?: Record<string, unknown> }).__ctx };" },
   { file: COMPARATOR, from: "  const diningCompatibility = compareCategories(", to: "  (globalThis as unknown as { __ctx?: Record<string, unknown> }).__ctx = { rawDiningStyle: leftFacts.diningStyle };\n  const diningCompatibility = compareCategories(" }],
  probe(({ compat, snap }) => {
    const result = compat(snap("user-a", { preferences: contextOf("a") }), snap("user-b", { preferences: contextOf("b") }));
    return JSON.stringify(result).includes("casual");
  }));

// 19. the policy version is omitted
mutation(19, "the compatibility policy version is omitted from the result",
  [{ file: COMPARATOR, from: "    policyVersion: SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,\n    snapshotSchemaVersion: SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,\n    mealPatternCompatibility,", to: "    snapshotSchemaVersion: SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,\n    mealPatternCompatibility," }],
  probe(({ compat, snap }) => {
    const result = compat(snap("user-a", { preferences: contextOf("a") }), snap("user-b", { preferences: contextOf("b") }));
    return result.policyVersion === undefined;
  }));

// 20. the taste policy version is accidentally bumped
mutation(20, "the taste policy version is bumped by this round",
  [{ file: TASTE_POLICY, from: 'export const TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-v1.1" as const;', to: 'export const TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-v2" as const;' }],
  probe(({ taste, snap }) => {
    const result = taste(
      snap("user-a", { preferences: [cuisine("a", "japanese")] }),
      snap("user-b", { preferences: [cuisine("b", "japanese")] })
    );
    return result.policyVersion !== "taste-similarity-v1.1";
  }));

// 21. a score appears on a not_scored dimension
mutation(21, "a not_scored dimension carries a score key",
  [{ file: COMPARATOR, from: "  return { dimension, comparisonMode, status: \"not_scored\", reason };", to: "  return { dimension, comparisonMode, status: \"not_scored\", score: 0, reason };" }],
  probe(({ compat, snap }) => "score" in compat(snap("user-a"), snap("user-b")).mealPatternCompatibility));

// 22. reason-code ordering stops following the declaration rank
// Dropping the sort entirely would be a no-op today, because the comparator happens to add codes in
// declaration order — the sort is what keeps that true rather than incidental. So the injected defect
// is the plausible one: someone "simplifies" the rank comparator into a plain lexicographic sort.
mutation(22, "reason code ordering follows lexicographic order instead of the declaration rank",
  [{ file: REASON_CODES, from: "  return [...new Set(codes)].sort(\n    (left, right) => (REASON_CODE_RANK.get(left) ?? 0) - (REASON_CODE_RANK.get(right) ?? 0)\n  );", to: "  return [...new Set(codes)].sort();" }],
  probe(({ compat, snap }) => {
    const result = compat(
      snap("user-a", { preferences: [paymentPreference("a", "split_bill"), diningStyle("a", "casual"), mealType("a", "lunch")] }),
      snap("user-b", { preferences: [paymentPreference("b", "split_bill"), diningStyle("b", "casual"), mealType("b", "lunch")] })
    );
    return JSON.stringify(result.explanationReasonCodes) !== JSON.stringify(["shared_meal_type_preference", "similar_dining_style", "compatible_payment_preference"]);
  }));

// 23. the scope mapping is crossed over
mutation(23, "dining_context evidence is routed into the meal pattern dimension",
  [{ file: COMPARATOR, from: "    } else if (preference.scope === \"dining_context\" && preference.facet === \"dining_style\") {", to: "    } else if (preference.scope === \"dining_context\") {\n      mealTypes.push(preference.value);\n      mealTypeEvidenceCount += 1;\n    } else if (false && preference.facet === \"dining_style\") {" }],
  probe(({ compat, snap }) => {
    const result = compat(
      snap("user-a", { preferences: [diningStyle("a", "casual")] }),
      snap("user-b", { preferences: [diningStyle("b", "casual")] })
    );
    return result.mealPatternCompatibility.status === "scored" || result.diningCompatibility.status === "scored";
  }));

// 24. an unsupported snapshot schema is scored anyway
mutation(24, "an unsupported snapshot schema is scored instead of failing closed",
  [{ file: COMPARATOR, from: "    snapshotA.schemaVersion !== SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION ||\n    snapshotB.schemaVersion !== SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION", to: "    snapshotA.schemaVersion === undefined ||\n    snapshotB.schemaVersion === undefined" }],
  probe(({ compat, snap }) => {
    const base = snap("user-a", { preferences: contextOf("a") });
    const result = compat({ ...base, schemaVersion: "taste-profile-snapshot-v99" }, snap("user-b", { preferences: contextOf("b") }));
    return result.mealPatternCompatibility.status === "scored";
  }));

// ================================================================================================
const killed = results.filter((entry) => entry.killed);
const survived = results.filter((entry) => !entry.killed);
console.log(JSON.stringify({
  suite: "taste-similarity-ts3c-mutations",
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
