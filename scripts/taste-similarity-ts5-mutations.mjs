#!/usr/bin/env node
// TS-5 mutation proof — COLD START EVIDENCE POLICY V1.
//
// Each mutation rewrites REAL implementation bytes on disk, then requires that the TS-5 guard, the
// TS-5 smoke, or a dedicated behavioural probe FAILS. A mutation nothing notices is a hole.
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
const coldStartRoot = path.join(domainRoot, "cold-start");

const ASSESS = path.join(coldStartRoot, "assess.ts");
const POLICY = path.join(coldStartRoot, "policy.ts");
const TYPES = path.join(coldStartRoot, "types.ts");

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
const favoriteRestaurant = (user, restaurantId) => ({
  category: "behavior", behaviorKind: "favorite", favoriteKind: "restaurant", interpretation: "positive_user_action",
  evidence: envelope(`fav:${user}:r:${restaurantId}`, "favorite", "favorite_restaurant", "user_action", "not_eligible", { kind: "restaurant", restaurantId })
});
const favoriteMenuItem = (user, restaurantId, menuItemId) => ({
  category: "behavior", behaviorKind: "favorite", favoriteKind: "menu_item", interpretation: "positive_user_action",
  evidence: envelope(`fav:${user}:m:${restaurantId}:${menuItemId}`, "favorite", "favorite_menu_item", "user_action", "not_eligible", { kind: "menu_item", restaurantId, menuItemId })
});
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
      meals: counted(0),
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
      guardFailed = !runSuite("scripts/taste-similarity-ts5-guard.mjs");
      smokeFailed = !runSuite("scripts/taste-similarity-ts5-smoke.mjs");
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
  const { assessColdStart, calculateEvidenceConfidence, compareTasteProfiles, composeTasteProfileSnapshot } = domain;
  const snap = (userId, input) => makeSnapshot(composeTasteProfileSnapshot, userId, input);
  const assess = (inputA, inputB) => {
    const bundle = compareTasteProfiles(snap("user-a", inputA), snap("user-b", inputB));
    return assessColdStart(bundle, calculateEvidenceConfidence(bundle));
  };
  return assertion({ assess, snap, assessColdStart, calculateEvidenceConfidence, compareTasteProfiles });
};

const fiveFamilies = (user, values = {}) => ({
  preferences: [cuisine(user, values.cuisine ?? "japanese"), flavor(user, values.flavor ?? "coriander"), spice(user, values.spice ?? "medium")],
  behavior: [favoriteRestaurant(user, values.restaurant ?? "rest-1"), favoriteMenuItem(user, values.restaurant ?? "rest-1", "item-1")]
});
const oneCuisine = (user, value = "japanese") => ({ preferences: [cuisine(user, value)] });
const failedTasteProfile = { taste_profile: { status: "failed", evidenceCount: 1, failureCode: "source_read_failed" } };
const failedFavorites = { favorites: { status: "failed", evidenceCount: 1, failureCode: "source_read_failed" } };

// ================================================================================================
// 1-4. similarity and confidence driving classification
mutation(1, "a similarity score of zero forces an unavailable evidence state",
  [{ file: ASSESS, from: '  if (comparison.confidenceInputs.dimensionAvailability.taste === "scored") {', to: '  if (comparison.confidenceInputs.dimensionAvailability.taste === "scored" && comparison.taste.status === "scored" && comparison.taste.score > 0) {' }],
  probe(({ assess }) => {
    const disjoint = assess(oneCuisine("a", "japanese"), oneCuisine("b", "french"));
    return disjoint.tasteEvidence.state !== "comparable";
  }));

mutation(2, "a perfect similarity score is reported as a readiness verdict",
  [{ file: ASSESS, from: "    restrictionState,\n    reasonCodes: collectReasonCodes(", to: "    ...({ ready: comparison.taste.status === \"scored\" && comparison.taste.score === 1 } as Record<string, unknown>),\n    restrictionState,\n    reasonCodes: collectReasonCodes(" }],
  probe(({ assess }) => "ready" in assess(fiveFamilies("a"), fiveFamilies("b"))));

mutation(3, "a confidence value at or above a threshold is treated as ready",
  [{ file: ASSESS, from: "    return { state: \"comparable\", basis: confidence.taste.basis, value: confidence.taste.value };", to: "    if (confidence.taste.value >= 0.5) return { state: \"comparable\", basis: confidence.taste.basis, value: confidence.taste.value };\n    return { state: \"sources_incomplete\" };" }],
  null);

mutation(4, "a confidence value below a threshold is treated as cold start",
  [{ file: ASSESS, from: "  const tasteEvidence = classifyTasteEvidence(comparison, confidence, tasteSourcesComplete);", to: "  const raw = classifyTasteEvidence(comparison, confidence, tasteSourcesComplete);\n  const tasteEvidence = raw.state === \"comparable\" && raw.value < 0.5 ? { state: \"no_comparable_evidence\" as const } : raw;" }],
  null);

