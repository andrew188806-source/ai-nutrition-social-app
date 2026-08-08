#!/usr/bin/env node
// TS-3B-R1 mutation proof — REPEATED CANONICAL MEAL CONSUMPTION EVIDENCE.
//
// Each mutation rewrites REAL implementation bytes on disk, then requires that the R1 guard, the R1
// smoke, or a dedicated behavioural probe FAILS. A mutation nothing notices is a hole in the regime.
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
const similarityRoot = path.join(domainRoot, "similarity");

const file = (name) => path.join(similarityRoot, name);
const COMPARATOR = file("comparator.ts");
const POLICY = file("policy.ts");
const TYPES = file("types.ts");
const REASON_CODES = file("reasonCodes.ts");

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
const cuisine = (user, value) => ({
  category: "preference", scope: "food_taste", facet: "cuisine", polarity: "positive", value,
  evidence: envelope(`tp:${user}:cuisine:${value}`, "explicit_profile", "taste_profile", "user_explicit", "not_eligible")
});
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
const rating = (user, restaurantId, ratingValue) => ({
  category: "behavior", behaviorKind: "rating", ratingKind: "restaurant", interpretation: "scalar_evaluation_unclassified",
  ratingValue, feedback: { dislikeReasons: [] },
  evidence: envelope(`rating:${user}:${restaurantId}`, "rating", "restaurant_rating", "user_action", "source_policy", { kind: "restaurant", restaurantId })
});
const atRestaurant = (restaurantId) => ({ kind: "restaurant", restaurantId });
const atMenuItem = (restaurantId, menuItemId) => ({ kind: "menu_item", restaurantId, menuItemId });
const atBranch = (restaurantId, branchId) => ({ kind: "branch", restaurantId, branchId });

const state = (count) => (count > 0 ? { status: "available", evidenceCount: count } : { status: "empty", evidenceCount: 0 });
function makeSnapshot(compose, userId, { preferences = [], behavior = [], mealsTruncation = "not_truncated" } = {}) {
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
      meals: { requestedStartDate: "2026-07-01", requestedEndDate: "2026-08-08", requestedLimit: 50, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: mealsTruncation },
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
    // Accumulate edits per file so several replacements against the same file compose.
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
      guardFailed = !runSuite("scripts/taste-similarity-ts3b-r1-guard.mjs");
      smokeFailed = !runSuite("scripts/taste-similarity-ts3b-r1-smoke.mjs");
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

// A behavioural probe returns TRUE when it detects the injected defect.
const probe = (assertion) => (domain) => {
  const { compareTasteSimilarity, composeTasteProfileSnapshot } = domain;
  const snap = (userId, input) => makeSnapshot(composeTasteProfileSnapshot, userId, input);
  return assertion({ compare: compareTasteSimilarity, snap });
};

const twiceAt = (user, target) => [meal(target, { id: `m:${user}:1` }), meal(target, { id: `m:${user}:2` })];
const onceAt = (user, target) => [meal(target, { id: `m:${user}:1` })];

// ================================================================================================
// 1. threshold lowered to 1 — a single meal would become taste affinity
mutation(1, "the repetition boundary drops to a single occurrence",
  [{ file: POLICY, from: "export const MIN_REPEATED_MEAL_OCCURRENCES = 2;", to: "export const MIN_REPEATED_MEAL_OCCURRENCES = 1;" }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { behavior: onceAt("a", atRestaurant("rest-1")) }),
      snap("user-b", { behavior: onceAt("b", atRestaurant("rest-1")) })
    );
    return result.status === "scored";
  }));

// 2. threshold raised to 3 — genuine repetition stops qualifying
mutation(2, "the repetition boundary silently rises to three",
  [{ file: POLICY, from: "export const MIN_REPEATED_MEAL_OCCURRENCES = 2;", to: "export const MIN_REPEATED_MEAL_OCCURRENCES = 3;" }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { behavior: twiceAt("a", atRestaurant("rest-1")) }),
      snap("user-b", { behavior: twiceAt("b", atRestaurant("rest-1")) })
    );
    return result.status !== "scored";
  }));

