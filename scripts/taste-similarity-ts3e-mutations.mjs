#!/usr/bin/env node
// TS-3E mutation proof — CANONICAL COMPARISON BUNDLE.
//
// Each mutation rewrites REAL implementation bytes on disk, then requires that the TS-3E guard, the
// TS-3E smoke, or a dedicated behavioural probe FAILS. A mutation nothing notices is a hole.
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
const comparisonRoot = path.join(domainRoot, "comparison");

const COMPOSE = path.join(comparisonRoot, "compose.ts");
const TYPES = path.join(comparisonRoot, "types.ts");
const POLICY = path.join(comparisonRoot, "policy.ts");
const TASTE_POLICY = path.join(domainRoot, "similarity/policy.ts");
const CONTEXT_POLICY = path.join(domainRoot, "compatibility/policy.ts");
const GOAL_POLICY = path.join(domainRoot, "goal-restriction/policy.ts");

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
const spice = (user, value) => preference(user, "food_taste", "spice", "unclassified", value, "spice");
const mealType = (user, value) => preference(user, "meal_pattern", "meal_type", "positive", value);
const diningStyle = (user, value) => preference(user, "dining_context", "dining_style", "unclassified", value, "dining");
const paymentPreference = (user, value) => preference(user, "social_logistics", "payment_preference", "unclassified", value, "payment");
const favoriteRestaurant = (user, restaurantId) => ({
  category: "behavior", behaviorKind: "favorite", favoriteKind: "restaurant", interpretation: "positive_user_action",
  evidence: envelope(`fav:${user}:r:${restaurantId}`, "favorite", "favorite_restaurant", "user_action", "not_eligible", { kind: "restaurant", restaurantId })
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

const available = (count) => (count > 0 ? { status: "available", evidenceCount: count } : { status: "empty", evidenceCount: 0 });
function makeSnapshot(compose, userId, { preferences = [], behavior = [], goals = [], restrictions = [] } = {}) {
  return compose({
    subjectUserId: userId,
    preferences, goals, restrictions, behavior,
    sourceStates: {
      taste_profile: available(preferences.length),
      nutrition_goals: available(goals.length),
      dietary_restrictions: available(restrictions.length),
      meals: available(0),
      favorites: available(behavior.filter((entry) => entry.behaviorKind === "favorite").length),
      ratings: available(0)
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
      guardFailed = !runSuite("scripts/taste-similarity-ts3e-guard.mjs");
      smokeFailed = !runSuite("scripts/taste-similarity-ts3e-smoke.mjs");
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
  const { compareTasteProfiles, composeTasteProfileSnapshot } = domain;
  const snap = (userId, input) => makeSnapshot(composeTasteProfileSnapshot, userId, input);
  return assertion({ bundle: compareTasteProfiles, snap, domain });
};

// Dining style deliberately DIFFERS between the two users. Fixtures where both sides are identical
// hide any mutation that swaps one side for the other, so the pair must not be self-similar.
const richInput = (user) => ({
  preferences: [cuisine(user, "japanese"), spice(user, "medium"), mealType(user, "lunch"), diningStyle(user, user === "a" ? "casual" : "fine_dining"), paymentPreference(user, "split_bill")],
  behavior: [favoriteRestaurant(user, "rest-1")],
  goals: [goalLabel(user, "fat_loss"), goalScalar(user, "daily_calories_target", user === "a" ? 1400 : 3200)],
  restrictions: [restriction(user, "coriander")]
});

// ================================================================================================
// 1-2. aggregate / weighted score
mutation(1, "an aggregate score is introduced",
  [{ file: COMPOSE, from: "    status: schemaSupported ? \"assembled\" : \"unsupported_snapshot_schema\",", to: "    status: schemaSupported ? \"assembled\" : \"unsupported_snapshot_schema\",\n    ...({ overallSimilarity: taste.status === \"scored\" ? taste.score : 0 } as Record<string, unknown>)," }],
  probe(({ bundle, snap }) => Object.keys(bundle(snap("user-a", richInput("a")), snap("user-b", richInput("b")))).some((key) => /overall|aggregate|combined/i.test(key))));

mutation(2, "a weighted average across the three authorities is introduced",
  [{ file: COMPOSE, from: "    confidenceInputs: assembleConfidenceInputs(", to: "    ...({ weightedScore: ((taste.status === \"scored\" ? taste.score : 0) * 0.6) + ((goalRestriction.goalCompatibility.status === \"scored\" ? goalRestriction.goalCompatibility.score : 0) * 0.4) } as Record<string, unknown>),\n    confidenceInputs: assembleConfidenceInputs(" }],
  probe(({ bundle, snap }) => "weightedScore" in bundle(snap("user-a", richInput("a")), snap("user-b", richInput("b")))));

// 3. restriction verdict becomes a numeric penalty
mutation(3, "the restriction verdict is converted into a numeric penalty",
  [{ file: COMPOSE, from: "    taste,\n    socialContext,\n    goalRestriction,", to: "    taste: goalRestriction.restrictionEligibility.verdict === \"needs_attention\" && taste.status === \"scored\"\n      ? { ...taste, score: taste.score / 2 }\n      : taste,\n    socialContext,\n    goalRestriction," }],
  probe(({ bundle, snap, domain }) => {
    const a = snap("user-a", { ...richInput("a"), restrictions: [restriction("a", "peanut", { rawSeverity: "severe" })] });
    const b = snap("user-b", richInput("b"));
    return JSON.stringify(bundle(a, b).taste) !== JSON.stringify(domain.compareTasteSimilarity(a, b));
  }));

// 4-5. confidence
mutation(4, "a numeric confidence value is introduced",
  [{ file: TYPES, from: "export type TasteComparisonConfidenceInputs = {\n  evidenceCoverage: {", to: "export type TasteComparisonConfidenceInputs = {\n  confidenceScore: number;\n  evidenceCoverage: {" },
   { file: COMPOSE, from: "  return {\n    evidenceCoverage: {", to: "  return {\n    confidenceScore: taste.status === \"scored\" ? 0.8 : 0.2,\n    evidenceCoverage: {" }],
  probe(({ bundle, snap }) => "confidenceScore" in bundle(snap("user-a", richInput("a")), snap("user-b", richInput("b"))).confidenceInputs));

mutation(5, "a qualitative high/medium/low confidence band is introduced",
  [{ file: TYPES, from: "export type TasteComparisonConfidenceInputs = {\n  evidenceCoverage: {", to: "export type TasteComparisonConfidenceInputs = {\n  confidenceLevel: \"high\" | \"medium\" | \"low\";\n  evidenceCoverage: {" },
   { file: COMPOSE, from: "  return {\n    evidenceCoverage: {", to: "  return {\n    confidenceLevel: taste.status === \"scored\" ? \"high\" : \"low\",\n    evidenceCoverage: {" }],
  probe(({ bundle, snap }) => "confidenceLevel" in bundle(snap("user-a", richInput("a")), snap("user-b", richInput("b"))).confidenceInputs));

// 6-8. component bypassed
mutation(6, "the taste comparator is bypassed and its result fabricated",
  [{ file: COMPOSE, from: "  const taste = compareTasteSimilarity(snapshotA, snapshotB);", to: "  const taste = { ...compareTasteSimilarity(snapshotA, snapshotB), status: \"scored\", score: 1 } as ReturnType<typeof compareTasteSimilarity>;" }],
  probe(({ bundle, snap, domain }) => {
    const a = snap("user-a", {});
    const b = snap("user-b", {});
    return JSON.stringify(bundle(a, b).taste) !== JSON.stringify(domain.compareTasteSimilarity(a, b));
  }));

mutation(7, "the social-context comparator is bypassed and its result fabricated",
  [{ file: COMPOSE, from: "  const socialContext = compareSocialContextCompatibility(snapshotA, snapshotB);", to: "  const base = compareSocialContextCompatibility(snapshotA, snapshotB);\n  const socialContext = { ...base, diningCompatibility: { ...base.diningCompatibility, status: \"scored\", score: 1 } } as ReturnType<typeof compareSocialContextCompatibility>;" }],
  probe(({ bundle, snap, domain }) => {
    const a = snap("user-a", {});
    const b = snap("user-b", {});
    return JSON.stringify(bundle(a, b).socialContext) !== JSON.stringify(domain.compareSocialContextCompatibility(a, b));
  }));

mutation(8, "the goal/restriction comparator is bypassed and its result fabricated",
  [{ file: COMPOSE, from: "  const goalRestriction = compareGoalRestrictionCompatibility(snapshotA, snapshotB);", to: "  const goalBase = compareGoalRestrictionCompatibility(snapshotA, snapshotB);\n  const goalRestriction = { ...goalBase, restrictionEligibility: { ...goalBase.restrictionEligibility, verdict: \"compatible\" } } as ReturnType<typeof compareGoalRestrictionCompatibility>;" }],
  probe(({ bundle, snap, domain }) => {
    const a = snap("user-a", { restrictions: [restriction("a", "peanut", { rawSeverity: "severe" })] });
    const b = snap("user-b", { restrictions: [restriction("b", "coriander")] });
    return JSON.stringify(bundle(a, b).goalRestriction) !== JSON.stringify(domain.compareGoalRestrictionCompatibility(a, b));
  }));

// 9. a local Jaccard is copied into the bundle
mutation(9, "a local set-similarity implementation is copied into the bundle",
  [{ file: COMPOSE, from: "  const schemaSupported =", to: "  const localIntersection = new Set([\"x\"]);\n  const unionSize = localIntersection.size;\n  const intersectionSize = localIntersection.size;\n  const agreement = intersectionSize / Math.max(1, unionSize);\n  void agreement;\n  const schemaSupported =" }],
  null);

// 10. unsupported schema partially scores
mutation(10, "an unsupported snapshot schema is reported as assembled",
  [{ file: COMPOSE, from: "    status: schemaSupported ? \"assembled\" : \"unsupported_snapshot_schema\",", to: "    status: \"assembled\"," }],
  probe(({ bundle, snap }) => {
    const a = snap("user-a", richInput("a"));
    const result = bundle({ ...a, schemaVersion: "taste-profile-snapshot-v99" }, snap("user-b", richInput("b")));
    return result.status === "assembled";
  }));

// 11. a not_scored component collapses the bundle
mutation(11, "an unscored component collapses the whole bundle",
  [{ file: COMPOSE, from: "  const schemaSupported =", to: "  if (taste.status !== \"scored\") {\n    return {\n      versions: {\n        bundleVersion: TASTE_COMPARISON_BUNDLE_VERSION,\n        snapshotSchemaVersion: TASTE_COMPARISON_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,\n        tastePolicyVersion: TASTE_SIMILARITY_POLICY_VERSION,\n        socialContextPolicyVersion: SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,\n        goalRestrictionPolicyVersion: GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION\n      },\n      status: \"unsupported_snapshot_schema\",\n      taste,\n      socialContext,\n      goalRestriction,\n      confidenceInputs: assembleConfidenceInputs(snapshotA, snapshotB, taste, socialContext, goalRestriction),\n      explanationReasonCodes: assembleReasonCodes(taste, socialContext, goalRestriction)\n    };\n  }\n  const schemaSupported =" }],
  probe(({ bundle, snap }) => {
    const result = bundle(
      snap("user-a", { preferences: [mealType("a", "lunch")] }),
      snap("user-b", { preferences: [mealType("b", "lunch")] })
    );
    return result.status !== "assembled";
  }));

// 12. needs_attention destroys the bundle
mutation(12, "a needs_attention restriction verdict destroys the bundle",
  [{ file: COMPOSE, from: "    socialContext,\n    goalRestriction,", to: "    socialContext: goalRestriction.restrictionEligibility.verdict === \"needs_attention\"\n      ? compareSocialContextCompatibility(snapshotA, snapshotA)\n      : socialContext,\n    goalRestriction," }],
  probe(({ bundle, snap, domain }) => {
    const a = snap("user-a", { ...richInput("a"), restrictions: [restriction("a", "peanut", { rawSeverity: "severe" })] });
    const b = snap("user-b", richInput("b"));
    return JSON.stringify(bundle(a, b).socialContext) !== JSON.stringify(domain.compareSocialContextCompatibility(a, b));
  }));

// 13-14. reason assembly
mutation(13, "reason ordering becomes lexicographic instead of the fixed component order",
  [{ file: COMPOSE, from: "  return Object.freeze([...new Set(merged)]);", to: "  return Object.freeze([...new Set(merged)].sort());" }],
  probe(({ bundle, snap, domain }) => {
    const a = snap("user-a", richInput("a"));
    const b = snap("user-b", richInput("b"));
    const expected = [...new Set([
      ...domain.compareTasteSimilarity(a, b).explanationReasonCodes,
      ...domain.compareSocialContextCompatibility(a, b).explanationReasonCodes,
      ...domain.compareGoalRestrictionCompatibility(a, b).explanationReasonCodes
    ])];
    return JSON.stringify(bundle(a, b).explanationReasonCodes) !== JSON.stringify(expected);
  }));

mutation(14, "the reason merge loses its dedupe while double-counting a component",
  [{ file: COMPOSE, from: "  return Object.freeze([...new Set(merged)]);", to: "  return Object.freeze([...merged]);" },
   { file: COMPOSE, from: "    ...taste.explanationReasonCodes,\n    ...socialContext.explanationReasonCodes,", to: "    ...taste.explanationReasonCodes,\n    ...taste.explanationReasonCodes,\n    ...socialContext.explanationReasonCodes," }],
  probe(({ bundle, snap }) => {
    const codes = bundle(snap("user-a", richInput("a")), snap("user-b", richInput("b"))).explanationReasonCodes;
    return new Set(codes).size !== codes.length;
  }));

// 15-21. privacy leaks
const leak = (id, name, fromKey, injected, needle) => mutation(id, name,
  [{ file: COMPOSE, from: "    explanationReasonCodes: assembleReasonCodes(taste, socialContext, goalRestriction)", to: `    explanationReasonCodes: assembleReasonCodes(taste, socialContext, goalRestriction),\n    ...({ ${fromKey}: ${injected} } as Record<string, unknown>)` }],
  probe(({ bundle, snap }) => JSON.stringify(bundle(snap("user-a", richInput("a")), snap("user-b", richInput("b")))).includes(needle)));

leak(15, "a raw cuisine value is leaked into the bundle", "sharedCuisine", '"japanese"', "japanese");
leak(16, "a restaurant or menu item id is leaked into the bundle", "sharedRestaurantId", '"rest-1"', "rest-1");
leak(17, "a raw goal label is leaked into the bundle", "sharedGoalLabel", '"fat_loss"', "fat_loss");
leak(18, "a raw macro target is leaked into the bundle", "dailyCaloriesTarget", "1400", "1400");
leak(19, "a raw restriction label is leaked into the bundle", "sharedRestriction", '"coriander"', "coriander");
leak(20, "a raw payment or dining value is leaked into the bundle", "sharedPaymentPreference", '"split_bill"', "split_bill");
leak(21, "a subject user id is leaked into the bundle", "subjectUserId", "snapshotA.subjectUserId", "user-a");

// 22-23. consumer-policy signals
mutation(22, "a GPS or proximity signal is introduced",
  [{ file: COMPOSE, from: "  const schemaSupported =", to: "  const distanceKm = 0;\n  const nearbyStatus = \"nearby\";\n  void [distanceKm, nearbyStatus];\n  const schemaSupported =" }],
  null);

mutation(23, "a premium, activity or verified signal is introduced",
  [{ file: COMPOSE, from: "  const schemaSupported =", to: "  const isPremium = false;\n  const activityScore = 0;\n  const isVerified = false;\n  void [isPremium, activityScore, isVerified];\n  const schemaSupported =" }],
  null);

// 24. the bundle version is omitted
mutation(24, "the bundle policy version is omitted from the result",
  [{ file: COMPOSE, from: "      bundleVersion: TASTE_COMPARISON_BUNDLE_VERSION,", to: "" }],
  probe(({ bundle, snap }) => bundle(snap("user-a", richInput("a")), snap("user-b", richInput("b"))).versions.bundleVersion === undefined));

// 25-27. component versions changed
mutation(25, "the taste policy version is changed by this round",
  [{ file: TASTE_POLICY, from: 'export const TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-v1.1" as const;', to: 'export const TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-v2" as const;' }],
  probe(({ bundle, snap }) => bundle(snap("user-a", richInput("a")), snap("user-b", richInput("b"))).versions.tastePolicyVersion !== "taste-similarity-v1.1"));

mutation(26, "the social-context policy version is changed by this round",
  [{ file: CONTEXT_POLICY, from: 'export const SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION = "social-context-compatibility-v1" as const;', to: 'export const SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION = "social-context-compatibility-v2" as const;' }],
  probe(({ bundle, snap }) => bundle(snap("user-a", richInput("a")), snap("user-b", richInput("b"))).versions.socialContextPolicyVersion !== "social-context-compatibility-v1"));

mutation(27, "the goal/restriction policy version is changed by this round",
  [{ file: GOAL_POLICY, from: 'export const GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION = "goal-restriction-compatibility-v1" as const;', to: 'export const GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION = "goal-restriction-compatibility-v2" as const;' }],
  probe(({ bundle, snap }) => bundle(snap("user-a", richInput("a")), snap("user-b", richInput("b"))).versions.goalRestrictionPolicyVersion !== "goal-restriction-compatibility-v1"));

// 28. the bundle version literal is duplicated instead of imported
mutation(28, "a component version is restated as a literal instead of imported",
  [{ file: COMPOSE, from: "      tastePolicyVersion: TASTE_SIMILARITY_POLICY_VERSION,", to: "      tastePolicyVersion: \"taste-similarity-v1.1\" as typeof TASTE_SIMILARITY_POLICY_VERSION," }],
  null);

// 29. symmetry broken
mutation(29, "argument order changes the bundle",
  [{ file: COMPOSE, from: "  const taste = compareTasteSimilarity(snapshotA, snapshotB);", to: "  const taste = snapshotA.subjectUserId > snapshotB.subjectUserId\n    ? compareTasteSimilarity(snapshotA, snapshotA)\n    : compareTasteSimilarity(snapshotA, snapshotB);" }],
  probe(({ bundle, snap }) => {
    const a = snap("user-a", richInput("a"));
    const b = snap("user-b", richInput("b"));
    return JSON.stringify(bundle(a, b)) !== JSON.stringify(bundle(b, a));
  }));

// ================================================================================================
const killed = results.filter((entry) => entry.killed);
const survived = results.filter((entry) => !entry.killed);
console.log(JSON.stringify({
  suite: "taste-similarity-ts3e-mutations",
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
