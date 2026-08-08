#!/usr/bin/env node
// TS-3A + TS-3B mutation proof.
//
// Each mutation rewrites REAL implementation bytes in memory, reloads the module graph from the
// mutated source, and requires that the TS-3 guard, the TS-3 smoke suite, or a dedicated behavioural
// probe FAILS. A mutation that no suite notices is a hole in the regime, not a passing test.
//
// Kills must be real: a mutation that merely crashes the harness (unloadable module, syntax error) is
// reported as `harness_crash` and does NOT count as a kill.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const domainRoot = path.join(root, "packages/shared/src/domain/taste-similarity");
const similarityRoot = path.join(domainRoot, "similarity");

const file = (name) => path.join(similarityRoot, name);
const COMPARATOR = file("comparator.ts");
const POLICY = file("policy.ts");
const TYPES = file("types.ts");
const REASON_CODES = file("reasonCodes.ts");

// ---- module loader that can substitute mutated bytes for one file -------------------------------
function resolveTsFile(candidate) {
  for (const suffix of ["", ".ts", "/index.ts"]) {
    const full = `${candidate}${suffix}`;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

function loadDomain(overrides) {
  const cache = new Map();
  const loadFile = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const source = overrides.get(absolute) ?? fs.readFileSync(absolute, "utf8");
    const { outputText } = ts.transpileModule(source, {
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

// ---- shared fixture builders (identical semantics to the smoke suite) ---------------------------
const envelope = (id, origin, kind, basis, decay, target = null, extra = {}) => ({
  evidenceId: id, origin, sourceRecordKind: kind, recordedAt: "2026-08-01T00:00:00.000Z",
  confidenceBasis: basis, decayEligibility: decay, ...(target ? { target } : {}), ...extra
});
const preference = (user, scope, facet, polarity, value) => ({
  category: "preference", scope, facet, polarity, value,
  evidence: envelope(`tp:${user}:${scope}:${facet}:${value}`, "explicit_profile", "taste_profile", "user_explicit", "not_eligible")
});
const cuisine = (user, value) => preference(user, "food_taste", "cuisine", "positive", value);
const flavor = (user, value) => preference(user, "food_taste", "flavor", "negative", value);
const spice = (user, value) => preference(user, "food_taste", "spice", "unclassified", value);
const mealPattern = (user, value) => preference(user, "meal_pattern", "meal_type", "positive", value);
const payment = (user, value) => preference(user, "social_logistics", "payment_preference", "unclassified", value);
const favoriteRestaurant = (user, restaurantId) => ({
  category: "behavior", behaviorKind: "favorite", favoriteKind: "restaurant", interpretation: "positive_user_action",
  evidence: envelope(`fav:${user}:r:${restaurantId}`, "favorite", "favorite_restaurant", "user_action", "not_eligible", { kind: "restaurant", restaurantId })
});
const favoriteMenuItem = (user, restaurantId, menuItemId) => ({
  category: "behavior", behaviorKind: "favorite", favoriteKind: "menu_item", interpretation: "positive_user_action",
  evidence: envelope(`fav:${user}:m:${restaurantId}:${menuItemId}`, "favorite", "favorite_menu_item", "user_action", "not_eligible", { kind: "menu_item", restaurantId, menuItemId })
});
const mealOccurrence = (user, restaurantId, seq) => ({
  category: "behavior", behaviorKind: "meal_occurrence", interpretation: "observed", mealType: "lunch",
  occurredAt: "2026-08-01T12:00:00.000Z", consumedRatio: 1,
  evidence: envelope(`meal:${user}:${seq}`, "meal_record", "meal_record_item", "observed_consumption", "source_policy",
    { kind: "restaurant", restaurantId }, { recordedAt: "2026-08-01T12:00:00.000Z", sourceConfidence: 0.9 })
});
const rating = (user, restaurantId, ratingValue) => ({
  category: "behavior", behaviorKind: "rating", ratingKind: "restaurant", interpretation: "scalar_evaluation_unclassified",
  ratingValue, feedback: { dislikeReasons: [] },
  evidence: envelope(`rating:${user}:${restaurantId}`, "rating", "restaurant_rating", "user_action", "source_policy", { kind: "restaurant", restaurantId })
});

const state = (count) => (count > 0 ? { status: "available", evidenceCount: count } : { status: "empty", evidenceCount: 0 });

function makeSnapshot(compose, userId, { preferences = [], behavior = [] } = {}) {
  return compose({
    subjectUserId: userId,
    preferences, goals: [], restrictions: [], behavior,
    sourceStates: {
      taste_profile: state(preferences.length),
      nutrition_goals: state(0),
      dietary_restrictions: state(0),
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

// ---- detectors ----------------------------------------------------------------------------------
// The guard and smoke run against the real working tree, so a source-text mutation is applied to
// disk, the suite is executed, and the bytes are restored in a finally block.
function runSuite(script) {
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8", windowsHide: true });
  return result.status === 0;
}

function withMutatedDisk(targets, run) {
  const originals = new Map(targets.map(({ file: target }) => [target, fs.readFileSync(target, "utf8")]));
  try {
    // Accumulate edits per file: several mutations rewrite the same file more than once, and each
    // replacement must be applied on top of the previous one rather than against pristine bytes.
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
      guardFailed = !runSuite("scripts/taste-similarity-ts3-guard.mjs");
      smokeFailed = !runSuite("scripts/taste-similarity-ts3-smoke.mjs");
      if (detector) {
        const domain = loadDomain(new Map());
        probeFailed = detector(domain);
      }
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

// A behavioural probe returns TRUE when it detects the injected defect.
const probe = (assertion) => (domain) => {
  const { compareTasteSimilarity, composeTasteProfileSnapshot } = domain;
  const snap = (userId, input) => makeSnapshot(composeTasteProfileSnapshot, userId, input);
  return assertion({ compare: compareTasteSimilarity, snap });
};

// ================================================================================================
// 1. social logistics leaks into taste
mutation(1, "social_logistics preference leaks into the taste comparison",
  [{ file: COMPARATOR, from: 'if (preference.scope !== "food_taste") continue;', to: 'if (preference.scope !== "food_taste" && preference.scope !== "social_logistics") continue;' }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { preferences: [cuisine("a", "japanese"), payment("a", "split_bill")] }),
      snap("user-b", { preferences: [cuisine("b", "japanese"), payment("b", "split_bill")] })
    );
    return JSON.stringify(result).includes("social") || result.confidenceInputs.explicitEvidenceCount !== 2;
  }));

// 2. meal_pattern preference leaks into taste
mutation(2, "meal_pattern preference leaks into the taste comparison",
  [{ file: COMPARATOR, from: 'if (preference.scope !== "food_taste") continue;', to: 'if (preference.scope !== "food_taste" && preference.scope !== "meal_pattern") continue;' }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { preferences: [cuisine("a", "japanese"), mealPattern("a", "lunch")] }),
      snap("user-b", { preferences: [cuisine("b", "japanese"), mealPattern("b", "lunch")] })
    );
    return result.confidenceInputs.explicitEvidenceCount !== 2;
  }));

// 3. meal history contributes to the score
mutation(3, "meal history contributes to the score",
  [{ file: COMPARATOR, from: 'if (behavior.behaviorKind !== "favorite") continue;', to: 'if (behavior.behaviorKind !== "favorite" && behavior.behaviorKind !== "meal_occurrence") continue;' }],
  probe(({ compare, snap }) => {
    const withMeals = compare(
      snap("user-a", { preferences: [cuisine("a", "japanese")], behavior: [mealOccurrence("a", "rest-1", 1)] }),
      snap("user-b", { preferences: [cuisine("b", "japanese")], behavior: [mealOccurrence("b", "rest-1", 2)] })
    );
    return withMeals.confidenceInputs.behavioralEvidenceCount !== 0;
  }));

// 4. ratings contribute to the score
mutation(4, "rating evidence contributes to the score",
  [{ file: COMPARATOR, from: 'if (behavior.behaviorKind !== "favorite") continue;', to: 'if (behavior.behaviorKind !== "favorite" && behavior.behaviorKind !== "rating") continue;' }],
  probe(({ compare, snap }) => {
    const withRatings = compare(
      snap("user-a", { preferences: [cuisine("a", "japanese")], behavior: [rating("a", "rest-1", 5)] }),
      snap("user-b", { preferences: [cuisine("b", "japanese")], behavior: [rating("b", "rest-1", 1)] })
    );
    return withRatings.confidenceInputs.behavioralEvidenceCount !== 0;
  }));

// 5. missing evidence is scored as disagreement
mutation(5, "missing evidence is scored as a zero instead of unknown",
  [{ file: COMPARATOR, from: "if (left === null || right === null) return null;", to: "if (left === null && right === null) return null;\n  if (left === null || right === null) return { agreement: 0, intersectionSize: 0 };" }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { preferences: [cuisine("a", "japanese"), flavor("a", "coriander")] }),
      snap("user-b", { preferences: [cuisine("b", "japanese")] })
    );
    return result.status === "scored" && result.score < 1;
  }));

// 6. a measured zero is converted into "unknown"
mutation(6, "a measured zero overlap is hidden as unknown",
  [{ file: COMPARATOR, from: "if (unionSize === 0) return null;", to: "if (unionSize === 0 || intersectionSize === 0) return null;" }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { preferences: [cuisine("a", "japanese")] }),
      snap("user-b", { preferences: [cuisine("b", "french")] })
    );
    return result.status !== "scored" || result.score !== 0;
  }));

