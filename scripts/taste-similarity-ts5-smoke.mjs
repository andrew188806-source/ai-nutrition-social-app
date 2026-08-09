#!/usr/bin/env node
// TS-5 contract smoke — COLD START EVIDENCE POLICY V1.
//
// Executes the REAL shared domain: snapshots are built with the frozen composeTasteProfileSnapshot,
// bundled by the frozen compareTasteProfiles, scored by the frozen calculateEvidenceConfidence, and
// assessed by the real TS-5 policy. Nothing is re-implemented here.
//
// Scenario 5 is the load-bearing invariant: identical evidence structure with opposite similarity
// must produce a byte-identical assessment.
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
  assessColdStart,
  calculateEvidenceConfidence,
  compareTasteProfiles,
  composeTasteProfileSnapshot,
  COLD_START_POLICY_VERSION
} = domain;

expect(typeof assessColdStart === "function", "S0 the REAL cold start assessor loads");
expect(typeof calculateEvidenceConfidence === "function" && typeof compareTasteProfiles === "function",
  "S0 the REAL frozen bundle and confidence producers load");

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
const restriction = (user, label, { rawSeverity = "preference" } = {}) => ({
  category: "restriction", restrictionType: "avoidance", label, rawSeverity, visibility: "private",
  evidence: envelope(`restr:${user}:${label}`, "dietary_restriction", "dietary_restriction", "user_explicit", "not_eligible")
});

const counted = (count) => (count > 0 ? { status: "available", evidenceCount: count } : { status: "empty", evidenceCount: 0 });
const snapshot = (userId, {
  preferences = [], behavior = [], goals = [], restrictions = [],
  mealsTruncation = "not_truncated", favoritesTruncation = "not_truncated", ratingsTruncation = "not_truncated",
  sourceOverrides = {}
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
      ratings: counted(0),
      ...sourceOverrides
    },
    generatedAt: "2026-08-08T12:00:00.000Z",
    evidenceWindow: {
      historyScope: "bounded",
      meals: { requestedStartDate: "2026-07-01", requestedEndDate: "2026-08-08", requestedLimit: 50, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: mealsTruncation },
      favorites: { requestedLimit: 25, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: favoritesTruncation },
      ratings: { requestedLimit: null, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: ratingsTruncation }
    }
  });

const assess = (inputA, inputB) => {
  const bundle = compareTasteProfiles(snapshot("user-a", inputA), snapshot("user-b", inputB));
  return assessColdStart(bundle, calculateEvidenceConfidence(bundle));
};

const fiveFamilies = (user, values = {}) => ({
  preferences: [cuisine(user, values.cuisine ?? "japanese"), flavor(user, values.flavor ?? "coriander"), spice(user, values.spice ?? "medium")],
  behavior: [favoriteRestaurant(user, values.restaurant ?? "rest-1"), favoriteMenuItem(user, values.restaurant ?? "rest-1", "item-1")]
});
const oneCuisine = (user, value = "japanese") => ({ preferences: [cuisine(user, value)] });
const failedFavorites = { favorites: { status: "failed", evidenceCount: 1, failureCode: "source_read_failed" } };
const failedTasteProfile = { taste_profile: { status: "failed", evidenceCount: 1, failureCode: "source_read_failed" } };
const deferredMeals = { meals: { status: "deferred", evidenceCount: 0, reason: "acl_activation_pending" } };

