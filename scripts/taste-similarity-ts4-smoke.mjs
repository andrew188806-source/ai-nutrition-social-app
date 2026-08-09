#!/usr/bin/env node
// TS-4 contract smoke — EVIDENCE CONFIDENCE V1.
//
// Executes the REAL shared domain: snapshots are built with the frozen composeTasteProfileSnapshot,
// bundled by the frozen compareTasteProfiles, and scored for evidence support by the real TS-4
// calculator. Nothing is re-implemented here.
//
// Scenarios 3-5 are the load-bearing invariant: identical evidence STRUCTURE must produce identical
// confidence regardless of whether the two users agreed or disagreed.
//
// Fully local and pure: no network, no database, no Supabase, no credential, no clock dependence.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
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
  return loadFile(path.join(root, "packages/shared/src/domain/taste-similarity/index.ts"));
}

const domain = loadDomain();
const {
  calculateEvidenceConfidence,
  compareTasteProfiles,
  composeTasteProfileSnapshot,
  EVIDENCE_CONFIDENCE_POLICY_VERSION,
  TASTE_CONFIDENCE_SUPPORTED_DIMENSION_COUNT,
  TASTE_CONFIDENCE_RELEVANT_SOURCE_COUNT
} = domain;

expect(typeof calculateEvidenceConfidence === "function", "S0 the REAL evidence confidence calculator loads");
expect(typeof compareTasteProfiles === "function", "S0 the REAL frozen bundle composer loads");