// 7. a not_scored result gains a score key
mutation(7, "a not_scored result carries a score key",
  [{ file: COMPARATOR, from: '    status: "not_scored",\n    reason,', to: '    status: "not_scored",\n    score: 0,\n    reason,' }],
  probe(({ compare, snap }) => "score" in compare(snap("user-a"), snap("user-b"))));

// 8. not scored is silently reported as scored zero
mutation(8, "an unscorable pair is reported as a scored zero",
  [{ file: COMPARATOR, from: "    return notScored(reason, confidenceInputs, unknowns);", to: '    void reason;\n    return { policyVersion: TASTE_SIMILARITY_POLICY_VERSION, snapshotSchemaVersion: TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION, status: "scored", score: 0, comparableDimensions: EMPTY_DIMENSIONS, overlaps: EMPTY_DIMENSIONS, sharedAvoidances: EMPTY_DIMENSIONS, unknowns: freezeDimensions([...unknowns]), conflicts: EMPTY_DIMENSIONS, confidenceInputs, explanationReasonCodes: orderTasteSimilarityReasonCodes(["limited_evidence"]) };' }],
  probe(({ compare, snap }) => compare(snap("user-a"), snap("user-b")).status === "scored"));

// 9. shared avoidance is reclassified as a positive overlap
mutation(9, "a shared disliked flavor is reported as a positive overlap",
  [{ file: COMPARATOR, from: '      sharedAvoidances.push("flavor_avoidance");', to: '      overlaps.push("flavor_avoidance");' }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { preferences: [flavor("a", "coriander")] }),
      snap("user-b", { preferences: [flavor("b", "coriander")] })
    );
    return result.overlaps.includes("flavor_avoidance") || result.sharedAvoidances.length === 0;
  }));

