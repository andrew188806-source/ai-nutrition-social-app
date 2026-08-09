#!/usr/bin/env node
// TS-6 mutation proof — SHARED TASTE ADAPTER V1.
//
// Each mutation rewrites REAL implementation bytes on disk, then requires that the TS-6 guard, the
// TS-6 smoke, or a dedicated behavioural probe FAILS. A mutation nothing notices is a hole.
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
const adapterRoot = path.join(domainRoot, "shared-adapter");

const ADAPT = path.join(adapterRoot, "adapt.ts");
const TYPES = path.join(adapterRoot, "types.ts");

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
const goalLabel = (user, value) => ({
  category: "goal", facet: "goal_label", value,
  validity: { startsOn: "2026-07-01", isActive: true },
  evidence: envelope(`goal:${user}:label:${value}`, "nutrition_goal", "nutrition_goal", "user_explicit", "not_eligible")
});
const goalScalar = (user, facet, value, unit = "kcal") => ({
  category: "goal", facet, value, unit,
  validity: { startsOn: "2026-07-01", isActive: true },
  evidence: envelope(`goal:${user}:${facet}`, "nutrition_goal", "nutrition_goal", "user_explicit", "not_eligible")
});
const restriction = (user, label, { rawSeverity = "preference" } = {}) => ({
  category: "restriction", restrictionType: "avoidance", label, rawSeverity, visibility: "private",
  evidence: envelope(`restr:${user}:${label}`, "dietary_restriction", "dietary_restriction", "user_explicit", "not_eligible")
});

