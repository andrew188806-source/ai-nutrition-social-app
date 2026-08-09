#!/usr/bin/env node
// TS-6 contract smoke — SHARED TASTE ADAPTER V1.
//
// Executes the REAL shared domain end to end: frozen snapshot composition, frozen comparison bundle,
// frozen evidence confidence, frozen cold start assessment, then the real adapter.
//
// The load-bearing family of checks is exact-value preservation: every projected number and state is
// compared against the frozen producer's own output rather than against a literal.
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
  adaptSharedTasteComparison,
  assessColdStart,
  calculateEvidenceConfidence,
  compareTasteProfiles,
  composeTasteProfileSnapshot,
  SHARED_TASTE_ADAPTER_POLICY_VERSION
} = domain;

expect(typeof adaptSharedTasteComparison === "function", "S0 the REAL shared adapter loads");
expect(typeof assessColdStart === "function" && typeof calculateEvidenceConfidence === "function"
  && typeof compareTasteProfiles === "function", "S0 all three REAL frozen producers load");

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
const snapshot = (userId, {
  preferences = [], behavior = [], goals = [], restrictions = [],
  mealsTruncation = "not_truncated", favoritesTruncation = "not_truncated", sourceOverrides = {}
} = {}) =>
  composeTasteProfileSnapshot({
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
      ratings: { requestedLimit: null, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" }
    }
  });

// Produces the three frozen inputs AND the adapter output, so every projection can be checked
// against its own producer rather than against a hard-coded expectation.
function pipeline(inputA, inputB) {
  const comparison = compareTasteProfiles(snapshot("user-a", inputA), snapshot("user-b", inputB));
  const confidence = calculateEvidenceConfidence(comparison);
  const coldStart = assessColdStart(comparison, confidence);
  return { comparison, confidence, coldStart, adapted: adaptSharedTasteComparison(comparison, confidence, coldStart) };
}

const richPair = (user, values = {}) => ({
  preferences: [
    cuisine(user, values.cuisine ?? "japanese"), flavor(user, values.flavor ?? "coriander"), spice(user, values.spice ?? "medium"),
    mealType(user, "lunch"), diningStyle(user, values.dining ?? "casual"), paymentPreference(user, "split_bill")
  ],
  behavior: [favoriteRestaurant(user, values.restaurant ?? "rest-1"), favoriteMenuItem(user, values.restaurant ?? "rest-1", "item-1")],
  goals: [goalLabel(user, values.goal ?? "fat_loss"), goalScalar(user, "daily_calories_target", user === "a" ? 1400 : 3200)],
  restrictions: [restriction(user, values.restriction ?? "coriander", values.severity ? { rawSeverity: values.severity } : {})]
});

// ============ 1-4. taste projection ==============================================================
{
  const { comparison, adapted } = pipeline(richPair("a"), richPair("b", { dining: "fine_dining" }));
  expect(adapted.status === "adapted", "1 a fully rich pair adapts", adapted.status);
  expect(adapted.taste && adapted.context && adapted.goal && adapted.restriction && adapted.signals && adapted.reasons,
    "1a every component projection is present", Object.keys(adapted));

  expect(adapted.taste.similarity.status === "scored" && adapted.taste.similarity.score === comparison.taste.score,
    "2 a high taste score is preserved EXACTLY from the frozen result", { projected: adapted.taste.similarity.score, frozen: comparison.taste.score });

  const low = pipeline(richPair("a"), richPair("b", { cuisine: "french", flavor: "mushroom", spice: "mild", restaurant: "rest-9", dining: "fine_dining" }));
  expect(low.adapted.taste.similarity.score === low.comparison.taste.score && low.comparison.taste.score < 1,
    "3 a low taste score is preserved EXACTLY", { projected: low.adapted.taste.similarity.score, frozen: low.comparison.taste.score });

  const noTaste = pipeline({ preferences: [mealType("a", "lunch")] }, { preferences: [mealType("b", "lunch")] });
  expect(noTaste.adapted.taste.similarity.status === "not_scored"
    && noTaste.adapted.taste.similarity.reason === noTaste.comparison.taste.reason,
    "4 a not_scored taste state and its frozen reason are preserved exactly", noTaste.adapted.taste.similarity);
  expect(!("score" in noTaste.adapted.taste.similarity), "4a a not_scored projection carries no score key");
}

