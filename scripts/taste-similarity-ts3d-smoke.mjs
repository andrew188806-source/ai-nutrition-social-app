#!/usr/bin/env node
// TS-3D contract smoke — GOAL COMPATIBILITY and RESTRICTION ELIGIBILITY.
//
// Executes the REAL shared domain: snapshots are built with the frozen composeTasteProfileSnapshot,
// and taste / social-context / goal-restriction all come from the real comparators. Nothing is
// re-implemented here.
//
// Scenarios 17-20 are the load-bearing isolation gates: the FROZEN taste comparator is loaded from
// the TS-3B-R1 freeze commit and the FROZEN social-context comparator from the TS-3C freeze commit,
// then run alongside the current ones, so "TS-3D changes neither" is demonstrated against the actual
// previous implementations rather than asserted.
//
// Fully local and pure: no network, no database, no Supabase, no credential, no clock dependence.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = process.cwd();
const R1_FREEZE_COMMIT = "91d50dbf98370e8a3848942c52c5e94827329a89";
const TS3C_FREEZE_COMMIT = "e4535ba07c738603445c756c66c9941dd245954b";
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
  compareGoalRestrictionCompatibility,
  compareSocialContextCompatibility,
  compareTasteSimilarity,
  composeTasteProfileSnapshot,
  GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
  SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
  TASTE_SIMILARITY_POLICY_VERSION
} = domain;

expect(typeof compareGoalRestrictionCompatibility === "function", "S0 the REAL goal/restriction comparator loads");
expect(typeof compareTasteSimilarity === "function", "S0 the REAL taste comparator loads alongside it");
expect(typeof compareSocialContextCompatibility === "function", "S0 the REAL social-context comparator loads alongside it");

function loadFrozen(commit, directory, files) {
  const overrides = new Map();
  const absoluteDir = path.join(root, "packages/shared/src/domain/taste-similarity", directory);
  for (const file of files) {
    const shown = spawnSync(
      "git",
      ["show", `${commit}:packages/shared/src/domain/taste-similarity/${directory}/${file}`],
      { cwd: root, encoding: "utf8", windowsHide: true }
    );
    if (shown.status !== 0) return null;
    overrides.set(path.normalize(path.join(absoluteDir, file)), shown.stdout);
  }
  return loadDomain(overrides);
}

const frozenModuleFiles = ["policy.ts", "reasonCodes.ts", "types.ts", "comparator.ts", "index.ts"];
const frozenTasteDomain = loadFrozen(R1_FREEZE_COMMIT, "similarity", frozenModuleFiles);
const frozenContextDomain = loadFrozen(TS3C_FREEZE_COMMIT, "compatibility", frozenModuleFiles);
const frozenTasteCompare = frozenTasteDomain?.compareTasteSimilarity ?? null;
const frozenContextCompare = frozenContextDomain?.compareSocialContextCompatibility ?? null;
expect(typeof frozenTasteCompare === "function", "S0 the FROZEN taste-similarity-v1.1 comparator loads from the R1 freeze commit");
expect(typeof frozenContextCompare === "function", "S0 the FROZEN social-context-compatibility-v1 comparator loads from the TS-3C freeze commit");

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
const spice = (user, value) => preference(user, "food_taste", "spice", "unclassified", value, "spice");
const mealType = (user, value) => preference(user, "meal_pattern", "meal_type", "positive", value);
const diningStyle = (user, value) => preference(user, "dining_context", "dining_style", "unclassified", value, "dining");
const paymentPreference = (user, value) => preference(user, "social_logistics", "payment_preference", "unclassified", value, "payment");