// 3. duplicate evidence ids counted twice
mutation(3, "a duplicated evidence id is counted as two occurrences",
  [{ file: COMPARATOR, from: "  const restaurantOccurrenceIds = new Map<string, Set<string>>();", to: "  const restaurantOccurrenceIds = new Map<string, string[]>() as unknown as Map<string, Set<string>>;" },
   { file: COMPARATOR, from: "function addOccurrence(index: Map<string, Set<string>>, targetKey: string, evidenceId: string): void {\n  const existing = index.get(targetKey);\n  if (existing) {\n    existing.add(evidenceId);\n    return;\n  }\n  index.set(targetKey, new Set([evidenceId]));\n}", to: "function addOccurrence(index: Map<string, Set<string>>, targetKey: string, evidenceId: string): void {\n  const existing = index.get(targetKey) as unknown as string[] | undefined;\n  if (existing) {\n    existing.push(evidenceId);\n    return;\n  }\n  index.set(targetKey, [evidenceId] as unknown as Set<string>);\n}" },
   { file: COMPARATOR, from: "    if (evidenceIds.size >= MIN_REPEATED_MEAL_OCCURRENCES) qualifying.push(targetKey);", to: "    if ((evidenceIds as unknown as string[]).length >= MIN_REPEATED_MEAL_OCCURRENCES) qualifying.push(targetKey);" }],
  probe(({ compare, snap }) => {
    const duplicated = (user) => [meal(atRestaurant("rest-1"), { id: `m:${user}:1` }), meal(atRestaurant("rest-1"), { id: `m:${user}:1` })];
    const result = compare(
      snap("user-a", { behavior: duplicated("a") }),
      snap("user-b", { behavior: duplicated("b") })
    );
    return result.status === "scored";
  }));

// 4. a name-shaped key replaces the canonical restaurant id
mutation(4, "a name-shaped key replaces the canonical restaurant identity",
  [{ file: COMPARATOR, from: "      addOccurrence(restaurantOccurrenceIds, target.restaurantId, behavior.evidence.evidenceId);", to: '      addOccurrence(restaurantOccurrenceIds, (behavior.evidence as { displayName?: string }).displayName ?? "shared-name", behavior.evidence.evidenceId);' }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { behavior: twiceAt("a", atRestaurant("rest-1")) }),
      snap("user-b", { behavior: twiceAt("b", atRestaurant("rest-2")) })
    );
    return result.status === "scored" && result.score > 0;
  }));

// 5. the menu-item key loses its restaurant scope
mutation(5, "repeated menu-item identity drops its restaurant scope",
  [{ file: COMPARATOR, from: "      addOccurrence(menuItemOccurrenceIds, `${target.restaurantId}::${target.menuItemId}`, behavior.evidence.evidenceId);", to: "      addOccurrence(menuItemOccurrenceIds, target.menuItemId, behavior.evidence.evidenceId);" }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { behavior: twiceAt("a", atMenuItem("rest-1", "item-9")) }),
      snap("user-b", { behavior: twiceAt("b", atMenuItem("rest-2", "item-9")) })
    );
    return result.status === "scored" && result.score > 0;
  }));

// 6. branch becomes a taste identity
mutation(6, "a branch reference is inferred as a restaurant visit",
  [{ file: COMPARATOR, from: '    if (target.kind === "restaurant") {', to: '    if (target.kind === "branch") {\n      addOccurrence(restaurantOccurrenceIds, target.restaurantId, behavior.evidence.evidenceId);\n    } else if (target.kind === "restaurant") {' }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { behavior: twiceAt("a", atBranch("rest-1", "branch-1")) }),
      snap("user-b", { behavior: twiceAt("b", atBranch("rest-1", "branch-2")) })
    );
    return result.status === "scored";
  }));

// 7. favorite and repeated counted as two independent votes
mutation(7, "favorite and repeated consumption are counted as two independent votes",
  [{ file: COMPARATOR, from: "  if (favoriteRestaurants === null && restaurantFamilyHasMeals) {", to: "  if (restaurantFamilyHasMeals) {" }],
  probe(({ compare, snap }) => {
    const behavior = (user) => [favoriteRestaurant(user, "rest-1"), ...twiceAt(user, atRestaurant(`only-${user}`))];
    const result = compare(
      snap("user-a", { behavior: behavior("a") }),
      snap("user-b", { behavior: behavior("b") })
    );
    return result.comparableDimensions.filter((entry) => entry.startsWith("favorite_restaurant") || entry === "repeated_meal_restaurant").length > 1;
  }));

