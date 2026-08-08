#!/usr/bin/env node
// TS-3C contract smoke — SOCIAL CONTEXT COMPATIBILITY.
//
// Executes the REAL shared domain: snapshots are built with the frozen composeTasteProfileSnapshot,
// compatibility comes from the real TS-3C comparator, and taste comes from the real frozen
// taste-similarity-v1.1 comparator. Nothing is re-implemented here.
//
// Scenarios 15-17 are the load-bearing isolation gate: the FROZEN TS-3B-R1 comparator is loaded from
// the R1 freeze commit and run alongside the current one, so "TS-3C changes no taste output" is
// demonstrated against the actual previous implementation rather than asserted.
//
// Fully local and pure: no network, no database, no Supabase, no credential, no clock dependence.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = process.cwd();
const R1_FREEZE_COMMIT = "91d50dbf98370e8a3848942c52c5e94827329a89";
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
  compareSocialContextCompatibility,
  compareTasteSimilarity,
  composeTasteProfileSnapshot,
  SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
  TASTE_SIMILARITY_POLICY_VERSION
} = domain;

expect(typeof compareSocialContextCompatibility === "function", "S0 the REAL compatibility comparator loads");
expect(typeof compareTasteSimilarity === "function", "S0 the REAL taste comparator loads alongside it");
expect(typeof composeTasteProfileSnapshot === "function", "S0 the REAL frozen snapshot composer loads");

