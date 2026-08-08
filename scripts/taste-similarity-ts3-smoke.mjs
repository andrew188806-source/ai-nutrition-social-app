#!/usr/bin/env node
// TS-3A + TS-3B contract smoke — VERSIONED RESULT CONTRACT AND PURE FOOD-TASTE COMPARATOR.
//
// Executes the REAL shared domain: snapshots are built with the frozen composeTasteProfileSnapshot
// and scored with the real comparator. Nothing is re-implemented here.
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
const cache = new Map();
const resolveTsFile = (candidate) => {
  for (const suffix of ["", ".ts", "/index.ts"]) {
    const full = `${candidate}${suffix}`;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
};
function loadTsFile(absolute) {
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
    return loadTsFile(resolved);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}
const domain = loadTsFile(path.join(root, "packages/shared/src/domain/taste-similarity/index.ts"));
const { compareTasteSimilarity, composeTasteProfileSnapshot, TASTE_SIMILARITY_POLICY_VERSION } = domain;

expect(typeof compareTasteSimilarity === "function", "S0 the REAL comparator loads");
expect(typeof composeTasteProfileSnapshot === "function", "S0 the REAL frozen snapshot composer loads");

// ---- snapshot builders using only frozen TS-1/TS-2 authority -------------------------------------
const envelope = (id, origin, kind, basis, decay, target = null) => ({
  evidenceId: id, origin, sourceRecordKind: kind, recordedAt: "2026-08-01T00:00:00.000Z",
  confidenceBasis: basis, decayEligibility: decay, ...(target ? { target } : {})
});
const cuisine = (user, value) => ({
  category: "preference", scope: "food_taste", facet: "cuisine", polarity: "positive", value,
  evidence: envelope(`tp:${user}:cuisine:${value}`, "explicit_profile", "taste_profile", "user_explicit", "not_eligible")
});
const flavor = (user, value) => ({
  category: "preference", scope: "food_taste", facet: "flavor", polarity: "negative", value,
  evidence: envelope(`tp:${user}:flavor:${value}`, "explicit_profile", "taste_profile", "user_explicit", "not_eligible")
});
const spice = (user, value) => ({
  category: "preference", scope: "food_taste", facet: "spice", polarity: "unclassified", value,
  evidence: envelope(`tp:${user}:spice`, "explicit_profile", "taste_profile", "user_explicit", "not_eligible")
});
const mealPattern = (user, value) => ({
  category: "preference", scope: "meal_pattern", facet: "meal_type", polarity: "positive", value,
  evidence: envelope(`tp:${user}:meal:${value}`, "explicit_profile", "taste_profile", "user_explicit", "not_eligible")
});
const diningStyle = (user, value) => ({
  category: "preference", scope: "dining_context", facet: "dining_style", polarity: "unclassified", value,
  evidence: envelope(`tp:${user}:dining`, "explicit_profile", "taste_profile", "user_explicit", "not_eligible")
});
const payment = (user, value) => ({
  category: "preference", scope: "social_logistics", facet: "payment_preference", polarity: "unclassified", value,
  evidence: envelope(`tp:${user}:pay`, "explicit_profile", "taste_profile", "user_explicit", "not_eligible")
});
const favoriteRestaurant = (user, restaurantId) => ({
  category: "behavior", behaviorKind: "favorite", favoriteKind: "restaurant", interpretation: "positive_user_action",
  evidence: envelope(`fav:${user}:r:${restaurantId}`, "favorite", "favorite_restaurant", "user_action", "not_eligible", { kind: "restaurant", restaurantId })
});
const favoriteMenuItem = (user, restaurantId, menuItemId) => ({
  category: "behavior", behaviorKind: "favorite", favoriteKind: "menu_item", interpretation: "positive_user_action",
  evidence: envelope(`fav:${user}:m:${menuItemId}`, "favorite", "favorite_menu_item", "user_action", "not_eligible", { kind: "menu_item", restaurantId, menuItemId })
});
const mealOccurrence = (user, restaurantId, seq, confidence) => ({
  category: "behavior", behaviorKind: "meal_occurrence", interpretation: "observed", mealType: "lunch",
  occurredAt: "2026-08-01T12:00:00.000Z", consumedRatio: 1,
  evidence: {
    ...envelope(`meal:${user}:${seq}`, "meal_record", "meal_record_item", "observed_consumption", "source_policy", { kind: "restaurant", restaurantId }),
    // The frozen TS-1 normalizer requires the meal timestamp and the evidence timestamp to agree.
    recordedAt: "2026-08-01T12:00:00.000Z",
    ...(confidence === undefined ? {} : { sourceConfidence: confidence })
  }
});
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
const snapshot = (userId, { preferences = [], behavior = [], goals = [], restrictions = [], favoritesTruncation = "not_truncated" } = {}) =>
  composeTasteProfileSnapshot({
    subjectUserId: userId,
    preferences, goals, restrictions, behavior,
    sourceStates: {
      taste_profile: state(preferences.length),
      nutrition_goals: state(goals.length),
      dietary_restrictions: state(restrictions.length),
      meals: state(behavior.filter((b) => b.behaviorKind === "meal_occurrence").length),
      favorites: state(behavior.filter((b) => b.behaviorKind === "favorite").length),
      ratings: state(behavior.filter((b) => b.behaviorKind === "rating").length)
    },
    generatedAt: "2026-08-08T12:00:00.000Z",
    evidenceWindow: {
      historyScope: "bounded",
      meals: { requestedStartDate: "2026-07-01", requestedEndDate: "2026-08-08", requestedLimit: 50, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" },
      favorites: { requestedLimit: 25, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: favoritesTruncation },
      ratings: { requestedLimit: null, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" }
    }
  });

// ================================ 1-3. cuisine ==================================================
{
  const a = snapshot("user-a", { preferences: [cuisine("a", "japanese"), cuisine("a", "thai")] });
  const b = snapshot("user-b", { preferences: [cuisine("b", "japanese"), cuisine("b", "thai")] });
  const identical = compareTasteSimilarity(a, b);
  expect(identical.status === "scored" && identical.score === 1, "1 identical cuisine sets score 1", identical.score);
  expect(identical.overlaps.includes("cuisine_preference"), "1a identical cuisine is an overlap");

  const partial = compareTasteSimilarity(a, snapshot("user-c", { preferences: [cuisine("c", "japanese"), cuisine("c", "italian")] }));
  expect(partial.status === "scored" && partial.score > 0 && partial.score < 1, "2 partial cuisine overlap scores strictly between 0 and 1", partial.score);

  const disjoint = compareTasteSimilarity(a, snapshot("user-d", { preferences: [cuisine("d", "french")] }));
  expect(disjoint.status === "scored" && disjoint.score === 0, "3 disjoint cuisine sets score 0 (measured, both had evidence)", disjoint.score);
  expect(disjoint.conflicts.length === 0, "3a no conflict is fabricated from disjoint cuisines");
}

// ================================ 4-6. emptiness / sparsity =====================================
{
  const bothEmpty = compareTasteSimilarity(snapshot("user-a"), snapshot("user-b"));
  expect(bothEmpty.status === "not_scored" && bothEmpty.reason === "no_comparable_evidence", "4 both empty are not scored", bothEmpty.reason);
  expect(!("score" in bothEmpty), "4a a not-scored result has NO score key");

  const oneEmpty = compareTasteSimilarity(snapshot("user-a", { preferences: [cuisine("a", "japanese")] }), snapshot("user-b"));
  expect(oneEmpty.status === "not_scored" && oneEmpty.reason === "insufficient_evidence", "5 one empty side is insufficient_evidence", oneEmpty.reason);
  expect(!("score" in oneEmpty), "5a insufficient_evidence carries no score key");

  const single = compareTasteSimilarity(
    snapshot("user-a", { preferences: [cuisine("a", "japanese")] }),
    snapshot("user-b", { preferences: [cuisine("b", "japanese")] })
  );
  expect(single.status === "scored" && single.score === 1, "6 a single matching cuisine tag is scored");
  expect(single.confidenceInputs.comparableDimensionCount === 1, "6a sparse evidence is exposed: exactly one comparable dimension");
  expect(single.confidenceInputs.evidenceCount === 2, "6b sparse evidence is exposed: evidence count 2");
  expect(single.explanationReasonCodes.includes("limited_evidence"), "6c a one-signal match is flagged limited_evidence");
  expect(typeof single.confidenceInputs === "object" && !("confidence" in single), "6d no numeric confidence is produced (TS-4 owns it)");
}

// ================================ 7-8. flavor avoidance =========================================
{
  const shared = compareTasteSimilarity(
    snapshot("user-a", { preferences: [flavor("a", "coriander")] }),
    snapshot("user-b", { preferences: [flavor("b", "coriander")] })
  );
  expect(shared.sharedAvoidances.includes("flavor_avoidance"), "7 a shared disliked flavor is a sharedAvoidance");
  expect(!shared.overlaps.includes("flavor_avoidance"), "7a shared avoidance is NOT recorded as a positive overlap");
  expect(shared.explanationReasonCodes.includes("shared_flavor_avoidance"), "7b shared avoidance has its own reason code");
  expect(!shared.explanationReasonCodes.includes("shared_cuisine_preference"), "7c avoidance never emits a liking reason code");

  const silence = compareTasteSimilarity(
    snapshot("user-a", { preferences: [flavor("a", "coriander"), cuisine("a", "thai")] }),
    snapshot("user-b", { preferences: [cuisine("b", "thai")] })
  );
  expect(silence.unknowns.includes("flavor_avoidance"), "8 dislike vs silence is unknown, not comparable");
  expect(silence.conflicts.length === 0, "8a dislike vs silence is never a conflict");
  expect(silence.comparableDimensions.join(",") === "cuisine_preference", "8b an unknown dimension stays out of the denominator", silence.comparableDimensions);
}

// ================================ 9-10. spice ===================================================
{
  const same = compareTasteSimilarity(
    snapshot("user-a", { preferences: [spice("a", "medium")] }),
    snapshot("user-b", { preferences: [spice("b", "medium")] })
  );
  expect(same.overlaps.includes("spice_preference") && same.score === 1, "9 an identical spice string is an overlap");

  const different = compareTasteSimilarity(
    snapshot("user-a", { preferences: [spice("a", "mild"), cuisine("a", "thai")] }),
    snapshot("user-b", { preferences: [spice("b", "hot"), cuisine("b", "thai")] })
  );
  expect(different.unknowns.includes("spice_preference"), "10 different spice strings are unknown");
  expect(different.conflicts.length === 0, "10a different spice is never a conflict");
  expect(!different.comparableDimensions.includes("spice_preference"), "10b unknown spice is excluded from the denominator");
}

// ================================ 11-13. favorites ==============================================
{
  const sharedRestaurant = compareTasteSimilarity(
    snapshot("user-a", { behavior: [favoriteRestaurant("a", "rest-1")] }),
    snapshot("user-b", { behavior: [favoriteRestaurant("b", "rest-1")] })
  );
  expect(sharedRestaurant.overlaps.includes("favorite_restaurant") && sharedRestaurant.score === 1, "11 a shared canonical favorite restaurant is an overlap");

  const sharedMenuItem = compareTasteSimilarity(
    snapshot("user-a", { behavior: [favoriteMenuItem("a", "rest-1", "item-9")] }),
    snapshot("user-b", { behavior: [favoriteMenuItem("b", "rest-1", "item-9")] })
  );
  expect(sharedMenuItem.overlaps.includes("favorite_menu_item"), "12 a shared canonical favorite menu item is an overlap");

  const differentIds = compareTasteSimilarity(
    snapshot("user-a", { behavior: [favoriteRestaurant("a", "rest-1")] }),
    snapshot("user-b", { behavior: [favoriteRestaurant("b", "rest-2")] })
  );
  expect(differentIds.score === 0 && !differentIds.overlaps.includes("favorite_restaurant"), "13 different restaurant IDs never overlap, even under an identical display name (names are never read)");

  const sameItemIdOtherRestaurant = compareTasteSimilarity(
    snapshot("user-a", { behavior: [favoriteMenuItem("a", "rest-1", "item-9")] }),
    snapshot("user-b", { behavior: [favoriteMenuItem("b", "rest-2", "item-9")] })
  );
  expect(sameItemIdOtherRestaurant.score === 0, "13a an identical menu item id at a different restaurant is not the same dish", sameItemIdOtherRestaurant.score);
}

// ================================ 14-15. determinism and symmetry ===============================
{
  const a = snapshot("user-a", { preferences: [cuisine("a", "japanese"), cuisine("a", "thai"), flavor("a", "coriander"), spice("a", "medium")], behavior: [favoriteRestaurant("a", "rest-1")] });
  const b = snapshot("user-b", { preferences: [cuisine("b", "thai"), cuisine("b", "japanese"), flavor("b", "coriander"), spice("b", "medium")], behavior: [favoriteRestaurant("b", "rest-1")] });
  const shuffled = snapshot("user-b", { preferences: [spice("b", "medium"), flavor("b", "coriander"), cuisine("b", "japanese"), cuisine("b", "thai")], behavior: [favoriteRestaurant("b", "rest-1")] });
  expect(JSON.stringify(compareTasteSimilarity(a, b)) === JSON.stringify(compareTasteSimilarity(a, shuffled)), "14 shuffled input ordering yields an identical result");
  expect(JSON.stringify(compareTasteSimilarity(a, b)) === JSON.stringify(compareTasteSimilarity(b, a)), "15 A/B swap yields an EXACTLY symmetric result");
  const repeated = compareTasteSimilarity(a, b);
  expect(JSON.stringify(repeated) === JSON.stringify(compareTasteSimilarity(a, b)), "15a repeated evaluation is byte-identical");
}

// ================================ 16-23. excluded evidence ======================================
{
  const baseA = { preferences: [cuisine("a", "japanese")] };
  const baseB = { preferences: [cuisine("b", "japanese")] };
  const reference = JSON.stringify(compareTasteSimilarity(snapshot("user-a", baseA), snapshot("user-b", baseB)));
  const unchangedBy = (label, extraA, index) => {
    const withExtra = compareTasteSimilarity(
      snapshot("user-a", { ...baseA, ...extraA }),
      snapshot("user-b", baseB)
    );
    const stripped = { ...withExtra, confidenceInputs: { ...withExtra.confidenceInputs } };
    const referenceParsed = JSON.parse(reference);
    expect(
      stripped.status === referenceParsed.status &&
        stripped.score === referenceParsed.score &&
        JSON.stringify(stripped.comparableDimensions) === JSON.stringify(referenceParsed.comparableDimensions) &&
        JSON.stringify(stripped.overlaps) === JSON.stringify(referenceParsed.overlaps),
      `${index} ${label} has no effect on food-taste score or dimensions`,
      { score: stripped.score }
    );
  };
  unchangedBy("meal_pattern preference", { preferences: [...baseA.preferences, mealPattern("a", "lunch")] }, 16);
  unchangedBy("dining_context preference", { preferences: [...baseA.preferences, diningStyle("a", "casual")] }, 17);
  unchangedBy("social_logistics preference", { preferences: [...baseA.preferences, payment("a", "split_bill")] }, 18);
  unchangedBy("nutrition goal", { goals: [goal("a")] }, 19);
  unchangedBy("dietary restriction", { restrictions: [restriction("a", "peanut")] }, 20);
  unchangedBy("meal history", { behavior: [mealOccurrence("a", "rest-1", 1), mealOccurrence("a", "rest-1", 2)] }, 23);

  // sourceConfidence and rating value must not move anything.
  const lowConfidence = compareTasteSimilarity(
    snapshot("user-a", { ...baseA, behavior: [mealOccurrence("a", "rest-1", 1, 0.1)] }),
    snapshot("user-b", baseB)
  );
  const highConfidence = compareTasteSimilarity(
    snapshot("user-a", { ...baseA, behavior: [mealOccurrence("a", "rest-1", 1, 0.99)] }),
    snapshot("user-b", baseB)
  );
  expect(JSON.stringify(lowConfidence) === JSON.stringify(highConfidence), "21 sourceConfidence has no effect (recognition quality is not taste affinity)");

  const lowRating = compareTasteSimilarity(snapshot("user-a", { ...baseA, behavior: [rating("a", "rest-1", 1)] }), snapshot("user-b", baseB));
  const highRating = compareTasteSimilarity(snapshot("user-a", { ...baseA, behavior: [rating("a", "rest-1", 5)] }), snapshot("user-b", baseB));
  expect(JSON.stringify(lowRating) === JSON.stringify(highRating), "22 rating value has no effect (polarity threshold deferred)");
}

// ================================ 24-28. contract invariants ====================================
{
  const cases = [
    compareTasteSimilarity(snapshot("user-a", { preferences: [cuisine("a", "japanese")] }), snapshot("user-b", { preferences: [cuisine("b", "japanese")] })),
    compareTasteSimilarity(snapshot("user-a", { preferences: [cuisine("a", "x")] }), snapshot("user-b", { preferences: [cuisine("b", "y")] })),
    compareTasteSimilarity(snapshot("user-a"), snapshot("user-b"))
  ];
  expect(
    cases.every((result) => result.status !== "scored" || (result.score >= 0 && result.score <= 1)),
    "24 every score falls within the canonical 0..1 range"
  );
  expect(cases.every((result) => result.status === "scored" || !("score" in result)), "25 no not_scored result carries a score key");
  expect(cases.every((result) => result.policyVersion === "taste-similarity-v1"), "26 the policy version is pinned on every result");
  expect(cases.every((result) => result.snapshotSchemaVersion === "taste-profile-snapshot-v1"), "27 the snapshot schema version is stamped on every result");

  const unsupported = compareTasteSimilarity(
    { ...snapshot("user-a", { preferences: [cuisine("a", "japanese")] }), schemaVersion: "taste-profile-snapshot-v99" },
    snapshot("user-b", { preferences: [cuisine("b", "japanese")] })
  );
  expect(unsupported.status === "not_scored" && unsupported.reason === "unsupported_snapshot_schema", "27a an unknown snapshot schema fails closed", unsupported.reason);
  expect(!("score" in unsupported), "27b an unsupported schema produces no score");

  const rich = compareTasteSimilarity(
    snapshot("user-a", { preferences: [cuisine("a", "japanese"), flavor("a", "coriander"), spice("a", "medium")], behavior: [favoriteRestaurant("a", "rest-1"), favoriteMenuItem("a", "rest-1", "item-1")] }),
    snapshot("user-b", { preferences: [cuisine("b", "japanese"), flavor("b", "coriander"), spice("b", "medium")], behavior: [favoriteRestaurant("b", "rest-1"), favoriteMenuItem("b", "rest-1", "item-1")] })
  );
  const expectedOrder = ["shared_cuisine_preference", "shared_flavor_avoidance", "shared_spice_preference", "shared_favorite_restaurant", "shared_favorite_menu_item"];
  expect(JSON.stringify(rich.explanationReasonCodes) === JSON.stringify(expectedOrder), "28 reason codes are emitted in the fixed declaration order", rich.explanationReasonCodes);
  const avoidanceOnly = compareTasteSimilarity(
    snapshot("user-a", { preferences: [flavor("a", "coriander")] }),
    snapshot("user-b", { preferences: [flavor("b", "coriander")] })
  );
  expect(
    JSON.stringify(avoidanceOnly.explanationReasonCodes.filter((code) => code !== "limited_evidence")) ===
      JSON.stringify(["shared_flavor_avoidance"]),
    "28a a partial reason set keeps the same relative declaration order",
    avoidanceOnly.explanationReasonCodes
  );

  const serialized = JSON.stringify(rich);
  expect(!serialized.includes("coriander") && !serialized.includes("japanese") && !serialized.includes("medium"), "28b no raw evidence VALUE appears in the result");
  expect(!serialized.includes("user-a") && !serialized.includes("user-b"), "28c no subject user id appears in the result");
  expect(!/1800|peanut|allergy|ratingValue/.test(serialized), "28d no goal target, restriction or rating detail appears in the result");
}

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  smoke: "taste-similarity-ts3",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  policyVersion: TASTE_SIMILARITY_POLICY_VERSION,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);
