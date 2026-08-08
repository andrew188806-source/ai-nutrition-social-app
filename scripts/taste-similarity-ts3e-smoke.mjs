#!/usr/bin/env node
// TS-3E contract smoke — CANONICAL COMPARISON BUNDLE.
//
// Executes the REAL shared domain. Scenarios 9-11 are the load-bearing composition proof: each of the
// three frozen comparators is called DIRECTLY and its output compared byte-for-byte with the
// corresponding slot in the bundle, so "the bundle carries frozen output verbatim" is demonstrated
// rather than asserted. Scenario 18 additionally re-runs each component from its own freeze commit
// to prove no component implementation drifted.
//
// Fully local and pure: no network, no database, no Supabase, no credential, no clock dependence.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = process.cwd();
const R1_FREEZE_COMMIT = "91d50dbf98370e8a3848942c52c5e94827329a89";
const TS3C_FREEZE_COMMIT = "e4535ba07c738603445c756c66c9941dd245954b";
const TS3D_FREEZE_COMMIT = "6dab5f10110c1770da6081a36018a085f7712cad";
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
  compareTasteProfiles,
  compareTasteSimilarity,
  compareSocialContextCompatibility,
  compareGoalRestrictionCompatibility,
  composeTasteProfileSnapshot,
  TASTE_COMPARISON_BUNDLE_VERSION,
  TASTE_SIMILARITY_POLICY_VERSION,
  SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
  GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION
} = domain;

expect(typeof compareTasteProfiles === "function", "S0 the REAL bundle composer loads");
expect(typeof compareTasteSimilarity === "function" && typeof compareSocialContextCompatibility === "function"
  && typeof compareGoalRestrictionCompatibility === "function", "S0 all three REAL component comparators load");

function loadFrozenComponent(commit, directory, files) {
  const overrides = new Map();
  const absoluteDir = path.join(root, "packages/shared/src/domain/taste-similarity", directory);
  for (const file of files) {
    const shown = spawnSync(
      "git", ["show", `${commit}:packages/shared/src/domain/taste-similarity/${directory}/${file}`],
      { cwd: root, encoding: "utf8", windowsHide: true }
    );
    if (shown.status !== 0) return null;
    overrides.set(path.normalize(path.join(absoluteDir, file)), shown.stdout);
  }
  return loadDomain(overrides);
}

const frozenTaste = loadFrozenComponent(R1_FREEZE_COMMIT, "similarity", ["policy.ts", "reasonCodes.ts", "types.ts", "comparator.ts", "index.ts"]);
const frozenContext = loadFrozenComponent(TS3C_FREEZE_COMMIT, "compatibility", ["policy.ts", "reasonCodes.ts", "types.ts", "comparator.ts", "index.ts"]);
const frozenGoal = loadFrozenComponent(TS3D_FREEZE_COMMIT, "goal-restriction", ["policy.ts", "reasonCodes.ts", "types.ts", "comparator.ts", "index.ts"]);
expect(frozenTaste !== null && frozenContext !== null && frozenGoal !== null, "S0 all three FROZEN component implementations load from their freeze commits");

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