const counted = (count) => (count > 0 ? { status: "available", evidenceCount: count } : { status: "empty", evidenceCount: 0 });
function makeSnapshot(compose, userId, { preferences = [], behavior = [], goals = [], restrictions = [] } = {}) {
  return compose({
    subjectUserId: userId,
    preferences, goals, restrictions, behavior,
    sourceStates: {
      taste_profile: counted(preferences.length),
      nutrition_goals: counted(goals.length),
      dietary_restrictions: counted(restrictions.length),
      meals: counted(0),
      favorites: counted(behavior.filter((entry) => entry.behaviorKind === "favorite").length),
      ratings: counted(0)
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
      guardFailed = !runSuite("scripts/taste-similarity-ts6-guard.mjs");
      smokeFailed = !runSuite("scripts/taste-similarity-ts6-smoke.mjs");
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

const richPair = (user, values = {}) => ({
  preferences: [
    cuisine(user, values.cuisine ?? "japanese"), flavor(user, values.flavor ?? "coriander"), spice(user, values.spice ?? "medium"),
    mealType(user, "lunch"), diningStyle(user, values.dining ?? "casual"), paymentPreference(user, "split_bill")
  ],
  behavior: [favoriteRestaurant(user, values.restaurant ?? "rest-1"), favoriteMenuItem(user, values.restaurant ?? "rest-1", "item-1")],
  goals: [goalLabel(user, "fat_loss"), goalScalar(user, "daily_calories_target", user === "a" ? 1400 : 3200)],
  restrictions: [restriction(user, values.restriction ?? "coriander", values.severity ? { rawSeverity: values.severity } : {})]
});

const probe = (assertion) => (domain) => {
  const { adaptSharedTasteComparison, assessColdStart, calculateEvidenceConfidence, compareTasteProfiles, composeTasteProfileSnapshot } = domain;
  const snap = (userId, input) => makeSnapshot(composeTasteProfileSnapshot, userId, input);
  const pipeline = (inputA, inputB) => {
    const comparison = compareTasteProfiles(snap("user-a", inputA), snap("user-b", inputB));
    const confidence = calculateEvidenceConfidence(comparison);
    const coldStart = assessColdStart(comparison, confidence);
    return { comparison, confidence, coldStart, adapted: adaptSharedTasteComparison(comparison, confidence, coldStart) };
  };
  return assertion({ pipeline, snap, adaptSharedTasteComparison, assessColdStart, calculateEvidenceConfidence, compareTasteProfiles });
};

// ================================================================================================
// 1-6. recomputation
mutation(1, "the taste score is recomputed instead of copied",
  [{ file: ADAPT, from: 'return Object.freeze({ status: "scored", score: taste.score });', to: 'return Object.freeze({ status: "scored", score: taste.comparableDimensions.length / 5 });' }],
  probe(({ pipeline }) => {
    const { comparison, adapted } = pipeline(richPair("a"), richPair("b", { dining: "fine_dining" }));
    return adapted.taste.similarity.score !== comparison.taste.score;
  }));

mutation(2, "the taste score is rounded by the adapter",
  [{ file: ADAPT, from: 'return Object.freeze({ status: "scored", score: taste.score });', to: 'return Object.freeze({ status: "scored", score: Math.round(taste.score * 100) / 100 });' }],
  null);

mutation(3, "a context score is recomputed",
  [{ file: ADAPT, from: 'if (dimension.status === "scored") return Object.freeze({ status: "scored", score: dimension.score });', to: 'if (dimension.status === "scored") return Object.freeze({ status: "scored", score: dimension.score / 2 });' }],
  probe(({ pipeline }) => {
    const { comparison, adapted } = pipeline(richPair("a"), richPair("b", { dining: "fine_dining" }));
    return adapted.context.mealPattern.score !== comparison.socialContext.mealPatternCompatibility.score;
  }));

mutation(4, "the goal score is recomputed",
  [{ file: ADAPT, from: 'if (goal.status === "scored") return Object.freeze({ status: "scored", score: goal.score });', to: 'if (goal.status === "scored") return Object.freeze({ status: "scored", score: goal.score * 0.9 });' }],
  null);

mutation(5, "the evidence confidence is recomputed",
  [{ file: ADAPT, from: 'return Object.freeze({ status: "available", value: taste.value, basis: taste.basis });', to: 'return Object.freeze({ status: "available", value: taste.inputs.comparableFamilyCount / taste.inputs.supportedFamilyCount, basis: taste.basis });' }],
  probe(({ pipeline }) => {
    const { confidence, adapted } = pipeline(richPair("a"), richPair("b", { dining: "fine_dining" }));
    return adapted.taste.evidenceConfidence.value !== confidence.taste.value;
  }));

mutation(6, "the cold start evidence state is recomputed",
  [{ file: ADAPT, from: "      evidenceState: coldStart.tasteEvidence.state", to: '      evidenceState: comparison.taste.status === "scored" ? "comparable" : "no_comparable_evidence"' }],
  probe(({ pipeline, adaptSharedTasteComparison }) => {
    const { comparison, confidence, coldStart } = pipeline(richPair("a"), richPair("b", { dining: "fine_dining" }));
    const forced = adaptSharedTasteComparison(comparison, confidence, { ...coldStart, tasteEvidence: { state: "sources_incomplete" } });
    return forced.taste.evidenceState !== "sources_incomplete";
  }));

// 7-8. restriction
mutation(7, "the restriction verdict is modified by the adapter",
  [{ file: ADAPT, from: "      verdict: comparison.goalRestriction.restrictionEligibility.verdict,", to: '      verdict: coldStart.restrictionState.unclassifiedPresent ? "compatible" : comparison.goalRestriction.restrictionEligibility.verdict,' }],
  probe(({ pipeline }) => {
    const { adapted } = pipeline(richPair("a", { restriction: "peanut", severity: "severe" }), richPair("b", { dining: "fine_dining" }));
    return adapted.restriction.verdict !== "needs_attention";
  }));

mutation(8, "needs_attention is converted into a score penalty",
  [{ file: ADAPT, from: "      similarity: projectTasteSimilarity(comparison.taste),", to: '      similarity: coldStart.restrictionState.unclassifiedPresent && comparison.taste.status === "scored"\n        ? Object.freeze({ status: "scored" as const, score: comparison.taste.score / 2 })\n        : projectTasteSimilarity(comparison.taste),' }],
  probe(({ pipeline }) => {
    const { comparison, adapted } = pipeline(richPair("a", { restriction: "peanut", severity: "severe" }), richPair("b", { dining: "fine_dining" }));
    return adapted.taste.similarity.score !== comparison.taste.score;
  }));

// 9-14. aggregate, weight, verdict, ranking
mutation(9, "an aggregate score is introduced",
  [{ file: ADAPT, from: "    signals: Object.freeze({", to: '    ...({ overallScore: comparison.taste.status === "scored" ? comparison.taste.score : 0 } as Record<string, unknown>),\n    signals: Object.freeze({' }],
  probe(({ pipeline }) => Object.keys(pipeline(richPair("a"), richPair("b")).adapted).some((key) => /overall|aggregate/i.test(key))));

mutation(10, "a weighted score is introduced",
  [{ file: ADAPT, from: "    signals: Object.freeze({", to: '    ...({ weightedScore: 0.6 } as Record<string, unknown>),\n    signals: Object.freeze({' }],
  null);

mutation(11, "a global confidence is introduced",
  [{ file: ADAPT, from: "    signals: Object.freeze({", to: '    ...({ overallConfidence: 0.5 } as Record<string, unknown>),\n    signals: Object.freeze({' }],
  null);

mutation(12, "a threshold is introduced",
  [{ file: ADAPT, from: "  const blocking = findBlockingReason(comparison, confidence, coldStart);", to: "  const minimumThreshold = 0.5;\n  void minimumThreshold;\n  const blocking = findBlockingReason(comparison, confidence, coldStart);" }],
  null);

mutation(13, "a readiness or proceed verdict is introduced",
  [{ file: ADAPT, from: "    signals: Object.freeze({", to: '    ...({ ready: coldStart.tasteEvidence.state === "comparable" } as Record<string, unknown>),\n    signals: Object.freeze({' }],
  probe(({ pipeline }) => "ready" in pipeline(richPair("a"), richPair("b")).adapted));

mutation(14, "a ranking or gating field is introduced",
  [{ file: ADAPT, from: "    signals: Object.freeze({", to: '    ...({ rank: 1, gating: "allow" } as Record<string, unknown>),\n    signals: Object.freeze({' }],
  null);

// 15-16. fallback substitution
mutation(15, "a missing taste score falls back to a context score",
  [{ file: ADAPT, from: "      similarity: projectTasteSimilarity(comparison.taste),", to: '      similarity: comparison.taste.status !== "scored" && comparison.socialContext.diningCompatibility.status === "scored"\n        ? Object.freeze({ status: "scored" as const, score: comparison.socialContext.diningCompatibility.score })\n        : projectTasteSimilarity(comparison.taste),' }],
  probe(({ pipeline }) => {
    const { adapted } = pipeline(
      { preferences: [diningStyle("a", "casual")] },
      { preferences: [diningStyle("b", "casual")] }
    );
    return adapted.taste.similarity.status === "scored";
  }));

mutation(16, "a missing taste score falls back to the goal score",
  [{ file: ADAPT, from: "      similarity: projectTasteSimilarity(comparison.taste),", to: '      similarity: comparison.taste.status !== "scored" && comparison.goalRestriction.goalCompatibility.status === "scored"\n        ? Object.freeze({ status: "scored" as const, score: comparison.goalRestriction.goalCompatibility.score })\n        : projectTasteSimilarity(comparison.taste),' }],
  probe(({ pipeline }) => {
    const { adapted } = pipeline({ goals: [goalLabel("a", "fat_loss")] }, { goals: [goalLabel("b", "fat_loss")] });
    return adapted.taste.similarity.status === "scored";
  }));

// 17-19. coherence and fail-closed
mutation(17, "the input version cross-check is removed",
  [{ file: ADAPT, from: "  return coherent ? null : \"policy_version_mismatch\";", to: "  void coherent;\n  return null;" }],
  probe(({ pipeline, adaptSharedTasteComparison }) => {
    const { comparison, confidence, coldStart } = pipeline(richPair("a"), richPair("b"));
    const mismatched = adaptSharedTasteComparison(comparison,
      { ...confidence, versions: { ...confidence.versions, tastePolicyVersion: "taste-similarity-v9" } }, coldStart);
    return mismatched.status !== "unsupported";
  }));

mutation(18, "mismatched versions are partially adapted instead of failing closed",
  [{ file: ADAPT, from: '    comparison.versions.bundleVersion === confidence.versions.comparisonBundleVersion &&', to: "" }],
  probe(({ pipeline, adaptSharedTasteComparison }) => {
    const { comparison, confidence, coldStart } = pipeline(richPair("a"), richPair("b"));
    const mismatched = adaptSharedTasteComparison(comparison,
      { ...confidence, versions: { ...confidence.versions, comparisonBundleVersion: "taste-comparison-bundle-v9" } }, coldStart);
    return mismatched.status !== "unsupported";
  }));

mutation(19, "an unsupported result leaks a component score",
  [{ file: ADAPT, from: '    return Object.freeze({ versions: Object.freeze(versions), status: "unsupported", reason: blocking });', to: '    return Object.freeze({ versions: Object.freeze(versions), status: "unsupported", reason: blocking,\n      ...({ taste: { similarity: projectTasteSimilarity(comparison.taste) } } as Record<string, unknown>) });' }],
  probe(({ pipeline, adaptSharedTasteComparison }) => {
    const { comparison, confidence, coldStart } = pipeline(richPair("a"), richPair("b"));
    const mismatched = adaptSharedTasteComparison(comparison,
      { ...confidence, versions: { ...confidence.versions, tastePolicyVersion: "taste-similarity-v9" } }, coldStart);
    return "taste" in mismatched;
  }));

// 20-23. upstream bundle and internal metadata leakage
mutation(20, "the raw comparison bundle is embedded in the result",
  [{ file: ADAPT, from: "    signals: Object.freeze({", to: "    ...({ comparison } as Record<string, unknown>),\n    signals: Object.freeze({" }],
  probe(({ pipeline }) => "comparison" in pipeline(richPair("a"), richPair("b")).adapted));

mutation(21, "the raw confidence bundle is embedded in the result",
  [{ file: ADAPT, from: "    signals: Object.freeze({", to: "    ...({ confidence } as Record<string, unknown>),\n    signals: Object.freeze({" }],
  probe(({ pipeline }) => "confidence" in pipeline(richPair("a"), richPair("b")).adapted));

mutation(22, "the raw cold start assessment is embedded in the result",
  [{ file: ADAPT, from: "    signals: Object.freeze({", to: "    ...({ coldStart } as Record<string, unknown>),\n    signals: Object.freeze({" }],
  probe(({ pipeline }) => "coldStart" in pipeline(richPair("a"), richPair("b")).adapted));

mutation(23, "internal confidence inputs are exposed",
  [{ file: ADAPT, from: "    signals: Object.freeze({", to: "    ...({ confidenceInputs: comparison.confidenceInputs } as Record<string, unknown>),\n    signals: Object.freeze({" }],
  probe(({ pipeline }) => "confidenceInputs" in pipeline(richPair("a"), richPair("b")).adapted));

// 24-28. privacy leaks
const leak = (id, name, key, expression, needle) => mutation(id, name,
  [{ file: ADAPT, from: "    signals: Object.freeze({", to: `    ...({ ${key}: ${expression} } as Record<string, unknown>),\n    signals: Object.freeze({` }],
  probe(({ pipeline }) => JSON.stringify(pipeline(richPair("a"), richPair("b")).adapted).includes(needle)));

leak(24, "a user id is leaked into the result", "subjectUserId", '"user-a"', "user-a");
leak(25, "a restaurant or menu id is leaked into the result", "sharedRestaurantId", '"rest-1"', "rest-1");
leak(26, "a goal label or macro target is leaked into the result", "goalLabel", '"fat_loss"', "fat_loss");
leak(27, "a restriction label or severity is leaked into the result", "restrictionLabel", '"peanut"', "peanut");
leak(28, "a payment or dining raw value is leaked into the result", "paymentPreference", '"split_bill"', "split_bill");

// 29-31. reason channels and ordering
mutation(29, "the two reason channels are flattened into one ambiguous list",
  [{ file: ADAPT, from: "      comparison: Object.freeze([...comparison.explanationReasonCodes]),\n      evidence: Object.freeze([...coldStart.reasonCodes])", to: "      comparison: Object.freeze([...comparison.explanationReasonCodes, ...coldStart.reasonCodes]),\n      evidence: Object.freeze([])" }],
  probe(({ pipeline }) => {
    const { coldStart, adapted } = pipeline(richPair("a"), richPair("b", { dining: "fine_dining" }));
    return JSON.stringify(adapted.reasons.evidence) !== JSON.stringify(coldStart.reasonCodes);
  }));

mutation(30, "an invented reason code is added",
  [{ file: ADAPT, from: "      comparison: Object.freeze([...comparison.explanationReasonCodes]),", to: '      comparison: Object.freeze([...comparison.explanationReasonCodes, "strong_match" as never]),' }],
  probe(({ pipeline }) => pipeline(richPair("a"), richPair("b")).adapted.reasons.comparison.includes("strong_match")));

mutation(31, "reason order is lexicographically re-sorted",
  [{ file: ADAPT, from: "      evidence: Object.freeze([...coldStart.reasonCodes])", to: "      evidence: Object.freeze([...coldStart.reasonCodes].sort())" }],
  null);

// 32. mutable upstream array shared with the consumer
mutation(32, "the output shares a mutable reference to an upstream array",
  [{ file: ADAPT, from: "      availableFamilies: Object.freeze([...coldStart.availableSignalFamilies]),", to: "      availableFamilies: coldStart.availableSignalFamilies," }],
  null);

// 33-34. consumer-specific and platform signals
mutation(33, "a consumer-specific field is introduced",
  [{ file: ADAPT, from: "    signals: Object.freeze({", to: '    ...({ mealBuddyRank: 1 } as Record<string, unknown>),\n    signals: Object.freeze({' }],
  null);

mutation(34, "a GPS, popularity, premium or activity signal is introduced",
  [{ file: ADAPT, from: "  const blocking = findBlockingReason(comparison, confidence, coldStart);", to: "  const distanceKm = 0;\n  const popularityScore = 0;\n  const isPremium = false;\n  const activityScore = 0;\n  void [distanceKm, popularityScore, isPremium, activityScore];\n  const blocking = findBlockingReason(comparison, confidence, coldStart);" }],
  null);

// 35. the projection degenerates into returning the bundles verbatim
mutation(35, "the projection returns the upstream bundles verbatim",
  [{ file: TYPES, from: "export type AdaptedSharedTasteResult = {", to: "export type AdaptedSharedTasteResult = {\n  readonly comparison?: unknown;\n  readonly confidence?: unknown;\n  readonly coldStart?: unknown;" }],
  null);

// ================================================================================================
const killed = results.filter((entry) => entry.killed);
const survived = results.filter((entry) => !entry.killed);
console.log(JSON.stringify({
  suite: "taste-similarity-ts6-mutations",
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
