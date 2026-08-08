#!/usr/bin/env node
// TS-3B-R1 contract smoke — REPEATED CANONICAL MEAL CONSUMPTION EVIDENCE.
//
// Executes the REAL shared domain: snapshots are built with the frozen composeTasteProfileSnapshot
// and scored with the real comparator. Nothing is re-implemented here.
//
// Scenario 1 is the decisive predecessor-isolation proof: the FROZEN taste-similarity-v1 comparator
// is loaded from the TS-3A/B freeze commit and run alongside the current one, so "meal-free results
// are unchanged" is demonstrated against the actual previous implementation rather than asserted.
//
// Fully local and pure: no network, no database, no Supabase, no credential, no clock dependence.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = process.cwd();
const TS3_FREEZE_COMMIT = "8e7592caa351813021c6b9e34a31635a2db6c866";
const checks = [];
const expect = (pass, name, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const resolveTsFile = (candidate) => {
  for (const suffix of ["", ".ts", "/index.ts"]) {
    const full = `${candidate}${suffix}`;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
};

function loadDomain(overrides = new Map()) {
  const cache = new Map();
  const loadFile = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const source = overrides.get(path.normalize(absolute)) ?? fs.readFileSync(absolute, "utf8");
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
  return loadFile(path.join(root, "packages/shared/src/domain/taste-similarity/index.ts"));
}

const domain = loadDomain();
const {
  compareTasteSimilarity,
  composeTasteProfileSnapshot,
  MIN_REPEATED_MEAL_OCCURRENCES,
  TASTE_SIMILARITY_POLICY_VERSION,
  TASTE_SIMILARITY_POLICY_VERSION_HISTORY
} = domain;

expect(typeof compareTasteSimilarity === "function", "S0 the REAL comparator loads");
expect(typeof composeTasteProfileSnapshot === "function", "S0 the REAL frozen snapshot composer loads");
expect(MIN_REPEATED_MEAL_OCCURRENCES === 2, "S0 the repetition boundary is exactly 2", MIN_REPEATED_MEAL_OCCURRENCES);

// ---- frozen TS-3A/B comparator, loaded from the freeze commit -----------------------------------
const similarityDir = path.join(root, "packages/shared/src/domain/taste-similarity/similarity");
const frozenOverrides = new Map();
let frozenCompare = null;
{
  let ok = true;
  for (const file of ["policy.ts", "reasonCodes.ts", "types.ts", "comparator.ts"]) {
    const shown = spawnSync(
      "git",
      ["show", `${TS3_FREEZE_COMMIT}:packages/shared/src/domain/taste-similarity/similarity/${file}`],
      { cwd: root, encoding: "utf8", windowsHide: true }
    );
    if (shown.status !== 0) { ok = false; break; }
    frozenOverrides.set(path.normalize(path.join(similarityDir, file)), shown.stdout);
  }
  if (ok) frozenCompare = loadDomain(frozenOverrides).compareTasteSimilarity;
}
expect(typeof frozenCompare === "function", "S0 the FROZEN taste-similarity-v1 comparator loads from the freeze commit");

// ---- fixture builders using only frozen TS-1 authority ------------------------------------------
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
const payment = (user, value) => preference(user, "social_logistics", "payment_preference", "unclassified", value);
const favoriteRestaurant = (user, restaurantId) => ({
  category: "behavior", behaviorKind: "favorite", favoriteKind: "restaurant", interpretation: "positive_user_action",
  evidence: envelope(`fav:${user}:r:${restaurantId}`, "favorite", "favorite_restaurant", "user_action", "not_eligible", { kind: "restaurant", restaurantId })
});
const favoriteMenuItem = (user, restaurantId, menuItemId) => ({
  category: "behavior", behaviorKind: "favorite", favoriteKind: "menu_item", interpretation: "positive_user_action",
  evidence: envelope(`fav:${user}:m:${restaurantId}:${menuItemId}`, "favorite", "favorite_menu_item", "user_action", "not_eligible", { kind: "menu_item", restaurantId, menuItemId })
});

// A durable observed meal occurrence. `evidenceId` is explicit so a caller can deliberately reuse
// one and prove that a duplicate id cannot fake repetition.
const meal = (user, target, { id, at = "2026-08-01T12:00:00.000Z", sourceConfidence, basis = "observed_consumption" } = {}) => ({
  category: "behavior", behaviorKind: "meal_occurrence", interpretation: "observed", mealType: "lunch",
  occurredAt: at, consumedRatio: 1,
  evidence: envelope(
    id, "meal_record", "meal_record_item", basis, "source_policy", target,
    { recordedAt: at, ...(sourceConfidence === undefined ? {} : { sourceConfidence }) }
  )
});
const atRestaurant = (restaurantId) => ({ kind: "restaurant", restaurantId });
const atMenuItem = (restaurantId, menuItemId) => ({ kind: "menu_item", restaurantId, menuItemId });
const atBranch = (restaurantId, branchId) => ({ kind: "branch", restaurantId, branchId });

const rating = (user, restaurantId, ratingValue) => ({
  category: "behavior", behaviorKind: "rating", ratingKind: "restaurant", interpretation: "scalar_evaluation_unclassified",
  ratingValue, feedback: { dislikeReasons: [] },
  evidence: envelope(`rating:${user}:${restaurantId}`, "rating", "restaurant_rating", "user_action", "source_policy", { kind: "restaurant", restaurantId })
});
const goal = (user) => ({
  category: "goal", facet: "daily_calories_target", value: 1800, unit: "kcal",
  validity: { startsOn: "2026-08-01", isActive: true },
  evidence: envelope(`goal:${user}`, "nutrition_goal", "nutrition_goal", "user_explicit", "not_eligible")
});
const restriction = (user, label) => ({
  category: "restriction", restrictionType: "allergy", label, rawSeverity: "preference", visibility: "private",
  evidence: envelope(`restr:${user}:${label}`, "dietary_restriction", "dietary_restriction", "user_explicit", "not_eligible")
});

const state = (count) => (count > 0 ? { status: "available", evidenceCount: count } : { status: "empty", evidenceCount: 0 });
const snapshot = (userId, { preferences = [], behavior = [], goals = [], restrictions = [], mealsTruncation = "not_truncated" } = {}) =>
  composeTasteProfileSnapshot({
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
      meals: { requestedStartDate: "2026-07-01", requestedEndDate: "2026-08-08", requestedLimit: 50, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: mealsTruncation },
      favorites: { requestedLimit: 25, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" },
      ratings: { requestedLimit: null, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" }
    }
  });

// ============ 1. no meals → frozen TS-3A/B semantics unchanged ==================================
{
  const mealFreePairs = [
    [{ preferences: [cuisine("a", "japanese"), cuisine("a", "thai"), flavor("a", "coriander"), spice("a", "medium")], behavior: [favoriteRestaurant("a", "rest-1")] },
     { preferences: [cuisine("b", "japanese"), flavor("b", "coriander"), spice("b", "medium")], behavior: [favoriteRestaurant("b", "rest-1")] }],
    [{ preferences: [cuisine("a", "japanese")] }, { preferences: [cuisine("b", "french")] }],
    [{ preferences: [cuisine("a", "japanese")] }, {}],
    [{}, {}],
    [{ behavior: [favoriteMenuItem("a", "rest-1", "item-1")] }, { behavior: [favoriteMenuItem("b", "rest-1", "item-1")] }]
  ];
  // Strip exactly the two DELIBERATE contract changes: the policy version field, and the additive
  // confidence-input keys. Everything else must match the frozen implementation byte for byte.
  const stripAdditive = (result) => {
    const { policyVersion, confidenceInputs, ...rest } = result;
    void policyVersion;
    const { repeatedMealEvidence, sourceAvailability, truncation, ...inputs } = confidenceInputs;
    void repeatedMealEvidence;
    const { mealsAvailableForBoth, ...availability } = sourceAvailability;
    void mealsAvailableForBoth;
    const { mealsTruncatedForEither, ...truncated } = truncation;
    void mealsTruncatedForEither;
    return { ...rest, confidenceInputs: { ...inputs, sourceAvailability: availability, truncation: truncated } };
  };
  let identical = frozenCompare !== null;
  const divergences = [];
  if (frozenCompare) {
    for (const [inputA, inputB] of mealFreePairs) {
      const a = snapshot("user-a", inputA);
      const b = snapshot("user-b", inputB);
      const current = JSON.stringify(stripAdditive(compareTasteSimilarity(a, b)));
      const frozen = JSON.stringify(stripAdditive(frozenCompare(a, b)));
      if (current !== frozen) { identical = false; divergences.push({ current, frozen }); }
    }
  }
  expect(identical, "1 with no meal evidence, every result matches the FROZEN taste-similarity-v1 comparator exactly", divergences);
  const noMeals = compareTasteSimilarity(
    snapshot("user-a", { preferences: [cuisine("a", "japanese")] }),
    snapshot("user-b", { preferences: [cuisine("b", "japanese")] })
  );
  expect(
    !noMeals.unknowns.includes("repeated_meal_restaurant") && !noMeals.unknowns.includes("repeated_meal_menu_item"),
    "1a a family with no meal evidence does not appear as an unknown dimension"
  );
}

// ============ 2-7. repeated restaurant semantics ================================================
{
  const single = compareTasteSimilarity(
    snapshot("user-a", { behavior: [meal("a", atRestaurant("rest-1"), { id: "m:a:1" })] }),
    snapshot("user-b", { behavior: [meal("b", atRestaurant("rest-1"), { id: "m:b:1" })] })
  );
  expect(single.status === "not_scored", "2 one occurrence each of the same restaurant produces no taste signal", single.reason);
  expect(single.unknowns.includes("repeated_meal_restaurant"), "2a the family is reported unknown once meal evidence exists");
  expect(single.confidenceInputs.repeatedMealEvidence.qualifyingRestaurantTargets === 0, "2b nothing qualified as repeated");

  const lopsided = compareTasteSimilarity(
    snapshot("user-a", { behavior: [meal("a", atRestaurant("rest-1"), { id: "m:a:1" }), meal("a", atRestaurant("rest-1"), { id: "m:a:2" })] }),
    snapshot("user-b", { behavior: [meal("b", atRestaurant("rest-1"), { id: "m:b:1" })] })
  );
  expect(lopsided.status === "not_scored" && lopsided.unknowns.includes("repeated_meal_restaurant"), "3 A repeated but B single is not comparable");
  expect(!lopsided.comparableDimensions.includes("repeated_meal_restaurant"), "3a a one-sided repeated set stays out of the denominator");

  const bothRepeated = compareTasteSimilarity(
    snapshot("user-a", { behavior: [meal("a", atRestaurant("rest-1"), { id: "m:a:1" }), meal("a", atRestaurant("rest-1"), { id: "m:a:2" })] }),
    snapshot("user-b", { behavior: [meal("b", atRestaurant("rest-1"), { id: "m:b:1" }), meal("b", atRestaurant("rest-1"), { id: "m:b:2" })] })
  );
  expect(bothRepeated.status === "scored" && bothRepeated.score === 1, "4 both repeated at the same restaurant is a scored overlap", bothRepeated.score);
  expect(bothRepeated.overlaps.includes("repeated_meal_restaurant"), "4a the overlap is recorded on the repeated dimension");
  expect(bothRepeated.explanationReasonCodes.includes("shared_repeated_restaurant_consumption"), "4b repeated consumption gets its own reason code");
  expect(!bothRepeated.explanationReasonCodes.includes("shared_favorite_restaurant"), "4c repeated consumption never emits a favorite reason code");

  const partial = compareTasteSimilarity(
    snapshot("user-a", { behavior: [meal("a", atRestaurant("rest-1"), { id: "m:a:1" }), meal("a", atRestaurant("rest-1"), { id: "m:a:2" }), meal("a", atRestaurant("rest-2"), { id: "m:a:3" }), meal("a", atRestaurant("rest-2"), { id: "m:a:4" })] }),
    snapshot("user-b", { behavior: [meal("b", atRestaurant("rest-2"), { id: "m:b:1" }), meal("b", atRestaurant("rest-2"), { id: "m:b:2" }), meal("b", atRestaurant("rest-3"), { id: "m:b:3" }), meal("b", atRestaurant("rest-3"), { id: "m:b:4" })] })
  );
  expect(partial.status === "scored" && partial.score === 0.333333, "5 partial repeated overlap is a plain Jaccard index (1 of 3)", partial.score);

  const disjoint = compareTasteSimilarity(
    snapshot("user-a", { behavior: [meal("a", atRestaurant("rest-1"), { id: "m:a:1" }), meal("a", atRestaurant("rest-1"), { id: "m:a:2" })] }),
    snapshot("user-b", { behavior: [meal("b", atRestaurant("rest-9"), { id: "m:b:1" }), meal("b", atRestaurant("rest-9"), { id: "m:b:2" })] })
  );
  expect(disjoint.status === "scored" && disjoint.score === 0, "6 two qualifying but disjoint repeated sets are a measured 0", disjoint.score);
  expect(disjoint.conflicts.length === 0, "6a a disjoint repeated set is never a conflict");

  expect(
    JSON.stringify(disjoint).indexOf("rest-") === -1,
    "7 different restaurants never match and no restaurant identity appears in the result — identity is the canonical id, and no display name exists in the contract to read"
  );

  const branchOnly = compareTasteSimilarity(
    snapshot("user-a", { behavior: [meal("a", atBranch("rest-1", "branch-1"), { id: "m:a:1" }), meal("a", atBranch("rest-1", "branch-1"), { id: "m:a:2" })] }),
    snapshot("user-b", { behavior: [meal("b", atBranch("rest-1", "branch-1"), { id: "m:b:1" }), meal("b", atBranch("rest-1", "branch-1"), { id: "m:b:2" })] })
  );
  expect(branchOnly.status === "not_scored", "7a a branch target creates no dimension and is never inferred as a restaurant visit", branchOnly.reason);
  expect(
    !branchOnly.unknowns.includes("repeated_meal_restaurant") && !branchOnly.unknowns.includes("repeated_meal_menu_item"),
    "7b branch-only meal evidence produces no repeated dimension at all",
    branchOnly.unknowns
  );
}

// ============ 8-9. repeated menu item semantics =================================================
{
  const shared = compareTasteSimilarity(
    snapshot("user-a", { behavior: [meal("a", atMenuItem("rest-1", "item-9"), { id: "m:a:1" }), meal("a", atMenuItem("rest-1", "item-9"), { id: "m:a:2" })] }),
    snapshot("user-b", { behavior: [meal("b", atMenuItem("rest-1", "item-9"), { id: "m:b:1" }), meal("b", atMenuItem("rest-1", "item-9"), { id: "m:b:2" })] })
  );
  expect(shared.status === "scored" && shared.score === 1 && shared.overlaps.includes("repeated_meal_menu_item"), "8 the same composite menu-item id repeated by both is an overlap");
  expect(shared.explanationReasonCodes.includes("shared_repeated_menu_item_consumption"), "8a the repeated menu-item reason code is emitted");

  const otherRestaurant = compareTasteSimilarity(
    snapshot("user-a", { behavior: [meal("a", atMenuItem("rest-1", "item-9"), { id: "m:a:1" }), meal("a", atMenuItem("rest-1", "item-9"), { id: "m:a:2" })] }),
    snapshot("user-b", { behavior: [meal("b", atMenuItem("rest-2", "item-9"), { id: "m:b:1" }), meal("b", atMenuItem("rest-2", "item-9"), { id: "m:b:2" })] })
  );
  expect(otherRestaurant.status === "scored" && otherRestaurant.score === 0, "9 the same menu item id under a different restaurant is not the same dish", otherRestaurant.score);
}

// ============ 10. duplicate evidence id cannot fake repetition ==================================
{
  const duplicated = compareTasteSimilarity(
    snapshot("user-a", { behavior: [meal("a", atRestaurant("rest-1"), { id: "m:a:1" }), meal("a", atRestaurant("rest-1"), { id: "m:a:1" })] }),
    snapshot("user-b", { behavior: [meal("b", atRestaurant("rest-1"), { id: "m:b:1" }), meal("b", atRestaurant("rest-1"), { id: "m:b:1" })] })
  );
  expect(duplicated.status === "not_scored", "10 the same occurrence repeated under one evidence id is still one occurrence", duplicated.reason);
  expect(duplicated.confidenceInputs.repeatedMealEvidence.qualifyingRestaurantTargets === 0, "10a a duplicated evidence id qualifies nothing");
}

// ============ 11-13. favorite-vs-repeated fallback ==============================================
{
  const repeatedBehavior = (user) => [
    meal(user, atRestaurant(`only-${user}`), { id: `m:${user}:1` }),
    meal(user, atRestaurant(`only-${user}`), { id: `m:${user}:2` })
  ];
  const favoriteAndRepeated = compareTasteSimilarity(
    snapshot("user-a", { behavior: [favoriteRestaurant("a", "rest-1"), ...repeatedBehavior("a")] }),
    snapshot("user-b", { behavior: [favoriteRestaurant("b", "rest-1"), ...repeatedBehavior("b")] })
  );
  expect(favoriteAndRepeated.comparableDimensions.includes("favorite_restaurant"), "11 the stronger favorite dimension is used");
  expect(!favoriteAndRepeated.comparableDimensions.includes("repeated_meal_restaurant"), "11a the weaker repeated dimension is suppressed, not added alongside");
  expect(!favoriteAndRepeated.unknowns.includes("repeated_meal_restaurant"), "11b a suppressed dimension is not misreported as unknown");
  expect(favoriteAndRepeated.confidenceInputs.repeatedMealEvidence.restaurantSuppressedByFavorites, "11c suppression is exposed in the confidence inputs");
  expect(favoriteAndRepeated.comparableDimensions.length === 1 && favoriteAndRepeated.score === 1, "11d one behavioural family casts exactly one vote", favoriteAndRepeated.comparableDimensions);

  const repeatedMenu = (user) => [
    meal(user, atMenuItem(`only-${user}`, "item-1"), { id: `mm:${user}:1` }),
    meal(user, atMenuItem(`only-${user}`, "item-1"), { id: `mm:${user}:2` })
  ];
  const favoriteMenuAndRepeated = compareTasteSimilarity(
    snapshot("user-a", { behavior: [favoriteMenuItem("a", "rest-1", "item-9"), ...repeatedMenu("a")] }),
    snapshot("user-b", { behavior: [favoriteMenuItem("b", "rest-1", "item-9"), ...repeatedMenu("b")] })
  );
  expect(favoriteMenuAndRepeated.comparableDimensions.join(",") === "favorite_menu_item", "12 a comparable favorite menu item suppresses the repeated menu-item fallback", favoriteMenuAndRepeated.comparableDimensions);
  expect(favoriteMenuAndRepeated.confidenceInputs.repeatedMealEvidence.menuItemSuppressedByFavorites, "12a menu-item suppression is exposed");

  const onlyOneHasFavorite = compareTasteSimilarity(
    snapshot("user-a", { behavior: [favoriteRestaurant("a", "rest-1"), meal("a", atRestaurant("rest-7"), { id: "m:a:1" }), meal("a", atRestaurant("rest-7"), { id: "m:a:2" })] }),
    snapshot("user-b", { behavior: [meal("b", atRestaurant("rest-7"), { id: "m:b:1" }), meal("b", atRestaurant("rest-7"), { id: "m:b:2" })] })
  );
  expect(onlyOneHasFavorite.comparableDimensions.includes("repeated_meal_restaurant"), "13 when the favorite dimension is not comparable the repeated fallback activates");
  expect(onlyOneHasFavorite.status === "scored" && onlyOneHasFavorite.score === 1, "13a the fallback scores on its own");
  expect(!onlyOneHasFavorite.confidenceInputs.repeatedMealEvidence.restaurantSuppressedByFavorites, "13b nothing was suppressed in the fallback case");
}

// ============ 14-15, 20-21. inputs that must not matter =========================================
{
  // Covers BOTH fallback dimensions so a timestamp or confidence read on either path is caught.
  const base = (user, opts) => [
    meal(user, atRestaurant("rest-1"), { id: `m:${user}:1`, ...opts }),
    meal(user, atRestaurant("rest-1"), { id: `m:${user}:2`, ...opts }),
    meal(user, atMenuItem("rest-1", "item-3"), { id: `m:${user}:3`, ...opts }),
    meal(user, atMenuItem("rest-1", "item-3"), { id: `m:${user}:4`, ...opts })
  ];
  const reference = compareTasteSimilarity(snapshot("user-a", { behavior: base("a") }), snapshot("user-b", { behavior: base("b") }));

  const lowConfidence = compareTasteSimilarity(
    snapshot("user-a", { behavior: base("a", { sourceConfidence: 0.05 }) }),
    snapshot("user-b", { behavior: base("b", { sourceConfidence: 0.05 }) })
  );
  const highConfidence = compareTasteSimilarity(
    snapshot("user-a", { behavior: base("a", { sourceConfidence: 0.99 }) }),
    snapshot("user-b", { behavior: base("b", { sourceConfidence: 0.99 }) })
  );
  expect(JSON.stringify(lowConfidence) === JSON.stringify(highConfidence), "14 sourceConfidence never changes a repeated-consumption result");
  expect(JSON.stringify(lowConfidence) === JSON.stringify(reference), "14a a result is identical with and without sourceConfidence");

  const shifted = compareTasteSimilarity(
    snapshot("user-a", { behavior: base("a", { at: "2026-07-02T09:00:00.000Z" }) }),
    snapshot("user-b", { behavior: base("b", { at: "2026-08-07T21:30:00.000Z" }) })
  );
  expect(JSON.stringify(shifted) === JSON.stringify(reference), "15 meal timestamps inside the supplied snapshot never change the result — no recency, no decay");

  const withRatings = compareTasteSimilarity(
    snapshot("user-a", { behavior: [...base("a"), rating("a", "rest-1", 5)] }),
    snapshot("user-b", { behavior: [...base("b"), rating("b", "rest-1", 1)] })
  );
  const strippedRatings = { ...withRatings, confidenceInputs: withRatings.confidenceInputs };
  expect(
    strippedRatings.status === reference.status && strippedRatings.score === reference.score &&
      JSON.stringify(strippedRatings.comparableDimensions) === JSON.stringify(reference.comparableDimensions),
    "20 rating value and presence still have no effect on the taste score"
  );

  const withOther = compareTasteSimilarity(
    snapshot("user-a", { behavior: base("a"), goals: [goal("a")], restrictions: [restriction("a", "peanut")], preferences: [payment("a", "split_bill")] }),
    snapshot("user-b", { behavior: base("b"), goals: [goal("b")], restrictions: [restriction("b", "peanut")], preferences: [payment("b", "split_bill")] })
  );
  expect(
    withOther.status === reference.status && withOther.score === reference.score &&
      JSON.stringify(withOther.comparableDimensions) === JSON.stringify(reference.comparableDimensions),
    "21 goals, restrictions and social logistics still have no effect"
  );
}

// ============ 16-17. bounded and truncated history ==============================================
{
  const truncatedRepeats = compareTasteSimilarity(
    snapshot("user-a", { mealsTruncation: "known_truncated", behavior: [meal("a", atRestaurant("rest-1"), { id: "m:a:1" }), meal("a", atRestaurant("rest-1"), { id: "m:a:2" })] }),
    snapshot("user-b", { mealsTruncation: "possibly_truncated", behavior: [meal("b", atRestaurant("rest-1"), { id: "m:b:1" }), meal("b", atRestaurant("rest-1"), { id: "m:b:2" })] })
  );
  expect(truncatedRepeats.status === "scored" && truncatedRepeats.score === 1, "16 repetition observed inside a truncated window is still real repetition");
  expect(truncatedRepeats.confidenceInputs.truncation.mealsTruncatedForEither, "16a truncation stays visible in the confidence inputs");

  const truncatedSingle = compareTasteSimilarity(
    snapshot("user-a", { mealsTruncation: "known_truncated", behavior: [meal("a", atRestaurant("rest-1"), { id: "m:a:1" })] }),
    snapshot("user-b", { mealsTruncation: "known_truncated", behavior: [meal("b", atRestaurant("rest-1"), { id: "m:b:1" })] })
  );
  expect(truncatedSingle.status === "not_scored", "17 a truncated window with one observation fabricates no repeated signal", truncatedSingle.reason);
  expect(truncatedSingle.conflicts.length === 0 && truncatedSingle.overlaps.length === 0, "17a a short window is never turned into a negative assertion");
}

// ============ 18-19. meals-only cold start ======================================================
{
  const repeated = compareTasteSimilarity(
    snapshot("user-a", { behavior: [meal("a", atRestaurant("rest-1"), { id: "m:a:1" }), meal("a", atRestaurant("rest-1"), { id: "m:a:2" })] }),
    snapshot("user-b", { behavior: [meal("b", atRestaurant("rest-1"), { id: "m:b:1" }), meal("b", atRestaurant("rest-1"), { id: "m:b:2" })] })
  );
  expect(repeated.status === "scored", "18 a meals-only pair with repeated shared consumption is scorable");

  const singles = compareTasteSimilarity(
    snapshot("user-a", { behavior: [meal("a", atRestaurant("rest-1"), { id: "m:a:1" })] }),
    snapshot("user-b", { behavior: [meal("b", atRestaurant("rest-1"), { id: "m:b:1" })] })
  );
  expect(singles.status === "not_scored" && !("score" in singles), "19 a meals-only pair with single occurrences stays unscored");
}

// ============ 22-23. symmetry and determinism ===================================================
{
  const behaviorA = [
    meal("a", atRestaurant("rest-1"), { id: "m:a:1" }), meal("a", atRestaurant("rest-1"), { id: "m:a:2" }),
    meal("a", atMenuItem("rest-1", "item-3"), { id: "m:a:3" }), meal("a", atMenuItem("rest-1", "item-3"), { id: "m:a:4" })
  ];
  const behaviorB = [
    meal("b", atRestaurant("rest-1"), { id: "m:b:1" }), meal("b", atRestaurant("rest-1"), { id: "m:b:2" }),
    meal("b", atMenuItem("rest-1", "item-3"), { id: "m:b:3" }), meal("b", atMenuItem("rest-1", "item-3"), { id: "m:b:4" })
  ];
  const a = snapshot("user-a", { preferences: [cuisine("a", "japanese")], behavior: behaviorA });
  const b = snapshot("user-b", { preferences: [cuisine("b", "japanese")], behavior: behaviorB });
  expect(JSON.stringify(compareTasteSimilarity(a, b)) === JSON.stringify(compareTasteSimilarity(b, a)), "22 A/B swap yields an EXACTLY symmetric result");

  const shuffled = snapshot("user-b", { preferences: [cuisine("b", "japanese")], behavior: [...behaviorB].reverse() });
  expect(JSON.stringify(compareTasteSimilarity(a, b)) === JSON.stringify(compareTasteSimilarity(a, shuffled)), "23 shuffled meal event order yields a byte-identical result");
}

// ============ 24-28. contract invariants ========================================================
{
  expect(TASTE_SIMILARITY_POLICY_VERSION === "taste-similarity-v1.1", "24 the successor policy version is active", TASTE_SIMILARITY_POLICY_VERSION);
  expect(
    Array.isArray(TASTE_SIMILARITY_POLICY_VERSION_HISTORY) &&
      TASTE_SIMILARITY_POLICY_VERSION_HISTORY.join(",") === "taste-similarity-v1,taste-similarity-v1.1",
    "24a the version history keeps the superseded version unambiguous",
    TASTE_SIMILARITY_POLICY_VERSION_HISTORY
  );

  const results = [
    compareTasteSimilarity(snapshot("user-a"), snapshot("user-b")),
    compareTasteSimilarity(
      snapshot("user-a", { behavior: [meal("a", atRestaurant("rest-1"), { id: "m:a:1" })] }),
      snapshot("user-b", { behavior: [meal("b", atRestaurant("rest-1"), { id: "m:b:1" })] })
    ),
    compareTasteSimilarity(
      snapshot("user-a", { behavior: [meal("a", atRestaurant("rest-1"), { id: "m:a:1" }), meal("a", atRestaurant("rest-1"), { id: "m:a:2" })] }),
      snapshot("user-b", { behavior: [meal("b", atRestaurant("rest-2"), { id: "m:b:1" }), meal("b", atRestaurant("rest-2"), { id: "m:b:2" })] })
    ),
    compareTasteSimilarity(
      snapshot("user-a", { preferences: [cuisine("a", "japanese")], behavior: [meal("a", atRestaurant("rest-1"), { id: "m:a:1" }), meal("a", atRestaurant("rest-1"), { id: "m:a:2" })] }),
      snapshot("user-b", { preferences: [cuisine("b", "japanese")], behavior: [meal("b", atRestaurant("rest-1"), { id: "m:b:1" }), meal("b", atRestaurant("rest-1"), { id: "m:b:2" })] })
    )
  ];
  expect(results.every((result) => result.status === "scored" || !("score" in result)), "25 a not_scored result still carries no score key");
  expect(results.every((result) => result.status !== "scored" || (result.score >= 0 && result.score <= 1)), "26 every score stays inside the canonical 0..1 range");
  expect(results.every((result) => result.policyVersion === "taste-similarity-v1.1"), "26a every result is stamped with the successor version");
  expect(results.every((result) => result.snapshotSchemaVersion === "taste-profile-snapshot-v1"), "26b the snapshot schema stamp is unchanged");

  const rich = compareTasteSimilarity(
    snapshot("user-a", {
      preferences: [cuisine("a", "japanese"), flavor("a", "coriander"), spice("a", "medium")],
      behavior: [meal("a", atRestaurant("rest-1"), { id: "m:a:1" }), meal("a", atRestaurant("rest-1"), { id: "m:a:2" }), meal("a", atMenuItem("rest-1", "item-3"), { id: "m:a:3" }), meal("a", atMenuItem("rest-1", "item-3"), { id: "m:a:4" })]
    }),
    snapshot("user-b", {
      preferences: [cuisine("b", "japanese"), flavor("b", "coriander"), spice("b", "medium")],
      behavior: [meal("b", atRestaurant("rest-1"), { id: "m:b:1" }), meal("b", atRestaurant("rest-1"), { id: "m:b:2" }), meal("b", atMenuItem("rest-1", "item-3"), { id: "m:b:3" }), meal("b", atMenuItem("rest-1", "item-3"), { id: "m:b:4" })]
    })
  );
  const expectedOrder = [
    "shared_cuisine_preference", "shared_flavor_avoidance", "shared_spice_preference",
    "shared_repeated_restaurant_consumption", "shared_repeated_menu_item_consumption"
  ];
  expect(JSON.stringify(rich.explanationReasonCodes) === JSON.stringify(expectedOrder), "27 reason codes keep the fixed declaration order, with repeated consumption ranked below favorites", rich.explanationReasonCodes);

  const serialized = JSON.stringify(rich);
  expect(!/rest-1|item-3|m:a:|m:b:/.test(serialized), "28 no restaurant id, menu item id or meal evidence id appears in the result");
  expect(!/2026-0[78]/.test(serialized), "28a no meal timestamp appears in the result");
  expect(!/user-a|user-b/.test(serialized), "28b no subject user id appears in the result");
  expect(!/japanese|coriander|medium/.test(serialized), "28c no raw preference value appears in the result");
  expect(
    rich.confidenceInputs.repeatedMealEvidence.qualifyingRestaurantTargets === 2 &&
      rich.confidenceInputs.repeatedMealEvidence.qualifyingMenuItemTargets === 2,
    "28d repeated evidence is exposed as target COUNTS only, never as visit counts or identities",
    rich.confidenceInputs.repeatedMealEvidence
  );
}

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  smoke: "taste-similarity-ts3b-r1",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  policyVersion: TASTE_SIMILARITY_POLICY_VERSION,
  repetitionThreshold: MIN_REPEATED_MEAL_OCCURRENCES,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);