// ============ 5-10. confidence and evidence state ===============================================
{
  const { confidence, adapted } = pipeline(richPair("a"), richPair("b", { dining: "fine_dining" }));
  expect(adapted.taste.evidenceConfidence.status === "available"
    && adapted.taste.evidenceConfidence.value === confidence.taste.value
    && adapted.taste.evidenceConfidence.basis === confidence.taste.basis,
    "5 an available evidence confidence value and basis are preserved exactly", adapted.taste.evidenceConfidence);

  const noTaste = pipeline({ preferences: [mealType("a", "lunch")] }, { preferences: [mealType("b", "lunch")] });
  expect(noTaste.adapted.taste.evidenceConfidence.status === "not_available"
    && !("value" in noTaste.adapted.taste.evidenceConfidence)
    && noTaste.adapted.taste.evidenceConfidence.reason === noTaste.confidence.taste.reason,
    "6 an unavailable evidence confidence carries no value field", noTaste.adapted.taste.evidenceConfidence);

  expect(adapted.taste.evidenceState === "comparable", "7 a comparable evidence state is preserved", adapted.taste.evidenceState);
  const known = pipeline({}, {});
  expect(known.adapted.taste.evidenceState === "no_comparable_evidence"
    && known.adapted.taste.evidenceState === known.coldStart.tasteEvidence.state,
    "8 no_comparable_evidence is preserved exactly", known.adapted.taste.evidenceState);

  const failedProfile = { taste_profile: { status: "failed", evidenceCount: 1, failureCode: "source_read_failed" } };
  const degraded = pipeline({ sourceOverrides: failedProfile }, { sourceOverrides: failedProfile });
  expect(degraded.adapted.taste.evidenceState === "sources_incomplete"
    && degraded.adapted.taste.evidenceState === degraded.coldStart.tasteEvidence.state,
    "9 sources_incomplete is preserved exactly", degraded.adapted.taste.evidenceState);

  const a = snapshot("user-a", richPair("a"));
  const b = snapshot("user-b", richPair("b"));
  const badBundle = compareTasteProfiles({ ...a, schemaVersion: "taste-profile-snapshot-v99" }, b);
  const badConfidence = calculateEvidenceConfidence(badBundle);
  const badColdStart = assessColdStart(badBundle, badConfidence);
  const unsupported = adaptSharedTasteComparison(badBundle, badConfidence, badColdStart);
  expect(unsupported.status === "unsupported" && unsupported.reason === "unsupported_snapshot_schema",
    "10 a TS-5 unsupported state makes the adapter unsupported", unsupported);
}

// ============ 11-15. context and goal projection =================================================
{
  const { comparison, adapted } = pipeline(richPair("a"), richPair("b", { dining: "fine_dining" }));
  expect(adapted.context.mealPattern.score === comparison.socialContext.mealPatternCompatibility.score,
    "11 mealPattern score is preserved exactly", adapted.context.mealPattern);
  expect(adapted.context.dining.score === comparison.socialContext.diningCompatibility.score,
    "12 dining score is preserved exactly", adapted.context.dining);
  expect(adapted.context.socialLogistics.score === comparison.socialContext.socialLogisticsCompatibility.score,
    "13 socialLogistics score is preserved exactly", adapted.context.socialLogistics);
  expect(adapted.goal.status === "scored" && adapted.goal.score === comparison.goalRestriction.goalCompatibility.score,
    "14 goal score is preserved exactly", adapted.goal);

  const partial = pipeline({ preferences: [cuisine("a", "japanese"), mealType("a", "lunch")] }, { preferences: [cuisine("b", "japanese")] });
  expect(partial.adapted.context.dining.status === "not_scored"
    && partial.adapted.context.dining.reason === partial.comparison.socialContext.diningCompatibility.reason
    && partial.adapted.goal.status === "not_scored"
    && partial.adapted.goal.reason === partial.comparison.goalRestriction.goalCompatibility.reason,
    "15 individual not_scored context and goal states are preserved exactly",
    { dining: partial.adapted.context.dining, goal: partial.adapted.goal });
  expect(!("score" in partial.adapted.context.dining) && !("score" in partial.adapted.goal),
    "15a no not_scored projection carries a score key");
}