// ---- frozen TS-3B-R1 taste comparator, loaded from the R1 freeze commit -------------------------
const similarityDir = path.join(root, "packages/shared/src/domain/taste-similarity/similarity");
let frozenTasteCompare = null;
{
  const overrides = new Map();
  let ok = true;
  for (const file of ["policy.ts", "reasonCodes.ts", "types.ts", "comparator.ts", "index.ts"]) {
    const shown = spawnSync(
      "git",
      ["show", `${R1_FREEZE_COMMIT}:packages/shared/src/domain/taste-similarity/similarity/${file}`],
      { cwd: root, encoding: "utf8", windowsHide: true }
    );
    if (shown.status !== 0) { ok = false; break; }
    overrides.set(path.normalize(path.join(similarityDir, file)), shown.stdout);
  }
  if (ok) frozenTasteCompare = loadDomain(overrides).compareTasteSimilarity;
}
expect(typeof frozenTasteCompare === "function", "S0 the FROZEN taste-similarity-v1.1 comparator loads from the R1 freeze commit");

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
const meal = (target, { id, at = "2026-08-01T12:00:00.000Z", sourceConfidence } = {}) => ({
  category: "behavior", behaviorKind: "meal_occurrence", interpretation: "observed", mealType: "lunch",
  occurredAt: at, consumedRatio: 1,
  evidence: envelope(id, "meal_record", "meal_record_item", "observed_consumption", "source_policy", target,
    { recordedAt: at, ...(sourceConfidence === undefined ? {} : { sourceConfidence }) })
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
const snapshot = (userId, { preferences = [], behavior = [], goals = [], restrictions = [] } = {}) =>
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
      meals: { requestedStartDate: "2026-07-01", requestedEndDate: "2026-08-08", requestedLimit: 50, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" },
      favorites: { requestedLimit: 25, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" },
      ratings: { requestedLimit: null, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" }
    }
  });

const compat = (inputA, inputB) => compareSocialContextCompatibility(snapshot("user-a", inputA), snapshot("user-b", inputB));

// ============ 1-5. meal pattern ==================================================================
{
  const same = compat({ preferences: [mealType("a", "lunch")] }, { preferences: [mealType("b", "lunch")] });
  expect(same.mealPatternCompatibility.status === "scored" && same.mealPatternCompatibility.score === 1, "1 the same meal type scores 1", same.mealPatternCompatibility);
  expect(same.mealPatternCompatibility.comparisonMode === "set_overlap", "1a meal types are compared as a set, matching the frozen array column");
  expect(same.explanationReasonCodes.includes("shared_meal_type_preference"), "1b a shared meal type emits its own reason code");

  const partial = compat(
    { preferences: [mealType("a", "lunch"), mealType("a", "dinner")] },
    { preferences: [mealType("b", "dinner"), mealType("b", "breakfast")] }
  );
  expect(partial.mealPatternCompatibility.score === 0.333333, "2 partial multi-value meal-type overlap is a plain Jaccard index (1 of 3)", partial.mealPatternCompatibility.score);

  const disjoint = compat({ preferences: [mealType("a", "breakfast")] }, { preferences: [mealType("b", "late_night")] });
  expect(disjoint.mealPatternCompatibility.status === "scored" && disjoint.mealPatternCompatibility.score === 0, "3 disjoint explicit meal types are a measured 0", disjoint.mealPatternCompatibility.score);
  expect(!disjoint.explanationReasonCodes.includes("shared_meal_type_preference"), "3a a measured 0 emits no shared reason code");

  const oneSide = compat({ preferences: [mealType("a", "lunch")] }, {});
  expect(oneSide.mealPatternCompatibility.status === "not_scored" && oneSide.mealPatternCompatibility.reason === "insufficient_evidence", "4 one side missing meal type is insufficient_evidence", oneSide.mealPatternCompatibility.reason);
  expect(!("score" in oneSide.mealPatternCompatibility), "4a a not_scored dimension carries no score key");

  const neither = compat({}, {});
  expect(neither.mealPatternCompatibility.status === "not_scored" && neither.mealPatternCompatibility.reason === "no_comparable_evidence", "5 both missing meal type is no_comparable_evidence", neither.mealPatternCompatibility.reason);
}

// ============ 6-8. dining context ================================================================
{
  const same = compat({ preferences: [diningStyle("a", "casual")] }, { preferences: [diningStyle("b", "casual")] });
  expect(same.diningCompatibility.status === "scored" && same.diningCompatibility.score === 1, "6 the same dining style scores 1");
  expect(same.diningCompatibility.comparisonMode === "categorical_equality", "6a dining style is compared as an exact category, matching the frozen scalar column");
  expect(same.explanationReasonCodes.includes("similar_dining_style"), "6b a shared dining style emits its own reason code");

  const different = compat({ preferences: [diningStyle("a", "casual")] }, { preferences: [diningStyle("b", "fine_dining")] });
  expect(different.diningCompatibility.status === "scored" && different.diningCompatibility.score === 0, "7 a different explicit dining style is a measured 0", different.diningCompatibility.score);

  const oneSide = compat({ preferences: [diningStyle("a", "casual")] }, { preferences: [mealType("b", "lunch")] });
  expect(oneSide.diningCompatibility.status === "not_scored" && oneSide.diningCompatibility.reason === "insufficient_evidence", "8 one side missing dining style is not scored", oneSide.diningCompatibility.reason);
}

// ============ 9-11. social logistics =============================================================
{
  const same = compat({ preferences: [paymentPreference("a", "split_bill")] }, { preferences: [paymentPreference("b", "split_bill")] });
  expect(same.socialLogisticsCompatibility.status === "scored" && same.socialLogisticsCompatibility.score === 1, "9 the same payment preference scores 1");
  expect(same.explanationReasonCodes.includes("compatible_payment_preference"), "9a a shared payment preference emits its own reason code");

  const different = compat({ preferences: [paymentPreference("a", "split_bill")] }, { preferences: [paymentPreference("b", "treat_alternately")] });
  expect(different.socialLogisticsCompatibility.status === "scored" && different.socialLogisticsCompatibility.score === 0, "10 a different explicit payment preference is a measured 0", different.socialLogisticsCompatibility.score);

  const oneSide = compat({ preferences: [paymentPreference("a", "split_bill")] }, {});
  expect(oneSide.socialLogisticsCompatibility.status === "not_scored" && oneSide.socialLogisticsCompatibility.reason === "insufficient_evidence", "11 one side missing payment preference is not scored");
}

// ============ 12-14. independence and no aggregate ===============================================
{
  const all = compat(
    { preferences: [mealType("a", "lunch"), diningStyle("a", "casual"), paymentPreference("a", "split_bill")] },
    { preferences: [mealType("b", "lunch"), diningStyle("b", "fine_dining"), paymentPreference("b", "split_bill")] }
  );
  expect(
    all.mealPatternCompatibility.score === 1 && all.diningCompatibility.score === 0 && all.socialLogisticsCompatibility.score === 1,
    "12 all three dimensions are evaluated independently",
    [all.mealPatternCompatibility.score, all.diningCompatibility.score, all.socialLogisticsCompatibility.score]
  );

  const missingDining = compat(
    { preferences: [mealType("a", "lunch"), paymentPreference("a", "split_bill")] },
    { preferences: [mealType("b", "lunch"), paymentPreference("b", "split_bill")] }
  );
  expect(
    missingDining.mealPatternCompatibility.score === 1 && missingDining.socialLogisticsCompatibility.score === 1 &&
      missingDining.diningCompatibility.status === "not_scored",
    "13 one missing dimension leaves the other two untouched"
  );

  const keys = Object.keys(all);
  expect(
    !keys.some((key) => /overall|aggregate|combined|total/i.test(key)) && !("socialCompatibility" in all),
    "14 no aggregate or overall social score exists",
    keys
  );
  expect(typeof all.mealPatternCompatibility === "object" && typeof all.diningCompatibility === "object", "14a the three dimensions are reported side by side");
}

// ============ 15-17. FOOD-TASTE ISOLATION (load-bearing) =========================================
{
  const tasteBase = {
    preferences: [cuisine("x", "japanese"), cuisine("x", "thai"), flavor("x", "coriander"), spice("x", "medium")],
    behavior: [favoriteRestaurant("x", "rest-1"), meal(atRestaurant("rest-2"), { id: "m:x:1" }), meal(atRestaurant("rest-2"), { id: "m:x:2" })]
  };
  const withTaste = (user, extraPreferences) => ({
    preferences: [...tasteBase.preferences.map((entry) => ({ ...entry, evidence: { ...entry.evidence, evidenceId: entry.evidence.evidenceId.replace(":x:", `:${user}:`) } })), ...extraPreferences],
    behavior: tasteBase.behavior.map((entry) => ({ ...entry, evidence: { ...entry.evidence, evidenceId: entry.evidence.evidenceId.replace(":x:", `:${user}:`).replace("m:x:", `m:${user}:`) } }))
  });

  const contextVariants = [
    { label: "15 meal_pattern", a: [mealType("a", "lunch")], b: [mealType("b", "dinner")] },
    { label: "16 dining_context", a: [diningStyle("a", "casual")], b: [diningStyle("b", "fine_dining")] },
    { label: "17 social_logistics", a: [paymentPreference("a", "split_bill")], b: [paymentPreference("b", "treat_alternately")] }
  ];

  const controlA = snapshot("user-a", withTaste("a", []));
  const controlB = snapshot("user-b", withTaste("b", []));
  const controlCurrent = JSON.stringify(compareTasteSimilarity(controlA, controlB));
  const controlFrozen = frozenTasteCompare ? JSON.stringify(frozenTasteCompare(controlA, controlB)) : null;
  expect(controlCurrent === controlFrozen, "15a the current taste comparator matches the FROZEN R1 comparator exactly on the control pair");

  for (const variant of contextVariants) {
    const a = snapshot("user-a", withTaste("a", variant.a));
    const b = snapshot("user-b", withTaste("b", variant.b));
    const currentTaste = JSON.stringify(compareTasteSimilarity(a, b));
    const frozenTaste = frozenTasteCompare ? JSON.stringify(frozenTasteCompare(a, b)) : null;
    expect(currentTaste === controlCurrent, `${variant.label} change has zero effect on the food-taste result`);
    expect(currentTaste === frozenTaste, `${variant.label} change leaves the current taste result identical to the FROZEN R1 comparator`);
  }
  expect(TASTE_SIMILARITY_POLICY_VERSION === "taste-similarity-v1.1", "17a the taste policy version is untouched at taste-similarity-v1.1", TASTE_SIMILARITY_POLICY_VERSION);
  expect(
    !JSON.stringify(compareTasteSimilarity(controlA, controlB)).includes("meal_pattern") &&
      !controlCurrent.includes("dining") && !controlCurrent.includes("payment") && !controlCurrent.includes("social_logistics"),
    "17b no context dimension appears anywhere in a taste result"
  );
}

// ============ 18-23. inputs that must not affect compatibility ===================================
{
  const contextOnly = (user) => [mealType(user, "lunch"), diningStyle(user, "casual"), paymentPreference(user, "split_bill")];
  const reference = compat({ preferences: contextOnly("a") }, { preferences: contextOnly("b") });
  const unchangedBy = (label, extraA, extraB, index) => {
    const result = compat(
      { preferences: [...contextOnly("a"), ...(extraA.preferences ?? [])], behavior: extraA.behavior ?? [], goals: extraA.goals ?? [], restrictions: extraA.restrictions ?? [] },
      { preferences: [...contextOnly("b"), ...(extraB.preferences ?? [])], behavior: extraB.behavior ?? [], goals: extraB.goals ?? [], restrictions: extraB.restrictions ?? [] }
    );
    expect(JSON.stringify(result) === JSON.stringify(reference), `${index} ${label} has zero effect on every compatibility dimension`);
  };
  unchangedBy("a nutrition goal change", { goals: [goal("a", 1800)] }, { goals: [goal("b", 2400)] }, 18);
  unchangedBy("a dietary restriction change", { restrictions: [restriction("a", "peanut")] }, { restrictions: [restriction("b", "shellfish")] }, 19);
  unchangedBy("a rating change", { behavior: [rating("a", "rest-1", 5)] }, { behavior: [rating("b", "rest-1", 1)] }, 20);
  unchangedBy("a meal history change", { behavior: [meal(atRestaurant("rest-1"), { id: "m:a:1" }), meal(atRestaurant("rest-1"), { id: "m:a:2" })] }, { behavior: [meal(atRestaurant("rest-1"), { id: "m:b:1" }), meal(atRestaurant("rest-1"), { id: "m:b:2" })] }, 21);
  unchangedBy("a favorites change", { behavior: [favoriteRestaurant("a", "rest-7")] }, { behavior: [favoriteRestaurant("b", "rest-7")] }, 22);
  unchangedBy("a sourceConfidence change", { behavior: [meal(atRestaurant("rest-1"), { id: "m:a:1", sourceConfidence: 0.05 })] }, { behavior: [meal(atRestaurant("rest-1"), { id: "m:b:1", sourceConfidence: 0.99 })] }, 23);
  unchangedBy("a food-taste preference change", { preferences: [cuisine("a", "japanese"), spice("a", "hot")] }, { preferences: [cuisine("b", "french"), spice("b", "mild")] }, 23.1);
}

// ============ 24-32. contract invariants =========================================================
{
  const contextA = { preferences: [mealType("a", "lunch"), mealType("a", "dinner"), diningStyle("a", "casual"), paymentPreference("a", "split_bill")] };
  const contextB = { preferences: [mealType("b", "dinner"), diningStyle("b", "casual"), paymentPreference("b", "split_bill")] };
  const a = snapshot("user-a", contextA);
  const b = snapshot("user-b", contextB);
  expect(
    JSON.stringify(compareSocialContextCompatibility(a, b)) === JSON.stringify(compareSocialContextCompatibility(b, a)),
    "24 A/B swap yields an EXACTLY symmetric result"
  );

  const shuffled = snapshot("user-b", { preferences: [...contextB.preferences].reverse() });
  expect(
    JSON.stringify(compareSocialContextCompatibility(a, b)) === JSON.stringify(compareSocialContextCompatibility(a, shuffled)),
    "25 shuffled evidence order yields a byte-identical result"
  );

  const unsupported = compareSocialContextCompatibility({ ...a, schemaVersion: "taste-profile-snapshot-v99" }, b);
  expect(
    unsupported.mealPatternCompatibility.reason === "unsupported_snapshot_schema" &&
      unsupported.diningCompatibility.reason === "unsupported_snapshot_schema" &&
      unsupported.socialLogisticsCompatibility.reason === "unsupported_snapshot_schema",
    "26 an unknown snapshot schema fails closed on every dimension"
  );
  expect(
    !("score" in unsupported.mealPatternCompatibility) && !("score" in unsupported.diningCompatibility) &&
      !("score" in unsupported.socialLogisticsCompatibility),
    "26a a fail-closed result carries no score anywhere"
  );

  const allCases = [
    compareSocialContextCompatibility(a, b),
    compat({}, {}),
    compat({ preferences: [mealType("a", "lunch")] }, { preferences: [mealType("b", "brunch")] }),
    unsupported
  ];
  const everyDimension = allCases.flatMap((result) => [result.mealPatternCompatibility, result.diningCompatibility, result.socialLogisticsCompatibility]);
  expect(everyDimension.every((entry) => entry.status === "scored" || !("score" in entry)), "27 no not_scored dimension carries a score key");
  expect(everyDimension.every((entry) => entry.status !== "scored" || (entry.score >= 0 && entry.score <= 1)), "28 every dimension score stays inside the canonical 0..1 range");
  expect(allCases.every((result) => result.policyVersion === "social-context-compatibility-v1"), "29 the compatibility policy version is pinned on every result", SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION);
  expect(allCases.every((result) => result.snapshotSchemaVersion === "taste-profile-snapshot-v1"), "29a the snapshot schema version is stamped on every result");
  expect(TASTE_SIMILARITY_POLICY_VERSION === "taste-similarity-v1.1", "30 the taste policy version remains taste-similarity-v1.1");

  const serialized = JSON.stringify(compareSocialContextCompatibility(a, b));
  expect(!/lunch|dinner|casual|split_bill|fine_dining/.test(serialized), "31 no raw meal type, dining style or payment preference value appears in the output");
  expect(!/user-a|user-b|tp:/.test(serialized), "31a no user id or evidence id appears in the output");

  const rich = compat(
    { preferences: [mealType("a", "lunch"), diningStyle("a", "casual"), paymentPreference("a", "split_bill")] },
    { preferences: [mealType("b", "lunch"), diningStyle("b", "casual"), paymentPreference("b", "split_bill")] }
  );
  expect(
    JSON.stringify(rich.explanationReasonCodes) === JSON.stringify(["shared_meal_type_preference", "similar_dining_style", "compatible_payment_preference"]),
    "32 reason codes are emitted in the fixed declaration order",
    rich.explanationReasonCodes
  );
  const sparse = compat({ preferences: [mealType("a", "lunch")] }, { preferences: [mealType("b", "lunch")] });
  expect(
    JSON.stringify(sparse.explanationReasonCodes) === JSON.stringify(["shared_meal_type_preference", "limited_context_evidence"]),
    "32a a partial reason set keeps the same relative declaration order",
    sparse.explanationReasonCodes
  );
  expect(
    rich.confidenceInputs.comparableDimensionCount === 3 && rich.confidenceInputs.unknownDimensionCount === 0 &&
      !("confidence" in rich.confidenceInputs) && !("confidenceScore" in rich.confidenceInputs),
    "32b sparse-evidence inputs are non-numeric-confidence counts only",
    rich.confidenceInputs
  );
}

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  smoke: "taste-similarity-ts3c",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  compatibilityPolicyVersion: SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
  tastePolicyVersion: TASTE_SIMILARITY_POLICY_VERSION,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);