// 8. the weaker signal overrides the stronger one
mutation(8, "repeated consumption overrides a comparable favorite dimension",
  [{ file: COMPARATOR, from: "  const favoriteRestaurants = compareSets(leftFacts.favoriteRestaurantIds, rightFacts.favoriteRestaurantIds);", to: "  const favoriteRestaurants = leftFacts.repeatedRestaurantIds !== null && rightFacts.repeatedRestaurantIds !== null\n    ? null\n    : compareSets(leftFacts.favoriteRestaurantIds, rightFacts.favoriteRestaurantIds);" }],
  probe(({ compare, snap }) => {
    const behavior = (user) => [favoriteRestaurant(user, "rest-1"), ...twiceAt(user, atRestaurant(`only-${user}`))];
    const result = compare(
      snap("user-a", { behavior: behavior("a") }),
      snap("user-b", { behavior: behavior("b") })
    );
    return !result.comparableDimensions.includes("favorite_restaurant");
  }));

// 9. absence of repeated evidence becomes a measured zero
mutation(9, "a missing repeated set is scored as a zero instead of unknown",
  [{ file: COMPARATOR, from: "    const repeatedRestaurants = compareSets(leftFacts.repeatedRestaurantIds, rightFacts.repeatedRestaurantIds);", to: "    const repeatedRestaurants = compareSets(leftFacts.repeatedRestaurantIds, rightFacts.repeatedRestaurantIds)\n      ?? { agreement: 0, intersectionSize: 0 };" }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { preferences: [cuisine("a", "japanese")], behavior: twiceAt("a", atRestaurant("rest-1")) }),
      snap("user-b", { preferences: [cuisine("b", "japanese")], behavior: onceAt("b", atRestaurant("rest-1")) })
    );
    return result.status === "scored" && result.score < 1;
  }));

// 10. a measured zero is hidden as unknown
mutation(10, "two qualifying but disjoint repeated sets are hidden as unknown",
  [{ file: COMPARATOR, from: "    if (repeatedRestaurants === null) {", to: "    if (repeatedRestaurants === null || repeatedRestaurants.intersectionSize === 0) {" }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { behavior: twiceAt("a", atRestaurant("rest-1")) }),
      snap("user-b", { behavior: twiceAt("b", atRestaurant("rest-9")) })
    );
    return result.status !== "scored" || result.score !== 0;
  }));

// 11. occurrence count becomes a magnitude
mutation(11, "the occurrence count is used as a graded multiplier",
  [{ file: COMPARATOR, from: "      outcomes.push({ dimension: \"repeated_meal_restaurant\", agreement: repeatedRestaurants.agreement });", to: "      const visitWeight = Math.min(1, (leftFacts.repeatedRestaurantIds?.length ?? 0) / 3);\n      outcomes.push({ dimension: \"repeated_meal_restaurant\", agreement: repeatedRestaurants.agreement * visitWeight });" }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { behavior: twiceAt("a", atRestaurant("rest-1")) }),
      snap("user-b", { behavior: twiceAt("b", atRestaurant("rest-1")) })
    );
    return result.status === "scored" && result.score !== 1;
  }));

// 12. sourceConfidence gates qualification
mutation(12, "sourceConfidence gates whether a meal qualifies",
  [{ file: COMPARATOR, from: '    if (behavior.evidence.confidenceBasis !== "observed_consumption") continue;', to: '    if (behavior.evidence.confidenceBasis !== "observed_consumption") continue;\n    if ((behavior.evidence.sourceConfidence ?? 1) < 0.5) continue;' }],
  probe(({ compare, snap }) => {
    const low = (user) => [meal(atRestaurant("rest-1"), { id: `m:${user}:1`, sourceConfidence: 0.1 }), meal(atRestaurant("rest-1"), { id: `m:${user}:2`, sourceConfidence: 0.1 })];
    const high = (user) => [meal(atRestaurant("rest-1"), { id: `m:${user}:1`, sourceConfidence: 0.9 }), meal(atRestaurant("rest-1"), { id: `m:${user}:2`, sourceConfidence: 0.9 })];
    const lowResult = compare(snap("user-a", { behavior: low("a") }), snap("user-b", { behavior: low("b") }));
    const highResult = compare(snap("user-a", { behavior: high("a") }), snap("user-b", { behavior: high("b") }));
    return JSON.stringify(lowResult) !== JSON.stringify(highResult);
  }));