const favoriteRestaurant = (user, restaurantId) => ({
  category: "behavior", behaviorKind: "favorite", favoriteKind: "restaurant", interpretation: "positive_user_action",
  evidence: envelope(`fav:${user}:r:${restaurantId}`, "favorite", "favorite_restaurant", "user_action", "not_eligible", { kind: "restaurant", restaurantId })
});
const meal = (restaurantId, { id, at = "2026-08-01T12:00:00.000Z" } = {}) => ({
  category: "behavior", behaviorKind: "meal_occurrence", interpretation: "observed", mealType: "lunch",
  occurredAt: at, consumedRatio: 1,
  evidence: envelope(id, "meal_record", "meal_record_item", "observed_consumption", "source_policy", { kind: "restaurant", restaurantId }, { recordedAt: at })
});
const rating = (user, restaurantId, ratingValue) => ({
  category: "behavior", behaviorKind: "rating", ratingKind: "restaurant", interpretation: "scalar_evaluation_unclassified",
  ratingValue, feedback: { dislikeReasons: [] },
  evidence: envelope(`rating:${user}:${restaurantId}`, "rating", "restaurant_rating", "user_action", "source_policy", { kind: "restaurant", restaurantId })
});

// Goal label evidence. `slot` keeps evidence ids distinct when a user holds several labels.
const goalLabel = (user, value, { isActive = true, startsOn = "2026-07-01", endsOn, slot = value } = {}) => ({
  category: "goal", facet: "goal_label", value,
  validity: { startsOn, isActive, ...(endsOn === undefined ? {} : { endsOn }) },
  evidence: envelope(`goal:${user}:label:${slot}`, "nutrition_goal", "nutrition_goal", "user_explicit", "not_eligible")
});
const goalScalar = (user, facet, value, unit = "kcal") => ({
  category: "goal", facet, value, unit,
  validity: { startsOn: "2026-07-01", isActive: true },
  evidence: envelope(`goal:${user}:${facet}`, "nutrition_goal", "nutrition_goal", "user_explicit", "not_eligible")
});
const restriction = (user, label, { rawSeverity = "preference", restrictionType = "avoidance", slot = label } = {}) => ({
  category: "restriction", restrictionType, label, rawSeverity, visibility: "private",
  evidence: envelope(`restr:${user}:${slot}`, "dietary_restriction", "dietary_restriction", "user_explicit", "not_eligible")
});