// ============ 16-19. restriction projection ======================================================
{
  const compatible = pipeline(richPair("a"), richPair("b", { dining: "fine_dining" }));
  expect(compatible.adapted.restriction.verdict === compatible.comparison.goalRestriction.restrictionEligibility.verdict
    && compatible.adapted.restriction.verdict === "compatible",
    "16 a compatible restriction verdict is preserved exactly", compatible.adapted.restriction.verdict);

  const attention = pipeline(
    richPair("a", { restriction: "peanut", severity: "severe" }),
    richPair("b", { dining: "fine_dining" })
  );
  expect(attention.adapted.restriction.verdict === "needs_attention"
    && attention.adapted.restriction.verdict === attention.comparison.goalRestriction.restrictionEligibility.verdict,
    "17 needs_attention survives the adapter exactly", attention.adapted.restriction.verdict);
  expect(attention.adapted.restriction.unclassifiedPresent === true
    && attention.adapted.restriction.unclassifiedPresent === attention.coldStart.restrictionState.unclassifiedPresent,
    "18 unclassifiedPresent is preserved exactly");
  expect(!Object.keys(attention.adapted.restriction).some((key) => /value|score|confidence|percent|probab|safe/i.test(key)),
    "19 restriction carries no numeric or reassurance field", Object.keys(attention.adapted.restriction));
}

// ============ 20-22. signal families =============================================================
{
  const failedFavorites = { favorites: { status: "failed", evidenceCount: 1, failureCode: "source_read_failed" } };
  const { coldStart, adapted } = pipeline(
    { preferences: [cuisine("a", "japanese")], behavior: [favoriteRestaurant("a", "rest-1")], sourceOverrides: failedFavorites },
    { preferences: [cuisine("b", "japanese")], behavior: [favoriteRestaurant("b", "rest-1")], sourceOverrides: failedFavorites }
  );
  expect(JSON.stringify(adapted.signals.availableFamilies) === JSON.stringify(coldStart.availableSignalFamilies),
    "20 availableFamilies is projected exactly", adapted.signals.availableFamilies);
  expect(JSON.stringify(adapted.signals.incompleteFamilies) === JSON.stringify(coldStart.incompleteSignalFamilies),
    "21 incompleteFamilies is projected exactly", adapted.signals.incompleteFamilies);
  expect(adapted.signals.availableFamilies.includes("taste") && adapted.signals.incompleteFamilies.includes("taste"),
    "22 the overlap between the two lists is preserved");
}

// ============ 23-26. reason channels =============================================================
{
  const { comparison, coldStart, adapted } = pipeline(
    { preferences: [cuisine("a", "japanese")], mealsTruncation: "known_truncated" },
    { preferences: [cuisine("b", "japanese")] }
  );
  expect(JSON.stringify(adapted.reasons.comparison) === JSON.stringify(comparison.explanationReasonCodes),
    "23 comparison reasons are projected exactly and in frozen order", adapted.reasons.comparison);
  expect(JSON.stringify(adapted.reasons.evidence) === JSON.stringify(coldStart.reasonCodes),
    "24 evidence reasons are projected exactly and in frozen order", adapted.reasons.evidence);
  expect(
    Array.isArray(adapted.reasons.comparison) && Array.isArray(adapted.reasons.evidence)
      && !Array.isArray(adapted.reasons),
    "25 the two reason channels remain structurally separate"
  );
  const allCodes = [...adapted.reasons.comparison, ...adapted.reasons.evidence];
  const frozenVocabulary = new Set([...comparison.explanationReasonCodes, ...coldStart.reasonCodes]);
  expect(allCodes.every((code) => frozenVocabulary.has(code)), "26 no reason code exists that a frozen layer did not emit", allCodes);
  expect(!allCodes.some((code) => /match|recommend|good|weak|strong_match|safe_to_eat/i.test(code)),
    "26a no judgement-flavoured reason code appears", allCodes);
}