// 13. recency boosts the score
mutation(13, "a recent meal timestamp boosts the repeated agreement",
  [{ file: COMPARATOR, from: "      outcomes.push({ dimension: \"repeated_meal_menu_item\", agreement: repeatedMenuItems.agreement });", to: "      const recent = left.confidenceMetadata.latestEvidenceAt ?? \"\";\n      outcomes.push({ dimension: \"repeated_meal_menu_item\", agreement: recent > \"2026-08-01\" ? repeatedMenuItems.agreement : repeatedMenuItems.agreement / 2 });" }],
  probe(({ compare, snap }) => {
    const menuMeals = (user, at) => [
      meal(atMenuItem("rest-1", "item-3"), { id: `mm:${user}:1`, at }),
      meal(atMenuItem("rest-1", "item-3"), { id: `mm:${user}:2`, at })
    ];
    const older = compare(snap("user-a", { behavior: menuMeals("a", "2026-07-02T09:00:00.000Z") }), snap("user-b", { behavior: menuMeals("b", "2026-07-02T09:00:00.000Z") }));
    const newer = compare(snap("user-a", { behavior: menuMeals("a", "2026-08-07T21:30:00.000Z") }), snap("user-b", { behavior: menuMeals("b", "2026-08-07T21:30:00.000Z") }));
    return JSON.stringify(older) !== JSON.stringify(newer);
  }));

// 14. a decay formula appears
mutation(14, "an exponential decay formula is introduced",
  [{ file: COMPARATOR, from: "  const repeatedRestaurantIds = selectRepeatedTargets(restaurantOccurrenceIds);", to: "  const halfLifeDays = 30;\n  const decayWeight = Math.exp(-1 / halfLifeDays);\n  void decayWeight;\n  const repeatedRestaurantIds = selectRepeatedTargets(restaurantOccurrenceIds);" }],
  null);

// 15. a consumed-ratio threshold is invented
mutation(15, "a consumed-ratio threshold is invented",
  [{ file: COMPARATOR, from: "    const target = behavior.evidence.target;\n    if (target === null) continue;", to: "    if (behavior.consumedRatio < 0.5) continue;\n    const target = behavior.evidence.target;\n    if (target === null) continue;" }],
  null);

// 16. a rating polarity threshold appears
mutation(16, "a rating polarity threshold is introduced",
  [{ file: COMPARATOR, from: '    if (behavior.behaviorKind !== "meal_occurrence") continue;', to: '    if (behavior.behaviorKind === "rating" && behavior.ratingValue >= 4) {\n      const ratingTarget = behavior.evidence.target;\n      if (ratingTarget !== null && ratingTarget.kind === "restaurant") {\n        addOccurrence(restaurantOccurrenceIds, ratingTarget.restaurantId, behavior.evidence.evidenceId);\n        addOccurrence(restaurantOccurrenceIds, ratingTarget.restaurantId, `${behavior.evidence.evidenceId}:implied`);\n      }\n    }\n    if (behavior.behaviorKind !== "meal_occurrence") continue;' }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { behavior: [rating("a", "rest-1", 5)] }),
      snap("user-b", { behavior: [rating("b", "rest-1", 5)] })
    );
    return result.status === "scored";
  }));

// 17. truncation is treated as a complete negative
mutation(17, "a truncated meal window is treated as a complete negative",
  [{ file: COMPARATOR, from: "    if (repeatedRestaurants === null) {\n      unknowns.push(\"repeated_meal_restaurant\");", to: "    if (leftFacts.mealsTruncated || rightFacts.mealsTruncated) {\n      outcomes.push({ dimension: \"repeated_meal_restaurant\", agreement: 0 });\n    } else if (repeatedRestaurants === null) {\n      unknowns.push(\"repeated_meal_restaurant\");" }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { mealsTruncation: "known_truncated", behavior: twiceAt("a", atRestaurant("rest-1")) }),
      snap("user-b", { mealsTruncation: "known_truncated", behavior: twiceAt("b", atRestaurant("rest-1")) })
    );
    return result.status === "scored" && result.score !== 1;
  }));

// 18. symmetry broken through the repeated path
mutation(18, "argument order changes a repeated-consumption result",
  [{ file: COMPARATOR, from: "  return compareCodeUnits(first.subjectUserId, second.subjectUserId) <= 0 ? [first, second] : [second, first];", to: "  return [first, second];" },
   { file: COMPARATOR, from: "  const comparableDimensions = outcomes.map((outcome) => outcome.dimension);", to: "  const comparableDimensions = outcomes.map((outcome) => outcome.dimension);\n  if (left.subjectUserId > right.subjectUserId) outcomes.push({ dimension: \"repeated_meal_restaurant\", agreement: 0 });" }],
  probe(({ compare, snap }) => {
    const a = snap("user-a", { behavior: twiceAt("a", atRestaurant("rest-1")) });
    const b = snap("user-b", { behavior: twiceAt("b", atRestaurant("rest-1")) });
    return JSON.stringify(compare(a, b)) !== JSON.stringify(compare(b, a));
  }));