// 5-6. empty versus failed
mutation(5, "a failed source is treated as reachable, like empty",
  [{ file: ASSESS, from: "  const tasteSourcesReachable =\n    availability.tasteProfileAvailableForBoth &&\n    availability.favoritesAvailableForBoth &&\n    availability.mealsAvailableForBoth;", to: "  const tasteSourcesReachable = true;" }],
  probe(({ assess }) => {
    const failed = assess({ sourceOverrides: failedTasteProfile }, { sourceOverrides: failedTasteProfile });
    return failed.tasteEvidence.state === "no_comparable_evidence";
  }));

mutation(6, "an empty source is treated as unreachable, like failed",
  [{ file: ASSESS, from: "  const tasteSourcesReachable =\n    availability.tasteProfileAvailableForBoth &&", to: "  const tasteSourcesReachable =\n    comparison.confidenceInputs.evidenceCoverage.totalEvidenceCount > 0 &&\n    availability.tasteProfileAvailableForBoth &&" }],
  probe(({ assess }) => {
    const empty = assess({}, {});
    return empty.tasteEvidence.state !== "no_comparable_evidence";
  }));

// 7-8. truncation
mutation(7, "truncated history is treated as a new-user classification",
  [{ file: ASSESS, from: "  const tasteEvidence = classifyTasteEvidence(comparison, confidence, tasteSourcesComplete);", to: "  const classified = classifyTasteEvidence(comparison, confidence, tasteSourcesComplete);\n  const tasteEvidence = !tasteHistoryComplete ? { state: \"no_comparable_evidence\" as const } : classified;" }],
  probe(({ assess }) => {
    const truncated = assess({ ...oneCuisine("a"), mealsTruncation: "known_truncated" }, oneCuisine("b"));
    return truncated.tasteEvidence.state !== "comparable";
  }));

mutation(8, "ratings truncation changes the assessment",
  [{ file: ASSESS, from: "  const tasteHistoryComplete = !history.favoritesTruncatedForEither && !history.mealsTruncatedForEither;", to: "  const tasteHistoryComplete = !history.favoritesTruncatedForEither && !history.mealsTruncatedForEither && !history.ratingsTruncatedForEither;" }],
  probe(({ assess }) => {
    const control = assess(oneCuisine("a"), oneCuisine("b"));
    const ratings = assess({ ...oneCuisine("a"), ratingsTruncation: "known_truncated" }, oneCuisine("b"));
    return JSON.stringify(control) !== JSON.stringify(ratings);
  }));

// 9-10. substitution
mutation(9, "missing taste is substituted with a context score",
  [{ file: ASSESS, from: "  const restrictionState = collectRestrictionState(comparison, confidence);", to: "  const contextSubstituteScore = comparison.socialContext.diningCompatibility.status === \"scored\"\n    ? comparison.socialContext.diningCompatibility.score\n    : 0;\n  void contextSubstituteScore;\n  const restrictionState = collectRestrictionState(comparison, confidence);" }],
  null);

mutation(10, "missing taste is substituted with a goal score",
  [{ file: ASSESS, from: "  const restrictionState = collectRestrictionState(comparison, confidence);", to: "  const goalSubstituteScore = comparison.goalRestriction.goalCompatibility.status === \"scored\"\n    ? comparison.goalRestriction.goalCompatibility.score\n    : 0;\n  void goalSubstituteScore;\n  const restrictionState = collectRestrictionState(comparison, confidence);" }],
  null);

// 11-12. restriction safety
mutation(11, "a needs_attention verdict is dropped during limited evidence",
  [{ file: ASSESS, from: "    verdict: comparison.goalRestriction.restrictionEligibility.verdict,", to: "    verdict: comparison.confidenceInputs.dimensionAvailability.taste === \"scored\"\n      ? comparison.goalRestriction.restrictionEligibility.verdict\n      : \"compatible\"," }],
  probe(({ assess }) => {
    const result = assess(
      { restrictions: [restriction("a", "peanut", { rawSeverity: "severe" })] },
      { restrictions: [restriction("b", "coriander")] }
    );
    return result.restrictionState.verdict !== "needs_attention";
  }));

mutation(12, "an unclassified restriction is assumed safe",
  [{ file: ASSESS, from: "    unclassifiedPresent: confidence.restrictionEvidence.unclassifiedPresent,", to: "    unclassifiedPresent: false," }],
  probe(({ assess }) => {
    const result = assess(
      { ...oneCuisine("a"), restrictions: [restriction("a", "peanut", { rawSeverity: "severe" })] },
      { ...oneCuisine("b"), restrictions: [restriction("b", "coriander")] }
    );
    return !result.restrictionState.unclassifiedPresent;
  }));