// 10. a conflict is fabricated where TS-1 has no contradicting authority
mutation(10, "a conflict is fabricated from a differing spice value",
  [{ file: COMPARATOR, from: '    unknowns.push("spice_preference");', to: '    unknowns.push("spice_preference");\n    conflictsInjected.push("spice_preference");' },
   { file: COMPARATOR, from: "  const reasonCodes = new Set<TasteSimilarityReasonCode>();", to: "  const reasonCodes = new Set<TasteSimilarityReasonCode>();\n  const conflictsInjected: TasteSimilarityDimension[] = [];" },
   { file: COMPARATOR, from: "    conflicts: EMPTY_DIMENSIONS,\n    confidenceInputs,\n    explanationReasonCodes: orderTasteSimilarityReasonCodes(reasonCodes)", to: "    conflicts: freezeDimensions(conflictsInjected),\n    confidenceInputs,\n    explanationReasonCodes: orderTasteSimilarityReasonCodes(reasonCodes)" }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { preferences: [cuisine("a", "thai"), spice("a", "mild")] }),
      snap("user-b", { preferences: [cuisine("b", "thai"), spice("b", "hot")] })
    );
    return result.conflicts.length > 0;
  }));

// 11. spice acquires an invented ordinal scale
mutation(11, "spice acquires an invented ordinal scale",
  [{ file: COMPARATOR, from: "  if (leftFacts.spice === null || rightFacts.spice === null || leftFacts.spice !== rightFacts.spice) {", to: '  const SPICE_ORDER = ["mild", "medium", "hot"];\n  const spiceDistance = leftFacts.spice === null || rightFacts.spice === null ? null : Math.abs(SPICE_ORDER.indexOf(leftFacts.spice) - SPICE_ORDER.indexOf(rightFacts.spice)) / 2;\n  if (spiceDistance !== null && leftFacts.spice !== rightFacts.spice) {\n    outcomes.push({ dimension: "spice_preference", agreement: 1 - spiceDistance });\n  } else if (leftFacts.spice === null || rightFacts.spice === null || leftFacts.spice !== rightFacts.spice) {' }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { preferences: [spice("a", "mild")] }),
      snap("user-b", { preferences: [spice("b", "medium")] })
    );
    return result.status === "scored";
  }));