// ============ 1-5. core classification and score independence ===================================
{
  const bothEmpty = assess({}, {});
  expect(bothEmpty.tasteEvidence.state === "no_comparable_evidence", "1 both empty with reachable sources is a KNOWN absence", bothEmpty.tasteEvidence);
  expect(!("value" in bothEmpty.tasteEvidence) && !("basis" in bothEmpty.tasteEvidence), "1a a non-comparable state exposes neither value nor basis");

  const sparseVsRich = assess(fiveFamilies("a"), oneCuisine("b"));
  expect(sparseVsRich.tasteEvidence.state === "comparable", "2 a sparse counterpart still yields a comparable state");
  expect(sparseVsRich.tasteEvidence.basis === "limited_evidence_coverage", "2a the inherited basis reports limited coverage", sparseVsRich.tasteEvidence.basis);
  expect(sparseVsRich.reasonCodes.includes("limited_taste_evidence"), "2b limited coverage is reported as a reason code");

  const oneFamily = assess(oneCuisine("a"), oneCuisine("b"));
  expect(oneFamily.tasteEvidence.state === "comparable" && oneFamily.tasteEvidence.value === 0.6,
    "3 one cuisine with all sources complete carries the frozen 0.6 through untouched", oneFamily.tasteEvidence.value);
  expect(
    !("ready" in oneFamily) && !("isColdStart" in oneFamily) && !("proceedNormally" in oneFamily),
    "3a 0.6 implies no readiness verdict, because no readiness field exists",
    Object.keys(oneFamily)
  );

  const rich = assess(fiveFamilies("a"), fiveFamilies("b"));
  expect(
    rich.tasteEvidence.state === "comparable" && oneFamily.tasteEvidence.state === "comparable" &&
      rich.tasteEvidence.value !== oneFamily.tasteEvidence.value,
    "4 classification stays structural while the informational value differs",
    { rich: rich.tasteEvidence.value, sparse: oneFamily.tasteEvidence.value }
  );

  const agreeing = assess(fiveFamilies("a"), fiveFamilies("b"));
  const disagreeing = assess(
    fiveFamilies("a", { spice: "mild" }),
    fiveFamilies("b", { cuisine: "french", flavor: "mushroom", spice: "mild", restaurant: "rest-9" })
  );
  const agreeingBundle = compareTasteProfiles(snapshot("user-a", fiveFamilies("a")), snapshot("user-b", fiveFamilies("b")));
  const disagreeingBundle = compareTasteProfiles(
    snapshot("user-a", fiveFamilies("a", { spice: "mild" })),
    snapshot("user-b", fiveFamilies("b", { cuisine: "french", flavor: "mushroom", spice: "mild", restaurant: "rest-9" }))
  );
  expect(agreeingBundle.taste.score === 1 && disagreeingBundle.taste.score < 1, "5 the two fixtures genuinely differ in similarity",
    { agreeing: agreeingBundle.taste.score, disagreeing: disagreeingBundle.taste.score });
  expect(JSON.stringify(agreeing) === JSON.stringify(disagreeing),
    "5a identical evidence structure with opposite similarity produces a BYTE-IDENTICAL assessment");
}

// ============ 6-7. comparable coexisting with incompleteness ====================================
{
  const favoritesFailed = assess(
    { ...oneCuisine("a"), behavior: [favoriteRestaurant("a", "rest-1")], sourceOverrides: failedFavorites },
    { ...oneCuisine("b"), behavior: [favoriteRestaurant("b", "rest-1")], sourceOverrides: failedFavorites }
  );
  expect(favoritesFailed.tasteEvidence.state === "comparable", "6 a scored taste result stays comparable despite a failed source", favoritesFailed.tasteEvidence.state);
  expect(favoritesFailed.availableSignalFamilies.includes("taste") && favoritesFailed.incompleteSignalFamilies.includes("taste"),
    "6a taste appears in BOTH lists — availability and incompleteness are independent facts",
    { available: favoritesFailed.availableSignalFamilies, incomplete: favoritesFailed.incompleteSignalFamilies });
  expect(favoritesFailed.reasonCodes.includes("incomplete_taste_sources"), "6b the degraded source is reported as a reason code");

  const mealsTruncated = assess(
    { ...oneCuisine("a"), mealsTruncation: "known_truncated" },
    oneCuisine("b")
  );
  expect(mealsTruncated.tasteEvidence.state === "comparable", "7 truncated history does not downgrade a scored taste result");
  expect(mealsTruncated.incompleteSignalFamilies.includes("taste") && mealsTruncated.reasonCodes.includes("incomplete_history"),
    "7a truncation is reported through the incomplete family list and its own reason code", mealsTruncated.reasonCodes);
}