const available = (count) => (count > 0 ? { status: "available", evidenceCount: count } : { status: "empty", evidenceCount: 0 });
const snapshot = (userId, {
  preferences = [], behavior = [], goals = [], restrictions = [],
  mealsTruncation = "not_truncated", sourceOverrides = {}
} = {}) =>
  composeTasteProfileSnapshot({
    subjectUserId: userId,
    preferences, goals, restrictions, behavior,
    sourceStates: {
      taste_profile: available(preferences.length),
      nutrition_goals: available(goals.length),
      dietary_restrictions: available(restrictions.length),
      meals: available(behavior.filter((entry) => entry.behaviorKind === "meal_occurrence").length),
      favorites: available(behavior.filter((entry) => entry.behaviorKind === "favorite").length),
      ratings: available(behavior.filter((entry) => entry.behaviorKind === "rating").length),
      ...sourceOverrides
    },
    generatedAt: "2026-08-08T12:00:00.000Z",
    evidenceWindow: {
      historyScope: "bounded",
      meals: { requestedStartDate: "2026-07-01", requestedEndDate: "2026-08-08", requestedLimit: 50, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: mealsTruncation },
      favorites: { requestedLimit: 25, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" },
      ratings: { requestedLimit: null, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" }
    }
  });

// Dining style deliberately DIFFERS between the two users, so the pair is not self-similar: a
// fixture where both sides are identical would hide any defect that swaps one side for the other.
const richInput = (user) => ({
  preferences: [cuisine(user, "japanese"), flavor(user, "coriander"), spice(user, "medium"), mealType(user, "lunch"), diningStyle(user, user === "a" ? "casual" : "fine_dining"), paymentPreference(user, "split_bill")],
  behavior: [favoriteRestaurant(user, "rest-1"), meal("rest-2", { id: `m:${user}:1` }), meal("rest-2", { id: `m:${user}:2` }), rating(user, "rest-1", 4)],
  goals: [goalLabel(user, "fat_loss"), goalScalar(user, "daily_calories_target", user === "a" ? 1400 : 3200)],
  restrictions: [restriction(user, "coriander")]
});

// ============ 1-8. component presence, independence, partiality ==================================
{
  const rich = compareTasteProfiles(snapshot("user-a", richInput("a")), snapshot("user-b", richInput("b")));
  expect(rich.status === "assembled", "1 a rich pair assembles a complete bundle", rich.status);
  expect(rich.taste.status === "scored" && rich.socialContext.mealPatternCompatibility.status === "scored"
    && rich.goalRestriction.goalCompatibility.status === "scored", "1a all three component results are present and populated");

  const tasteOnly = compareTasteProfiles(
    snapshot("user-a", { preferences: [cuisine("a", "japanese")] }),
    snapshot("user-b", { preferences: [cuisine("b", "japanese")] })
  );
  expect(tasteOnly.taste.status === "scored", "2 taste-only evidence scores taste");
  expect(tasteOnly.socialContext.mealPatternCompatibility.status === "not_scored"
    && tasteOnly.goalRestriction.goalCompatibility.status === "not_scored", "2a the other components stay independently not_scored");

  const contextOnly = compareTasteProfiles(
    snapshot("user-a", { preferences: [mealType("a", "lunch")] }),
    snapshot("user-b", { preferences: [mealType("b", "lunch")] })
  );
  expect(contextOnly.socialContext.mealPatternCompatibility.status === "scored" && contextOnly.taste.status === "not_scored", "3 context-only evidence scores context and leaves taste unscored");

  const goalOnly = compareTasteProfiles(
    snapshot("user-a", { goals: [goalLabel("a", "fat_loss")] }),
    snapshot("user-b", { goals: [goalLabel("b", "fat_loss")] })
  );
  expect(goalOnly.goalRestriction.goalCompatibility.status === "scored" && goalOnly.taste.status === "not_scored"
    && goalOnly.socialContext.diningCompatibility.status === "not_scored", "4 goal-only evidence scores goal and leaves taste and context independent");

  const restrictionOnly = compareTasteProfiles(
    snapshot("user-a", { restrictions: [restriction("a", "peanut", { rawSeverity: "severe" })] }),
    snapshot("user-b", { restrictions: [restriction("b", "coriander")] })
  );
  expect(restrictionOnly.goalRestriction.restrictionEligibility.verdict === "needs_attention", "5 a restriction-only pair preserves the verdict verbatim", restrictionOnly.goalRestriction.restrictionEligibility);

  const empty = compareTasteProfiles(snapshot("user-a"), snapshot("user-b"));
  expect(empty.status === "assembled", "6 an empty pair still assembles a valid bundle");
  expect(empty.taste.status === "not_scored" && !("score" in empty.taste)
    && empty.goalRestriction.goalCompatibility.status === "not_scored" && !("score" in empty.goalRestriction.goalCompatibility),
    "6a no score is fabricated anywhere for an empty pair");

  const partialSources = compareTasteProfiles(
    snapshot("user-a", { ...richInput("a"), sourceOverrides: { ratings: { status: "failed", evidenceCount: 0, failureCode: "read_failed" } } }),
    snapshot("user-b", richInput("b"))
  );
  expect(partialSources.taste.status === "scored" && partialSources.socialContext.diningCompatibility.status === "scored",
    "7 an unavailable source leaves unaffected components fully preserved");
  expect(partialSources.confidenceInputs.sourceAvailability.ratingsAvailableForBoth === false,
    "7a the unavailable source is reported honestly in the unified inputs");

  const attentionA = snapshot("user-a", { ...richInput("a"), restrictions: [restriction("a", "peanut", { rawSeverity: "severe" })] });
  const attentionB = snapshot("user-b", richInput("b"));
  const withAttention = compareTasteProfiles(attentionA, attentionB);
  const controlTaste = JSON.stringify(compareTasteSimilarity(attentionA, attentionB));
  expect(withAttention.goalRestriction.restrictionEligibility.verdict === "needs_attention", "8 needs_attention is preserved");
  expect(JSON.stringify(withAttention.taste) === controlTaste, "8a needs_attention applies no penalty to the taste score");
  expect(
    JSON.stringify(withAttention.socialContext) === JSON.stringify(compareSocialContextCompatibility(attentionA, attentionB)),
    "8b needs_attention leaves the social-context result byte-identical to the direct component call"
  );
}

// ============ 9-11. component output is carried VERBATIM (load-bearing) =========================
{
  const a = snapshot("user-a", richInput("a"));
  const b = snapshot("user-b", richInput("b"));
  const bundle = compareTasteProfiles(a, b);
  expect(JSON.stringify(bundle.taste) === JSON.stringify(compareTasteSimilarity(a, b)), "9 the bundle carries the exact frozen taste comparator output");
  expect(JSON.stringify(bundle.socialContext) === JSON.stringify(compareSocialContextCompatibility(a, b)), "10 the bundle carries the exact frozen social-context comparator output");
  expect(JSON.stringify(bundle.goalRestriction) === JSON.stringify(compareGoalRestrictionCompatibility(a, b)), "11 the bundle carries the exact frozen goal/restriction comparator output");
}

// ============ 12-16. version bundle ==============================================================
{
  const bundle = compareTasteProfiles(snapshot("user-a", richInput("a")), snapshot("user-b", richInput("b")));
  expect(bundle.versions.tastePolicyVersion === "taste-similarity-v1.1", "12 the taste policy version is pinned at v1.1", bundle.versions.tastePolicyVersion);
  expect(bundle.versions.socialContextPolicyVersion === "social-context-compatibility-v1", "13 the social-context policy version is pinned");
  expect(bundle.versions.goalRestrictionPolicyVersion === "goal-restriction-compatibility-v1", "14 the goal/restriction policy version is pinned");
  expect(bundle.versions.bundleVersion === "taste-comparison-bundle-v1", "15 the bundle version is pinned", TASTE_COMPARISON_BUNDLE_VERSION);
  expect(bundle.versions.snapshotSchemaVersion === "taste-profile-snapshot-v1", "16 the snapshot schema version is pinned");
  expect(
    bundle.versions.tastePolicyVersion === TASTE_SIMILARITY_POLICY_VERSION &&
      bundle.versions.socialContextPolicyVersion === SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION &&
      bundle.versions.goalRestrictionPolicyVersion === GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
    "16a every stamped version is the frozen exported constant, not a duplicated literal"
  );
}

// ============ 17-19. no aggregate, no numeric confidence =========================================
{
  const bundle = compareTasteProfiles(snapshot("user-a", richInput("a")), snapshot("user-b", richInput("b")));
  const serialized = JSON.stringify(bundle);
  expect(
    !Object.keys(bundle).some((key) => /overall|aggregate|combined|match|rank|weighted/i.test(key)) &&
      !/"overall|"aggregate|"combined|"matchScore|"rankScore|"weightedScore/i.test(serialized),
    "17 no aggregate, overall, match, rank or weighted score exists anywhere in the bundle",
    Object.keys(bundle)
  );
  expect(
    !("confidence" in bundle) && !("confidenceScore" in bundle.confidenceInputs) &&
      !/"confidence"\s*:\s*[\d.]/.test(serialized) && !/"(high|medium|low)"/.test(serialized),
    "18 no numeric confidence and no qualitative confidence band exists"
  );

  const sparse = compareTasteProfiles(snapshot("user-a"), snapshot("user-b"));
  expect(!("score" in sparse.taste) && !("score" in sparse.goalRestriction.goalCompatibility)
    && !("score" in sparse.socialContext.mealPatternCompatibility) && !("score" in sparse.goalRestriction.restrictionEligibility),
    "19 the absence of `score` on every not_scored sub-result is preserved through composition");
}

// ============ 20-21. symmetry and determinism ====================================================
{
  const a = snapshot("user-a", richInput("a"));
  const b = snapshot("user-b", richInput("b"));
  expect(JSON.stringify(compareTasteProfiles(a, b)) === JSON.stringify(compareTasteProfiles(b, a)), "20 A/B swap yields an EXACTLY symmetric bundle");

  const shuffledInput = richInput("b");
  const shuffled = snapshot("user-b", {
    preferences: [...shuffledInput.preferences].reverse(),
    behavior: [...shuffledInput.behavior].reverse(),
    goals: [...shuffledInput.goals].reverse(),
    restrictions: [...shuffledInput.restrictions].reverse()
  });
  expect(JSON.stringify(compareTasteProfiles(a, b)) === JSON.stringify(compareTasteProfiles(a, shuffled)), "21 shuffled evidence order yields a byte-identical bundle");
}

// ============ 22-25. explanation assembly ========================================================
{
  const bundle = compareTasteProfiles(snapshot("user-a", richInput("a")), snapshot("user-b", richInput("b")));
  const codes = bundle.explanationReasonCodes;
  const taste = compareTasteSimilarity(snapshot("user-a", richInput("a")), snapshot("user-b", richInput("b")));
  const context = compareSocialContextCompatibility(snapshot("user-a", richInput("a")), snapshot("user-b", richInput("b")));
  const goalRestriction = compareGoalRestrictionCompatibility(snapshot("user-a", richInput("a")), snapshot("user-b", richInput("b")));
  const expected = [...new Set([...taste.explanationReasonCodes, ...context.explanationReasonCodes, ...goalRestriction.explanationReasonCodes])];
  expect(JSON.stringify(codes) === JSON.stringify(expected), "22 reason codes are the components' own ordered codes merged in fixed component order", codes);
  expect(JSON.stringify(compareTasteProfiles(snapshot("user-a", richInput("a")), snapshot("user-b", richInput("b"))).explanationReasonCodes) === JSON.stringify(codes),
    "22a repeated assembly produces an identical reason sequence");
  expect(new Set(codes).size === codes.length, "23 the merged reason list contains no duplicates", codes);
  expect(codes.every((code) => /^[a-z_]+$/.test(code)), "24 every reason is a closed snake_case code with no free text", codes);
  expect(codes.some((code) => code.startsWith("shared_")) && codes.some((code) => code.includes("restriction") || code.includes("goal")),
    "24a safe categories from more than one component survive the merge");

  const serialized = JSON.stringify(codes);
  expect(!/japanese|coriander|medium|split_bill|casual|lunch|fat_loss|rest-|peanut|1400|3200/.test(serialized), "25 no raw evidence value appears in the reason list");
}

// ============ 26-29. unified confidence inputs ===================================================
{
  const a = snapshot("user-a", { ...richInput("a"), mealsTruncation: "known_truncated" });
  const b = snapshot("user-b", { ...richInput("b"), sourceOverrides: { ratings: { status: "disabled", evidenceCount: 0, reason: "source_disabled" } } });
  const bundle = compareTasteProfiles(a, b);
  const inputs = bundle.confidenceInputs;
  expect(
    inputs.sourceAvailability.tasteProfileAvailableForBoth === true &&
      inputs.sourceAvailability.nutritionGoalsAvailableForBoth === true &&
      inputs.sourceAvailability.dietaryRestrictionsAvailableForBoth === true &&
      inputs.sourceAvailability.mealsAvailableForBoth === true &&
      inputs.sourceAvailability.favoritesAvailableForBoth === true &&
      inputs.sourceAvailability.ratingsAvailableForBoth === false,
    "26 source availability is assembled from all six TS-2 sources, with a disabled source reported false",
    inputs.sourceAvailability
  );
  expect(
    inputs.historyCompleteness.mealsTruncatedForEither === true &&
      inputs.historyCompleteness.favoritesTruncatedForEither === false &&
      inputs.historyCompleteness.historyScopeBoundedForBoth === true,
    "27 bounded-history and truncation state propagate into the unified inputs",
    inputs.historyCompleteness
  );

  const control = snapshot("user-a", richInput("a"));
  const controlB = snapshot("user-b", richInput("b"));
  const controlBundle = compareTasteProfiles(control, controlB);
  const controlTaste = compareTasteSimilarity(control, controlB);
  const controlContext = compareSocialContextCompatibility(control, controlB);
  const controlGoal = compareGoalRestrictionCompatibility(control, controlB);
  const contextScored = [controlContext.mealPatternCompatibility, controlContext.diningCompatibility, controlContext.socialLogisticsCompatibility]
    .filter((entry) => entry.status === "scored").length;
  expect(
    controlBundle.confidenceInputs.evidenceCoverage.comparableDimensionCount ===
      controlTaste.confidenceInputs.comparableDimensionCount + contextScored + (controlGoal.goalCompatibility.status === "scored" ? 1 : 0),
    "28 the comparable dimension count is the sum of what each component actually reported",
    controlBundle.confidenceInputs.evidenceCoverage
  );
  expect(
    controlBundle.confidenceInputs.evidenceCoverage.explicitEvidenceCount ===
      controlTaste.confidenceInputs.explicitEvidenceCount + controlContext.confidenceInputs.explicitEvidenceCount &&
      controlBundle.confidenceInputs.evidenceCoverage.behavioralEvidenceCount === controlTaste.confidenceInputs.behavioralEvidenceCount,
    "29 explicit and behavioural evidence counts are preserved from the component reports"
  );
  expect(
    controlBundle.confidenceInputs.evidenceCoverage.totalEvidenceCount ===
      control.confidenceMetadata.evidenceCounts.total + controlB.confidenceMetadata.evidenceCounts.total,
    "29a the total evidence count comes from the frozen TS-2 snapshot coverage metadata"
  );
  expect(
    controlBundle.confidenceInputs.dimensionAvailability.taste === "scored" &&
      controlBundle.confidenceInputs.dimensionAvailability.restrictionVerdict === controlGoal.restrictionEligibility.verdict,
    "29b dimension availability mirrors each component's own state, including the restriction verdict"
  );
}

// ============ 30-32. fail-closed and independence ================================================
{
  const a = snapshot("user-a", richInput("a"));
  const b = snapshot("user-b", richInput("b"));
  const unsupported = compareTasteProfiles({ ...a, schemaVersion: "taste-profile-snapshot-v99" }, b);
  expect(unsupported.status === "unsupported_snapshot_schema", "30 an unknown snapshot schema fails closed at bundle level", unsupported.status);
  expect(
    unsupported.taste.status === "not_scored" && unsupported.taste.reason === "unsupported_snapshot_schema" &&
      unsupported.socialContext.mealPatternCompatibility.reason === "unsupported_snapshot_schema" &&
      unsupported.goalRestriction.restrictionEligibility.verdict === "unknown",
    "30a every component simultaneously reports its own fail-closed state"
  );
  expect(!("score" in unsupported.taste) && !("score" in unsupported.goalRestriction.goalCompatibility)
    && !("score" in unsupported.socialContext.diningCompatibility), "30b no score anywhere can look valid after a fail-closed bundle");

  const mixed = compareTasteProfiles(
    snapshot("user-a", { preferences: [cuisine("a", "japanese"), mealType("a", "lunch")], goals: [goalLabel("a", "fat_loss")] }),
    snapshot("user-b", { preferences: [cuisine("b", "japanese"), mealType("b", "lunch")] })
  );
  expect(mixed.status === "assembled" && mixed.taste.status === "scored" && mixed.socialContext.mealPatternCompatibility.status === "scored",
    "31 one unscored component does not fail or degrade the whole bundle");
  expect(mixed.goalRestriction.goalCompatibility.status === "not_scored", "31a the unscored component simply reports itself as unscored");

  const attention = compareTasteProfiles(
    snapshot("user-a", { preferences: [cuisine("a", "japanese")], restrictions: [restriction("a", "peanut", { rawSeverity: "severe" })] }),
    snapshot("user-b", { preferences: [cuisine("b", "japanese")], restrictions: [restriction("b", "coriander")] })
  );
  expect(attention.taste.status === "scored" && attention.taste.score === 1
    && attention.goalRestriction.restrictionEligibility.verdict === "needs_attention",
    "32 the restriction verdict stays fully independent of every score", { taste: attention.taste.score, verdict: attention.goalRestriction.restrictionEligibility.verdict });
}

// ============ 33-35. consumer-policy and legacy signal absence ===================================
{
  const bundle = compareTasteProfiles(snapshot("user-a", richInput("a")), snapshot("user-b", richInput("b")));
  const serialized = JSON.stringify(bundle);
  expect(!/distanceKm|latitude|longitude|nearby|proximity|geolocation/i.test(serialized), "33 no GPS or proximity signal exists in the bundle");
  expect(!/premium|activityScore|verified|engagement|popularity|trending/i.test(serialized), "34 no premium, activity or verified signal exists in the bundle");
  expect(
    !/threshold|shouldShow|ranked|topN|eligibleForDisplay|recommend/i.test(serialized) &&
      !Object.keys(bundle).some((key) => /rank|threshold|recommend|display/i.test(key)),
    "35 no Social ranking, gating or display decision is produced",
    Object.keys(bundle)
  );
  expect(!/user-a|user-b|tp:|fav:|goal:|restr:|m:a:|m:b:/.test(serialized), "35a no user id or evidence id appears anywhere in the bundle");
  expect(!/japanese|coriander|medium|split_bill|casual|fat_loss|rest-1|rest-2|1400|3200|peanut/.test(serialized), "35b no raw evidence value appears anywhere in the bundle");
}

// ============ 18(extra). component implementations have not drifted ==============================
{
  const a = snapshot("user-a", richInput("a"));
  const b = snapshot("user-b", richInput("b"));
  expect(frozenTaste !== null && JSON.stringify(compareTasteSimilarity(a, b)) === JSON.stringify(frozenTaste.compareTasteSimilarity(a, b)),
    "P1 the taste component matches its FROZEN implementation from the R1 freeze commit");
  expect(frozenContext !== null && JSON.stringify(compareSocialContextCompatibility(a, b)) === JSON.stringify(frozenContext.compareSocialContextCompatibility(a, b)),
    "P2 the social-context component matches its FROZEN implementation from the TS-3C freeze commit");
  expect(frozenGoal !== null && JSON.stringify(compareGoalRestrictionCompatibility(a, b)) === JSON.stringify(frozenGoal.compareGoalRestrictionCompatibility(a, b)),
    "P3 the goal/restriction component matches its FROZEN implementation from the TS-3D freeze commit");
}

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  smoke: "taste-similarity-ts3e",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  bundleVersion: TASTE_COMPARISON_BUNDLE_VERSION,
  tastePolicyVersion: TASTE_SIMILARITY_POLICY_VERSION,
  socialContextPolicyVersion: SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
  goalRestrictionPolicyVersion: GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);