// ---- fixture builders using only frozen TS-1 authority ------------------------------------------
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
const atMenuItem = (restaurantId, menuItemId) => ({ kind: "menu_item", restaurantId, menuItemId });
const rating = (user, restaurantId, ratingValue) => ({
  category: "behavior", behaviorKind: "rating", ratingKind: "restaurant", interpretation: "scalar_evaluation_unclassified",
  ratingValue, feedback: { dislikeReasons: [] },
  evidence: envelope(`rating:${user}:${restaurantId}`, "rating", "restaurant_rating", "user_action", "source_policy", { kind: "restaurant", restaurantId })
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
const snapshot = (userId, {
  preferences = [], behavior = [], goals = [], restrictions = [],
  mealsTruncation = "not_truncated", favoritesTruncation = "not_truncated", ratingsTruncation = "not_truncated",
  sourceOverrides = {}, generatedAt = "2026-08-08T12:00:00.000Z"
} = {}) =>
  composeTasteProfileSnapshot({
    subjectUserId: userId,
    preferences, goals, restrictions, behavior,
    sourceStates: {
      taste_profile: counted(preferences.length),
      nutrition_goals: counted(goals.length),
      dietary_restrictions: counted(restrictions.length),
      meals: counted(behavior.filter((entry) => entry.behaviorKind === "meal_occurrence").length),
      favorites: counted(behavior.filter((entry) => entry.behaviorKind === "favorite").length),
      ratings: counted(behavior.filter((entry) => entry.behaviorKind === "rating").length),
      ...sourceOverrides
    },
    generatedAt,
    evidenceWindow: {
      historyScope: "bounded",
      meals: { requestedStartDate: "2026-07-01", requestedEndDate: "2026-08-08", requestedLimit: 50, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: mealsTruncation },
      favorites: { requestedLimit: 25, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: favoritesTruncation },
      ratings: { requestedLimit: null, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: ratingsTruncation }
    }
  });

const confidenceOf = (inputA, inputB) =>
  calculateEvidenceConfidence(compareTasteProfiles(snapshot("user-a", inputA), snapshot("user-b", inputB)));

// Five comparable taste families: cuisine, flavor, spice, restaurant identity, menu-item identity.
const fiveFamilies = (user, { cuisineValue = "japanese", flavorValue = "coriander", spiceValue = "medium" } = {}) => ({
  preferences: [cuisine(user, cuisineValue), flavor(user, flavorValue), spice(user, spiceValue)],
  behavior: [favoriteRestaurant(user, "rest-1"), favoriteMenuItem(user, "rest-1", "item-1")]
});

// ============ 1-2. coverage endpoints ============================================================
{
  const sparse = confidenceOf(
    { preferences: [cuisine("a", "japanese")] },
    { preferences: [cuisine("b", "japanese")] }
  );
  expect(sparse.taste.status === "available", "1 a single shared cuisine still yields an available confidence");
  // coverage 1/5 = 0.2 ; taste_profile complete, favorites+meals empty-and-therefore-complete = 3/3
  expect(sparse.taste.value === 0.6, "1a one family with all sources complete scores (0.2 + 1) / 2", sparse.taste.value);
  expect(sparse.taste.inputs.comparableFamilyCount === 1, "1b exactly one taste family was comparable");
  expect(sparse.taste.basis === "limited_evidence_coverage", "1c a single family is reported as limited coverage", sparse.taste.basis);

  const rich = confidenceOf(fiveFamilies("a"), fiveFamilies("b"));
  expect(rich.taste.status === "available" && rich.taste.value === 1, "2 five comparable families with three complete sources scores exactly 1", rich.taste.value);
  expect(rich.taste.inputs.comparableFamilyCount === 5 && rich.taste.inputs.completeRelevantSourceCount === 3, "2a both ratios reach their maxima", rich.taste.inputs);
  expect(rich.taste.basis === "strong_explicit_and_behavioral_evidence", "2b explicit plus behavioural families are reported as such", rich.taste.basis);
}

// ============ 3-5. confidence is independent of agreement (load-bearing) ========================
{
  const agreeing = compareTasteProfiles(snapshot("user-a", fiveFamilies("a")), snapshot("user-b", fiveFamilies("b")));
  const disagreeing = compareTasteProfiles(
    snapshot("user-a", fiveFamilies("a", { cuisineValue: "japanese", flavorValue: "coriander", spiceValue: "mild" })),
    snapshot("user-b", {
      preferences: [cuisine("b", "french"), flavor("b", "mushroom"), spice("b", "mild")],
      behavior: [favoriteRestaurant("b", "rest-9"), favoriteMenuItem("b", "rest-9", "item-9")]
    })
  );
  const agreeingConfidence = calculateEvidenceConfidence(agreeing);
  const disagreeingConfidence = calculateEvidenceConfidence(disagreeing);

  expect(agreeing.taste.score === 1, "3 the agreeing pair scores 1 on similarity", agreeing.taste.score);
  expect(disagreeing.taste.score < 1, "3a the disagreeing pair scores lower on similarity", disagreeing.taste.score);
  expect(disagreeingConfidence.taste.value === 1, "3b rich but disagreeing evidence still yields HIGH confidence", disagreeingConfidence.taste.value);
  expect(agreeingConfidence.taste.value === 1, "4 rich and agreeing evidence yields the same high confidence");
  expect(
    JSON.stringify(agreeingConfidence.taste) === JSON.stringify(disagreeingConfidence.taste),
    "5 identical evidence structure with opposite similarity produces an IDENTICAL confidence result",
    { agreeing: agreeingConfidence.taste, disagreeing: disagreeingConfidence.taste }
  );
}

// ============ 6-9. availability and partial evidence =============================================
{
  const empty = confidenceOf({}, {});
  expect(empty.taste.status === "not_available" && empty.taste.reason === "component_not_scored", "6 an unscored taste component is not_available", empty.taste);
  expect(!("value" in empty.taste), "6a a not_available result carries no value key");

  const oneSided = confidenceOf(fiveFamilies("a"), { preferences: [cuisine("b", "japanese")] });
  expect(oneSided.taste.status === "available" && oneSided.taste.value < 1, "7 a sparse counterpart bounds comparability and lowers support", oneSided.taste.value);

  const favoritesOnly = confidenceOf(
    { behavior: [favoriteRestaurant("a", "rest-1")] },
    { behavior: [favoriteRestaurant("b", "rest-1")] }
  );
  expect(favoritesOnly.taste.status === "available" && favoritesOnly.taste.value === 0.6, "8 favorites-only evidence yields moderate support", favoritesOnly.taste.value);
  expect(favoritesOnly.taste.basis === "limited_evidence_coverage", "8a a single behavioural family is limited coverage");

  const repeatedOnly = confidenceOf(
    { behavior: [meal(atRestaurant("rest-1"), { id: "m:a:1" }), meal(atRestaurant("rest-1"), { id: "m:a:2" })] },
    { behavior: [meal(atRestaurant("rest-1"), { id: "m:b:1" }), meal(atRestaurant("rest-1"), { id: "m:b:2" })] }
  );
  expect(repeatedOnly.taste.status === "available" && repeatedOnly.taste.value === 0.6, "9 repeated-meals-only evidence yields the same moderate support", repeatedOnly.taste.value);
}

// ============ 10-11. empty versus failed (load-bearing) ==========================================
{
  const withEmptyFavorites = confidenceOf(
    { preferences: [cuisine("a", "japanese")] },
    { preferences: [cuisine("b", "japanese")] }
  );
  expect(withEmptyFavorites.taste.inputs.completeRelevantSourceCount === 3, "10 an empty source counts as COMPLETE knowledge", withEmptyFavorites.taste.inputs);

  // Same visible evidence, but the favorites source failed on one side. `failed` is the only
  // non-available state permitted to retain evidence, which is exactly why row counts cannot be used.
  const failedSource = { favorites: { status: "failed", evidenceCount: 1, failureCode: "source_read_failed" } };
  const withFailedFavorites = confidenceOf(
    { preferences: [cuisine("a", "japanese")], behavior: [favoriteRestaurant("a", "rest-1")], sourceOverrides: failedSource },
    { preferences: [cuisine("b", "japanese")], behavior: [favoriteRestaurant("b", "rest-1")], sourceOverrides: failedSource }
  );
  const withAvailableFavorites = confidenceOf(
    { preferences: [cuisine("a", "japanese")], behavior: [favoriteRestaurant("a", "rest-1")] },
    { preferences: [cuisine("b", "japanese")], behavior: [favoriteRestaurant("b", "rest-1")] }
  );
  expect(
    withFailedFavorites.taste.value < withAvailableFavorites.taste.value,
    "11 identical visible evidence with a FAILED source scores lower than with a reachable source",
    { failed: withFailedFavorites.taste.value, available: withAvailableFavorites.taste.value }
  );
  expect(withFailedFavorites.taste.basis === "source_unavailable", "11a an unreachable source is reported as the basis");
  expect(withFailedFavorites.taste.inputs.completeRelevantSourceCount === 2, "11b the failed source is not counted complete");
}

// ============ 12-15. truncation ==================================================================
{
  const base = (user) => ({ preferences: [cuisine(user, "japanese")], behavior: [favoriteRestaurant(user, "rest-1")] });
  const control = confidenceOf(base("a"), base("b"));

  const favoritesTruncated = confidenceOf({ ...base("a"), favoritesTruncation: "known_truncated" }, base("b"));
  expect(favoritesTruncated.taste.value < control.taste.value, "12 favorites truncation lowers taste confidence", { truncated: favoritesTruncated.taste.value, control: control.taste.value });
  expect(favoritesTruncated.taste.basis === "incomplete_history", "12a truncation is reported as incomplete history");

  const mealsTruncated = confidenceOf({ ...base("a"), mealsTruncation: "known_truncated" }, base("b"));
  expect(mealsTruncated.taste.value < control.taste.value, "13 meals truncation lowers taste confidence", mealsTruncated.taste.value);

  const ratingsTruncated = confidenceOf({ ...base("a"), ratingsTruncation: "known_truncated" }, { ...base("b"), ratingsTruncation: "possibly_truncated" });
  expect(JSON.stringify(ratingsTruncated) === JSON.stringify(control), "14 ratings truncation has ZERO effect — no frozen scorer reads ratings");

  const possibly = confidenceOf({ ...base("a"), favoritesTruncation: "possibly_truncated" }, base("b"));
  expect(
    possibly.taste.value === favoritesTruncated.taste.value,
    "15 possibly_truncated and known_truncated receive the same completeness treatment",
    { possibly: possibly.taste.value, known: favoritesTruncated.taste.value }
  );
}

// ============ 16-19. family counting and denominators ===========================================
{
  const favoriteAndRepeatedRestaurant = (user) => ({
    preferences: [cuisine(user, "japanese")],
    behavior: [
      favoriteRestaurant(user, "rest-1"),
      meal(atRestaurant(`only-${user}`), { id: `m:${user}:1` }),
      meal(atRestaurant(`only-${user}`), { id: `m:${user}:2` })
    ]
  });
  const restaurantFamily = confidenceOf(favoriteAndRepeatedRestaurant("a"), favoriteAndRepeatedRestaurant("b"));
  expect(
    restaurantFamily.taste.inputs.comparableFamilyCount === 2,
    "16 a comparable favorite restaurant and its suppressed repeated counterpart count as ONE family",
    restaurantFamily.taste.inputs
  );

  const favoriteAndRepeatedMenu = (user) => ({
    preferences: [cuisine(user, "japanese")],
    behavior: [
      favoriteMenuItem(user, "rest-1", "item-1"),
      meal(atMenuItem(`only-${user}`, "item-9"), { id: `mm:${user}:1` }),
      meal(atMenuItem(`only-${user}`, "item-9"), { id: `mm:${user}:2` })
    ]
  });
  const menuFamily = confidenceOf(favoriteAndRepeatedMenu("a"), favoriteAndRepeatedMenu("b"));
  expect(menuFamily.taste.inputs.comparableFamilyCount === 2, "17 the menu-item family is likewise counted once", menuFamily.taste.inputs);

  const rich = confidenceOf(fiveFamilies("a"), fiveFamilies("b"));
  expect(TASTE_CONFIDENCE_SUPPORTED_DIMENSION_COUNT === 5, "18 the supported denominator is exactly 5", TASTE_CONFIDENCE_SUPPORTED_DIMENSION_COUNT);
  expect(rich.taste.inputs.supportedFamilyCount === 5 && rich.taste.value === 1, "18a with the denominator at 5 a fully-evidenced pair reaches 1 — it could not under 7");
  expect(TASTE_CONFIDENCE_RELEVANT_SOURCE_COUNT === 3 && rich.taste.inputs.relevantSourceCount === 3, "19 the relevant source denominator is exactly 3");
}

// ============ 20-24. inputs that must not change taste confidence ===============================
{
  const base = (user, extra = {}) => ({
    preferences: [cuisine(user, "japanese"), flavor(user, "coriander")],
    behavior: [favoriteRestaurant(user, "rest-1")],
    ...extra
  });
  const control = confidenceOf(base("a"), base("b"));
  const unchangedBy = (label, extraA, extraB, index) => {
    const result = confidenceOf({ ...base("a"), ...extraA }, { ...base("b"), ...extraB });
    expect(JSON.stringify(result.taste) === JSON.stringify(control.taste), `${index} ${label} has zero effect on taste evidence confidence`);
  };

  const lowConfidenceMeals = (user) => ({ behavior: [...base(user).behavior, meal(atRestaurant("rest-5"), { id: `m:${user}:1`, sourceConfidence: 0.05 }), meal(atRestaurant("rest-5"), { id: `m:${user}:2`, sourceConfidence: 0.05 })] });
  const highConfidenceMeals = (user) => ({ behavior: [...base(user).behavior, meal(atRestaurant("rest-5"), { id: `m:${user}:1`, sourceConfidence: 0.99 }), meal(atRestaurant("rest-5"), { id: `m:${user}:2`, sourceConfidence: 0.99 })] });
  const low = confidenceOf({ ...base("a"), ...lowConfidenceMeals("a") }, { ...base("b"), ...lowConfidenceMeals("b") });
  const high = confidenceOf({ ...base("a"), ...highConfidenceMeals("a") }, { ...base("b"), ...highConfidenceMeals("b") });
  expect(JSON.stringify(low.taste) === JSON.stringify(high.taste), "20 sourceConfidence changes have zero effect on evidence confidence");

  const early = confidenceOf(
    { ...base("a"), generatedAt: "2026-08-08T00:00:00.000Z" },
    { ...base("b"), generatedAt: "2026-08-08T00:00:00.000Z" }
  );
  const late = confidenceOf(
    { ...base("a"), generatedAt: "2026-08-08T23:59:00.000Z" },
    { ...base("b"), generatedAt: "2026-08-08T23:59:00.000Z" }
  );
  expect(JSON.stringify(early.taste) === JSON.stringify(late.taste), "21 timestamp changes have zero effect — no recency, no decay");

  unchangedBy("a goal evidence change", { goals: [goalLabel("a", "fat_loss")] }, { goals: [goalLabel("b", "gain_muscle")] }, 22);
  unchangedBy(
    "a payment, dining or meal_pattern change",
    { preferences: [...base("a").preferences, paymentPreference("a", "split_bill"), diningStyle("a", "casual"), mealType("a", "lunch")] },
    { preferences: [...base("b").preferences, paymentPreference("b", "treat_alternately"), diningStyle("b", "fine_dining"), mealType("b", "dinner")] },
    23
  );
  unchangedBy("a restriction change", { restrictions: [restriction("a", "peanut", { rawSeverity: "severe" })] }, { restrictions: [restriction("b", "coriander")] }, 24);
  unchangedBy("a rating change", { behavior: [...base("a").behavior, rating("a", "rest-1", 5)] }, { behavior: [...base("b").behavior, rating("b", "rest-1", 1)] }, 24.1);
}

// ============ 25-30. non-numeric dimension states and restriction ===============================
{
  const contextual = confidenceOf(
    { preferences: [mealType("a", "lunch"), diningStyle("a", "casual"), paymentPreference("a", "split_bill")], goals: [goalLabel("a", "fat_loss")] },
    { preferences: [mealType("b", "lunch"), diningStyle("b", "fine_dining"), paymentPreference("b", "split_bill")], goals: [goalLabel("b", "fat_loss")] }
  );
  for (const [index, key] of [[25, "mealPattern"], [26, "dining"], [27, "socialLogistics"], [28, "goal"]]) {
    expect(contextual[key].status === "available", `${index} ${key} reports an available evidence state when scored`, contextual[key]);
    expect(!("value" in contextual[key]), `${index}a ${key} carries NO numeric value`);
  }

  const noContext = confidenceOf({ preferences: [cuisine("a", "japanese")] }, { preferences: [cuisine("b", "japanese")] });
  expect(
    noContext.mealPattern.status === "not_available" && noContext.mealPattern.reason === "component_not_scored" &&
      noContext.goal.status === "not_available",
    "28b an unscored single-facet dimension reports not_available with a mapped reason",
    { mealPattern: noContext.mealPattern, goal: noContext.goal }
  );

  const restricted = confidenceOf(
    { preferences: [cuisine("a", "japanese")], restrictions: [restriction("a", "peanut", { rawSeverity: "severe" })] },
    { preferences: [cuisine("b", "japanese")], restrictions: [restriction("b", "coriander")] }
  );
  const restrictionKeys = Object.keys(restricted.restrictionEvidence);
  expect(
    !restrictionKeys.some((key) => /value|score|confidence|probab|percent|safety/i.test(key)),
    "29 restriction evidence carries NO numeric field of any kind",
    restrictionKeys
  );
  expect(
    restricted.restrictionEvidence.unclassifiedPresent === true &&
      restricted.restrictionEvidence.evidencePresentForBoth === true &&
      restricted.restrictionEvidence.sourceReachableForBoth === true,
    "30 an unclassified restriction is preserved categorically and is never softened",
    restricted.restrictionEvidence
  );
}

// ============ 31-36. contract invariants =========================================================
{
  const a = snapshot("user-a", fiveFamilies("a"));
  const b = snapshot("user-b", fiveFamilies("b"));
  const bundle = compareTasteProfiles(a, b);

  const unsupported = calculateEvidenceConfidence(compareTasteProfiles({ ...a, schemaVersion: "taste-profile-snapshot-v99" }, b));
  expect(unsupported.taste.status === "not_available" && unsupported.taste.reason === "unsupported_snapshot_schema", "31 an unsupported snapshot schema fails closed", unsupported.taste);
  expect(
    !("value" in unsupported.taste) && unsupported.mealPattern.reason === "unsupported_snapshot_schema" &&
      unsupported.goal.reason === "unsupported_snapshot_schema",
    "31a every dimension fails closed together and none carries a value"
  );

  expect(
    JSON.stringify(calculateEvidenceConfidence(bundle)) === JSON.stringify(calculateEvidenceConfidence(bundle)),
    "32 repeated calculation over the same bundle is byte-identical"
  );
  expect(
    JSON.stringify(calculateEvidenceConfidence(compareTasteProfiles(a, b))) ===
      JSON.stringify(calculateEvidenceConfidence(compareTasteProfiles(b, a))),
    "32a the confidence of a swapped bundle is byte-identical"
  );

  const cases = [
    calculateEvidenceConfidence(bundle),
    confidenceOf({ preferences: [cuisine("a", "japanese")] }, { preferences: [cuisine("b", "french")] }),
    confidenceOf({}, {}),
    unsupported
  ];
  expect(
    cases.every((entry) => entry.taste.status !== "available" || (entry.taste.value >= 0 && entry.taste.value <= 1)),
    "33 every evidence confidence value stays inside the canonical 0..1 range"
  );
  expect(
    cases.every((entry) => !Object.keys(entry).some((key) => /overall|aggregate|global|combined|match|rank/i.test(key))),
    "34 no aggregate, global, match or rank confidence field exists",
    Object.keys(cases[0])
  );
  expect(
    cases[0].versions.evidenceConfidencePolicyVersion === "evidence-confidence-v1" &&
      cases[0].versions.tastePolicyVersion === "taste-similarity-v1.1" &&
      cases[0].versions.socialContextPolicyVersion === "social-context-compatibility-v1" &&
      cases[0].versions.goalRestrictionPolicyVersion === "goal-restriction-compatibility-v1" &&
      cases[0].versions.comparisonBundleVersion === "taste-comparison-bundle-v1" &&
      cases[0].versions.snapshotSchemaVersion === "taste-profile-snapshot-v1",
    "35 all six authority versions are pinned on the result",
    cases[0].versions
  );
  expect(EVIDENCE_CONFIDENCE_POLICY_VERSION === "evidence-confidence-v1", "35a the policy version constant is the pinned successor");

  const serialized = JSON.stringify(cases[0]);
  expect(!/japanese|coriander|medium|rest-1|item-1|fat_loss|peanut|split_bill|casual|lunch/.test(serialized), "36 no raw evidence value appears in the output");
  expect(!/user-a|user-b|tp:|fav:|goal:|restr:|m:a:|m:b:/.test(serialized), "36a no user id or evidence id appears in the output");
  expect(!/2026-0[78]/.test(serialized), "36b no timestamp appears in the output");
  expect(!/probab|likelihood|percent|accuracy/i.test(serialized), "36c no probability-flavoured wording appears in the output");
}

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  smoke: "taste-similarity-ts4",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  evidenceConfidencePolicyVersion: EVIDENCE_CONFIDENCE_POLICY_VERSION,
  supportedFamilyDenominator: TASTE_CONFIDENCE_SUPPORTED_DIMENSION_COUNT,
  relevantSourceDenominator: TASTE_CONFIDENCE_RELEVANT_SOURCE_COUNT,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);