// ============ 8-12. unavailable, degraded, unsupported ==========================================
{
  const preferenceFailed = assess({ sourceOverrides: failedTasteProfile }, { sourceOverrides: failedTasteProfile });
  expect(preferenceFailed.tasteEvidence.state === "sources_incomplete", "8 taste unavailable with a FAILED source is sources_incomplete", preferenceFailed.tasteEvidence.state);
  expect(preferenceFailed.reasonCodes.includes("incomplete_taste_sources"), "8a the unknown is reported, not an absence");

  const preferenceEmpty = assess({}, {});
  expect(preferenceEmpty.tasteEvidence.state === "no_comparable_evidence", "9 taste unavailable with an EMPTY source is a known absence");
  expect(preferenceEmpty.reasonCodes.includes("no_comparable_taste_evidence"), "9a known absence gets its own reason code");
  expect(preferenceFailed.tasteEvidence.state !== preferenceEmpty.tasteEvidence.state, "9b failed and empty are never the same classification");

  const deferred = assess({ sourceOverrides: deferredMeals }, { sourceOverrides: deferredMeals });
  expect(deferred.tasteEvidence.state === "sources_incomplete", "10 a deferred source leaves taste unavailable as sources_incomplete", deferred.tasteEvidence.state);

  const a = snapshot("user-a", fiveFamilies("a"));
  const b = snapshot("user-b", fiveFamilies("b"));
  const unsupportedBundle = compareTasteProfiles({ ...a, schemaVersion: "taste-profile-snapshot-v99" }, b);
  const unsupported = assessColdStart(unsupportedBundle, calculateEvidenceConfidence(unsupportedBundle));
  expect(unsupported.tasteEvidence.state === "unsupported", "11 an unsupported snapshot schema is its own state, not cold start", unsupported.tasteEvidence.state);
  expect(unsupported.reasonCodes.length === 1 && unsupported.reasonCodes[0] === "unsupported_schema", "11a unsupported reports exactly one reason code", unsupported.reasonCodes);
  expect(unsupported.availableSignalFamilies.length === 0 && unsupported.incompleteSignalFamilies.length === 0, "11b no partial family assessment survives an unsupported contract");

  const goodBundle = compareTasteProfiles(a, b);
  const goodConfidence = calculateEvidenceConfidence(goodBundle);
  const mismatched = assessColdStart(goodBundle, {
    ...goodConfidence,
    versions: { ...goodConfidence.versions, tastePolicyVersion: "taste-similarity-v9" }
  });
  expect(mismatched.tasteEvidence.state === "unsupported", "12 mismatched bundle versions fail closed to unsupported", mismatched.tasteEvidence.state);
  expect(mismatched.reasonCodes.includes("unsupported_schema"), "12a the version mismatch is reported, never partially assessed");
}

// ============ 13-17. other families and restriction preservation ================================
{
  const contextOnly = assess(
    { preferences: [mealType("a", "lunch"), diningStyle("a", "casual"), paymentPreference("a", "split_bill")] },
    { preferences: [mealType("b", "lunch"), diningStyle("b", "fine_dining"), paymentPreference("b", "split_bill")] }
  );
  expect(contextOnly.tasteEvidence.state === "no_comparable_evidence", "13 full context without taste leaves taste unavailable");
  expect(
    contextOnly.availableSignalFamilies.includes("meal_pattern") && contextOnly.availableSignalFamilies.includes("dining") &&
      contextOnly.availableSignalFamilies.includes("social_logistics") && !contextOnly.availableSignalFamilies.includes("taste"),
    "13a the context families are reported as available and taste is not",
    contextOnly.availableSignalFamilies
  );
  expect(contextOnly.reasonCodes.includes("context_only_evidence"), "13b context-only is described, never substituted");
  expect(!JSON.stringify(contextOnly).includes("score") && !("fallbackScore" in contextOnly), "13c no substitute score is produced");

  const goalOnly = assess({ goals: [goalLabel("a", "fat_loss")] }, { goals: [goalLabel("b", "fat_loss")] });
  expect(goalOnly.availableSignalFamilies.includes("goal") && !goalOnly.availableSignalFamilies.includes("taste"),
    "14 goal-only evidence reports goal as available", goalOnly.availableSignalFamilies);
  expect(goalOnly.reasonCodes.includes("goal_only_evidence") && !goalOnly.reasonCodes.includes("context_only_evidence"),
    "14a goal-only is described distinctly and never substituted for taste", goalOnly.reasonCodes);

  const restrictionOnly = assess(
    { restrictions: [restriction("a", "coriander")] },
    { restrictions: [restriction("b", "coriander")] }
  );
  expect(restrictionOnly.restrictionState.verdict === "compatible" && restrictionOnly.restrictionState.evidencePresentForBoth,
    "15 a restriction-only pair preserves the frozen restriction state", restrictionOnly.restrictionState);
  expect(restrictionOnly.reasonCodes.includes("no_comparable_evidence"),
    "15a a restriction verdict never silences 'nothing comparable' — restriction is not a comparison", restrictionOnly.reasonCodes);

  const needsAttention = assess(
    { ...oneCuisine("a"), restrictions: [restriction("a", "peanut", { rawSeverity: "severe" })] },
    { ...oneCuisine("b"), restrictions: [restriction("b", "coriander")] }
  );
  const directBundle = compareTasteProfiles(
    snapshot("user-a", { ...oneCuisine("a"), restrictions: [restriction("a", "peanut", { rawSeverity: "severe" })] }),
    snapshot("user-b", { ...oneCuisine("b"), restrictions: [restriction("b", "coriander")] })
  );
  expect(needsAttention.restrictionState.verdict === "needs_attention"
    && needsAttention.restrictionState.verdict === directBundle.goalRestriction.restrictionEligibility.verdict,
    "16 needs_attention is carried through EXACTLY as the frozen layer produced it", needsAttention.restrictionState.verdict);
  expect(needsAttention.restrictionState.unclassifiedPresent === true, "17 the unclassified flag is preserved exactly");
  expect(!Object.keys(needsAttention.restrictionState).some((key) => /value|score|confidence|percent|safe/i.test(key)),
    "17a restriction state carries no numeric or reassurance field", Object.keys(needsAttention.restrictionState));
  expect(!needsAttention.reasonCodes.some((code) => /restrict/i.test(code)),
    "17b restriction never enters the generic evidence-readiness vocabulary", needsAttention.reasonCodes);
}