const state = (count) => (count > 0 ? { status: "available", evidenceCount: count } : { status: "empty", evidenceCount: 0 });
const snapshot = (userId, { preferences = [], behavior = [], goals = [], restrictions = [], generatedAt = "2026-08-08T12:00:00.000Z" } = {}) =>
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
    generatedAt,
    evidenceWindow: {
      historyScope: "bounded",
      meals: { requestedStartDate: "2026-07-01", requestedEndDate: "2026-08-08", requestedLimit: 50, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" },
      favorites: { requestedLimit: 25, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" },
      ratings: { requestedLimit: null, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" }
    }
  });

const gr = (inputA, inputB) => compareGoalRestrictionCompatibility(snapshot("user-a", inputA), snapshot("user-b", inputB));

// ============ 1-8. goal compatibility ============================================================
{
  const same = gr({ goals: [goalLabel("a", "fat_loss")] }, { goals: [goalLabel("b", "fat_loss")] });
  expect(same.goalCompatibility.status === "scored" && same.goalCompatibility.score === 1, "1 the same goal label scores 1", same.goalCompatibility);
  expect(same.explanationReasonCodes.includes("shared_goal_label"), "1a a shared goal label emits its own reason code");

  const different = gr({ goals: [goalLabel("a", "fat_loss")] }, { goals: [goalLabel("b", "gain_muscle")] });
  expect(different.goalCompatibility.status === "scored" && different.goalCompatibility.score === 0, "2 different explicit goal labels are a measured 0", different.goalCompatibility.score);
  expect(different.explanationReasonCodes.includes("different_goal_label"), "2a a measured 0 emits the differing-label code, not the shared one");
  expect(!different.explanationReasonCodes.includes("shared_goal_label"), "2b no semantic grouping treats two distinct labels as one");

  const bothMissing = gr({}, {});
  expect(bothMissing.goalCompatibility.status === "not_scored" && bothMissing.goalCompatibility.reason === "no_comparable_evidence", "3 both missing goal labels is no_comparable_evidence", bothMissing.goalCompatibility.reason);
  expect(!("score" in bothMissing.goalCompatibility), "3a a not_scored goal result carries no score key");

  const oneMissing = gr({ goals: [goalLabel("a", "fat_loss")] }, {});
  expect(oneMissing.goalCompatibility.status === "not_scored" && oneMissing.goalCompatibility.reason === "insufficient_evidence", "4 one missing side is insufficient_evidence", oneMissing.goalCompatibility.reason);
  expect(oneMissing.explanationReasonCodes.includes("limited_goal_evidence"), "4a an unscorable goal dimension is flagged as limited evidence");

  const inactive = gr(
    { goals: [goalLabel("a", "fat_loss", { isActive: false })] },
    { goals: [goalLabel("b", "fat_loss")] }
  );
  expect(inactive.goalCompatibility.status === "not_scored", "5 an inactive goal is ignored, exactly as the frozen mapper ignores it", inactive.goalCompatibility.reason);

  const notYetActive = gr(
    { goals: [goalLabel("a", "fat_loss", { startsOn: "2027-01-01" })] },
    { goals: [goalLabel("b", "fat_loss")] }
  );
  expect(notYetActive.goalCompatibility.status === "not_scored", "6 a not-yet-started goal is ignored", notYetActive.goalCompatibility.reason);
  const expired = gr(
    { goals: [goalLabel("a", "fat_loss", { endsOn: "2026-07-31" })] },
    { goals: [goalLabel("b", "fat_loss")] }
  );
  expect(expired.goalCompatibility.status === "not_scored", "6a an expired goal is ignored", expired.goalCompatibility.reason);
  const stillValid = gr(
    { goals: [goalLabel("a", "fat_loss", { endsOn: "2026-12-31" })] },
    { goals: [goalLabel("b", "fat_loss")] }
  );
  expect(stillValid.goalCompatibility.score === 1, "6b a goal whose window still covers the snapshot date is used");

  const wildlyDifferentMacros = gr(
    { goals: [goalLabel("a", "fat_loss"), goalScalar("a", "daily_calories_target", 1200), goalScalar("a", "protein_target_g", 60, "g")] },
    { goals: [goalLabel("b", "fat_loss"), goalScalar("b", "daily_calories_target", 4000), goalScalar("b", "protein_target_g", 250, "g")] }
  );
  expect(wildlyDifferentMacros.goalCompatibility.score === 1, "7 wildly different macro targets do not change a shared-label result", wildlyDifferentMacros.goalCompatibility.score);

  const macrosOnly = gr(
    { goals: [goalScalar("a", "daily_calories_target", 2000)] },
    { goals: [goalScalar("b", "daily_calories_target", 2000)] }
  );
  expect(macrosOnly.goalCompatibility.status === "not_scored", "8 identical macro targets create no comparability when the goal label is absent", macrosOnly.goalCompatibility.reason);
  expect(macrosOnly.confidenceInputs.goal.eligibleGoalLabelCount === 0, "8a macro scalars are never counted as goal-label evidence");

  const multiLabel = gr(
    { goals: [goalLabel("a", "fat_loss"), goalLabel("a", "high_protein")] },
    { goals: [goalLabel("b", "high_protein"), goalLabel("b", "endurance")] }
  );
  expect(multiLabel.goalCompatibility.score === 0.333333, "8b several active labels are compared as a plain Jaccard index (1 of 3)", multiLabel.goalCompatibility.score);
}

// ============ 9-16. restriction eligibility ======================================================
{
  const noEvidence = gr({}, {});
  expect(noEvidence.restrictionEligibility.verdict === "compatible", "9 two profiles with no restriction evidence are compatible", noEvidence.restrictionEligibility);
  expect(noEvidence.restrictionEligibility.basis === "no_restriction_evidence", "9a the absence of evidence is stated explicitly as the basis");
  expect(noEvidence.restrictionEligibility.comparableRestrictionEvidence === false, "9b the metadata reports that no comparable restriction evidence existed");
  expect(!("score" in noEvidence.restrictionEligibility), "9c restriction eligibility carries no score of any kind");

  const sharedSoft = gr(
    { restrictions: [restriction("a", "coriander")] },
    { restrictions: [restriction("b", "coriander")] }
  );
  expect(sharedSoft.restrictionEligibility.verdict === "compatible" && sharedSoft.restrictionEligibility.basis === "soft_preferences_only", "10 a shared soft restriction stays compatible");
  expect(sharedSoft.confidenceInputs.restriction.sharedSoftRestrictionCount === 1, "10a the shared soft constraint is recorded as a COUNT");
  expect(sharedSoft.explanationReasonCodes.includes("shared_soft_restriction"), "10b a shared soft constraint emits its own reason code");

  const differingSoft = gr(
    { restrictions: [restriction("a", "coriander")] },
    { restrictions: [restriction("b", "mushroom")] }
  );
  expect(differingSoft.restrictionEligibility.verdict === "compatible", "11 differing soft restrictions are NOT a hard incompatibility", differingSoft.restrictionEligibility);
  expect(differingSoft.confidenceInputs.restriction.sharedSoftRestrictionCount === 0, "11a nothing is shared, and that is reported as a count of zero");
  expect(!differingSoft.explanationReasonCodes.includes("shared_soft_restriction"), "11b no shared-constraint code is emitted when nothing is shared");

  const oneUnclassified = gr(
    { restrictions: [restriction("a", "peanut", { rawSeverity: "severe" })] },
    { restrictions: [restriction("b", "coriander")] }
  );
  expect(oneUnclassified.restrictionEligibility.verdict === "needs_attention", "12 a single unclassified restriction moves the verdict to needs_attention", oneUnclassified.restrictionEligibility);
  expect(oneUnclassified.restrictionEligibility.basis === "unclassified_enforcement_present", "12a the basis names the unclassified enforcement");
  expect(oneUnclassified.explanationReasonCodes.includes("restriction_requires_attention"), "12b needs_attention emits its own reason code");

  const bothUnclassified = gr(
    { restrictions: [restriction("a", "peanut", { rawSeverity: "severe" })] },
    { restrictions: [restriction("b", "gluten", { rawSeverity: "medical" })] }
  );
  expect(bothUnclassified.restrictionEligibility.verdict !== "compatible", "13 two unclassified restrictions never silently resolve to compatible", bothUnclassified.restrictionEligibility.verdict);
  expect(bothUnclassified.confidenceInputs.restriction.unclassifiedRestrictionPresent, "13a the presence of unclassified enforcement is exposed as a boolean");

  const serialized = JSON.stringify(gr(
    { restrictions: [restriction("a", "peanut", { rawSeverity: "life_threatening", restrictionType: "allergy" })] },
    { restrictions: [restriction("b", "coriander")] }
  ));
  expect(!/peanut|coriander|gluten|mushroom/.test(serialized), "14 no raw restriction label appears in the output");
  expect(!/allergy|avoidance/.test(serialized), "15 no restriction type or free-text note appears in the output");
  expect(!/life_threatening|severe|medical|preference/.test(serialized), "16 no raw severity string appears in the output");
  expect(!/private|friends|public/.test(serialized), "16a no restriction visibility value appears in the output");
}

// ============ 17-20. ISOLATION (load-bearing) ====================================================
{
  const tasteAndContext = (user) => ({
    preferences: [cuisine(user, "japanese"), spice(user, "medium"), mealType(user, "lunch"), diningStyle(user, "casual"), paymentPreference(user, "split_bill")],
    behavior: [favoriteRestaurant(user, "rest-1"), meal("rest-2", { id: `m:${user}:1` }), meal("rest-2", { id: `m:${user}:2` })]
  });
  const withExtras = (user, extras) => ({ ...tasteAndContext(user), ...extras });

  const controlA = snapshot("user-a", tasteAndContext("a"));
  const controlB = snapshot("user-b", tasteAndContext("b"));
  const controlTaste = JSON.stringify(compareTasteSimilarity(controlA, controlB));
  const controlContext = JSON.stringify(compareSocialContextCompatibility(controlA, controlB));
  expect(frozenTasteCompare !== null && controlTaste === JSON.stringify(frozenTasteCompare(controlA, controlB)), "17a the current taste comparator matches the FROZEN R1 comparator on the control pair");
  expect(frozenContextCompare !== null && controlContext === JSON.stringify(frozenContextCompare(controlA, controlB)), "19a the current social-context comparator matches the FROZEN TS-3C comparator on the control pair");

  const variants = [
    {
      label: "goal",
      a: { goals: [goalLabel("a", "fat_loss"), goalScalar("a", "daily_calories_target", 1200)] },
      b: { goals: [goalLabel("b", "gain_muscle"), goalScalar("b", "daily_calories_target", 3800)] }
    },
    {
      label: "restriction",
      a: { restrictions: [restriction("a", "peanut", { rawSeverity: "severe" })] },
      b: { restrictions: [restriction("b", "coriander")] }
    }
  ];
  for (const variant of variants) {
    const a = snapshot("user-a", withExtras("a", variant.a));
    const b = snapshot("user-b", withExtras("b", variant.b));
    const taste = JSON.stringify(compareTasteSimilarity(a, b));
    const context = JSON.stringify(compareSocialContextCompatibility(a, b));
    const index = variant.label === "goal" ? 17 : 18;
    expect(taste === controlTaste, `${index} a ${variant.label} change leaves the food-taste result byte-identical`);
    expect(taste === JSON.stringify(frozenTasteCompare(a, b)), `${index}b a ${variant.label} change leaves taste identical to the FROZEN R1 comparator`);
    const contextIndex = variant.label === "goal" ? 19 : 20;
    expect(context === controlContext, `${contextIndex} a ${variant.label} change leaves the social-context result byte-identical`);
    expect(context === JSON.stringify(frozenContextCompare(a, b)), `${contextIndex}b a ${variant.label} change leaves social context identical to the FROZEN TS-3C comparator`);
  }
  expect(TASTE_SIMILARITY_POLICY_VERSION === "taste-similarity-v1.1", "20a the taste policy version is untouched", TASTE_SIMILARITY_POLICY_VERSION);
  expect(SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION === "social-context-compatibility-v1", "20b the social-context policy version is untouched", SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION);
}

// ============ 21-24. inputs that must not affect TS-3D ===========================================
{
  const base = (user) => ({ goals: [goalLabel(user, "fat_loss")], restrictions: [restriction(user, "coriander")] });
  const reference = gr(base("a"), base("b"));
  const unchangedBy = (label, extraA, extraB, index) => {
    const result = gr({ ...base("a"), ...extraA }, { ...base("b"), ...extraB });
    expect(JSON.stringify(result) === JSON.stringify(reference), `${index} ${label} has zero effect on goal compatibility or restriction eligibility`);
  };
  unchangedBy("a meal history change", { behavior: [meal("rest-1", { id: "m:a:1" }), meal("rest-1", { id: "m:a:2" })] }, { behavior: [meal("rest-1", { id: "m:b:1" }), meal("rest-1", { id: "m:b:2" })] }, 21);
  unchangedBy("a favorites change", { behavior: [favoriteRestaurant("a", "rest-9")] }, { behavior: [favoriteRestaurant("b", "rest-9")] }, 22);
  unchangedBy("a rating change", { behavior: [rating("a", "rest-1", 5)] }, { behavior: [rating("b", "rest-1", 1)] }, 23);
  unchangedBy(
    "a payment, dining or meal_pattern preference change",
    { preferences: [paymentPreference("a", "split_bill"), diningStyle("a", "casual"), mealType("a", "lunch")] },
    { preferences: [paymentPreference("b", "treat_alternately"), diningStyle("b", "fine_dining"), mealType("b", "dinner")] },
    24
  );
  unchangedBy("a food-taste preference change", { preferences: [cuisine("a", "japanese")] }, { preferences: [cuisine("b", "french")] }, 24.1);
}

// ============ 25-32. contract invariants =========================================================
{
  const inputA = { goals: [goalLabel("a", "fat_loss"), goalLabel("a", "high_protein")], restrictions: [restriction("a", "coriander")] };
  const inputB = { goals: [goalLabel("b", "high_protein")], restrictions: [restriction("b", "coriander")] };
  const a = snapshot("user-a", inputA);
  const b = snapshot("user-b", inputB);
  expect(
    JSON.stringify(compareGoalRestrictionCompatibility(a, b)) === JSON.stringify(compareGoalRestrictionCompatibility(b, a)),
    "25 A/B swap yields an EXACTLY symmetric result"
  );

  const shuffled = snapshot("user-a", { goals: [...inputA.goals].reverse(), restrictions: [...inputA.restrictions].reverse() });
  expect(
    JSON.stringify(compareGoalRestrictionCompatibility(a, b)) === JSON.stringify(compareGoalRestrictionCompatibility(shuffled, b)),
    "26 shuffled evidence order yields a byte-identical result"
  );

  const unsupported = compareGoalRestrictionCompatibility({ ...a, schemaVersion: "taste-profile-snapshot-v99" }, b);
  expect(unsupported.goalCompatibility.reason === "unsupported_snapshot_schema", "27 an unknown snapshot schema fails closed on goal compatibility");
  expect(unsupported.restrictionEligibility.verdict === "unknown" && unsupported.restrictionEligibility.basis === "unsupported_snapshot_schema", "27a an unknown snapshot schema fails closed on restriction eligibility", unsupported.restrictionEligibility);
  expect(!("score" in unsupported.goalCompatibility), "27b the fail-closed goal result carries no score");
  expect(unsupported.explanationReasonCodes.includes("restriction_evidence_unknown"), "27c the unknown verdict emits its own reason code");

  const allCases = [compareGoalRestrictionCompatibility(a, b), gr({}, {}), unsupported];
  const keys = Object.keys(allCases[0]);
  expect(
    !keys.some((key) => /overall|aggregate|combined|totalScore/i.test(key)) &&
      !("socialCompatibility" in allCases[0]) && !("tasteSimilarity" in allCases[0]),
    "28 no overall, combined, social or taste score exists on the result",
    keys
  );
  expect(allCases.every((result) => result.goalCompatibility.status === "scored" || !("score" in result.goalCompatibility)), "28a no not_scored goal result carries a score key");
  expect(
    allCases.every((result) => result.goalCompatibility.status !== "scored" || (result.goalCompatibility.score >= 0 && result.goalCompatibility.score <= 1)),
    "28b every goal score stays inside the canonical 0..1 range"
  );
  expect(allCases.every((result) => !("score" in result.restrictionEligibility)), "28c restriction eligibility never gains a score");
  expect(allCases.every((result) => result.policyVersion === "goal-restriction-compatibility-v1"), "29 the policy version is pinned on every result", GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION);
  expect(allCases.every((result) => result.snapshotSchemaVersion === "taste-profile-snapshot-v1"), "29a the snapshot schema version is stamped on every result");

  const inputs = allCases[0].confidenceInputs;
  expect(
    !("confidence" in inputs) && !("confidenceScore" in inputs) &&
      typeof inputs.goal.eligibleGoalLabelCount === "number" && typeof inputs.restriction.unclassifiedRestrictionPresent === "boolean",
    "30 sparse-evidence inputs are counts and booleans only, with no numeric confidence",
    inputs
  );

  const rich = gr(
    { goals: [goalLabel("a", "fat_loss")], restrictions: [restriction("a", "coriander"), restriction("a", "peanut", { rawSeverity: "severe" })] },
    { goals: [goalLabel("b", "fat_loss")], restrictions: [restriction("b", "coriander")] }
  );
  expect(
    JSON.stringify(rich.explanationReasonCodes) === JSON.stringify(["shared_goal_label", "shared_soft_restriction", "restriction_requires_attention"]),
    "31 reason codes are emitted in the fixed declaration order",
    rich.explanationReasonCodes
  );

  const richSerialized = JSON.stringify(rich);
  expect(!/fat_loss|high_protein|coriander|peanut/.test(richSerialized), "32 no raw goal label or restriction label appears in the output");
  expect(!/1200|4000|daily_calories_target|protein_target_g|kcal/.test(JSON.stringify(gr(
    { goals: [goalLabel("a", "fat_loss"), goalScalar("a", "daily_calories_target", 1200)] },
    { goals: [goalLabel("b", "fat_loss"), goalScalar("b", "daily_calories_target", 4000)] }
  ))), "32a no macro target value or facet name appears in the output");
  expect(!/user-a|user-b|goal:|restr:/.test(richSerialized), "32b no user id or evidence id appears in the output");
}

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  smoke: "taste-similarity-ts3d",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  goalRestrictionPolicyVersion: GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
  socialContextPolicyVersion: SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
  tastePolicyVersion: TASTE_SIMILARITY_POLICY_VERSION,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);