// ============ 27-31. input coherence and fail-closed =============================================
{
  const comparison = compareTasteProfiles(snapshot("user-a", richPair("a")), snapshot("user-b", richPair("b")));
  const confidence = calculateEvidenceConfidence(comparison);
  const coldStart = assessColdStart(comparison, confidence);

  const badConfidence = adaptSharedTasteComparison(comparison,
    { ...confidence, versions: { ...confidence.versions, tastePolicyVersion: "taste-similarity-v9" } }, coldStart);
  expect(badConfidence.status === "unsupported" && badConfidence.reason === "policy_version_mismatch",
    "27 a comparison/confidence version mismatch fails closed", badConfidence);

  const badColdStart = adaptSharedTasteComparison(comparison, confidence,
    { ...coldStart, versions: { ...coldStart.versions, comparisonBundleVersion: "taste-comparison-bundle-v9" } });
  expect(badColdStart.status === "unsupported" && badColdStart.reason === "policy_version_mismatch",
    "28 a comparison/coldStart version mismatch fails closed", badColdStart);

  const badPair = adaptSharedTasteComparison(comparison,
    { ...confidence, versions: { ...confidence.versions, evidenceConfidencePolicyVersion: "evidence-confidence-v9" } }, coldStart);
  expect(badPair.status === "unsupported" && badPair.reason === "policy_version_mismatch",
    "29 a confidence/coldStart version mismatch fails closed", badPair);

  const a = snapshot("user-a", richPair("a"));
  const badBundle = compareTasteProfiles({ ...a, schemaVersion: "taste-profile-snapshot-v99" }, snapshot("user-b", richPair("b")));
  const badBundleConfidence = calculateEvidenceConfidence(badBundle);
  const unsupported = adaptSharedTasteComparison(badBundle, badBundleConfidence, assessColdStart(badBundle, badBundleConfidence));
  expect(unsupported.status === "unsupported" && unsupported.reason === "unsupported_snapshot_schema",
    "30 an unsupported snapshot schema fails closed");
  expect(
    !("taste" in unsupported) && !("context" in unsupported) && !("goal" in unsupported)
      && !("restriction" in unsupported) && !("signals" in unsupported) && !("reasons" in unsupported),
    "31 an unsupported result carries NO usable component data at all",
    Object.keys(unsupported)
  );
}

// ============ 32-39. contract, privacy and encapsulation =========================================
{
  const { adapted } = pipeline(richPair("a"), richPair("b", { dining: "fine_dining" }));
  const keys = Object.keys(adapted);
  expect(!keys.some((key) => /overall|aggregate|combined|matchScore|rankScore|compatibilityScore|suitab|recommend/i.test(key)),
    "32 no aggregate or recommendation score field exists", keys);
  expect(!JSON.stringify(adapted).match(/"overallConfidence"|"globalConfidence"/), "33 no global confidence field exists");
  expect(!keys.some((key) => /\bready\b|proceed|canMatch|eligible/i.test(key)), "34 no readiness or proceed field exists", keys);
  expect(!keys.some((key) => /rank|gate|topN|threshold|weight|boost|penalt|priorit/i.test(key)), "35 no ranking or gating field exists", keys);

  const serialized = JSON.stringify(adapted);
  expect(!/japanese|coriander|medium|casual|fine_dining|split_bill|lunch|fat_loss|peanut|rest-1|item-1/.test(serialized),
    "36 no raw evidence value appears in the serialized result");
  expect(!/user-a|user-b|tp:|fav:|goal:|restr:|1400|3200|daily_calories_target/.test(serialized),
    "37 no user id, evidence id or macro target appears in the serialized result");
  expect(!/confidenceInputs|evidenceCoverage|sourceAvailability|historyCompleteness|dimensionAvailability|comparableDimensions|overlaps|sharedAvoidances|unknowns/.test(serialized),
    "38 no internal foundation metadata is exposed");
  expect(!keys.includes("comparison") && !keys.includes("confidence") && !keys.includes("coldStart")
    && !/"policyVersion"|"snapshotSchemaVersion":\s*"taste-profile-snapshot-v1",\s*"status"/.test(serialized),
    "39 no upstream bundle is embedded verbatim", keys);
}