// ============ 18-20. truncation relevance =======================================================
{
  const control = assess(oneCuisine("a"), oneCuisine("b"));

  const favoritesTruncated = assess({ ...oneCuisine("a"), favoritesTruncation: "known_truncated" }, oneCuisine("b"));
  expect(favoritesTruncated.incompleteSignalFamilies.includes("taste") && favoritesTruncated.reasonCodes.includes("incomplete_history"),
    "18 favorites truncation is a relevant incompleteness", favoritesTruncated.reasonCodes);

  const mealsTruncated = assess({ ...oneCuisine("a"), mealsTruncation: "possibly_truncated" }, oneCuisine("b"));
  expect(mealsTruncated.incompleteSignalFamilies.includes("taste") && mealsTruncated.reasonCodes.includes("incomplete_history"),
    "19 meals truncation is a relevant incompleteness");
  expect(mealsTruncated.tasteEvidence.state === "comparable" && favoritesTruncated.tasteEvidence.state === "comparable",
    "19a neither truncation is mistaken for a new user");

  const ratingsTruncated = assess(
    { ...oneCuisine("a"), ratingsTruncation: "known_truncated" },
    { ...oneCuisine("b"), ratingsTruncation: "possibly_truncated" }
  );
  expect(JSON.stringify(ratingsTruncated) === JSON.stringify(control), "20 ratings truncation has ZERO effect on the assessment");
}

// ============ 21-25. determinism of lists and codes =============================================
{
  const mixed = assess(
    { ...fiveFamilies("a"), goals: [goalLabel("a", "fat_loss")], restrictions: [restriction("a", "coriander")], mealsTruncation: "known_truncated" },
    { ...fiveFamilies("b"), goals: [goalLabel("b", "fat_loss")], restrictions: [restriction("b", "coriander")] }
  );
  const repeated = assess(
    { ...fiveFamilies("a"), goals: [goalLabel("a", "fat_loss")], restrictions: [restriction("a", "coriander")], mealsTruncation: "known_truncated" },
    { ...fiveFamilies("b"), goals: [goalLabel("b", "fat_loss")], restrictions: [restriction("b", "coriander")] }
  );
  expect(JSON.stringify(mixed.availableSignalFamilies) === JSON.stringify(repeated.availableSignalFamilies),
    "21 availableSignalFamilies is deterministic", mixed.availableSignalFamilies);
  expect(JSON.stringify(mixed.incompleteSignalFamilies) === JSON.stringify(repeated.incompleteSignalFamilies),
    "22 incompleteSignalFamilies is deterministic", mixed.incompleteSignalFamilies);
  expect(mixed.availableSignalFamilies.includes("taste") && mixed.incompleteSignalFamilies.includes("taste"),
    "23 a family may legitimately appear in both lists at once");

  const codeOrder = mixed.reasonCodes;
  const declaration = ["no_comparable_taste_evidence", "limited_taste_evidence", "incomplete_taste_sources", "incomplete_history",
    "context_only_evidence", "goal_only_evidence", "no_comparable_evidence", "unsupported_schema"];
  const ranks = codeOrder.map((code) => declaration.indexOf(code));
  expect(ranks.every((rankValue, index) => index === 0 || ranks[index - 1] < rankValue),
    "24 reason codes follow the fixed declaration order", codeOrder);
  expect(new Set(codeOrder).size === codeOrder.length, "25 reason codes contain no duplicates", codeOrder);
}