// 12. favorites are matched by display name instead of canonical id
mutation(12, "favorites are matched by a name-shaped key instead of the canonical id",
  [{ file: COMPARATOR, from: "      favoriteRestaurantIds.push(target.restaurantId);", to: '      favoriteRestaurantIds.push((behavior.evidence as { displayName?: string }).displayName ?? "shared-name");' }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { behavior: [favoriteRestaurant("a", "rest-1")] }),
      snap("user-b", { behavior: [favoriteRestaurant("b", "rest-2")] })
    );
    return result.status === "scored" && result.score > 0;
  }));

// 13. the menu-item key drops its restaurant scope
mutation(13, "menu item identity drops its restaurant scope",
  [{ file: COMPARATOR, from: "      favoriteMenuItemIds.push(`${target.restaurantId}::${target.menuItemId}`);", to: "      favoriteMenuItemIds.push(target.menuItemId);" }],
  probe(({ compare, snap }) => {
    // The same menu item id at two DIFFERENT restaurants is not the same dish.
    const result = compare(
      snap("user-a", { behavior: [favoriteMenuItem("a", "rest-1", "item-9")] }),
      snap("user-b", { behavior: [favoriteMenuItem("b", "rest-2", "item-9")] })
    );
    return result.status === "scored" && result.score > 0;
  }));

// 14. the score escapes the canonical range
mutation(14, "the score escapes the canonical 0..1 range",
  [{ file: COMPARATOR, from: "  const score = roundTasteSimilarityScore(total / outcomes.length);", to: "  const score = roundTasteSimilarityScore(Math.min(1, total / outcomes.length) * 1.0 + (outcomes.length > 1 ? 0.5 : 0));" }],
  null);

// 15. rounding stops being deterministic
mutation(15, "score rounding becomes non-deterministic",
  [{ file: POLICY, from: "  const rounded = Math.round(value * factor) / factor;", to: "  const rounded = Math.round(value * factor + Number.EPSILON * Math.sign(value)) / factor;\n  if (value > 0 && value < 1) return Math.round(value * 1000) / 1000;" }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { preferences: [cuisine("a", "japanese"), cuisine("a", "thai")] }),
      snap("user-b", { preferences: [cuisine("b", "japanese"), cuisine("b", "italian")] })
    );
    return result.status === "scored" && result.score !== 0.333333;
  }));

// 16. the range guard is replaced with a silent clamp
mutation(16, "an out-of-range score is silently clamped instead of throwing",
  [{ file: POLICY, from: '    throw new RangeError("Taste similarity score must fall within the canonical 0..1 range.");', to: "    return Math.min(TASTE_SIMILARITY_SCORE_MAX, Math.max(TASTE_SIMILARITY_SCORE_MIN, rounded));" }],
  null);

// 17. the policy version stops being pinned
mutation(17, "the policy version is no longer pinned to taste-similarity-v1",
  [{ file: POLICY, from: 'export const TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-v1" as const;', to: 'export const TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-latest" as const;' }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { preferences: [cuisine("a", "japanese")] }),
      snap("user-b", { preferences: [cuisine("b", "japanese")] })
    );
    return result.policyVersion !== "taste-similarity-v1";
  }));

// 18. an unsupported snapshot schema is scored anyway
mutation(18, "an unsupported snapshot schema is scored instead of failing closed",
  [{ file: COMPARATOR, from: "    snapshotA.schemaVersion !== TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION ||\n    snapshotB.schemaVersion !== TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION", to: "    snapshotA.schemaVersion === undefined ||\n    snapshotB.schemaVersion === undefined" }],
  probe(({ compare, snap }) => {
    const base = snap("user-a", { preferences: [cuisine("a", "japanese")] });
    const result = compare({ ...base, schemaVersion: "taste-profile-snapshot-v99" }, snap("user-b", { preferences: [cuisine("b", "japanese")] }));
    return result.status === "scored";
  }));

// 19. symmetry is broken by dropping canonical pair ordering
mutation(19, "argument order changes the result",
  [{ file: COMPARATOR, from: "  return compareCodeUnits(first.subjectUserId, second.subjectUserId) <= 0 ? [first, second] : [second, first];", to: "  return [first, second];" },
   { file: COMPARATOR, from: "  const comparableDimensions = outcomes.map((outcome) => outcome.dimension);", to: "  const comparableDimensions = outcomes.map((outcome) => outcome.dimension);\n  if (left.subjectUserId > right.subjectUserId) outcomes.push({ dimension: \"cuisine_preference\", agreement: 0 });" }],
  probe(({ compare, snap }) => {
    const a = snap("user-a", { preferences: [cuisine("a", "japanese")] });
    const b = snap("user-b", { preferences: [cuisine("b", "japanese")] });
    return JSON.stringify(compare(a, b)) !== JSON.stringify(compare(b, a));
  }));