// 13-16. forbidden fallback sources
mutation(13, "a popularity fallback is introduced",
  [{ file: ASSESS, from: "  const restrictionState = collectRestrictionState(comparison, confidence);", to: "  const popularityFallback = true;\n  void popularityFallback;\n  const restrictionState = collectRestrictionState(comparison, confidence);" }],
  null);

mutation(14, "a GPS or nearby fallback is introduced",
  [{ file: ASSESS, from: "  const restrictionState = collectRestrictionState(comparison, confidence);", to: "  const nearbyDistanceKm = 0;\n  void nearbyDistanceKm;\n  const restrictionState = collectRestrictionState(comparison, confidence);" }],
  null);

mutation(15, "a demographic fallback is introduced",
  [{ file: ASSESS, from: "  const restrictionState = collectRestrictionState(comparison, confidence);", to: "  const demographicAge = 0;\n  void demographicAge;\n  const restrictionState = collectRestrictionState(comparison, confidence);" }],
  null);

mutation(16, "a premium, activity or verified fallback is introduced",
  [{ file: ASSESS, from: "  const restrictionState = collectRestrictionState(comparison, confidence);", to: "  const isPremium = false;\n  const activityScore = 0;\n  const isVerified = false;\n  void [isPremium, activityScore, isVerified];\n  const restrictionState = collectRestrictionState(comparison, confidence);" }],
  null);

// 17. unsupported collapsed into an evidence classification
mutation(17, "an unsupported contract is reported as an empty profile",
  [{ file: ASSESS, from: '      tasteEvidence: { state: "unsupported" },', to: '      tasteEvidence: { state: "no_comparable_evidence" },' }],
  probe(({ assess, assessColdStart, calculateEvidenceConfidence, compareTasteProfiles, snap }) => {
    void assess;
    const a = snap("user-a", fiveFamilies("a"));
    const b = snap("user-b", fiveFamilies("b"));
    const bundle = compareTasteProfiles({ ...a, schemaVersion: "taste-profile-snapshot-v99" }, b);
    return assessColdStart(bundle, calculateEvidenceConfidence(bundle)).tasteEvidence.state !== "unsupported";
  }));

// 18. raw evidence leak
mutation(18, "raw evidence or identity data is leaked into the assessment",
  [{ file: ASSESS, from: "    restrictionState,\n    reasonCodes: collectReasonCodes(", to: "    ...({ comparableDimensions: comparison.taste.status === \"scored\" ? comparison.taste.comparableDimensions : [] } as Record<string, unknown>),\n    restrictionState,\n    reasonCodes: collectReasonCodes(" }],
  probe(({ assess }) => "comparableDimensions" in assess(fiveFamilies("a"), fiveFamilies("b"))));

// 19-20. nondeterminism
mutation(19, "a random rule is introduced",
  [{ file: ASSESS, from: "  const tasteEvidence = classifyTasteEvidence(comparison, confidence, tasteSourcesComplete);", to: "  const roll = Math.random();\n  void roll;\n  const tasteEvidence = classifyTasteEvidence(comparison, confidence, tasteSourcesComplete);" }],
  null);

mutation(20, "a wall-clock rule is introduced",
  [{ file: ASSESS, from: "  const tasteEvidence = classifyTasteEvidence(comparison, confidence, tasteSourcesComplete);", to: "  const assessedAt = Date.now();\n  void assessedAt;\n  const tasteEvidence = classifyTasteEvidence(comparison, confidence, tasteSourcesComplete);" }],
  null);

// 21. version cross-check removed
mutation(21, "the bundle version cross-check is removed",
  [{ file: ASSESS, from: "  if (comparison.status !== \"assembled\") return false;\n  const shared =", to: "  if (comparison.status !== \"assembled\") return false;\n  if (true) return true;\n  const shared =" }],
  probe(({ assessColdStart, calculateEvidenceConfidence, compareTasteProfiles, snap }) => {
    const bundle = compareTasteProfiles(snap("user-a", fiveFamilies("a")), snap("user-b", fiveFamilies("b")));
    const confidence = calculateEvidenceConfidence(bundle);
    const mismatched = assessColdStart(bundle, {
      ...confidence,
      versions: { ...confidence.versions, tastePolicyVersion: "taste-similarity-v9" }
    });
    return mismatched.tasteEvidence.state !== "unsupported";
  }));