// ============ 26-33. contract invariants ========================================================
{
  const cases = [
    assess(fiveFamilies("a"), fiveFamilies("b")),
    assess(oneCuisine("a"), oneCuisine("b")),
    assess({}, {}),
    assess({ sourceOverrides: failedTasteProfile }, { sourceOverrides: failedTasteProfile })
  ];
  const keys = Object.keys(cases[0]);
  expect(!keys.some((key) => /isColdStart|coldStart/i.test(key)), "26 no isColdStart boolean exists", keys);
  expect(!keys.some((key) => /\bready\b|proceed|canMatch|gating|threshold/i.test(key)), "27 no readiness or proceed verdict exists", keys);
  expect(!keys.some((key) => /overall|aggregate|matchScore|rankScore|combined/i.test(key)), "28 no aggregate or match score exists", keys);
  expect(
    !JSON.stringify(cases[0]).match(/sparseSubjectCount|userAIsSparse|userBIsSparse|newUser|profileCompletenessByUser/),
    "29 no user-level sparsity inference exists"
  );

  const bundle = compareTasteProfiles(snapshot("user-a", oneCuisine("a")), snapshot("user-b", oneCuisine("b")));
  const confidence = calculateEvidenceConfidence(bundle);
  const raised = assessColdStart(bundle, {
    ...confidence,
    taste: { ...confidence.taste, value: 0.99 }
  });
  const lowered = assessColdStart(bundle, {
    ...confidence,
    taste: { ...confidence.taste, value: 0.01 }
  });
  expect(
    raised.tasteEvidence.state === lowered.tasteEvidence.state &&
      JSON.stringify(raised.reasonCodes) === JSON.stringify(lowered.reasonCodes) &&
      JSON.stringify(raised.availableSignalFamilies) === JSON.stringify(lowered.availableSignalFamilies),
    "30-31 moving the numeric value alone never switches the categorical classification",
    { raised: raised.tasteEvidence, lowered: lowered.tasteEvidence }
  );

  const serialized = JSON.stringify(cases[0]);
  expect(!/japanese|coriander|medium|rest-1|item-1|fat_loss|peanut|split_bill|casual|lunch/.test(serialized), "32 no raw evidence value appears in the assessment");
  expect(!/user-a|user-b|tp:|fav:|goal:|restr:/.test(serialized), "32a no user id or evidence id appears in the assessment");
  expect(!/2026-0[78]/.test(serialized), "32b no timestamp appears in the assessment");

  expect(JSON.stringify(assessColdStart(bundle, confidence)) === JSON.stringify(assessColdStart(bundle, confidence)),
    "33 repeated execution over the same inputs is byte-identical");
  expect(cases[0].versions.coldStartPolicyVersion === "cold-start-policy-v1"
    && cases[0].versions.evidenceConfidencePolicyVersion === "evidence-confidence-v1"
    && cases[0].versions.comparisonBundleVersion === "taste-comparison-bundle-v1"
    && cases[0].versions.tastePolicyVersion === "taste-similarity-v1.1"
    && cases[0].versions.socialContextPolicyVersion === "social-context-compatibility-v1"
    && cases[0].versions.goalRestrictionPolicyVersion === "goal-restriction-compatibility-v1"
    && cases[0].versions.snapshotSchemaVersion === "taste-profile-snapshot-v1",
    "33a all seven authority versions are pinned", cases[0].versions);
}

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  smoke: "taste-similarity-ts5",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  coldStartPolicyVersion: COLD_START_POLICY_VERSION,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);