// 20. magic per-source weights are introduced
mutation(20, "arbitrary per-dimension weights are introduced",
  [{ file: COMPARATOR, from: "  const total = outcomes.reduce((sum, outcome) => sum + outcome.agreement, 0);\n  const score = roundTasteSimilarityScore(total / outcomes.length);", to: '  const WEIGHTS: Record<string, number> = { cuisine_preference: 0.4, flavor_avoidance: 0.1, spice_preference: 0.1, favorite_restaurant: 0.3, favorite_menu_item: 0.1 };\n  const weightSum = outcomes.reduce((sum, outcome) => sum + (WEIGHTS[outcome.dimension] ?? 0), 0);\n  const total = outcomes.reduce((sum, outcome) => sum + outcome.agreement * (WEIGHTS[outcome.dimension] ?? 0), 0);\n  const score = roundTasteSimilarityScore(total / weightSum);' }],
  null);

// 21. GPS / premium / activity contribution is introduced
mutation(21, "GPS, premium or activity contribution is introduced",
  [{ file: COMPARATOR, from: "  const comparableDimensions = outcomes.map((outcome) => outcome.dimension);", to: '  const distanceKm = 0; const isPremium = false; const activityScore = 0;\n  void [distanceKm, isPremium, activityScore];\n  const comparableDimensions = outcomes.map((outcome) => outcome.dimension);' }],
  null);

// 22. a numeric confidence is fabricated
mutation(22, "a numeric confidence value is fabricated",
  [{ file: TYPES, from: "  truncation: {\n    favoritesTruncatedForEither: boolean;\n  };", to: "  truncation: {\n    favoritesTruncatedForEither: boolean;\n  };\n  confidenceScore: number;" },
   { file: COMPARATOR, from: "    truncation: {\n      favoritesTruncatedForEither: leftFacts.favoritesTruncated || rightFacts.favoritesTruncated\n    }", to: "    truncation: {\n      favoritesTruncatedForEither: leftFacts.favoritesTruncated || rightFacts.favoritesTruncated\n    },\n    confidenceScore: comparableDimensionCount / 5" },
   { file: COMPARATOR, from: "    sourceAvailability: { tasteProfileAvailableForBoth: false, favoritesAvailableForBoth: false },\n    truncation: { favoritesTruncatedForEither: false }", to: "    sourceAvailability: { tasteProfileAvailableForBoth: false, favoritesAvailableForBoth: false },\n    truncation: { favoritesTruncatedForEither: false },\n    confidenceScore: 0" }],
  null);

// 23. reason code ordering becomes locale- or insertion-dependent
mutation(23, "reason code ordering stops being deterministic",
  [{ file: REASON_CODES, from: "  return [...new Set(codes)].sort(\n    (left, right) => (REASON_CODE_RANK.get(left) ?? 0) - (REASON_CODE_RANK.get(right) ?? 0)\n  );", to: "  return [...new Set(codes)];" }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { preferences: [spice("a", "medium"), flavor("a", "coriander"), cuisine("a", "thai")] }),
      snap("user-b", { preferences: [spice("b", "medium"), flavor("b", "coriander"), cuisine("b", "thai")] })
    );
    return JSON.stringify(result.explanationReasonCodes) !== JSON.stringify(["shared_cuisine_preference", "shared_flavor_avoidance", "shared_spice_preference"]);
  }));

// 24. raw evidence values leak into the result
mutation(24, "raw evidence values leak into the explanation surface",
  [{ file: COMPARATOR, from: "    explanationReasonCodes: orderTasteSimilarityReasonCodes(reasonCodes)\n  };\n}", to: "    explanationReasonCodes: orderTasteSimilarityReasonCodes(reasonCodes),\n    ...({ sharedCuisineValues: leftFacts.cuisines } as Record<string, unknown>)\n  };\n}" }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { preferences: [cuisine("a", "japanese")] }),
      snap("user-b", { preferences: [cuisine("b", "japanese")] })
    );
    return JSON.stringify(result).includes("japanese");
  }));

// ================================================================================================
const killed = results.filter((entry) => entry.killed);
const survived = results.filter((entry) => !entry.killed);
console.log(JSON.stringify({
  suite: "taste-similarity-ts3-mutations",
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