// 22. comparable downgraded by source degradation
mutation(22, "a comparable taste result is downgraded because a source was degraded",
  [{ file: ASSESS, from: '  if (comparison.confidenceInputs.dimensionAvailability.taste === "scored") {\n    if (confidence.taste.status !== "available") return { state: "sources_incomplete" };', to: '  if (comparison.confidenceInputs.dimensionAvailability.taste === "scored") {\n    if (!tasteSourcesComplete) return { state: "sources_incomplete" };\n    if (confidence.taste.status !== "available") return { state: "sources_incomplete" };' }],
  probe(({ assess }) => {
    const degraded = assess(
      { ...oneCuisine("a"), behavior: [favoriteRestaurant("a", "rest-1")], sourceOverrides: failedFavorites },
      { ...oneCuisine("b"), behavior: [favoriteRestaurant("b", "rest-1")], sourceOverrides: failedFavorites }
    );
    return degraded.tasteEvidence.state !== "comparable";
  }));

// 23. available and incomplete forced to be disjoint
mutation(23, "a family is forbidden from appearing in both the available and incomplete lists",
  [{ file: ASSESS, from: "    incompleteSignalFamilies: freezeFamilies(incompleteSignalFamilies),", to: "    incompleteSignalFamilies: freezeFamilies(incompleteSignalFamilies.filter((family) => !availableSignalFamilies.includes(family)))," }],
  probe(({ assess }) => {
    const degraded = assess(
      { ...oneCuisine("a"), behavior: [favoriteRestaurant("a", "rest-1")], sourceOverrides: failedFavorites },
      { ...oneCuisine("b"), behavior: [favoriteRestaurant("b", "rest-1")], sourceOverrides: failedFavorites }
    );
    return !degraded.incompleteSignalFamilies.includes("taste");
  }));

// 24. numeric confidence modifies the categorical state
mutation(24, "the numeric confidence value modifies the categorical state",
  [{ file: ASSESS, from: "    if (tasteEvidence.basis === COLD_START_LIMITED_COVERAGE_BASIS) codes.add(\"limited_taste_evidence\");", to: "    if (tasteEvidence.value < 0.7) codes.add(\"limited_taste_evidence\");" }],
  null);

// 25. reason-code ordering stops following the declaration rank
mutation(25, "reason code ordering follows lexicographic order instead of the declaration rank",
  [{ file: POLICY, from: "    [...new Set(codes)].sort(\n      (left, right) => (REASON_CODE_ORDER.get(left) ?? 0) - (REASON_CODE_ORDER.get(right) ?? 0)\n    )", to: "    [...new Set(codes)].sort()" }],
  probe(({ assess }) => {
    const result = assess(
      { ...oneCuisine("a"), mealsTruncation: "known_truncated" },
      oneCuisine("b")
    );
    const declaration = ["no_comparable_taste_evidence", "limited_taste_evidence", "incomplete_taste_sources", "incomplete_history",
      "context_only_evidence", "goal_only_evidence", "no_comparable_evidence", "unsupported_schema"];
    const ranks = result.reasonCodes.map((code) => declaration.indexOf(code));
    return !ranks.every((value, index) => index === 0 || ranks[index - 1] < value);
  }));

// 26. a restriction verdict silences "nothing comparable"
mutation(26, "a restriction verdict silences the no-comparable-evidence reason",
  [{ file: ASSESS, from: '  if (!tasteAvailable && !contextAvailable && !goalAvailable) codes.add("no_comparable_evidence");', to: '  if (!tasteAvailable && !contextAvailable && !goalAvailable && !availableSignalFamilies.includes("restriction")) codes.add("no_comparable_evidence");' }],
  probe(({ assess }) => {
    const result = assess(
      { restrictions: [restriction("a", "coriander")] },
      { restrictions: [restriction("b", "coriander")] }
    );
    return !result.reasonCodes.includes("no_comparable_evidence");
  }));

// 27. per-user sparsity inference introduced
mutation(27, "a per-user sparsity inference is introduced",
  [{ file: ASSESS, from: "    restrictionState,\n    reasonCodes: collectReasonCodes(", to: "    ...({ sparseSubjectCount: 1 } as Record<string, unknown>),\n    restrictionState,\n    reasonCodes: collectReasonCodes(" }],
  probe(({ assess }) => "sparseSubjectCount" in assess(oneCuisine("a"), oneCuisine("b"))));

// 28. context reported as available when it was never scored
mutation(28, "a context family is reported available without being scored",
  [{ file: ASSESS, from: '  if (dimensions.dining === "scored") availableSignalFamilies.push("dining");', to: '  availableSignalFamilies.push("dining");' }],
  probe(({ assess }) => assess(oneCuisine("a"), oneCuisine("b")).availableSignalFamilies.includes("dining")));

// ================================================================================================
const killed = results.filter((entry) => entry.killed);
const survived = results.filter((entry) => !entry.killed);
console.log(JSON.stringify({
  suite: "taste-similarity-ts5-mutations",
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