// ============ 40-45. immutability, determinism and independence ==================================
{
  const { comparison, coldStart, adapted } = pipeline(richPair("a"), richPair("b", { dining: "fine_dining" }));
  const upstreamFamilies = [...coldStart.availableSignalFamilies];
  const upstreamReasons = [...comparison.explanationReasonCodes];
  let mutationRejected = false;
  try {
    adapted.signals.availableFamilies.push("taste");
    adapted.reasons.comparison.push("shared_cuisine_preference");
  } catch {
    mutationRejected = true;
  }
  expect(
    mutationRejected || (JSON.stringify(coldStart.availableSignalFamilies) === JSON.stringify(upstreamFamilies)
      && JSON.stringify(comparison.explanationReasonCodes) === JSON.stringify(upstreamReasons)),
    "40 mutating the adapter output cannot reach back into the upstream bundles"
  );

  const first = pipeline(richPair("a"), richPair("b", { dining: "fine_dining" }));
  const second = pipeline(richPair("a"), richPair("b", { dining: "fine_dining" }));
  expect(JSON.stringify(first.adapted) === JSON.stringify(second.adapted), "41 repeated execution is byte-identical");

  const highScore = pipeline(richPair("a"), richPair("b", { dining: "fine_dining" }));
  const lowScore = pipeline(richPair("a"), richPair("b", { cuisine: "french", dining: "fine_dining" }));
  expect(
    JSON.stringify(highScore.adapted.taste.evidenceConfidence) === JSON.stringify(lowScore.adapted.taste.evidenceConfidence)
      && highScore.adapted.taste.evidenceState === lowScore.adapted.taste.evidenceState
      && JSON.stringify(highScore.adapted.restriction) === JSON.stringify(lowScore.adapted.restriction),
    "42 changing a similarity score leaves confidence, evidence state and restriction untouched",
    { high: highScore.adapted.taste.similarity.score, low: lowScore.adapted.taste.similarity.score }
  );

  const baseComparison = highScore.comparison;
  const baseConfidence = highScore.confidence;
  const baseColdStart = highScore.coldStart;
  const shiftedConfidence = adaptSharedTasteComparison(baseComparison,
    { ...baseConfidence, taste: { ...baseConfidence.taste, value: 0.123456 } }, baseColdStart);
  expect(JSON.stringify(shiftedConfidence.taste.similarity) === JSON.stringify(highScore.adapted.taste.similarity)
    && shiftedConfidence.taste.evidenceConfidence.value === 0.123456,
    "43 changing the confidence value leaves the similarity projection untouched and is copied exactly",
    shiftedConfidence.taste);

  const shiftedState = adaptSharedTasteComparison(baseComparison, baseConfidence,
    { ...baseColdStart, tasteEvidence: { state: "sources_incomplete" } });
  expect(JSON.stringify(shiftedState.taste.similarity) === JSON.stringify(highScore.adapted.taste.similarity)
    && JSON.stringify(shiftedState.context) === JSON.stringify(highScore.adapted.context)
    && shiftedState.taste.evidenceState === "sources_incomplete",
    "44 changing the cold-start state modifies no score");

  const attention = pipeline(richPair("a", { restriction: "peanut", severity: "severe" }), richPair("b", { dining: "fine_dining" }));
  expect(
    attention.adapted.taste.similarity.score === attention.comparison.taste.score
      && attention.adapted.goal.score === attention.comparison.goalRestriction.goalCompatibility.score
      && attention.adapted.restriction.verdict === "needs_attention",
    "45 a needs_attention verdict is projected as a fact and modifies no score",
    { taste: attention.adapted.taste.similarity.score, verdict: attention.adapted.restriction.verdict }
  );

  expect(adapted.versions.sharedAdapterPolicyVersion === "shared-taste-adapter-v1"
    && adapted.versions.coldStartPolicyVersion === "cold-start-policy-v1"
    && adapted.versions.evidenceConfidencePolicyVersion === "evidence-confidence-v1"
    && adapted.versions.comparisonBundleVersion === "taste-comparison-bundle-v1"
    && adapted.versions.tastePolicyVersion === "taste-similarity-v1.1"
    && adapted.versions.socialContextPolicyVersion === "social-context-compatibility-v1"
    && adapted.versions.goalRestrictionPolicyVersion === "goal-restriction-compatibility-v1"
    && adapted.versions.snapshotSchemaVersion === "taste-profile-snapshot-v1",
    "45a all eight authority versions are pinned", adapted.versions);
}

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  smoke: "taste-similarity-ts6",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  sharedAdapterPolicyVersion: SHARED_TASTE_ADAPTER_POLICY_VERSION,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);