// 19. the repeated reason surface leaks identity
mutation(19, "the repeated explanation surface leaks a canonical identity",
  [{ file: COMPARATOR, from: "    explanationReasonCodes: orderTasteSimilarityReasonCodes(reasonCodes)\n  };\n}", to: "    explanationReasonCodes: orderTasteSimilarityReasonCodes(reasonCodes),\n    ...({ sharedRepeatedTargets: leftFacts.repeatedRestaurantIds } as Record<string, unknown>)\n  };\n}" }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { behavior: twiceAt("a", atRestaurant("rest-1")) }),
      snap("user-b", { behavior: twiceAt("b", atRestaurant("rest-1")) })
    );
    return JSON.stringify(result).includes("rest-1");
  }));

// 20. semantics changed without advancing the policy version
mutation(20, "the policy version is reverted while the new semantics stay",
  [{ file: POLICY, from: 'export const TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-v1.1" as const;', to: 'export const TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-v1" as const;' },
   { file: POLICY, from: '  "taste-similarity-v1",\n  "taste-similarity-v1.1"\n] as const;', to: '  "taste-similarity-v1"\n] as const;' }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { behavior: twiceAt("a", atRestaurant("rest-1")) }),
      snap("user-b", { behavior: twiceAt("b", atRestaurant("rest-1")) })
    );
    return result.policyVersion !== "taste-similarity-v1.1";
  }));

// 21. a magic per-source weight table appears
mutation(21, "a magic per-source weight table is introduced",
  [{ file: COMPARATOR, from: "  const total = outcomes.reduce((sum, outcome) => sum + outcome.agreement, 0);\n  const score = roundTasteSimilarityScore(total / outcomes.length);", to: '  const WEIGHTS: Record<string, number> = { repeated_meal_restaurant: 0.3, repeated_meal_menu_item: 0.3 };\n  const weightSum = outcomes.reduce((sum, outcome) => sum + (WEIGHTS[outcome.dimension] ?? 1), 0);\n  const total = outcomes.reduce((sum, outcome) => sum + outcome.agreement * (WEIGHTS[outcome.dimension] ?? 1), 0);\n  const score = roundTasteSimilarityScore(total / weightSum);' }],
  null);

// 22. GPS or Social signal leaks in
mutation(22, "a GPS or Social compatibility signal leaks into the repeated path",
  [{ file: COMPARATOR, from: "  const menuItemFamilyHasMeals = leftFacts.observedMealMenuItems || rightFacts.observedMealMenuItems;", to: '  const distanceKm = 0;\n  const socialCompatibility = 0;\n  void [distanceKm, socialCompatibility];\n  const menuItemFamilyHasMeals = leftFacts.observedMealMenuItems || rightFacts.observedMealMenuItems;' }],
  null);

// 23. a new dimension is added without the fallback rule
mutation(23, "the repeated dimension activates even when its family has no meal evidence",
  [{ file: COMPARATOR, from: "  const restaurantFamilyHasMeals = leftFacts.observedMealRestaurants || rightFacts.observedMealRestaurants;", to: "  const restaurantFamilyHasMeals = true;" }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { preferences: [cuisine("a", "japanese")] }),
      snap("user-b", { preferences: [cuisine("b", "japanese")] })
    );
    return result.unknowns.includes("repeated_meal_restaurant");
  }));

// 24. the repeated codes are collapsed into the favorite codes
mutation(24, "repeated consumption is explained with the favorite reason code",
  [{ file: COMPARATOR, from: '        reasonCodes.add("shared_repeated_restaurant_consumption");', to: '        reasonCodes.add("shared_favorite_restaurant");' }],
  probe(({ compare, snap }) => {
    const result = compare(
      snap("user-a", { behavior: twiceAt("a", atRestaurant("rest-1")) }),
      snap("user-b", { behavior: twiceAt("b", atRestaurant("rest-1")) })
    );
    return result.explanationReasonCodes.includes("shared_favorite_restaurant");
  }));

// ================================================================================================
const killed = results.filter((entry) => entry.killed);
const survived = results.filter((entry) => !entry.killed);
console.log(JSON.stringify({
  suite: "taste-similarity-ts3b-r1-mutations",
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
