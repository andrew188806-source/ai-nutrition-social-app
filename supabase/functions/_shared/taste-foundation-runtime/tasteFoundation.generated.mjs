// GENERATED FILE — DO NOT EDIT.
//
// Produced by scripts/build-taste-foundation-runtime.mjs from frozen canonical source.
// This artifact contains no import statement and no external dependency, so it presents no
// module-resolution surface to any ESM runtime. Every rule it executes is written in the frozen
// sources listed in provenance.generated.json and nowhere else; editing this file by hand would
// create a second authority and is detected by the SR-1A guard.
//
// sourceCount: 43
// source: apps/mobile/features/consumer-taste-profile/foundationMappers.ts sha256=04527e751075d18406be5031da6565aa8c030840119cc0033b111eeae904d237
// source: apps/mobile/features/consumer-taste-profile/types.ts sha256=5f39ca55f0298c0c9894460045c22a4af00fff116a4a99be462ac1de7f10b7bd
// source: packages/shared/src/domain/taste-similarity/behavior.ts sha256=bc3bfc7b770e492b79e9ca43516680b3c2d5f152c6ebd5289d0c4b9ddff980bd
// source: packages/shared/src/domain/taste-similarity/cold-start/assess.ts sha256=06301f7f0ee59eb5a30aab2480c8b2cc6495d764b01f0e548db6ce501b3ab99e
// source: packages/shared/src/domain/taste-similarity/cold-start/index.ts sha256=6fdb20df2e619edcb95dbdd2899cd494cecaf5c3bc6fa3e68fdd1be4e6a45479
// source: packages/shared/src/domain/taste-similarity/cold-start/policy.ts sha256=74a7d83098d99994786eec6a5642842d6cd6ec7d8319396367a6e4627c3a9971
// source: packages/shared/src/domain/taste-similarity/cold-start/types.ts sha256=084e4a794e0aac0797e889f43d4f0d66e0cab3e09658ec6485ad03df2d51bb39
// source: packages/shared/src/domain/taste-similarity/comparison/compose.ts sha256=7b44fad895c3eb435baacb495c08e9c1b914ac8088209ef9f2a16f3fc2bd8712
// source: packages/shared/src/domain/taste-similarity/comparison/index.ts sha256=6b38b0dcd00492aa63b1ea2319b383da0c730a82d36dc733f3f69f2bf10defd0
// source: packages/shared/src/domain/taste-similarity/comparison/policy.ts sha256=f0feebde699992e2ae9259a91661cecda8e22725943f0fc1f4d5ffbc54d90420
// source: packages/shared/src/domain/taste-similarity/comparison/types.ts sha256=27d9e585c453063406b3cf66fa5d44025c47036e77a94132ff5422bed5c0303d
// source: packages/shared/src/domain/taste-similarity/compatibility/comparator.ts sha256=881f165945400f44250ec50eab14a598def5f4fbcc867f63f40a136f084d0b70
// source: packages/shared/src/domain/taste-similarity/compatibility/index.ts sha256=a90d0749423586e62e0cbb39e8f47b44529c6cfe8aa6e3ed5ad4824168f407f3
// source: packages/shared/src/domain/taste-similarity/compatibility/policy.ts sha256=9ca7aa95736ca7efb7de85ec9322b8723f5ba896a38d53d89e06d01aace31cad
// source: packages/shared/src/domain/taste-similarity/compatibility/reasonCodes.ts sha256=9f21a65e7aa3f5fc6c0895833651cc681edd1f963e39f48db74144043400905e
// source: packages/shared/src/domain/taste-similarity/compatibility/types.ts sha256=4f61083c9710f8dfa95fdcea5422cb6992212882854b977236880db46f25a54b
// source: packages/shared/src/domain/taste-similarity/confidence/compute.ts sha256=3ae41a941adc0ae948cbfc4a367773230b3793c564dbe3284ad8ba7e82826ef8
// source: packages/shared/src/domain/taste-similarity/confidence/index.ts sha256=ab5f3ea09dd9e38bf136bd75e54f6ba7aea8bdeb45e700ddf45e7c09719dbe67
// source: packages/shared/src/domain/taste-similarity/confidence/policy.ts sha256=da19d18d6d458359b0000d85d096e504d260facf3c88ae565dd205d924e17e80
// source: packages/shared/src/domain/taste-similarity/confidence/types.ts sha256=c80e918869b042506a6319517673176d9d7627763163745469bf8c8438f06475
// source: packages/shared/src/domain/taste-similarity/evidence.ts sha256=7d4e2302b322fcdf7053dc32614afdd5d7e2a622abdc0fd0c7e91b944cdfdc94
// source: packages/shared/src/domain/taste-similarity/evidenceWindow.ts sha256=15db8eb777c9d172d7a1d0d047875702ee35303c6c06a0c4b7e08ec59ca81a97
// source: packages/shared/src/domain/taste-similarity/goal-restriction/comparator.ts sha256=825736dd7c048928b8413af249b3dbabd2fdebf8446b10a77ba67305ef1a0f61
// source: packages/shared/src/domain/taste-similarity/goal-restriction/index.ts sha256=a90d0749423586e62e0cbb39e8f47b44529c6cfe8aa6e3ed5ad4824168f407f3
// source: packages/shared/src/domain/taste-similarity/goal-restriction/policy.ts sha256=be19b6f5feb7d111b3c913ce3afbac5001ca621187852688b207cbc08a836539
// source: packages/shared/src/domain/taste-similarity/goal-restriction/reasonCodes.ts sha256=a00b4874df56747ef8cd8c9cac51fb66b8ab78a2fb76a8e86b0c7b4f2e11f98a
// source: packages/shared/src/domain/taste-similarity/goal-restriction/types.ts sha256=4737b4076fe0d92ea16b4e1faa088964088896cf7c62d9370382e72ad1ff841f
// source: packages/shared/src/domain/taste-similarity/goal.ts sha256=29cc8323ae77b96fc0f282841d787f9b56b787e8e3b60a6b700fbf692eac19cc
// source: packages/shared/src/domain/taste-similarity/index.ts sha256=6b084bfdbfb4a84644c738cea1a8fa5170b3e3251f42094e1fdb187a9abf3c5e
// source: packages/shared/src/domain/taste-similarity/normalization.ts sha256=c0d34619d6803bfda74f6cb76ea43cd17c01c7ab5dcf3be0d79c6d691b7131c2
// source: packages/shared/src/domain/taste-similarity/preference.ts sha256=9152e72269ff8c2a00e43eaaefd4cfd16e959ff3a616e618a7c82a1a7187c825
// source: packages/shared/src/domain/taste-similarity/restriction.ts sha256=9296e63568acd4a8f7e1480ea635dc7d441390c11331222f179d5ce65690a812
// source: packages/shared/src/domain/taste-similarity/shared-adapter/adapt.ts sha256=48205c871f3f560def333bc56930522dbaf4accd4ecc3c49c668a1fbfea9d50f
// source: packages/shared/src/domain/taste-similarity/shared-adapter/index.ts sha256=0d553f4794690e35e7b0684f7565c0252fa934b035b3cf7c50c7e64fe391b0e7
// source: packages/shared/src/domain/taste-similarity/shared-adapter/policy.ts sha256=41ea8f0c3d70fb328977a4006f9f714404ff6c837903a558583fb78b0200f3b8
// source: packages/shared/src/domain/taste-similarity/shared-adapter/types.ts sha256=041286674a9c0800adc0c8675470f286ba9e996552ca16db630bae03501109f6
// source: packages/shared/src/domain/taste-similarity/similarity/comparator.ts sha256=e8f3cf34d28a0fb00befb57dfb741c80f9522c24114e9856363b2fdc77e27cd7
// source: packages/shared/src/domain/taste-similarity/similarity/index.ts sha256=a90d0749423586e62e0cbb39e8f47b44529c6cfe8aa6e3ed5ad4824168f407f3
// source: packages/shared/src/domain/taste-similarity/similarity/policy.ts sha256=e23142ea8c437d468a5fd2e36835146717192321fb6dc7881c4b83104c4c361a
// source: packages/shared/src/domain/taste-similarity/similarity/reasonCodes.ts sha256=cb68b7dbbd46e2821cce031f3a2d59a15535570e2a41574493cf33bf60c4a56f
// source: packages/shared/src/domain/taste-similarity/similarity/types.ts sha256=1a0865263357ecd8a99830d8128823ae21e756495c25564abc7ea35404e621b9
// source: packages/shared/src/domain/taste-similarity/snapshot.ts sha256=627ff3f34d9b6eedbd50d3071620a0511d506d28a67a799f4ecd35e904283b3f
// source: packages/shared/src/domain/taste-similarity/sourceState.ts sha256=97dcde8a8af6ea2a0f7a55d6ccf04474b7e0b79869dd945e05c89b00113c206d

const __registry = new Map();
const __cache = new Map();
function __require(id) {
  if (__cache.has(id)) return __cache.get(id).exports;
  const factory = __registry.get(id);
  if (!factory) throw new Error("taste foundation runtime: unknown module " + id);
  const module = { exports: {} };
  __cache.set(id, module);
  factory(__require, module, module.exports);
  return module.exports;
}

__registry.set("apps/mobile/features/consumer-taste-profile/foundationMappers.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapTasteProfileRow = mapTasteProfileRow;
exports.mapNutritionGoalRows = mapNutritionGoalRows;
exports.mapDietaryRestrictionRows = mapDietaryRestrictionRows;
const taste_similarity_1 = require("../../../../packages/shared/src/domain/taste-similarity");
function mapTasteProfileRow(row, actorKey) {
    assertOwner(row, actorKey);
    const metadata = profileMetadata(row);
    const preferences = [];
    for (const value of (0, taste_similarity_1.normalizeStringSet)(requireStringArray(row.preferred_cuisine_tags))) {
        preferences.push((0, taste_similarity_1.normalizePreferenceEvidence)({
            category: "preference", scope: "food_taste", facet: "cuisine", polarity: "positive", value,
            evidence: { ...metadata, evidenceId: evidenceId(row.id, "cuisine", value) }
        }));
    }
    for (const value of (0, taste_similarity_1.normalizeStringSet)(requireStringArray(row.disliked_tastes))) {
        preferences.push((0, taste_similarity_1.normalizePreferenceEvidence)({
            category: "preference", scope: "food_taste", facet: "flavor", polarity: "negative", value,
            evidence: { ...metadata, evidenceId: evidenceId(row.id, "flavor", value) }
        }));
    }
    for (const value of (0, taste_similarity_1.normalizeStringSet)(requireStringArray(row.preferred_meal_types))) {
        preferences.push((0, taste_similarity_1.normalizePreferenceEvidence)({
            category: "preference", scope: "meal_pattern", facet: "meal_type", polarity: "positive", value,
            evidence: { ...metadata, evidenceId: evidenceId(row.id, "meal_type", value) }
        }));
    }
    if (row.spice_preference !== null)
        preferences.push((0, taste_similarity_1.normalizePreferenceEvidence)({
            category: "preference", scope: "food_taste", facet: "spice", polarity: "unclassified", value: row.spice_preference,
            evidence: { ...metadata, evidenceId: evidenceId(row.id, "spice", row.spice_preference) }
        }));
    if (row.dining_style !== null)
        preferences.push((0, taste_similarity_1.normalizePreferenceEvidence)({
            category: "preference", scope: "dining_context", facet: "dining_style", polarity: "unclassified", value: row.dining_style,
            evidence: { ...metadata, evidenceId: evidenceId(row.id, "dining_style", row.dining_style) }
        }));
    if (row.payment_preference !== null)
        preferences.push((0, taste_similarity_1.normalizePreferenceEvidence)({
            category: "preference", scope: "social_logistics", facet: "payment_preference", polarity: "unclassified", value: row.payment_preference,
            evidence: { ...metadata, evidenceId: evidenceId(row.id, "payment_preference", row.payment_preference) }
        }));
    return preferences;
}
function mapNutritionGoalRows(rows, actorKey, asOfDate) {
    requireDate(asOfDate);
    const output = [];
    for (const row of rows) {
        assertOwner(row, actorKey);
        requireDate(row.starts_on);
        if (row.ends_on !== null)
            requireDate(row.ends_on);
        if (typeof row.is_active !== "boolean")
            throw new Error("Nutrition goal active state is invalid.");
        if (!row.is_active || row.starts_on > asOfDate || (row.ends_on !== null && row.ends_on < asOfDate))
            continue;
        const validity = { startsOn: row.starts_on, ...(row.ends_on === null ? {} : { endsOn: row.ends_on }), isActive: true };
        const metadata = goalMetadata(row);
        output.push((0, taste_similarity_1.normalizeGoalEvidence)({
            category: "goal", facet: "goal_label", value: row.goal_label, validity,
            evidence: { ...metadata, evidenceId: `nutrition-goal:${cleanId(row.id)}:label` }
        }));
        const scalars = [
            ["daily_calories_target", row.daily_calories_target, "kcal"],
            ["protein_target_g", row.protein_target_g, "g"],
            ["carbohydrates_target_g", row.carbohydrates_target_g, "g"],
            ["fat_target_g", row.fat_target_g, "g"],
            ["fiber_target_g", row.fiber_target_g, "g"]
        ];
        for (const [facet, value, unit] of scalars) {
            if (value === null)
                continue;
            if (typeof value !== "number" || !Number.isFinite(value))
                throw new Error("Nutrition goal scalar is invalid.");
            output.push((0, taste_similarity_1.normalizeGoalEvidence)({
                category: "goal", facet, value, unit, validity,
                evidence: { ...metadata, evidenceId: `nutrition-goal:${cleanId(row.id)}:${facet}` }
            }));
        }
    }
    return output;
}
function mapDietaryRestrictionRows(rows, actorKey) {
    return rows.map((row) => {
        assertOwner(row, actorKey);
        return (0, taste_similarity_1.normalizeRestrictionEvidence)({
            category: "restriction",
            restrictionType: row.restriction_type,
            label: row.label,
            rawSeverity: row.severity,
            visibility: row.visibility,
            evidence: {
                evidenceId: `dietary-restriction:${cleanId(row.id)}`,
                origin: "dietary_restriction",
                sourceRecordKind: "dietary_restriction",
                recordedAt: requireTimestamp(row.created_at),
                updatedAt: requireTimestamp(row.updated_at),
                confidenceBasis: "user_explicit",
                decayEligibility: "not_eligible",
                target: null
            }
        });
    });
}
function profileMetadata(row) {
    return {
        origin: "explicit_profile",
        sourceRecordKind: "taste_profile",
        recordedAt: requireTimestamp(row.created_at),
        updatedAt: requireTimestamp(row.updated_at),
        confidenceBasis: "user_explicit",
        decayEligibility: "not_eligible",
        target: null
    };
}
function goalMetadata(row) {
    return {
        origin: "nutrition_goal",
        sourceRecordKind: "nutrition_goal",
        recordedAt: requireTimestamp(row.created_at),
        updatedAt: requireTimestamp(row.updated_at),
        confidenceBasis: "user_explicit",
        decayEligibility: "not_eligible",
        target: null
    };
}
function evidenceId(rowId, facet, value) {
    return `taste-profile:${cleanId(rowId)}:${facet}:${encodeURIComponent((0, taste_similarity_1.normalizeUnicodeText)(value))}`;
}
function assertOwner(row, actorKey) {
    if (cleanId(row.user_id) !== cleanId(actorKey))
        throw new Error("Foundation row owner does not match the authenticated actor.");
    cleanId(row.id);
    requireTimestamp(row.created_at);
    requireTimestamp(row.updated_at);
}
function requireStringArray(value) {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string"))
        throw new Error("Taste profile array is invalid.");
    return value;
}
function cleanId(value) {
    if (typeof value !== "string" || !value.trim())
        throw new Error("Foundation identity is invalid.");
    return value.trim();
}
function requireTimestamp(value) {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
        throw new Error("Foundation timestamp is invalid.");
    return value.trim();
}
function requireDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
        throw new Error("Foundation date is invalid.");
    }
    return value;
}
});

__registry.set("apps/mobile/features/consumer-taste-profile/types.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONSUMER_TASTE_FOUNDATION_TABLE_ALLOWLIST = void 0;
exports.CONSUMER_TASTE_FOUNDATION_TABLE_ALLOWLIST = [
    "taste_profiles",
    "nutrition_goals",
    "dietary_restrictions"
];
});

__registry.set("packages/shared/src/domain/taste-similarity/behavior.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
});

__registry.set("packages/shared/src/domain/taste-similarity/cold-start/assess.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assessColdStart = assessColdStart;
const snapshot_1 = require("../snapshot");
const similarity_1 = require("../similarity");
const compatibility_1 = require("../compatibility");
const goal_restriction_1 = require("../goal-restriction");
const comparison_1 = require("../comparison");
const confidence_1 = require("../confidence");
const policy_1 = require("./policy");
// TS-5 — cold start evidence assessment.
//
// WHAT THIS PRODUCES: a structural description of how ready the evidence was, and why a comparison
// was limited. Nothing here is a verdict. There is no boolean, no readiness field, no aggregate and
// no recommendation — whether a pair should be shown, hidden, ranked or acted on is consumer policy
// living well above this layer.
//
// WHAT THIS NEVER READS: any `.score`. Two pairs with identical evidence structure and opposite
// similarity must produce byte-identical assessments, and because no score is reachable from here
// that is a property of the file rather than a rule to remember.
//
// WHAT THIS NEVER COMPARES: the frozen evidence-support number. It is carried through untouched on
// the comparable variant and never tested against a constant. Every classification below is derived
// from categorical structure — component status, source reachability, truncation, inherited basis —
// so this policy contains no threshold and no tuned value of any kind.
//
// THE DISTINCTION THAT MATTERS MOST: a source that answered with nothing (`empty`) establishes real
// absence; a source that failed, is disabled, unauthenticated or deferred establishes nothing at all.
// The frozen bundles already collapse those six states into the correct reachability predicate, so
// this file inherits it rather than re-deriving it — and it never infers reachability from a count.
function assessColdStart(comparison, confidence) {
    const versions = {
        coldStartPolicyVersion: policy_1.COLD_START_POLICY_VERSION,
        evidenceConfidencePolicyVersion: confidence_1.EVIDENCE_CONFIDENCE_POLICY_VERSION,
        comparisonBundleVersion: comparison_1.TASTE_COMPARISON_BUNDLE_VERSION,
        tastePolicyVersion: similarity_1.TASTE_SIMILARITY_POLICY_VERSION,
        socialContextPolicyVersion: compatibility_1.SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
        goalRestrictionPolicyVersion: goal_restriction_1.GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
        snapshotSchemaVersion: snapshot_1.TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION
    };
    const restrictionState = collectRestrictionState(comparison, confidence);
    // Two independently produced bundles are accepted, so the authorities they overlap on are
    // cross-checked before anything else. A mismatch means the two describe different worlds, and no
    // partial assessment of a mismatched pair could be trusted.
    if (!interpretable(comparison, confidence)) {
        return {
            versions,
            tasteEvidence: { state: "unsupported" },
            availableSignalFamilies: freezeFamilies([]),
            incompleteSignalFamilies: freezeFamilies([]),
            restrictionState,
            reasonCodes: (0, policy_1.orderColdStartReasonCodes)(["unsupported_schema"])
        };
    }
    const availability = comparison.confidenceInputs.sourceAvailability;
    const history = comparison.confidenceInputs.historyCompleteness;
    const dimensions = comparison.confidenceInputs.dimensionAvailability;
    // Ratings are absent from every list below: no frozen scorer reads them, so neither their
    // reachability nor their truncation says anything about evidence readiness.
    const tasteSourcesReachable = availability.tasteProfileAvailableForBoth &&
        availability.favoritesAvailableForBoth &&
        availability.mealsAvailableForBoth;
    const tasteHistoryComplete = !history.favoritesTruncatedForEither && !history.mealsTruncatedForEither;
    const tasteSourcesComplete = tasteSourcesReachable && tasteHistoryComplete;
    const tasteEvidence = classifyTasteEvidence(comparison, confidence, tasteSourcesComplete);
    const availableSignalFamilies = [];
    if (dimensions.taste === "scored")
        availableSignalFamilies.push("taste");
    if (dimensions.mealPattern === "scored")
        availableSignalFamilies.push("meal_pattern");
    if (dimensions.dining === "scored")
        availableSignalFamilies.push("dining");
    if (dimensions.socialLogistics === "scored")
        availableSignalFamilies.push("social_logistics");
    if (dimensions.goal === "scored")
        availableSignalFamilies.push("goal");
    // Restriction always yields a categorical verdict, but `unknown` means the eligibility question
    // could not be answered, so only a determinate verdict counts as usable information.
    if (restrictionState.verdict !== "unknown")
        availableSignalFamilies.push("restriction");
    // A family belongs here when its supporting sources are degraded — INDEPENDENTLY of whether it
    // produced a result. Overlap with the available list is intentional and meaningful.
    const incompleteSignalFamilies = [];
    if (!tasteSourcesComplete)
        incompleteSignalFamilies.push("taste");
    if (!availability.tasteProfileAvailableForBoth) {
        incompleteSignalFamilies.push("meal_pattern", "dining", "social_logistics");
    }
    if (!availability.nutritionGoalsAvailableForBoth)
        incompleteSignalFamilies.push("goal");
    if (!availability.dietaryRestrictionsAvailableForBoth)
        incompleteSignalFamilies.push("restriction");
    return {
        versions,
        tasteEvidence,
        availableSignalFamilies: freezeFamilies(availableSignalFamilies),
        incompleteSignalFamilies: freezeFamilies(incompleteSignalFamilies),
        restrictionState,
        reasonCodes: collectReasonCodes(tasteEvidence, availableSignalFamilies, tasteSourcesReachable, tasteHistoryComplete)
    };
}
// Both bundles must report an interpretable snapshot AND agree on every authority they share. The
// confidence bundle additionally reports its own view of the taste component, so an incoherent pair
// — a scored comparison against an unavailable confidence — is treated as uninterpretable too.
function interpretable(comparison, confidence) {
    if (comparison.status !== "assembled")
        return false;
    const shared = comparison.versions.snapshotSchemaVersion === confidence.versions.snapshotSchemaVersion &&
        comparison.versions.tastePolicyVersion === confidence.versions.tastePolicyVersion &&
        comparison.versions.socialContextPolicyVersion === confidence.versions.socialContextPolicyVersion &&
        comparison.versions.goalRestrictionPolicyVersion === confidence.versions.goalRestrictionPolicyVersion &&
        comparison.versions.bundleVersion === confidence.versions.comparisonBundleVersion;
    if (!shared)
        return false;
    // Named for the component STATUS rather than anything score-shaped: nothing in this file reads or
    // holds a score, and the identifier should not suggest otherwise.
    const tasteComponentComparable = comparison.confidenceInputs.dimensionAvailability.taste === "scored";
    return tasteComponentComparable === (confidence.taste.status === "available");
}
// A scored taste component stays `comparable` even when its sources are patchy — the degradation is
// reported through the family lists and the inherited basis, not by discarding the result.
function classifyTasteEvidence(comparison, confidence, tasteSourcesComplete) {
    if (comparison.confidenceInputs.dimensionAvailability.taste === "scored") {
        if (confidence.taste.status !== "available")
            return { state: "sources_incomplete" };
        return { state: "comparable", basis: confidence.taste.basis, value: confidence.taste.value };
    }
    // Taste produced nothing. Whether that is a real absence or an unknown depends entirely on whether
    // the sources were in a position to tell us.
    return { state: tasteSourcesComplete ? "no_comparable_evidence" : "sources_incomplete" };
}
// Structural descriptions only. Every code below is derived from a status, a reachability boolean, a
// truncation boolean or a basis inherited from the frozen confidence layer.
function collectReasonCodes(tasteEvidence, availableSignalFamilies, tasteSourcesReachable, tasteHistoryComplete) {
    const codes = new Set();
    if (tasteEvidence.state === "no_comparable_evidence")
        codes.add("no_comparable_taste_evidence");
    if (tasteEvidence.state === "sources_incomplete")
        codes.add("incomplete_taste_sources");
    if (tasteEvidence.state === "comparable") {
        if (tasteEvidence.basis === policy_1.COLD_START_LIMITED_COVERAGE_BASIS)
            codes.add("limited_taste_evidence");
        if (policy_1.COLD_START_DEGRADED_SOURCE_BASES.includes(tasteEvidence.basis))
            codes.add("incomplete_taste_sources");
    }
    if (!tasteSourcesReachable)
        codes.add("incomplete_taste_sources");
    if (!tasteHistoryComplete)
        codes.add("incomplete_history");
    const tasteAvailable = availableSignalFamilies.includes("taste");
    const contextAvailable = availableSignalFamilies.includes("meal_pattern") ||
        availableSignalFamilies.includes("dining") ||
        availableSignalFamilies.includes("social_logistics");
    const goalAvailable = availableSignalFamilies.includes("goal");
    // Descriptions of what remains, never instructions to use it in place of taste.
    if (!tasteAvailable && contextAvailable)
        codes.add("context_only_evidence");
    if (!tasteAvailable && !contextAvailable && goalAvailable)
        codes.add("goal_only_evidence");
    // Restriction is excluded from this test on purpose: an eligibility verdict is not a comparison,
    // and letting one exist would silence a genuine "nothing comparable anywhere".
    if (!tasteAvailable && !contextAvailable && !goalAvailable)
        codes.add("no_comparable_evidence");
    return (0, policy_1.orderColdStartReasonCodes)(codes);
}
// Carried through untouched from the frozen layers. Nothing here recomputes, softens, defaults or
// quantifies a restriction.
function collectRestrictionState(comparison, confidence) {
    return Object.freeze({
        verdict: comparison.goalRestriction.restrictionEligibility.verdict,
        evidencePresentForBoth: confidence.restrictionEvidence.evidencePresentForBoth,
        unclassifiedPresent: confidence.restrictionEvidence.unclassifiedPresent,
        sourceReachableForBoth: confidence.restrictionEvidence.sourceReachableForBoth
    });
}
function freezeFamilies(values) {
    return Object.freeze([...new Set(values)]);
}
});

__registry.set("packages/shared/src/domain/taste-similarity/cold-start/index.ts", (require, module, exports) => {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./policy"), exports);
__exportStar(require("./types"), exports);
__exportStar(require("./assess"), exports);
});

__registry.set("packages/shared/src/domain/taste-similarity/cold-start/policy.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COLD_START_LIMITED_COVERAGE_BASIS = exports.COLD_START_DEGRADED_SOURCE_BASES = exports.COLD_START_REASON_CODES = exports.COLD_START_COMPARISON_FAMILIES = exports.COLD_START_SIGNAL_FAMILIES = exports.COLD_START_POLICY_VERSION = void 0;
exports.orderColdStartReasonCodes = orderColdStartReasonCodes;
// TS-5 — the COLD START EVIDENCE policy authority.
//
// Cold start describes EVIDENCE READINESS and the structural reason a comparison was limited. It
// never describes how good a match is, and it never decides anything: whether to show, hide, rank or
// proceed with a pair is Social Runtime consumer policy, and the shared adapter above this layer is
// composition only.
//
// Independent version line. It reads six frozen authorities and bumps none of them; a later change
// to how evidence state is classified bumps this one alone.
exports.COLD_START_POLICY_VERSION = "cold-start-policy-v1";
// The closed signal-family set. These are the independent families the frozen layers already
// produce; TS-5 reports which of them carry usable information and which rest on degraded sources.
exports.COLD_START_SIGNAL_FAMILIES = [
    "taste",
    "meal_pattern",
    "dining",
    "social_logistics",
    "goal",
    "restriction"
];
// The comparison families. `restriction` is deliberately absent: it is an eligibility state, not a
// comparison, so "no comparable evidence anywhere" must not be silenced by a restriction verdict
// happening to exist.
exports.COLD_START_COMPARISON_FAMILIES = [
    "taste",
    "meal_pattern",
    "dining",
    "social_logistics",
    "goal"
];
// Closed reason vocabulary. Structural descriptions only — never a judgement, never a raw value, and
// never a restriction statement: restriction safety lives in its own field, because folding it into a
// generic explanation is exactly how "cold start" becomes an excuse to discount a dietary warning.
exports.COLD_START_REASON_CODES = [
    "no_comparable_taste_evidence",
    "limited_taste_evidence",
    "incomplete_taste_sources",
    "incomplete_history",
    "context_only_evidence",
    "goal_only_evidence",
    "no_comparable_evidence",
    "unsupported_schema"
];
// Deterministic ordering authority: reason codes are emitted in this fixed declaration order, never
// in discovery order, so two runs over the same pair produce an identical sequence.
const REASON_CODE_ORDER = new Map(exports.COLD_START_REASON_CODES.map((code, index) => [code, index]));
function orderColdStartReasonCodes(codes) {
    return Object.freeze([...new Set(codes)].sort((left, right) => (REASON_CODE_ORDER.get(left) ?? 0) - (REASON_CODE_ORDER.get(right) ?? 0)));
}
// The TS-4 basis values that mean the taste evidence rests on degraded sources rather than on a
// short list of preferences. Inherited from the frozen confidence vocabulary rather than re-derived,
// so this policy introduces no boundary of its own.
exports.COLD_START_DEGRADED_SOURCE_BASES = Object.freeze([
    "source_unavailable",
    "incomplete_history"
]);
// The TS-4 basis that means coverage was minimal. Also inherited: TS-4 sets it at the single-family
// boundary, which itself mirrors the frozen taste comparator's own limited-evidence rule. TS-5 adds
// no threshold of its own and compares no number.
exports.COLD_START_LIMITED_COVERAGE_BASIS = "limited_evidence_coverage";
});

__registry.set("packages/shared/src/domain/taste-similarity/cold-start/types.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
});

__registry.set("packages/shared/src/domain/taste-similarity/comparison/compose.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareTasteProfiles = compareTasteProfiles;
const similarity_1 = require("../similarity");
const compatibility_1 = require("../compatibility");
const goal_restriction_1 = require("../goal-restriction");
const policy_1 = require("./policy");
// TS-3E — canonical comparison bundle assembly.
//
// COMPOSITION ONLY. This file computes nothing. It calls the three frozen comparators, carries their
// results verbatim, unifies the metadata they and the snapshot already expose, and merges their
// already-ordered reason codes. There is no Jaccard here, no cuisine rule, no favorite rule, no
// repeated-meal rule, no dining equality, no goal-label rule and no restriction classification —
// every one of those lives in exactly one frozen module and is reached only by calling it.
//
// WHAT THIS DELIBERATELY DOES NOT DO:
//
//   * No aggregate. `taste = 0.9` and `payment = 0` stay two facts. Nothing here decides they average
//     to 0.45, because no evidence in this repository says how to trade one against the other.
//   * No numeric confidence, and no qualitative band standing in for one. TS-4 owns that.
//   * No cold-start fallback, no ranking, no threshold, no gating. A sparse bundle is reported as
//     sparse and handed on intact.
//   * No penalty. `restrictionEligibility.verdict === "needs_attention"` stays a separate safety
//     signal and never touches a score.
//
// PARTIAL AVAILABILITY IS NORMAL. One component being unscorable never invalidates the others — only
// an uninterpretable snapshot schema fails the bundle, and it does so explicitly at bundle level.
//
// SYMMETRY IS STRUCTURAL. Each frozen comparator is already symmetric, and every value this file
// derives itself is combined with a COMMUTATIVE operator (`+`, `&&`, `||`), so argument order cannot
// reach the output. No pair ordering is needed, and no subject id is read or exposed.
function compareTasteProfiles(snapshotA, snapshotB) {
    const taste = (0, similarity_1.compareTasteSimilarity)(snapshotA, snapshotB);
    const socialContext = (0, compatibility_1.compareSocialContextCompatibility)(snapshotA, snapshotB);
    const goalRestriction = (0, goal_restriction_1.compareGoalRestrictionCompatibility)(snapshotA, snapshotB);
    const schemaSupported = snapshotA.schemaVersion === policy_1.TASTE_COMPARISON_SUPPORTED_SNAPSHOT_SCHEMA_VERSION &&
        snapshotB.schemaVersion === policy_1.TASTE_COMPARISON_SUPPORTED_SNAPSHOT_SCHEMA_VERSION;
    return {
        versions: {
            bundleVersion: policy_1.TASTE_COMPARISON_BUNDLE_VERSION,
            snapshotSchemaVersion: policy_1.TASTE_COMPARISON_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
            tastePolicyVersion: similarity_1.TASTE_SIMILARITY_POLICY_VERSION,
            socialContextPolicyVersion: compatibility_1.SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
            goalRestrictionPolicyVersion: goal_restriction_1.GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION
        },
        status: schemaSupported ? "assembled" : "unsupported_snapshot_schema",
        taste,
        socialContext,
        goalRestriction,
        confidenceInputs: assembleConfidenceInputs(snapshotA, snapshotB, taste, socialContext, goalRestriction),
        explanationReasonCodes: assembleReasonCodes(taste, socialContext, goalRestriction)
    };
}
// Merge order is the fixed component order: taste, then social context, then goal and restriction.
// Within each component the frozen ordering authority has ALREADY applied that component's own
// declaration rank, so no sort is applied here — sorting would destroy the ordering each component
// deliberately chose. Deduplication is structural via a Set, which also preserves first-seen order.
function assembleReasonCodes(taste, socialContext, goalRestriction) {
    const merged = [
        ...taste.explanationReasonCodes,
        ...socialContext.explanationReasonCodes,
        ...goalRestriction.explanationReasonCodes
    ];
    return Object.freeze([...new Set(merged)]);
}
// Unifies metadata the components and the snapshot already publish. Nothing here is derived from raw
// evidence: every input is a count, a boolean or a state that some frozen authority already decided.
function assembleConfidenceInputs(snapshotA, snapshotB, taste, socialContext, goalRestriction) {
    const sourceAvailableForBoth = (name) => isReachable(snapshotA, name) && isReachable(snapshotB, name);
    const truncatedForEither = (name) => snapshotA.evidenceWindow[name].truncation !== "not_truncated" ||
        snapshotB.evidenceWindow[name].truncation !== "not_truncated";
    const contextComparableCount = [
        socialContext.mealPatternCompatibility,
        socialContext.diningCompatibility,
        socialContext.socialLogisticsCompatibility
    ].filter((entry) => entry.status === "scored").length;
    const goalComparableCount = goalRestriction.goalCompatibility.status === "scored" ? 1 : 0;
    return {
        evidenceCoverage: {
            totalEvidenceCount: snapshotA.confidenceMetadata.evidenceCounts.total + snapshotB.confidenceMetadata.evidenceCounts.total,
            explicitEvidenceCount: taste.confidenceInputs.explicitEvidenceCount + socialContext.confidenceInputs.explicitEvidenceCount,
            behavioralEvidenceCount: taste.confidenceInputs.behavioralEvidenceCount,
            comparableDimensionCount: taste.confidenceInputs.comparableDimensionCount + contextComparableCount + goalComparableCount,
            unknownDimensionCount: taste.confidenceInputs.unknownDimensionCount +
                socialContext.confidenceInputs.unknownDimensionCount +
                (goalComparableCount === 0 ? 1 : 0)
        },
        sourceAvailability: {
            tasteProfileAvailableForBoth: sourceAvailableForBoth("taste_profile"),
            nutritionGoalsAvailableForBoth: sourceAvailableForBoth("nutrition_goals"),
            dietaryRestrictionsAvailableForBoth: sourceAvailableForBoth("dietary_restrictions"),
            mealsAvailableForBoth: sourceAvailableForBoth("meals"),
            favoritesAvailableForBoth: sourceAvailableForBoth("favorites"),
            ratingsAvailableForBoth: sourceAvailableForBoth("ratings")
        },
        historyCompleteness: {
            historyScopeBoundedForBoth: snapshotA.evidenceWindow.historyScope === "bounded" && snapshotB.evidenceWindow.historyScope === "bounded",
            mealsTruncatedForEither: truncatedForEither("meals"),
            favoritesTruncatedForEither: truncatedForEither("favorites"),
            ratingsTruncatedForEither: truncatedForEither("ratings")
        },
        dimensionAvailability: {
            taste: taste.status === "scored" ? "scored" : "not_scored",
            mealPattern: socialContext.mealPatternCompatibility.status === "scored" ? "scored" : "not_scored",
            dining: socialContext.diningCompatibility.status === "scored" ? "scored" : "not_scored",
            socialLogistics: socialContext.socialLogisticsCompatibility.status === "scored" ? "scored" : "not_scored",
            goal: goalRestriction.goalCompatibility.status === "scored" ? "scored" : "not_scored",
            restrictionVerdict: goalRestriction.restrictionEligibility.verdict,
            restrictionEvidenceComparable: goalRestriction.restrictionEligibility.comparableRestrictionEvidence
        }
    };
}
// "Reachable" means the source answered — with rows or with nothing. A disabled, unauthenticated,
// failed or deferred source did not, and that difference is exactly what a later confidence policy
// needs to see.
function isReachable(snapshot, name) {
    const status = snapshot.sourceStates[name].status;
    return status === "available" || status === "empty";
}
});

__registry.set("packages/shared/src/domain/taste-similarity/comparison/index.ts", (require, module, exports) => {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./policy"), exports);
__exportStar(require("./types"), exports);
__exportStar(require("./compose"), exports);
});

__registry.set("packages/shared/src/domain/taste-similarity/comparison/policy.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASTE_COMPARISON_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = exports.TASTE_COMPARISON_BUNDLE_VERSION = void 0;
const snapshot_1 = require("../snapshot");
// TS-3E — the CANONICAL COMPARISON BUNDLE authority.
//
// This version describes the COMPOSITION contract only: which components the bundle carries, how
// their metadata is unified, and how their reason codes are merged. It says nothing about how any
// component scores anything, because this module computes no score.
//
// It therefore moves independently of the three component policies. A component policy bump does not
// bump this one, and this one does not bump any of them — which is exactly the property that lets a
// consumer reason about "the shape I receive" separately from "how each number was produced".
exports.TASTE_COMPARISON_BUNDLE_VERSION = "taste-comparison-bundle-v1";
// The only snapshot schema this bundle assembles. Derived from the frozen TS-2 constant, never
// re-declared, so the bundle and the components can never disagree about which schema is supported.
exports.TASTE_COMPARISON_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = snapshot_1.TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION;
});

__registry.set("packages/shared/src/domain/taste-similarity/comparison/types.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
});

__registry.set("packages/shared/src/domain/taste-similarity/compatibility/comparator.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareSocialContextCompatibility = compareSocialContextCompatibility;
const policy_1 = require("./policy");
const reasonCodes_1 = require("./reasonCodes");
// TS-3C — the pure SOCIAL CONTEXT compatibility comparator.
//
// This file is not a taste scorer and shares no state with one. It reads exactly three preference
// scopes — `meal_pattern`, `dining_context`, `social_logistics` — and never `food_taste`. It reads no
// behaviour at all: no meal occurrences, no favorites, no ratings, no `sourceConfidence`. It reads no
// goals and no restrictions. Anything it cannot see, it cannot leak into a taste result.
//
// COMPARISON MODE FOLLOWS THE FROZEN EVIDENCE CARDINALITY, not preference:
//
//   meal_pattern    — sourced from the `preferred_meal_types` ARRAY column, so a user legitimately
//                     carries several values. Compared as a set with the parameter-free Jaccard
//                     index, exactly as the taste policy compares cuisines.
//   dining_context  — sourced from the single nullable `dining_style` scalar, so at most one value
//                     legally exists. Compared as an exact categorical equality: 1 or 0.
//   social_logistics — sourced from the single nullable `payment_preference` scalar. Same.
//
// Inventing multi-select semantics for a scalar, or an ordering over any of these controlled values,
// would be authority this repository has never agreed. There is no hierarchy: no meal type outranks
// another, no dining style is "better", and no payment preference implies spending ability.
//
// The dividing line, inherited deliberately from the taste comparator: MISSING evidence is
// not_scored and leaves the comparison entirely; PRESENT evidence that fails to match is a measured
// 0. Conflating the two is the single most damaging thing a compatibility scorer can do.
//
// Pure by construction: no clock, no randomness, no network, no database, no locale-sensitive
// comparison. Symmetry is structural — the pair is canonically ordered before anything reads it.
function compareSocialContextCompatibility(snapshotA, snapshotB) {
    const [left, right] = orderSnapshotPair(snapshotA, snapshotB);
    if (snapshotA.schemaVersion !== policy_1.SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION ||
        snapshotB.schemaVersion !== policy_1.SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION) {
        return unsupportedSchemaResult();
    }
    const leftFacts = collectContextFacts(left);
    const rightFacts = collectContextFacts(right);
    const reasonCodes = new Set();
    const mealPatternCompatibility = compareSets("meal_pattern", leftFacts.mealTypes, rightFacts.mealTypes);
    if (mealPatternCompatibility.status === "scored" && mealPatternCompatibility.score > 0) {
        reasonCodes.add("shared_meal_type_preference");
    }
    const diningCompatibility = compareCategories("dining_context", leftFacts.diningStyle, rightFacts.diningStyle);
    if (diningCompatibility.status === "scored" && diningCompatibility.score > 0) {
        reasonCodes.add("similar_dining_style");
    }
    const socialLogisticsCompatibility = compareCategories("social_logistics", leftFacts.paymentPreference, rightFacts.paymentPreference);
    if (socialLogisticsCompatibility.status === "scored" && socialLogisticsCompatibility.score > 0) {
        reasonCodes.add("compatible_payment_preference");
    }
    const dimensions = [mealPatternCompatibility, diningCompatibility, socialLogisticsCompatibility];
    const comparableDimensionCount = dimensions.filter((entry) => entry.status === "scored").length;
    if (comparableDimensionCount <= 1)
        reasonCodes.add("limited_context_evidence");
    return {
        policyVersion: policy_1.SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
        snapshotSchemaVersion: policy_1.SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
        mealPatternCompatibility,
        diningCompatibility,
        socialLogisticsCompatibility,
        confidenceInputs: buildConfidenceInputs(leftFacts, rightFacts, comparableDimensionCount, dimensions.length - comparableDimensionCount),
        explanationReasonCodes: (0, reasonCodes_1.orderSocialContextCompatibilityReasonCodes)(reasonCodes)
    };
}
// Reads ONLY the three non-food preference scopes. `food_taste` preferences, every behaviour kind,
// goals and restrictions are never touched here, which is what makes their exclusion structural
// rather than a downstream filter.
function collectContextFacts(snapshot) {
    const mealTypes = [];
    let diningStyle = null;
    let paymentPreference = null;
    let mealTypeEvidenceCount = 0;
    let diningStyleEvidenceCount = 0;
    let paymentPreferenceEvidenceCount = 0;
    for (const preference of snapshot.preferences) {
        // Polarity is deliberately not compared. The frozen shape declares `positive | unclassified` for
        // meal types and `neutral | unclassified` for the two scalars; both members are equally legal, so
        // treating `unclassified` as anything other than "this is the value" — least of all as a
        // conflict — would invent polarity semantics the contract does not carry.
        if (preference.scope === "meal_pattern" && preference.facet === "meal_type") {
            mealTypes.push(preference.value);
            mealTypeEvidenceCount += 1;
        }
        else if (preference.scope === "dining_context" && preference.facet === "dining_style") {
            // A taste profile row is unique per user and `dining_style` is a single nullable column, so at
            // most one value can legally exist. Snapshot preferences are sorted by evidenceId upstream, so
            // taking the first keeps the read deterministic even if that ever changes.
            if (diningStyle === null)
                diningStyle = preference.value;
            diningStyleEvidenceCount += 1;
        }
        else if (preference.scope === "social_logistics" && preference.facet === "payment_preference") {
            if (paymentPreference === null)
                paymentPreference = preference.value;
            paymentPreferenceEvidenceCount += 1;
        }
    }
    const tasteProfileState = snapshot.sourceStates.taste_profile.status;
    return {
        mealTypes: mealTypes.length ? sortUnique(mealTypes) : null,
        diningStyle,
        paymentPreference,
        mealTypeEvidenceCount,
        diningStyleEvidenceCount,
        paymentPreferenceEvidenceCount,
        explicitEvidenceCount: mealTypeEvidenceCount + diningStyleEvidenceCount + paymentPreferenceEvidenceCount,
        hasTasteProfileSource: tasteProfileState === "available" || tasteProfileState === "empty"
    };
}
// Set-valued dimension. Returns a measured 0 when both sides supplied values and share none — that
// is a real observation, not an absence.
function compareSets(dimension, left, right) {
    const missing = missingEvidenceReason(left === null, right === null);
    if (missing !== null)
        return notScored(dimension, "set_overlap", missing);
    const leftValues = left;
    const rightValues = right;
    const rightSet = new Set(rightValues);
    let intersectionSize = 0;
    for (const value of leftValues) {
        if (rightSet.has(value))
            intersectionSize += 1;
    }
    const unionSize = new Set([...leftValues, ...rightValues]).size;
    if (unionSize === 0)
        return notScored(dimension, "set_overlap", "no_comparable_evidence");
    return scored(dimension, "set_overlap", intersectionSize / unionSize);
}
// Singleton dimension. Exact equality on the normalized canonical value: 1 or 0, with no partial
// credit and no ordering between controlled values.
function compareCategories(dimension, left, right) {
    const missing = missingEvidenceReason(left === null, right === null);
    if (missing !== null)
        return notScored(dimension, "categorical_equality", missing);
    return scored(dimension, "categorical_equality", left === right ? 1 : 0);
}
// Distinguishes "neither side said anything" from "one side said nothing". Both are unscorable, but
// they are different product situations and a caller may treat them differently.
function missingEvidenceReason(leftMissing, rightMissing) {
    if (leftMissing && rightMissing)
        return "no_comparable_evidence";
    if (leftMissing || rightMissing)
        return "insufficient_evidence";
    return null;
}
function scored(dimension, comparisonMode, value) {
    return { dimension, comparisonMode, status: "scored", score: (0, policy_1.roundSocialContextCompatibilityScore)(value) };
}
function notScored(dimension, comparisonMode, reason) {
    return { dimension, comparisonMode, status: "not_scored", reason };
}
function unsupportedSchemaResult() {
    const failClosed = (dimension, comparisonMode) => notScored(dimension, comparisonMode, "unsupported_snapshot_schema");
    return {
        policyVersion: policy_1.SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
        snapshotSchemaVersion: policy_1.SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
        mealPatternCompatibility: failClosed("meal_pattern", "set_overlap"),
        diningCompatibility: failClosed("dining_context", "categorical_equality"),
        socialLogisticsCompatibility: failClosed("social_logistics", "categorical_equality"),
        confidenceInputs: {
            comparableDimensionCount: 0,
            unknownDimensionCount: 3,
            explicitEvidenceCount: 0,
            evidenceCountsByDimension: { meal_pattern: 0, dining_context: 0, social_logistics: 0 },
            sourceAvailability: { tasteProfileAvailableForBoth: false }
        },
        explanationReasonCodes: (0, reasonCodes_1.orderSocialContextCompatibilityReasonCodes)(["limited_context_evidence"])
    };
}
function buildConfidenceInputs(leftFacts, rightFacts, comparableDimensionCount, unknownDimensionCount) {
    return {
        comparableDimensionCount,
        unknownDimensionCount,
        explicitEvidenceCount: leftFacts.explicitEvidenceCount + rightFacts.explicitEvidenceCount,
        evidenceCountsByDimension: {
            meal_pattern: leftFacts.mealTypeEvidenceCount + rightFacts.mealTypeEvidenceCount,
            dining_context: leftFacts.diningStyleEvidenceCount + rightFacts.diningStyleEvidenceCount,
            social_logistics: leftFacts.paymentPreferenceEvidenceCount + rightFacts.paymentPreferenceEvidenceCount
        },
        sourceAvailability: {
            tasteProfileAvailableForBoth: leftFacts.hasTasteProfileSource && rightFacts.hasTasteProfileSource
        }
    };
}
// Canonical pair ordering. `subjectUserId` is an opaque normalized id, compared by code unit so the
// result never depends on host locale.
function orderSnapshotPair(first, second) {
    return compareCodeUnits(first.subjectUserId, second.subjectUserId) <= 0 ? [first, second] : [second, first];
}
function sortUnique(values) {
    return Object.freeze([...new Set(values)].sort(compareCodeUnits));
}
function compareCodeUnits(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
});

__registry.set("packages/shared/src/domain/taste-similarity/compatibility/index.ts", (require, module, exports) => {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./policy"), exports);
__exportStar(require("./reasonCodes"), exports);
__exportStar(require("./types"), exports);
__exportStar(require("./comparator"), exports);
});

__registry.set("packages/shared/src/domain/taste-similarity/compatibility/policy.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOCIAL_CONTEXT_SCORE_PRECISION = exports.SOCIAL_CONTEXT_SCORE_MAX = exports.SOCIAL_CONTEXT_SCORE_MIN = exports.SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = exports.SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION = void 0;
exports.roundSocialContextCompatibilityScore = roundSocialContextCompatibilityScore;
const snapshot_1 = require("../snapshot");
// TS-3C — the SOCIAL CONTEXT COMPATIBILITY policy authority.
//
// Deliberately its own version line, separate from `taste-similarity-v1.1`. Food-taste semantics did
// not change in this round, so bumping the taste version would falsely signal that they had, and
// would invalidate every taste result for a reason that has nothing to do with taste. Two questions
// — "do these two people like the same food" and "do these two people eat compatibly" — deserve two
// independently versionable answers.
exports.SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION = "social-context-compatibility-v1";
// The only snapshot schema this policy reads. Anything else fails closed on every dimension rather
// than being scored on assumptions about its shape.
exports.SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = snapshot_1.TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION;
// Canonical INTERNAL range, per dimension. There is deliberately NO aggregate: the three dimensions
// are reported side by side and never collapsed into one number here, because how to trade a
// payment-preference mismatch against a shared meal type is a product decision that belongs to
// whatever consumes this, not to the comparator.
exports.SOCIAL_CONTEXT_SCORE_MIN = 0;
exports.SOCIAL_CONTEXT_SCORE_MAX = 1;
// Deterministic rounding authority. Six decimals matches the precision the taste policy settled on
// for the same reason — it keeps the small rationals a Jaccard index actually produces
// distinguishable while removing binary representation noise. It is declared here rather than
// imported so the two policies can diverge in a later round without one silently dragging the other.
exports.SOCIAL_CONTEXT_SCORE_PRECISION = 6;
function roundSocialContextCompatibilityScore(value) {
    if (!Number.isFinite(value)) {
        throw new RangeError("Social context compatibility score must be a finite number.");
    }
    const factor = 10 ** exports.SOCIAL_CONTEXT_SCORE_PRECISION;
    const rounded = Math.round(value * factor) / factor;
    // Guard the contract itself rather than trusting callers: an out-of-range score is a defect, not
    // something to silently clamp into looking valid.
    if (rounded < exports.SOCIAL_CONTEXT_SCORE_MIN || rounded > exports.SOCIAL_CONTEXT_SCORE_MAX) {
        throw new RangeError("Social context compatibility score must fall within the canonical 0..1 range.");
    }
    return rounded;
}
});

__registry.set("packages/shared/src/domain/taste-similarity/compatibility/reasonCodes.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOCIAL_CONTEXT_COMPATIBILITY_REASON_CODES = void 0;
exports.orderSocialContextCompatibilityReasonCodes = orderSocialContextCompatibilityReasonCodes;
// TS-3C — closed reason-code vocabulary for social context compatibility.
//
// Separate vocabulary from the taste reason codes on purpose. "You both prefer to split the bill" is
// not a statement about taste, and a shared vocabulary would eventually let one render as the other.
//
// Codes carry no evidence values at all: never a meal type, never a dining style, never a payment
// preference, never a user id, never a count. That is what keeps an explanation safe to render even
// though the comparator reads preference rows classified `internal`.
exports.SOCIAL_CONTEXT_COMPATIBILITY_REASON_CODES = [
    "shared_meal_type_preference",
    "similar_dining_style",
    "compatible_payment_preference",
    "limited_context_evidence"
];
// Deterministic ordering authority: codes are emitted in this fixed declaration order, never in
// discovery order, so two runs over the same pair — and the same pair supplied in either argument
// order — produce an identical sequence.
const REASON_CODE_RANK = new Map(exports.SOCIAL_CONTEXT_COMPATIBILITY_REASON_CODES.map((code, index) => [code, index]));
function orderSocialContextCompatibilityReasonCodes(codes) {
    return [...new Set(codes)].sort((left, right) => (REASON_CODE_RANK.get(left) ?? 0) - (REASON_CODE_RANK.get(right) ?? 0));
}
});

__registry.set("packages/shared/src/domain/taste-similarity/compatibility/types.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOCIAL_CONTEXT_COMPATIBILITY_DIMENSIONS = void 0;
// TS-3C — the social context compatibility result contract.
//
// The three dimensions map ONE-TO-ONE onto the three non-food preference scopes TS-1 defines. The
// mapping is total and exclusive: `meal_pattern` reaches only `mealPatternCompatibility`,
// `dining_context` only `diningCompatibility`, `social_logistics` only `socialLogisticsCompatibility`,
// and `food_taste` reaches none of them.
exports.SOCIAL_CONTEXT_COMPATIBILITY_DIMENSIONS = [
    "meal_pattern",
    "dining_context",
    "social_logistics"
];
});

__registry.set("packages/shared/src/domain/taste-similarity/confidence/compute.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateEvidenceConfidence = calculateEvidenceConfidence;
const snapshot_1 = require("../snapshot");
const similarity_1 = require("../similarity");
const compatibility_1 = require("../compatibility");
const goal_restriction_1 = require("../goal-restriction");
const comparison_1 = require("../comparison");
const policy_1 = require("./policy");
// TS-4 — evidence confidence computation.
//
// WHAT THIS MEASURES: how much usable and complete evidence supports treating the observed result as
// meaningful. Not how often it would turn out correct. Not a match figure. Not a safety assurance.
//
// THE ONE INVARIANT THAT MATTERS MOST: this file never reads a `.score`. Support and agreement are
// different questions, and two pairs with identical evidence structure must receive identical
// confidence whether they agreed completely or not at all. Because no score is reachable from here,
// that is not a rule to remember — it is a rule that cannot be broken without changing this file.
//
// INPUT DISCIPLINE: the only input is the frozen `taste-comparison-bundle-v1`. TS-3E is the canonical
// assembly boundary, so nothing here recomputes a comparator, reaches past the bundle into a
// snapshot, or inspects a single evidence value. Only structural metadata is read: dimension
// identifiers, statuses, source-reachability booleans and truncation booleans.
//
// THE FORMULA, in full:
//
//   dimensionCoverage  = comparableTasteFamilyCount / 5
//   sourceCompleteness = completeRelevantSourceCount / 3
//   value              = round6((dimensionCoverage + sourceCompleteness) / 2)
//
// Both denominators are structural counts derived from frozen contracts, not tuned parameters, and
// the unweighted mean is the same neutrality argument the score policies already froze. There is no
// raw evidence count anywhere: counting FAMILIES rather than items is what makes saturation
// structural — twenty visits to one restaurant is still one comparable family — so no threshold,
// cap, log or decay constant is needed or present.
//
// DELIBERATELY ABSENT: source-recognition quality, any timestamp, any freshness or decay term, any
// evidence-strength weight, any rescaling of the reachable floor, and any aggregate across
// dimensions.
function calculateEvidenceConfidence(bundle) {
    const schemaSupported = bundle.status === "assembled";
    return {
        versions: {
            evidenceConfidencePolicyVersion: policy_1.EVIDENCE_CONFIDENCE_POLICY_VERSION,
            snapshotSchemaVersion: snapshot_1.TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION,
            tastePolicyVersion: similarity_1.TASTE_SIMILARITY_POLICY_VERSION,
            socialContextPolicyVersion: compatibility_1.SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
            goalRestrictionPolicyVersion: goal_restriction_1.GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
            comparisonBundleVersion: comparison_1.TASTE_COMPARISON_BUNDLE_VERSION
        },
        taste: computeTasteEvidenceConfidence(bundle, schemaSupported),
        mealPattern: mapEvidenceState(bundle.socialContext.mealPatternCompatibility.status, schemaSupported),
        dining: mapEvidenceState(bundle.socialContext.diningCompatibility.status, schemaSupported),
        socialLogistics: mapEvidenceState(bundle.socialContext.socialLogisticsCompatibility.status, schemaSupported),
        goal: mapEvidenceState(bundle.goalRestriction.goalCompatibility.status, schemaSupported),
        restrictionEvidence: collectRestrictionEvidenceState(bundle)
    };
}
function computeTasteEvidenceConfidence(bundle, schemaSupported) {
    if (!schemaSupported)
        return { status: "not_available", reason: "unsupported_snapshot_schema" };
    // Numeric evidence confidence exists only where there is a comparable result to support. An
    // unscored component reports a STATUS, never the number zero.
    if (bundle.taste.status !== "scored")
        return { status: "not_available", reason: "component_not_scored" };
    const families = collectComparableFamilies(bundle.taste.comparableDimensions);
    const relevantSources = collectRelevantSourceCompleteness(bundle);
    const inputs = {
        comparableFamilyCount: families.size,
        supportedFamilyCount: policy_1.TASTE_CONFIDENCE_SUPPORTED_DIMENSION_COUNT,
        completeRelevantSourceCount: relevantSources.completeCount,
        relevantSourceCount: policy_1.TASTE_CONFIDENCE_RELEVANT_SOURCE_COUNT
    };
    const dimensionCoverage = inputs.comparableFamilyCount / inputs.supportedFamilyCount;
    const sourceCompleteness = inputs.completeRelevantSourceCount / inputs.relevantSourceCount;
    const value = (0, policy_1.roundEvidenceConfidenceValue)((dimensionCoverage + sourceCompleteness) / 2);
    return { status: "available", value, basis: selectBasis(families, relevantSources), inputs };
}
// Maps each comparable dimension onto its identity FAMILY and counts the distinct families. A
// comparable favorite and its suppressed repeated-meal counterpart are the same family and are
// counted once — the frozen suppression rule already makes them mutually exclusive, and this keeps
// that true by construction rather than by coincidence.
function collectComparableFamilies(comparableDimensions) {
    const families = new Set();
    for (const dimension of comparableDimensions) {
        const family = policy_1.TASTE_CONFIDENCE_DIMENSION_FAMILIES[dimension];
        if (family !== undefined)
            families.add(family);
    }
    return families;
}
// A relevant source is COMPLETE when it is reachable for both users and, if it carries an evidence
// window, that window is not truncated.
//
// Reachability keys on the source STATE, never on an evidence count: `empty` means the source
// answered and the user genuinely has nothing, which is complete knowledge, while `failed` means we
// do not know what exists — and a failed source can still carry partial rows, so counting rows would
// silently turn "unknown" into "complete".
//
// `taste_profile` has no evidence window, so reachability is the whole test for it. Ratings are
// absent entirely: no frozen scorer reads them, so an incomplete ratings window says nothing about
// support for a taste result.
function collectRelevantSourceCompleteness(bundle) {
    const availability = bundle.confidenceInputs.sourceAvailability;
    const history = bundle.confidenceInputs.historyCompleteness;
    const sources = [
        { reachable: availability.tasteProfileAvailableForBoth, truncated: false },
        { reachable: availability.favoritesAvailableForBoth, truncated: history.favoritesTruncatedForEither },
        { reachable: availability.mealsAvailableForBoth, truncated: history.mealsTruncatedForEither }
    ];
    let completeCount = 0;
    let anySourceUnreachable = false;
    let anyRelevantWindowTruncated = false;
    for (const source of sources) {
        if (!source.reachable) {
            anySourceUnreachable = true;
            continue;
        }
        if (source.truncated) {
            anyRelevantWindowTruncated = true;
            continue;
        }
        completeCount += 1;
    }
    return { completeCount, anySourceUnreachable, anyRelevantWindowTruncated };
}
// Explanatory only. Evaluated in the policy's fixed precedence order, first match wins, and it never
// touches the value — the value is already computed before this runs.
function selectBasis(families, relevantSources) {
    if (relevantSources.anySourceUnreachable)
        return "source_unavailable";
    if (relevantSources.anyRelevantWindowTruncated)
        return "incomplete_history";
    if (families.size <= policy_1.TASTE_CONFIDENCE_LIMITED_COVERAGE_FAMILY_COUNT)
        return "limited_evidence_coverage";
    const explicit = [...families].some((family) => policy_1.TASTE_CONFIDENCE_EXPLICIT_FAMILIES.includes(family));
    const behavioral = [...families].some((family) => !policy_1.TASTE_CONFIDENCE_EXPLICIT_FAMILIES.includes(family));
    if (explicit && behavioral)
        return "strong_explicit_and_behavioral_evidence";
    if (explicit)
        return "explicit_evidence_only";
    return "behavioral_evidence_only";
}
// Non-numeric state for the four single-facet dimensions. A scored component means both users
// supplied the only evidence that can exist for it, which is reported as a status and a basis and
// deliberately not as a number.
function mapEvidenceState(componentStatus, schemaSupported) {
    if (!schemaSupported)
        return { status: "not_available", reason: "unsupported_snapshot_schema" };
    if (componentStatus !== "scored")
        return { status: "not_available", reason: mapUnavailableReason() };
    return { status: "available", basis: "explicit_evidence_only" };
}
function mapUnavailableReason() {
    return "component_not_scored";
}
// Built only from the safe structural metadata the frozen bundle already publishes. No restriction
// row, label, type or severity is ever reached, and no numeric field is produced.
function collectRestrictionEvidenceState(bundle) {
    return {
        evidencePresentForBoth: bundle.confidenceInputs.dimensionAvailability.restrictionEvidenceComparable,
        unclassifiedPresent: bundle.goalRestriction.confidenceInputs.restriction.unclassifiedRestrictionPresent,
        sourceReachableForBoth: bundle.confidenceInputs.sourceAvailability.dietaryRestrictionsAvailableForBoth
    };
}
});

__registry.set("packages/shared/src/domain/taste-similarity/confidence/index.ts", (require, module, exports) => {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./policy"), exports);
__exportStar(require("./types"), exports);
__exportStar(require("./compute"), exports);
});

__registry.set("packages/shared/src/domain/taste-similarity/confidence/policy.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVIDENCE_CONFIDENCE_VALUE_PRECISION = exports.EVIDENCE_CONFIDENCE_VALUE_MAX = exports.EVIDENCE_CONFIDENCE_VALUE_MIN = exports.EVIDENCE_CONFIDENCE_BASIS_PRECEDENCE = exports.TASTE_CONFIDENCE_LIMITED_COVERAGE_FAMILY_COUNT = exports.TASTE_CONFIDENCE_EXPLICIT_FAMILIES = exports.TASTE_CONFIDENCE_RELEVANT_SOURCE_COUNT = exports.TASTE_CONFIDENCE_SUPPORTED_DIMENSION_COUNT = exports.TASTE_CONFIDENCE_DIMENSION_FAMILIES = exports.EVIDENCE_CONFIDENCE_POLICY_VERSION = void 0;
exports.roundEvidenceConfidenceValue = roundEvidenceConfidenceValue;
// TS-4 — the EVIDENCE CONFIDENCE policy authority.
//
// Evidence confidence answers exactly one question: how much usable and complete evidence supports
// treating the currently observed result as meaningful? It is an evidence-support index and nothing
// else. It does not express how often the result would turn out correct, it is not a match measure,
// it says nothing about how a recommendation would turn out, and it is not a safety assurance. The
// name says `evidence` on purpose, and so does the version.
//
// Independent version line. It does not bump — and is not bumped by — any of the five frozen
// authorities it reads. A later formula change bumps this one only.
exports.EVIDENCE_CONFIDENCE_POLICY_VERSION = "evidence-confidence-v1";
// The taste identity FAMILIES. Seven dimensions exist in the frozen taste contract, but two PAIRS of
// them are mutually exclusive by the frozen favorites-suppression rule: a comparable
// `favorite_restaurant` structurally forbids `repeated_meal_restaurant`, and likewise for menu items.
// So the maximum simultaneously-comparable set is FIVE, not seven, and each identity family must be
// counted once no matter which of its two dimensions carried it.
//
// Using seven would cap a favorites-rich pair at 5/7 despite that pair having MORE evidence, which
// is exactly backwards.
exports.TASTE_CONFIDENCE_DIMENSION_FAMILIES = Object.freeze({
    cuisine_preference: "cuisine",
    flavor_avoidance: "flavor",
    spice_preference: "spice",
    favorite_restaurant: "restaurant_identity",
    repeated_meal_restaurant: "restaurant_identity",
    favorite_menu_item: "menu_item_identity",
    repeated_meal_menu_item: "menu_item_identity"
});
// Declared explicitly rather than derived from the dimension array, whose length is seven. The guard
// cross-checks it against the number of DISTINCT families above, so the two can never drift.
exports.TASTE_CONFIDENCE_SUPPORTED_DIMENSION_COUNT = 5;
// The sources the frozen taste scorer actually reads. Ratings are excluded because no frozen scorer
// consumes them; goals, restrictions and the context scopes are excluded because they belong to
// other dimensions entirely.
exports.TASTE_CONFIDENCE_RELEVANT_SOURCE_COUNT = 3;
// The explicit-preference families, used only to classify the reported basis. Behavioural families
// are the remainder. This never touches the numeric value.
exports.TASTE_CONFIDENCE_EXPLICIT_FAMILIES = Object.freeze([
    "cuisine",
    "flavor",
    "spice"
]);
// A single comparable family is the minimum non-zero coverage. The boundary is not a tuned
// parameter: it mirrors the frozen taste comparator, which already flags `limited_evidence` at
// exactly one comparable dimension.
exports.TASTE_CONFIDENCE_LIMITED_COVERAGE_FAMILY_COUNT = 1;
// Deterministic precedence for the reported basis. FIRST MATCH WINS, evaluated in this exact order,
// so overlapping conditions can never produce a non-deterministic label. Declared here rather than
// inline so the ordering is policy, not an implementation accident.
exports.EVIDENCE_CONFIDENCE_BASIS_PRECEDENCE = [
    "source_unavailable",
    "incomplete_history",
    "limited_evidence_coverage",
    "strong_explicit_and_behavioral_evidence",
    "explicit_evidence_only",
    "behavioral_evidence_only"
];
// Canonical INTERNAL range for the taste evidence-support index.
exports.EVIDENCE_CONFIDENCE_VALUE_MIN = 0;
exports.EVIDENCE_CONFIDENCE_VALUE_MAX = 1;
// Deterministic rounding authority, declared locally. The score policies each own a rounding helper
// for a SCORE; importing one here would couple an evidence-support index to a similarity scale and
// make a later score-precision change silently move confidence. Six decimals for the same reason
// they chose it: it keeps small rationals distinguishable while removing binary representation noise.
exports.EVIDENCE_CONFIDENCE_VALUE_PRECISION = 6;
function roundEvidenceConfidenceValue(value) {
    if (!Number.isFinite(value)) {
        throw new RangeError("Evidence confidence value must be a finite number.");
    }
    const factor = 10 ** exports.EVIDENCE_CONFIDENCE_VALUE_PRECISION;
    const rounded = Math.round(value * factor) / factor;
    // Guard the contract itself rather than trusting callers: an out-of-range value is a defect, not
    // something to silently clamp into looking valid.
    if (rounded < exports.EVIDENCE_CONFIDENCE_VALUE_MIN || rounded > exports.EVIDENCE_CONFIDENCE_VALUE_MAX) {
        throw new RangeError("Evidence confidence value must fall within the canonical 0..1 range.");
    }
    return rounded;
}
});

__registry.set("packages/shared/src/domain/taste-similarity/confidence/types.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
});

__registry.set("packages/shared/src/domain/taste-similarity/evidence.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasteEvidenceNormalizationError = void 0;
class TasteEvidenceNormalizationError extends Error {
    code = "taste_evidence_invalid";
    constructor(message) {
        super(message);
        this.name = "TasteEvidenceNormalizationError";
    }
}
exports.TasteEvidenceNormalizationError = TasteEvidenceNormalizationError;
});

__registry.set("packages/shared/src/domain/taste-similarity/evidenceWindow.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeTasteProfileEvidenceWindow = normalizeTasteProfileEvidenceWindow;
const evidence_1 = require("./evidence");
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function normalizeTasteProfileEvidenceWindow(input) {
    if (input.historyScope !== "bounded")
        throw new evidence_1.TasteEvidenceNormalizationError("Taste evidence history must remain bounded.");
    const meals = normalizeBoundedWindow(input.meals);
    return {
        historyScope: "bounded",
        meals,
        favorites: normalizeCollectionWindow(input.favorites),
        ratings: normalizeCollectionWindow(input.ratings)
    };
}
function normalizeBoundedWindow(input) {
    if (!validDate(input.requestedStartDate) || !validDate(input.requestedEndDate) || input.requestedStartDate > input.requestedEndDate) {
        throw new evidence_1.TasteEvidenceNormalizationError("Meal evidence window dates are invalid.");
    }
    return {
        requestedStartDate: input.requestedStartDate,
        requestedEndDate: input.requestedEndDate,
        requestedLimit: requireLimit(input.requestedLimit),
        ...normalizeCoverage(input)
    };
}
function normalizeCollectionWindow(input) {
    return {
        requestedLimit: input.requestedLimit == null ? null : requireLimit(input.requestedLimit),
        ...normalizeCoverage(input)
    };
}
function normalizeCoverage(input) {
    if (!Number.isInteger(input.returnedCount) || input.returnedCount < 0) {
        throw new evidence_1.TasteEvidenceNormalizationError("Evidence returned count is invalid.");
    }
    if (!["not_truncated", "possibly_truncated", "known_truncated"].includes(input.truncation)) {
        throw new evidence_1.TasteEvidenceNormalizationError("Evidence truncation state is invalid.");
    }
    const actualEarliestAt = normalizeNullableTimestamp(input.actualEarliestAt);
    const actualLatestAt = normalizeNullableTimestamp(input.actualLatestAt);
    if ((actualEarliestAt === null) !== (actualLatestAt === null)) {
        throw new evidence_1.TasteEvidenceNormalizationError("Evidence range endpoints must both be present or absent.");
    }
    if (actualEarliestAt && actualLatestAt && Date.parse(actualEarliestAt) > Date.parse(actualLatestAt)) {
        throw new evidence_1.TasteEvidenceNormalizationError("Evidence range endpoints are reversed.");
    }
    if (input.returnedCount === 0 && (actualEarliestAt || actualLatestAt)) {
        throw new evidence_1.TasteEvidenceNormalizationError("Empty evidence cannot claim an actual range.");
    }
    return { actualEarliestAt, actualLatestAt, returnedCount: input.returnedCount, truncation: input.truncation };
}
function requireLimit(value) {
    if (!Number.isInteger(value) || value < 1)
        throw new evidence_1.TasteEvidenceNormalizationError("Evidence limit is invalid.");
    return value;
}
function validDate(value) {
    if (!datePattern.test(value))
        return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function normalizeNullableTimestamp(value) {
    if (value === null)
        return null;
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
        throw new evidence_1.TasteEvidenceNormalizationError("Evidence timestamp is invalid.");
    }
    return value.trim();
}
});

__registry.set("packages/shared/src/domain/taste-similarity/goal-restriction/comparator.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareGoalRestrictionCompatibility = compareGoalRestrictionCompatibility;
const policy_1 = require("./policy");
const reasonCodes_1 = require("./reasonCodes");
// TS-3D — the pure GOAL COMPATIBILITY and RESTRICTION ELIGIBILITY comparator.
//
// Two people can like exactly the same food and want completely different things from it. Goal is
// not taste, restriction is not taste, and neither reaches the taste comparator or the social
// context comparator — this file imports nothing from either and is imported by neither.
//
// GOAL: coarse label only.
//
// The frozen goal contract carries a free-text `goal_label` plus five SCALAR macro facets. Only the
// label is read. The scalars — calories, protein, carbohydrates, fat, fiber — are
// `sensitive_internal` and are never compared across users, never output, and never turned into a
// numeric "goal distance". A macro target is a private medical-adjacent number, and cross-user macro
// arithmetic would leak it by inference even without printing it. Macro fit belongs to future
// user-to-restaurant logic, not to user-to-user compatibility.
//
// Labels are free text, so comparison is EXACT normalized equality. No semantic grouping is
// invented: this policy does not know that one label resembles another, because the repository has
// no controlled vocabulary saying so.
//
// ELIGIBILITY, NOT SIMILARITY, for restrictions.
//
// The frozen enforcement ladder has exactly two rungs, `soft` and `unclassified`, so nothing in this
// repository can currently express an exclusion. This round does not invent one — no severity
// taxonomy, no hard constraint, no exclusion rule. A soft preference stays a preference. Anything
// whose enforcement could not be classified resolves to `needs_attention`, never to `compatible`:
// "no conflict could be proven" is not the same statement as "there is no conflict", and collapsing
// the two is precisely the failure mode that matters when the subject is what someone can eat.
//
// Restriction eligibility therefore returns a CATEGORICAL verdict and carries no score at all.
//
// Pure by construction: no clock, no randomness, no network, no database, no locale-sensitive
// comparison. Date validity is read from the snapshot's own recorded `generatedAt`, which is data,
// not a clock — and each side is filtered by its own snapshot's date, so symmetry is preserved.
function compareGoalRestrictionCompatibility(snapshotA, snapshotB) {
    const [left, right] = orderSnapshotPair(snapshotA, snapshotB);
    if (snapshotA.schemaVersion !== policy_1.GOAL_RESTRICTION_SUPPORTED_SNAPSHOT_SCHEMA_VERSION ||
        snapshotB.schemaVersion !== policy_1.GOAL_RESTRICTION_SUPPORTED_SNAPSHOT_SCHEMA_VERSION) {
        return unsupportedSchemaResult();
    }
    const leftFacts = collectGoalRestrictionFacts(left);
    const rightFacts = collectGoalRestrictionFacts(right);
    const reasonCodes = new Set();
    const goalCompatibility = compareGoalLabels(leftFacts.goalLabels, rightFacts.goalLabels);
    if (goalCompatibility.status === "scored") {
        reasonCodes.add(goalCompatibility.score > 0 ? "shared_goal_label" : "different_goal_label");
    }
    else {
        reasonCodes.add("limited_goal_evidence");
    }
    const sharedSoftRestrictionCount = intersectionSize(leftFacts.softRestrictionLabels, rightFacts.softRestrictionLabels);
    const restrictionEligibility = decideRestrictionEligibility(leftFacts, rightFacts);
    if (sharedSoftRestrictionCount > 0)
        reasonCodes.add("shared_soft_restriction");
    if (restrictionEligibility.verdict === "needs_attention")
        reasonCodes.add("restriction_requires_attention");
    if (restrictionEligibility.verdict === "unknown")
        reasonCodes.add("restriction_evidence_unknown");
    return {
        policyVersion: policy_1.GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
        snapshotSchemaVersion: policy_1.GOAL_RESTRICTION_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
        goalCompatibility,
        restrictionEligibility,
        confidenceInputs: buildConfidenceInputs(leftFacts, rightFacts, goalCompatibility, sharedSoftRestrictionCount),
        explanationReasonCodes: (0, reasonCodes_1.orderGoalRestrictionReasonCodes)(reasonCodes)
    };
}
// Reads ONLY goal labels and restriction enforcement. Preferences of every scope, every behaviour
// kind and every goal SCALAR facet are never touched here, which is what makes their exclusion
// structural rather than a downstream filter.
function collectGoalRestrictionFacts(snapshot) {
    // The canonical producer already drops inactive and out-of-window goal rows, but the snapshot type
    // admits any goal evidence, so the same frozen rule is applied again here rather than assumed. The
    // as-of date is this snapshot's own recorded generation date, compared as an ISO date string
    // exactly the way the frozen mapper compares it.
    const asOfDate = snapshot.generatedAt.slice(0, 10);
    const goalLabels = [];
    let goalLabelEvidenceCount = 0;
    for (const goal of snapshot.goals) {
        if (goal.facet !== "goal_label")
            continue;
        if (!goal.validity.isActive)
            continue;
        if (goal.validity.startsOn > asOfDate)
            continue;
        if (goal.validity.endsOn !== undefined && goal.validity.endsOn < asOfDate)
            continue;
        goalLabels.push(goal.value);
        goalLabelEvidenceCount += 1;
    }
    const softRestrictionLabels = new Set();
    let restrictionEvidenceCount = 0;
    let unclassifiedRestrictionPresent = false;
    for (const restriction of snapshot.restrictions) {
        restrictionEvidenceCount += 1;
        if (restriction.enforcement === "soft") {
            // Held privately so an exactly shared soft constraint can be COUNTED. The label never leaves
            // this function.
            softRestrictionLabels.add(restriction.label);
            continue;
        }
        unclassifiedRestrictionPresent = true;
    }
    const goalState = snapshot.sourceStates.nutrition_goals.status;
    const restrictionState = snapshot.sourceStates.dietary_restrictions.status;
    return {
        goalLabels: goalLabels.length ? sortUnique(goalLabels) : null,
        goalLabelEvidenceCount,
        hasGoalSource: goalState === "available" || goalState === "empty",
        restrictionEvidenceCount,
        unclassifiedRestrictionPresent,
        softRestrictionLabels,
        hasRestrictionSource: restrictionState === "available" || restrictionState === "empty"
    };
}
// Set of exact normalized labels, compared with the parameter-free Jaccard index. Both sides present
// and sharing nothing is a measured 0 — a real observation. Either side absent is not comparable.
function compareGoalLabels(left, right) {
    const missing = missingEvidenceReason(left === null, right === null);
    if (missing !== null)
        return { comparisonMode: "set_overlap", status: "not_scored", reason: missing };
    const leftLabels = left;
    const rightLabels = right;
    const shared = intersectionSize(new Set(leftLabels), rightLabels);
    const unionSize = new Set([...leftLabels, ...rightLabels]).size;
    if (unionSize === 0) {
        return { comparisonMode: "set_overlap", status: "not_scored", reason: "no_comparable_evidence" };
    }
    return { comparisonMode: "set_overlap", status: "scored", score: (0, policy_1.roundGoalCompatibilityScore)(shared / unionSize) };
}
// Categorical verdict. Order matters: an unclassifiable constraint outranks everything else, because
// resolving it to `compatible` would turn "we could not tell" into a reassurance.
function decideRestrictionEligibility(leftFacts, rightFacts) {
    const comparableRestrictionEvidence = leftFacts.restrictionEvidenceCount > 0 && rightFacts.restrictionEvidenceCount > 0;
    if (leftFacts.unclassifiedRestrictionPresent || rightFacts.unclassifiedRestrictionPresent) {
        return { verdict: "needs_attention", basis: "unclassified_enforcement_present", comparableRestrictionEvidence };
    }
    if (leftFacts.restrictionEvidenceCount === 0 && rightFacts.restrictionEvidenceCount === 0) {
        return { verdict: "compatible", basis: "no_restriction_evidence", comparableRestrictionEvidence };
    }
    // Everything present is a soft preference. Differing soft preferences are not an incompatibility:
    // the frozen contract has no enforcement level that could make them one.
    return { verdict: "compatible", basis: "soft_preferences_only", comparableRestrictionEvidence };
}
function missingEvidenceReason(leftMissing, rightMissing) {
    if (leftMissing && rightMissing)
        return "no_comparable_evidence";
    if (leftMissing || rightMissing)
        return "insufficient_evidence";
    return null;
}
function unsupportedSchemaResult() {
    return {
        policyVersion: policy_1.GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
        snapshotSchemaVersion: policy_1.GOAL_RESTRICTION_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
        goalCompatibility: { comparisonMode: "set_overlap", status: "not_scored", reason: "unsupported_snapshot_schema" },
        restrictionEligibility: {
            verdict: "unknown",
            basis: "unsupported_snapshot_schema",
            comparableRestrictionEvidence: false
        },
        confidenceInputs: {
            goal: { eligibleGoalLabelCount: 0, comparableGoalDimension: false, goalSourceAvailableForBoth: false },
            restriction: {
                restrictionEvidenceCount: 0,
                unclassifiedRestrictionPresent: false,
                sharedSoftRestrictionCount: 0,
                restrictionSourceAvailableForBoth: false
            }
        },
        explanationReasonCodes: (0, reasonCodes_1.orderGoalRestrictionReasonCodes)(["limited_goal_evidence", "restriction_evidence_unknown"])
    };
}
function buildConfidenceInputs(leftFacts, rightFacts, goalCompatibility, sharedSoftRestrictionCount) {
    return {
        goal: {
            eligibleGoalLabelCount: leftFacts.goalLabelEvidenceCount + rightFacts.goalLabelEvidenceCount,
            comparableGoalDimension: goalCompatibility.status === "scored",
            goalSourceAvailableForBoth: leftFacts.hasGoalSource && rightFacts.hasGoalSource
        },
        restriction: {
            restrictionEvidenceCount: leftFacts.restrictionEvidenceCount + rightFacts.restrictionEvidenceCount,
            unclassifiedRestrictionPresent: leftFacts.unclassifiedRestrictionPresent || rightFacts.unclassifiedRestrictionPresent,
            sharedSoftRestrictionCount,
            restrictionSourceAvailableForBoth: leftFacts.hasRestrictionSource && rightFacts.hasRestrictionSource
        }
    };
}
function intersectionSize(left, right) {
    let size = 0;
    for (const value of right) {
        if (left.has(value))
            size += 1;
    }
    return size;
}
// Canonical pair ordering. `subjectUserId` is an opaque normalized id, compared by code unit so the
// result never depends on host locale.
function orderSnapshotPair(first, second) {
    return compareCodeUnits(first.subjectUserId, second.subjectUserId) <= 0 ? [first, second] : [second, first];
}
function sortUnique(values) {
    return Object.freeze([...new Set(values)].sort(compareCodeUnits));
}
function compareCodeUnits(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
});

__registry.set("packages/shared/src/domain/taste-similarity/goal-restriction/index.ts", (require, module, exports) => {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./policy"), exports);
__exportStar(require("./reasonCodes"), exports);
__exportStar(require("./types"), exports);
__exportStar(require("./comparator"), exports);
});

__registry.set("packages/shared/src/domain/taste-similarity/goal-restriction/policy.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOAL_COMPATIBILITY_SCORE_PRECISION = exports.GOAL_COMPATIBILITY_SCORE_MAX = exports.GOAL_COMPATIBILITY_SCORE_MIN = exports.GOAL_RESTRICTION_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = exports.GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION = void 0;
exports.roundGoalCompatibilityScore = roundGoalCompatibilityScore;
const snapshot_1 = require("../snapshot");
// TS-3D — the GOAL COMPATIBILITY and RESTRICTION ELIGIBILITY policy authority.
//
// A third independent version line. Neither `taste-similarity-v1.1` nor
// `social-context-compatibility-v1` changes in this round, and bumping either would falsely signal
// that its semantics had moved. Three questions — "do they like the same food", "do they eat
// compatibly", "do their nutrition goals and dietary constraints line up" — get three independently
// versionable answers.
exports.GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION = "goal-restriction-compatibility-v1";
// The only snapshot schema this policy reads. Anything else fails closed: goal compatibility is not
// scored and restriction eligibility returns the explicitly unknowable verdict.
exports.GOAL_RESTRICTION_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = snapshot_1.TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION;
// Canonical INTERNAL range for GOAL compatibility only. Restriction eligibility is deliberately
// NOT a number — see `types.ts`. There is no aggregate across the two, and no aggregate with taste
// or social context.
exports.GOAL_COMPATIBILITY_SCORE_MIN = 0;
exports.GOAL_COMPATIBILITY_SCORE_MAX = 1;
// Deterministic rounding authority, declared locally so this policy can diverge from its siblings in
// a later round without one silently dragging the other. Six decimals for the same reason the other
// policies chose it: it keeps the small rationals a Jaccard index produces distinguishable while
// removing binary representation noise.
exports.GOAL_COMPATIBILITY_SCORE_PRECISION = 6;
function roundGoalCompatibilityScore(value) {
    if (!Number.isFinite(value)) {
        throw new RangeError("Goal compatibility score must be a finite number.");
    }
    const factor = 10 ** exports.GOAL_COMPATIBILITY_SCORE_PRECISION;
    const rounded = Math.round(value * factor) / factor;
    // Guard the contract itself rather than trusting callers: an out-of-range score is a defect, not
    // something to silently clamp into looking valid.
    if (rounded < exports.GOAL_COMPATIBILITY_SCORE_MIN || rounded > exports.GOAL_COMPATIBILITY_SCORE_MAX) {
        throw new RangeError("Goal compatibility score must fall within the canonical 0..1 range.");
    }
    return rounded;
}
});

__registry.set("packages/shared/src/domain/taste-similarity/goal-restriction/reasonCodes.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOAL_RESTRICTION_REASON_CODES = void 0;
exports.orderGoalRestrictionReasonCodes = orderGoalRestrictionReasonCodes;
// TS-3D — closed reason-code vocabulary for goal compatibility and restriction eligibility.
//
// Its own vocabulary, separate from the taste and social-context codes. "You are both cutting" and
// "one of you has a constraint we could not classify" are not statements about taste or logistics,
// and a shared vocabulary would eventually let one render as another.
//
// Restriction evidence is classified `sensitive_internal` upstream, so these codes are the ONLY
// thing a caller may turn into wording. They carry no evidence values at all: never a restriction
// label, never a severity string, never a goal label, never a macro target, never a user id.
exports.GOAL_RESTRICTION_REASON_CODES = [
    "shared_goal_label",
    "different_goal_label",
    "limited_goal_evidence",
    "shared_soft_restriction",
    "restriction_requires_attention",
    "restriction_evidence_unknown"
];
// Deterministic ordering authority: codes are emitted in this fixed declaration order, never in
// discovery order, so two runs over the same pair — and the same pair supplied in either argument
// order — produce an identical sequence.
const REASON_CODE_RANK = new Map(exports.GOAL_RESTRICTION_REASON_CODES.map((code, index) => [code, index]));
function orderGoalRestrictionReasonCodes(codes) {
    return [...new Set(codes)].sort((left, right) => (REASON_CODE_RANK.get(left) ?? 0) - (REASON_CODE_RANK.get(right) ?? 0));
}
});

__registry.set("packages/shared/src/domain/taste-similarity/goal-restriction/types.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESTRICTION_ELIGIBILITY_VERDICTS = void 0;
// Restriction eligibility is a CATEGORICAL verdict, never a number.
//
// "How similar are their restrictions" is the wrong question: two people who each avoid one
// different thing are not half-eligible to eat together. The frozen contract also offers no
// enforcement level above `soft`, so nothing here can express an exclusion, and this round does not
// invent one.
exports.RESTRICTION_ELIGIBILITY_VERDICTS = ["compatible", "needs_attention", "unknown"];
});

__registry.set("packages/shared/src/domain/taste-similarity/goal.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
});

__registry.set("packages/shared/src/domain/taste-similarity/index.ts", (require, module, exports) => {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./evidence"), exports);
__exportStar(require("./preference"), exports);
__exportStar(require("./behavior"), exports);
__exportStar(require("./goal"), exports);
__exportStar(require("./restriction"), exports);
__exportStar(require("./normalization"), exports);
__exportStar(require("./sourceState"), exports);
__exportStar(require("./evidenceWindow"), exports);
__exportStar(require("./snapshot"), exports);
__exportStar(require("./similarity"), exports);
__exportStar(require("./compatibility"), exports);
__exportStar(require("./goal-restriction"), exports);
__exportStar(require("./comparison"), exports);
__exportStar(require("./confidence"), exports);
__exportStar(require("./cold-start"), exports);
__exportStar(require("./shared-adapter"), exports);
});

__registry.set("packages/shared/src/domain/taste-similarity/normalization.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeUnicodeText = normalizeUnicodeText;
exports.normalizeOpaqueCanonicalId = normalizeOpaqueCanonicalId;
exports.normalizeCanonicalTarget = normalizeCanonicalTarget;
exports.normalizeStringSet = normalizeStringSet;
exports.normalizePreferenceEvidence = normalizePreferenceEvidence;
exports.normalizeBehavioralEvidence = normalizeBehavioralEvidence;
exports.normalizeGoalEvidence = normalizeGoalEvidence;
exports.normalizeRestrictionEvidence = normalizeRestrictionEvidence;
exports.normalizeTasteEvidence = normalizeTasteEvidence;
exports.normalizeTasteEvidenceList = normalizeTasteEvidenceList;
const evidence_1 = require("./evidence");
const mealTypes = new Set(["breakfast", "lunch", "dinner", "late_night", "snack", "other"]);
const restrictionVisibilities = new Set(["private", "friends", "public"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function normalizeUnicodeText(value) {
    if (typeof value !== "string")
        throw new evidence_1.TasteEvidenceNormalizationError("Text evidence must be a string.");
    const normalized = value.normalize("NFC").trim();
    if (!normalized)
        throw new evidence_1.TasteEvidenceNormalizationError("Text evidence must not be empty.");
    return normalized;
}
function normalizeOpaqueCanonicalId(value) {
    if (typeof value !== "string")
        throw new evidence_1.TasteEvidenceNormalizationError("Canonical identifiers must be strings.");
    const normalized = value.trim();
    if (!normalized)
        throw new evidence_1.TasteEvidenceNormalizationError("Canonical identifiers must not be empty.");
    return normalized;
}
function normalizeCanonicalTarget(input) {
    if (!input || typeof input !== "object")
        throw new evidence_1.TasteEvidenceNormalizationError("Canonical target is required.");
    if (input.kind === "restaurant") {
        return { kind: "restaurant", restaurantId: normalizeOpaqueCanonicalId(input.restaurantId) };
    }
    if (input.kind === "branch") {
        return {
            kind: "branch",
            restaurantId: normalizeOpaqueCanonicalId(input.restaurantId),
            branchId: normalizeOpaqueCanonicalId(input.branchId)
        };
    }
    if (input.kind === "menu_item") {
        const branchId = input.branchId == null ? undefined : normalizeOpaqueCanonicalId(input.branchId);
        return {
            kind: "menu_item",
            restaurantId: normalizeOpaqueCanonicalId(input.restaurantId),
            ...(branchId ? { branchId } : {}),
            menuItemId: normalizeOpaqueCanonicalId(input.menuItemId)
        };
    }
    throw new evidence_1.TasteEvidenceNormalizationError("Canonical target kind is unsupported.");
}
function normalizeStringSet(values) {
    if (!Array.isArray(values))
        throw new evidence_1.TasteEvidenceNormalizationError("Evidence values must be an array.");
    return [...new Set(values.map(normalizeUnicodeText))].sort(compareCodeUnits);
}
function normalizePreferenceEvidence(input) {
    assertPreferenceShape(input);
    return {
        category: "preference",
        scope: input.scope,
        facet: input.facet,
        value: normalizeUnicodeText(input.value),
        polarity: input.polarity,
        evidence: normalizeEnvelope(input.evidence, "internal", false)
    };
}
function normalizeBehavioralEvidence(input) {
    if (input.category !== "behavior")
        throw new evidence_1.TasteEvidenceNormalizationError("Behavior normalizer requires behavior evidence.");
    if (input.behaviorKind === "meal_occurrence")
        return normalizeMealOccurrence(input);
    if (input.behaviorKind === "favorite")
        return normalizeFavorite(input);
    if (input.behaviorKind === "rating")
        return normalizeRating(input);
    throw new evidence_1.TasteEvidenceNormalizationError("Behavior evidence kind is unsupported.");
}
function normalizeGoalEvidence(input) {
    if (input.category !== "goal")
        throw new evidence_1.TasteEvidenceNormalizationError("Goal normalizer requires goal evidence.");
    if (input.evidence.origin !== "nutrition_goal" || input.evidence.sourceRecordKind !== "nutrition_goal") {
        throw new evidence_1.TasteEvidenceNormalizationError("Goal evidence must use canonical nutrition-goal authority.");
    }
    const validity = normalizeGoalValidity(input.validity);
    if (input.facet === "goal_label") {
        return {
            category: "goal",
            facet: "goal_label",
            value: normalizeUnicodeText(input.value),
            validity,
            evidence: normalizeEnvelope(input.evidence, "internal", false)
        };
    }
    const value = normalizeNumber(input.value, 0, Number.POSITIVE_INFINITY, "Goal target");
    const expectedUnit = input.facet === "daily_calories_target" ? "kcal" : "g";
    if (input.unit !== expectedUnit)
        throw new evidence_1.TasteEvidenceNormalizationError(`Goal target ${input.facet} must use ${expectedUnit}.`);
    return {
        category: "goal",
        facet: input.facet,
        value,
        unit: expectedUnit,
        validity,
        evidence: normalizeEnvelope(input.evidence, "sensitive_internal", false)
    };
}
function normalizeRestrictionEvidence(input) {
    if (input.category !== "restriction")
        throw new evidence_1.TasteEvidenceNormalizationError("Restriction normalizer requires restriction evidence.");
    if (input.evidence.origin !== "dietary_restriction" || input.evidence.sourceRecordKind !== "dietary_restriction") {
        throw new evidence_1.TasteEvidenceNormalizationError("Restriction evidence must use canonical dietary-restriction authority.");
    }
    const rawSeverity = normalizeUnicodeText(input.rawSeverity);
    return {
        category: "restriction",
        restrictionType: normalizeUnicodeText(input.restrictionType),
        label: normalizeUnicodeText(input.label),
        rawSeverity,
        enforcement: rawSeverity === "preference" ? "soft" : "unclassified",
        visibility: normalizeKnownOrUnknown(input.visibility, restrictionVisibilities),
        evidence: normalizeEnvelope(input.evidence, "sensitive_internal", false)
    };
}
function normalizeTasteEvidence(input) {
    if (input.category === "preference")
        return normalizePreferenceEvidence(input);
    if (input.category === "behavior")
        return normalizeBehavioralEvidence(input);
    if (input.category === "goal")
        return normalizeGoalEvidence(input);
    if (input.category === "restriction")
        return normalizeRestrictionEvidence(input);
    throw new evidence_1.TasteEvidenceNormalizationError("Taste evidence category is unsupported.");
}
function normalizeTasteEvidenceList(inputs) {
    const byEvidenceId = new Map();
    for (const input of inputs) {
        const normalized = normalizeTasteEvidence(input);
        const existing = byEvidenceId.get(normalized.evidence.evidenceId);
        if (existing && stableSerialize(existing) !== stableSerialize(normalized)) {
            throw new evidence_1.TasteEvidenceNormalizationError(`Conflicting evidence shares ID ${normalized.evidence.evidenceId}.`);
        }
        byEvidenceId.set(normalized.evidence.evidenceId, normalized);
    }
    return [...byEvidenceId.values()].sort((left, right) => compareCodeUnits(left.evidence.evidenceId, right.evidence.evidenceId));
}
function normalizeMealOccurrence(input) {
    if (input.interpretation !== "observed")
        throw new evidence_1.TasteEvidenceNormalizationError("Meal occurrence must remain observed behavior.");
    if (input.evidence.origin !== "meal_record" || input.evidence.sourceRecordKind !== "meal_record_item") {
        throw new evidence_1.TasteEvidenceNormalizationError("Meal occurrence must use canonical meal-record authority.");
    }
    const occurredAt = normalizeTimestamp(input.occurredAt, "Meal occurrence time");
    const evidence = normalizeEnvelope(input.evidence, "internal", true);
    if (evidence.recordedAt && evidence.recordedAt !== occurredAt) {
        throw new evidence_1.TasteEvidenceNormalizationError("Meal occurrence and evidence timestamps must agree when both are present.");
    }
    return {
        category: "behavior",
        behaviorKind: "meal_occurrence",
        interpretation: "observed",
        mealType: normalizeKnownOrUnknown(input.mealType, mealTypes),
        occurredAt,
        consumedRatio: normalizeNumber(input.consumedRatio, 0, 1, "Consumed ratio"),
        evidence
    };
}
function normalizeFavorite(input) {
    if (input.interpretation !== "positive_user_action")
        throw new evidence_1.TasteEvidenceNormalizationError("Favorite must remain a positive user action.");
    if (input.evidence.origin !== "favorite") {
        throw new evidence_1.TasteEvidenceNormalizationError("Favorite evidence must use canonical Favorites authority.");
    }
    const evidence = normalizeEnvelope(input.evidence, "internal", true);
    if (!evidence.target || evidence.target.kind !== input.favoriteKind) {
        throw new evidence_1.TasteEvidenceNormalizationError("Favorite kind must match its canonical target.");
    }
    if (input.favoriteKind === "restaurant" && input.evidence.sourceRecordKind !== "favorite_restaurant") {
        throw new evidence_1.TasteEvidenceNormalizationError("Restaurant favorite must use canonical restaurant Favorites authority.");
    }
    if (input.favoriteKind === "menu_item" && input.evidence.sourceRecordKind !== "favorite_menu_item") {
        throw new evidence_1.TasteEvidenceNormalizationError("Menu-item favorite must use canonical menu-item Favorites authority.");
    }
    return { ...input, category: "behavior", behaviorKind: "favorite", interpretation: "positive_user_action", evidence };
}
function normalizeRating(input) {
    if (input.interpretation !== "scalar_evaluation_unclassified") {
        throw new evidence_1.TasteEvidenceNormalizationError("Rating thresholds are not part of TS-1.");
    }
    if (input.evidence.origin !== "rating") {
        throw new evidence_1.TasteEvidenceNormalizationError("Rating evidence must use canonical Ratings authority.");
    }
    const evidence = normalizeEnvelope(input.evidence, "sensitive_internal", true);
    const expectedTarget = input.ratingKind === "restaurant" ? "restaurant" : "menu_item";
    const expectedRecord = input.ratingKind === "restaurant" ? "restaurant_rating" : "menu_item_rating";
    if (!evidence.target || evidence.target.kind !== expectedTarget || evidence.sourceRecordKind !== expectedRecord) {
        throw new evidence_1.TasteEvidenceNormalizationError("Rating kind must match its canonical target and Ratings authority.");
    }
    const feedbackInput = input.feedback ?? {};
    return {
        category: "behavior",
        behaviorKind: "rating",
        ratingKind: input.ratingKind,
        interpretation: "scalar_evaluation_unclassified",
        ratingValue: normalizeNumber(input.ratingValue, 0, 5, "Rating"),
        feedback: {
            ...optionalNormalizedField("taste", feedbackInput.taste),
            ...optionalNormalizedField("portion", feedbackInput.portion),
            ...optionalNormalizedField("price", feedbackInput.price),
            ...optionalNormalizedField("repurchase", feedbackInput.repurchase),
            dislikeReasons: normalizeStringSet(feedbackInput.dislikeReasons ?? [])
        },
        evidence: evidence
    };
}
function normalizeEnvelope(input, privacyClassification, allowTarget) {
    const target = input.target == null ? null : normalizeCanonicalTarget(input.target);
    if (!allowTarget && target)
        throw new evidence_1.TasteEvidenceNormalizationError("This evidence category cannot carry a canonical entity target.");
    const sourceConfidence = input.sourceConfidence == null
        ? undefined
        : normalizeNumber(input.sourceConfidence, 0, 1, "Source confidence");
    return {
        evidenceId: normalizeOpaqueCanonicalId(input.evidenceId),
        origin: input.origin,
        sourceRecordKind: input.sourceRecordKind,
        ...optionalTimestampField("recordedAt", input.recordedAt),
        ...optionalTimestampField("updatedAt", input.updatedAt),
        confidenceBasis: input.confidenceBasis,
        ...(sourceConfidence == null ? {} : { sourceConfidence }),
        decayEligibility: input.decayEligibility,
        privacyClassification,
        target
    };
}
function assertPreferenceShape(input) {
    if (input.category !== "preference")
        throw new evidence_1.TasteEvidenceNormalizationError("Preference normalizer requires preference evidence.");
    const key = `${input.scope}:${input.facet}:${input.polarity}`;
    const allowed = new Set([
        "food_taste:cuisine:positive",
        "food_taste:flavor:negative",
        "food_taste:spice:neutral",
        "food_taste:spice:unclassified",
        "meal_pattern:meal_type:positive",
        "meal_pattern:meal_type:unclassified",
        "dining_context:dining_style:neutral",
        "dining_context:dining_style:unclassified",
        "social_logistics:payment_preference:neutral",
        "social_logistics:payment_preference:unclassified"
    ]);
    if (!allowed.has(key))
        throw new evidence_1.TasteEvidenceNormalizationError("Preference scope, facet, and polarity are inconsistent.");
    if (input.evidence.origin !== "explicit_profile" || input.evidence.sourceRecordKind !== "taste_profile") {
        throw new evidence_1.TasteEvidenceNormalizationError("Preference evidence must use the canonical taste profile authority.");
    }
}
function normalizeKnownOrUnknown(input, knownValues) {
    const rawValue = typeof input === "string"
        ? normalizeUnicodeText(input)
        : input.classification === "known"
            ? normalizeUnicodeText(input.value)
            : normalizeUnicodeText(input.rawValue);
    return knownValues.has(rawValue)
        ? { classification: "known", value: rawValue }
        : { classification: "unknown", rawValue };
}
function normalizeGoalValidity(validity) {
    const startsOn = normalizeDate(validity.startsOn, "Goal start date");
    const endsOn = validity.endsOn == null ? undefined : normalizeDate(validity.endsOn, "Goal end date");
    if (endsOn && endsOn < startsOn)
        throw new evidence_1.TasteEvidenceNormalizationError("Goal end date must not precede its start date.");
    if (typeof validity.isActive !== "boolean")
        throw new evidence_1.TasteEvidenceNormalizationError("Goal active state must be boolean.");
    return { startsOn, ...(endsOn ? { endsOn } : {}), isActive: validity.isActive };
}
function normalizeDate(value, label) {
    const normalized = normalizeUnicodeText(value);
    if (!datePattern.test(normalized))
        throw new evidence_1.TasteEvidenceNormalizationError(`${label} must use YYYY-MM-DD.`);
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
        throw new evidence_1.TasteEvidenceNormalizationError(`${label} is invalid.`);
    }
    return normalized;
}
function normalizeTimestamp(value, label) {
    const normalized = normalizeUnicodeText(value);
    if (Number.isNaN(Date.parse(normalized)))
        throw new evidence_1.TasteEvidenceNormalizationError(`${label} is invalid.`);
    return normalized;
}
function normalizeNumber(value, minimum, maximum, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
        throw new evidence_1.TasteEvidenceNormalizationError(`${label} is outside its canonical range.`);
    }
    return value;
}
function optionalTimestampField(key, value) {
    return value == null ? {} : { [key]: normalizeTimestamp(value, key) };
}
function optionalNormalizedField(key, value) {
    return value == null ? {} : { [key]: normalizeUnicodeText(value) };
}
function compareCodeUnits(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function stableSerialize(value) {
    if (Array.isArray(value))
        return `[${value.map(stableSerialize).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.entries(value)
            .sort(([left], [right]) => compareCodeUnits(left, right))
            .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
});

__registry.set("packages/shared/src/domain/taste-similarity/preference.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
});

__registry.set("packages/shared/src/domain/taste-similarity/restriction.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
});

__registry.set("packages/shared/src/domain/taste-similarity/shared-adapter/adapt.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adaptSharedTasteComparison = adaptSharedTasteComparison;
const snapshot_1 = require("../snapshot");
const similarity_1 = require("../similarity");
const compatibility_1 = require("../compatibility");
const goal_restriction_1 = require("../goal-restriction");
const comparison_1 = require("../comparison");
const confidence_1 = require("../confidence");
const cold_start_1 = require("../cold-start");
const policy_1 = require("./policy");
// TS-6 — shared taste comparison adapter.
//
// PROJECTION ONLY. Nothing in this file computes. There is no set similarity here, no mean, no
// coverage figure, no evidence-support arithmetic, no evidence-readiness classification and no
// eligibility verdict — every value it emits was produced by a frozen layer and is copied through
// byte-for-byte. No rounding, no normalisation, no clamping, no conversion to a display scale.
//
// PROJECTION, NOT PASS-THROUGH. The three frozen bundles are already privacy-safe, but returning
// them verbatim would make every downstream consumer depend on the foundation's internal layout.
// This layer exists so they do not: it publishes a minimal shape and leaves the internals — the
// comparator's own confidence inputs, its dimension arrays, its structural metadata — behind.
//
// CONSUMER-NEUTRAL. It answers "what safe derived facts are available", never "what should be done
// about them". There is no readiness field, no ordering field, no gate and no aggregate, because a
// caller who found one would reasonably treat it as an answer to a question this layer cannot
// answer. Restriction attention and limited evidence are projected as facts, never converted into an
// adjustment.
//
// FAIL CLOSED. Three independently produced inputs are accepted, so every authority they share is
// cross-checked first. Inputs that disagree describe different worlds, and the failure carries no
// component data at all rather than a partially populated payload someone could read past.
function adaptSharedTasteComparison(comparison, confidence, coldStart) {
    const versions = {
        sharedAdapterPolicyVersion: policy_1.SHARED_TASTE_ADAPTER_POLICY_VERSION,
        coldStartPolicyVersion: cold_start_1.COLD_START_POLICY_VERSION,
        evidenceConfidencePolicyVersion: confidence_1.EVIDENCE_CONFIDENCE_POLICY_VERSION,
        comparisonBundleVersion: comparison_1.TASTE_COMPARISON_BUNDLE_VERSION,
        tastePolicyVersion: similarity_1.TASTE_SIMILARITY_POLICY_VERSION,
        socialContextPolicyVersion: compatibility_1.SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
        goalRestrictionPolicyVersion: goal_restriction_1.GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
        snapshotSchemaVersion: snapshot_1.TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION
    };
    const blocking = findBlockingReason(comparison, confidence, coldStart);
    if (blocking !== null) {
        return Object.freeze({ versions: Object.freeze(versions), status: "unsupported", reason: blocking });
    }
    return Object.freeze({
        versions: Object.freeze(versions),
        status: "adapted",
        taste: Object.freeze({
            similarity: projectTasteSimilarity(comparison.taste),
            evidenceConfidence: projectEvidenceConfidence(confidence),
            evidenceState: coldStart.tasteEvidence.state
        }),
        context: Object.freeze({
            mealPattern: projectDimension(comparison.socialContext.mealPatternCompatibility),
            dining: projectDimension(comparison.socialContext.diningCompatibility),
            socialLogistics: projectDimension(comparison.socialContext.socialLogisticsCompatibility)
        }),
        goal: projectGoal(comparison.goalRestriction.goalCompatibility),
        restriction: Object.freeze({
            verdict: comparison.goalRestriction.restrictionEligibility.verdict,
            basis: comparison.goalRestriction.restrictionEligibility.basis,
            evidencePresentForBoth: coldStart.restrictionState.evidencePresentForBoth,
            unclassifiedPresent: coldStart.restrictionState.unclassifiedPresent,
            sourceReachableForBoth: coldStart.restrictionState.sourceReachableForBoth
        }),
        signals: Object.freeze({
            // Copied, then frozen. Downstream never receives a reference that could mutate an upstream
            // array, and mutating the projection cannot reach back into the foundation.
            availableFamilies: Object.freeze([...coldStart.availableSignalFamilies]),
            incompleteFamilies: Object.freeze([...coldStart.incompleteSignalFamilies])
        }),
        reasons: Object.freeze({
            // Two channels, each preserving its own authority's order. No merge, no re-sort, no invented
            // entry: a code can only appear here because a frozen layer already emitted it.
            comparison: Object.freeze([...comparison.explanationReasonCodes]),
            evidence: Object.freeze([...coldStart.reasonCodes])
        })
    });
}
// Every authority the three inputs share is compared. A mismatch anywhere means they did not come
// from one coherent evaluation, and no part of the projection would be trustworthy.
function findBlockingReason(comparison, confidence, coldStart) {
    if (comparison.status !== "assembled")
        return "unsupported_snapshot_schema";
    if (coldStart.tasteEvidence.state === "unsupported")
        return "unsupported_snapshot_schema";
    const coherent = comparison.versions.snapshotSchemaVersion === confidence.versions.snapshotSchemaVersion &&
        comparison.versions.snapshotSchemaVersion === coldStart.versions.snapshotSchemaVersion &&
        comparison.versions.tastePolicyVersion === confidence.versions.tastePolicyVersion &&
        comparison.versions.tastePolicyVersion === coldStart.versions.tastePolicyVersion &&
        comparison.versions.socialContextPolicyVersion === confidence.versions.socialContextPolicyVersion &&
        comparison.versions.socialContextPolicyVersion === coldStart.versions.socialContextPolicyVersion &&
        comparison.versions.goalRestrictionPolicyVersion === confidence.versions.goalRestrictionPolicyVersion &&
        comparison.versions.goalRestrictionPolicyVersion === coldStart.versions.goalRestrictionPolicyVersion &&
        comparison.versions.bundleVersion === confidence.versions.comparisonBundleVersion &&
        comparison.versions.bundleVersion === coldStart.versions.comparisonBundleVersion &&
        confidence.versions.evidenceConfidencePolicyVersion === coldStart.versions.evidenceConfidencePolicyVersion;
    return coherent ? null : "policy_version_mismatch";
}
// The frozen taste result carries dimension arrays, overlap lists and its own confidence inputs.
// None of that crosses this boundary: the projection is the status, and the score exactly as it was.
function projectTasteSimilarity(taste) {
    if (taste.status === "scored")
        return Object.freeze({ status: "scored", score: taste.score });
    return Object.freeze({ status: "not_scored", reason: taste.reason });
}
function projectDimension(dimension) {
    if (dimension.status === "scored")
        return Object.freeze({ status: "scored", score: dimension.score });
    return Object.freeze({ status: "not_scored", reason: dimension.reason });
}
// Goal labels and every macro target stay behind this boundary. Only the comparability outcome and
// its exact value cross it.
function projectGoal(goal) {
    if (goal.status === "scored")
        return Object.freeze({ status: "scored", score: goal.score });
    return Object.freeze({ status: "not_scored", reason: goal.reason });
}
function projectEvidenceConfidence(confidence) {
    const taste = confidence.taste;
    if (taste.status === "available") {
        return Object.freeze({ status: "available", value: taste.value, basis: taste.basis });
    }
    return Object.freeze({ status: "not_available", reason: taste.reason });
}
});

__registry.set("packages/shared/src/domain/taste-similarity/shared-adapter/index.ts", (require, module, exports) => {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./policy"), exports);
__exportStar(require("./types"), exports);
__exportStar(require("./adapt"), exports);
});

__registry.set("packages/shared/src/domain/taste-similarity/shared-adapter/policy.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHARED_TASTE_ADAPTER_UNSUPPORTED_REASONS = exports.SHARED_TASTE_ADAPTER_STATUSES = exports.SHARED_TASTE_ADAPTER_POLICY_VERSION = void 0;
// TS-6 — the SHARED TASTE ADAPTER authority.
//
// This layer adapts. It projects three frozen results into one minimal, privacy-safe,
// consumer-neutral shape and computes nothing: no similarity, no compatibility, no evidence support,
// no evidence readiness, no eligibility. Every number it emits was produced by a frozen layer and is
// copied through unchanged.
//
// It also decides nothing. Whether a pair should be surfaced, suppressed, ordered or acted on is
// consumer policy belonging to a runtime well above this contract, and no field here may stand in
// for that judgement.
//
// Independent version line. It owns the PROJECTION SHAPE — field grouping, which safe reason
// channels are exposed, and the input-coherence contract — and owns no scoring semantics whatsoever.
// A later change to the projection bumps this version alone.
exports.SHARED_TASTE_ADAPTER_POLICY_VERSION = "shared-taste-adapter-v1";
// Neutral adapter outcome. `adapted` says the three inputs cohered and were projected; it says
// nothing about the pair. There is deliberately no third value that a caller could read as approval.
exports.SHARED_TASTE_ADAPTER_STATUSES = ["adapted", "unsupported"];
// Why a projection could not be produced. These describe the ADAPTER'S OWN contract state — an
// uninterpretable snapshot, or three inputs that disagree about which policies produced them. They
// are not explanations about the pair, and no explanation vocabulary is invented here: every reason
// describing the users themselves is projected verbatim from a frozen layer.
exports.SHARED_TASTE_ADAPTER_UNSUPPORTED_REASONS = [
    "unsupported_snapshot_schema",
    "policy_version_mismatch"
];
});

__registry.set("packages/shared/src/domain/taste-similarity/shared-adapter/types.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
});

__registry.set("packages/shared/src/domain/taste-similarity/similarity/comparator.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareTasteSimilarity = compareTasteSimilarity;
const policy_1 = require("./policy");
const reasonCodes_1 = require("./reasonCodes");
// TS-3B — the pure user-to-user FOOD-TASTE comparator.
//
// Pure by construction: no clock, no randomness, no network, no database, no React, no Supabase, no
// locale-sensitive comparison. Given the same two snapshots and this policy version it returns
// byte-identical output, in either argument order.
//
// SCORE COMPOSITION, and why it is mathematically neutral.
//
// Every comparable dimension contributes an agreement value in 0..1 and the result is their
// UNWEIGHTED ARITHMETIC MEAN. That is the only composition available without inventing authority:
// TS-1 ranks evidence qualitatively (user_explicit > user_action > observed_consumption) but
// assigns no magnitudes, so any unequal weighting would be a number this repository has never
// agreed. The mean is symmetric, bounded by the bounds of its inputs, and invariant to dimension
// ordering. Weighting is a TS-4+ decision and would require a new policy version.
//
// Set agreement uses the Jaccard index |A∩B| / |A∪B|. It is a standard, parameter-free set
// similarity: no tuning constant, no threshold, no asymmetry. Two users who each listed cuisines
// and share none score 0 on that dimension — a real measurement, not a conflict.
//
// The dividing line this file keeps: MISSING evidence is `unknown` and leaves the denominator
// entirely; PRESENT evidence that fails to overlap is a measured 0. Conflating the two is the
// single most damaging thing a similarity scorer can do, so the two paths never meet.
//
// TS-3B-R1 — REPEATED OBSERVED CONSUMPTION as a weaker behavioural fallback.
//
// `consumed once != liked`. A single meal occurrence proves a person ate somewhere, not that they
// enjoyed it, so one occurrence never creates taste affinity. Repeated consumption of the SAME
// canonical target inside the bounded snapshot is a genuine, if weaker, behavioural signal.
//
// Two rules keep it honest:
//
//   1. FALLBACK, NEVER ADDITIVE. Per identity family — restaurants, then menu items — the repeated
//      dimension activates only when the corresponding FAVORITE dimension is not comparable. A pair
//      who both marked favorites and both ate repeatedly casts one vote for that behavioural family,
//      not two. Evidence priority is enforced by this suppression rule, never by a numeric weight:
//      TS-1 ranks `user_action` above `observed_consumption` qualitatively and assigns no magnitudes.
//
//   2. BINARY, NEVER GRADED. Crossing MIN_REPEATED_MEAL_OCCURRENCES is all there is. Visit counts,
//      recency, timestamps, `sourceConfidence` and consumed ratio never reach the score. R1
//      implements no decay of any kind — the bounded snapshot is the only temporal boundary.
//
// A dimension whose family has no meal evidence at all on either side does not appear in the result
// at all, so a snapshot pair without meals scores exactly as it did under `taste-similarity-v1`.
const EMPTY_DIMENSIONS = Object.freeze([]);
function compareTasteSimilarity(snapshotA, snapshotB) {
    // Symmetry is structural, not incidental: the pair is canonically ordered before anything reads
    // it, so both argument orders execute the identical computation over the identical operands.
    const [left, right] = orderSnapshotPair(snapshotA, snapshotB);
    if (snapshotA.schemaVersion !== policy_1.TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION ||
        snapshotB.schemaVersion !== policy_1.TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION) {
        return notScored("unsupported_snapshot_schema", emptyConfidenceInputs(), []);
    }
    const leftFacts = collectTasteFacts(left);
    const rightFacts = collectTasteFacts(right);
    const outcomes = [];
    const overlaps = [];
    const sharedAvoidances = [];
    const unknowns = [];
    const reasonCodes = new Set();
    // --- cuisine: the only positive-polarity preference TS-1 defines -------------------------------
    const cuisine = compareSets(leftFacts.cuisines, rightFacts.cuisines);
    if (cuisine === null) {
        unknowns.push("cuisine_preference");
    }
    else {
        outcomes.push({ dimension: "cuisine_preference", agreement: cuisine.agreement });
        if (cuisine.intersectionSize > 0) {
            overlaps.push("cuisine_preference");
            reasonCodes.add("shared_cuisine_preference");
        }
    }
    // --- flavor: the only negative-polarity preference TS-1 defines --------------------------------
    // A shared dislike is genuine taste agreement, but it is recorded as an AVOIDANCE, never as an
    // overlap. One user's dislike against the other's silence is `unknown`, never a conflict: TS-1
    // has no positive flavor authority to contradict, so a conflict here would be invented.
    const flavor = compareSets(leftFacts.dislikedFlavors, rightFacts.dislikedFlavors);
    if (flavor === null) {
        unknowns.push("flavor_avoidance");
    }
    else {
        outcomes.push({ dimension: "flavor_avoidance", agreement: flavor.agreement });
        if (flavor.intersectionSize > 0) {
            sharedAvoidances.push("flavor_avoidance");
            reasonCodes.add("shared_flavor_avoidance");
        }
    }
    // --- spice: exact normalized string equality only ----------------------------------------------
    // TS-1 gives spice `neutral | unclassified` polarity and a bare string with no ordering, so there
    // is no mild < medium < spicy scale to compare against. Equal values are an observed overlap;
    // DIFFERENT values are `unknown`, not a conflict and not a zero — scoring them 0 would assert a
    // maximal dissimilarity the contract cannot support. Consequence, stated plainly: in v1 spice can
    // only ever raise a score or be excluded. Ordinal spice comparison is deferred.
    if (leftFacts.spice === null || rightFacts.spice === null || leftFacts.spice !== rightFacts.spice) {
        unknowns.push("spice_preference");
    }
    else {
        outcomes.push({ dimension: "spice_preference", agreement: 1 });
        overlaps.push("spice_preference");
        reasonCodes.add("shared_spice_preference");
    }
    // --- favorites: canonical ids only -------------------------------------------------------------
    // Identity comes from the canonical target reference carried by the evidence envelope. Display
    // names are never read, so two different restaurants sharing a name can never look like a match.
    const favoriteRestaurants = compareSets(leftFacts.favoriteRestaurantIds, rightFacts.favoriteRestaurantIds);
    if (favoriteRestaurants === null) {
        unknowns.push("favorite_restaurant");
    }
    else {
        outcomes.push({ dimension: "favorite_restaurant", agreement: favoriteRestaurants.agreement });
        if (favoriteRestaurants.intersectionSize > 0) {
            overlaps.push("favorite_restaurant");
            reasonCodes.add("shared_favorite_restaurant");
        }
    }
    const favoriteMenuItems = compareSets(leftFacts.favoriteMenuItemIds, rightFacts.favoriteMenuItemIds);
    if (favoriteMenuItems === null) {
        unknowns.push("favorite_menu_item");
    }
    else {
        outcomes.push({ dimension: "favorite_menu_item", agreement: favoriteMenuItems.agreement });
        if (favoriteMenuItems.intersectionSize > 0) {
            overlaps.push("favorite_menu_item");
            reasonCodes.add("shared_favorite_menu_item");
        }
    }
    // --- repeated observed consumption: restaurant family ------------------------------------------
    // Fallback only. `favoriteRestaurants !== null` means both users supplied canonical favorite
    // restaurants, so that stronger dimension already speaks for this behavioural family and the
    // weaker one is suppressed rather than added alongside it.
    const restaurantFamilyHasMeals = leftFacts.observedMealRestaurants || rightFacts.observedMealRestaurants;
    const restaurantSuppressedByFavorites = favoriteRestaurants !== null && restaurantFamilyHasMeals;
    let repeatedRestaurantContribution = 0;
    if (favoriteRestaurants === null && restaurantFamilyHasMeals) {
        const repeatedRestaurants = compareSets(leftFacts.repeatedRestaurantIds, rightFacts.repeatedRestaurantIds);
        if (repeatedRestaurants === null) {
            unknowns.push("repeated_meal_restaurant");
        }
        else {
            outcomes.push({ dimension: "repeated_meal_restaurant", agreement: repeatedRestaurants.agreement });
            repeatedRestaurantContribution =
                (leftFacts.repeatedRestaurantIds?.length ?? 0) + (rightFacts.repeatedRestaurantIds?.length ?? 0);
            if (repeatedRestaurants.intersectionSize > 0) {
                overlaps.push("repeated_meal_restaurant");
                reasonCodes.add("shared_repeated_restaurant_consumption");
            }
        }
    }
    // --- repeated observed consumption: menu item family -------------------------------------------
    const menuItemFamilyHasMeals = leftFacts.observedMealMenuItems || rightFacts.observedMealMenuItems;
    const menuItemSuppressedByFavorites = favoriteMenuItems !== null && menuItemFamilyHasMeals;
    let repeatedMenuItemContribution = 0;
    if (favoriteMenuItems === null && menuItemFamilyHasMeals) {
        const repeatedMenuItems = compareSets(leftFacts.repeatedMenuItemIds, rightFacts.repeatedMenuItemIds);
        if (repeatedMenuItems === null) {
            unknowns.push("repeated_meal_menu_item");
        }
        else {
            outcomes.push({ dimension: "repeated_meal_menu_item", agreement: repeatedMenuItems.agreement });
            repeatedMenuItemContribution =
                (leftFacts.repeatedMenuItemIds?.length ?? 0) + (rightFacts.repeatedMenuItemIds?.length ?? 0);
            if (repeatedMenuItems.intersectionSize > 0) {
                overlaps.push("repeated_meal_menu_item");
                reasonCodes.add("shared_repeated_menu_item_consumption");
            }
        }
    }
    const comparableDimensions = outcomes.map((outcome) => outcome.dimension);
    const confidenceInputs = buildConfidenceInputs(left, right, leftFacts, rightFacts, comparableDimensions.length, unknowns.length, {
        repeatedBehavioralContribution: repeatedRestaurantContribution + repeatedMenuItemContribution,
        restaurantSuppressedByFavorites,
        menuItemSuppressedByFavorites
    });
    if (comparableDimensions.length === 0) {
        // Distinguish "neither side has any v1 evidence" from "one side has none". Both are unscorable,
        // but they are different product situations and a caller may treat them differently.
        const reason = leftFacts.evidenceCount === 0 && rightFacts.evidenceCount === 0
            ? "no_comparable_evidence"
            : "insufficient_evidence";
        return notScored(reason, confidenceInputs, unknowns);
    }
    // Unweighted mean over COMPARABLE dimensions only. Unknown dimensions never entered `outcomes`,
    // so they contribute to neither the numerator nor the denominator.
    const total = outcomes.reduce((sum, outcome) => sum + outcome.agreement, 0);
    const score = (0, policy_1.roundTasteSimilarityScore)(total / outcomes.length);
    if (confidenceInputs.comparableDimensionCount <= 1 || confidenceInputs.evidenceCount <= 2) {
        reasonCodes.add("limited_evidence");
    }
    return {
        policyVersion: policy_1.TASTE_SIMILARITY_POLICY_VERSION,
        snapshotSchemaVersion: policy_1.TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
        status: "scored",
        score,
        comparableDimensions: freezeDimensions(comparableDimensions),
        overlaps: freezeDimensions(overlaps),
        sharedAvoidances: freezeDimensions(sharedAvoidances),
        unknowns: freezeDimensions(unknowns),
        conflicts: EMPTY_DIMENSIONS,
        confidenceInputs,
        explanationReasonCodes: (0, reasonCodes_1.orderTasteSimilarityReasonCodes)(reasonCodes)
    };
}
function notScored(reason, confidenceInputs, unknowns) {
    return {
        policyVersion: policy_1.TASTE_SIMILARITY_POLICY_VERSION,
        snapshotSchemaVersion: policy_1.TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
        status: "not_scored",
        reason,
        comparableDimensions: EMPTY_DIMENSIONS,
        overlaps: EMPTY_DIMENSIONS,
        sharedAvoidances: EMPTY_DIMENSIONS,
        unknowns: freezeDimensions([...unknowns]),
        conflicts: EMPTY_DIMENSIONS,
        confidenceInputs,
        explanationReasonCodes: (0, reasonCodes_1.orderTasteSimilarityReasonCodes)(["limited_evidence"])
    };
}
// Reads ONLY the v1 food-taste surface. meal_pattern / dining_context / social_logistics
// preferences, goals, restrictions, meal occurrences and ratings are never touched here, which is
// what makes their exclusion structural rather than a downstream filter.
function collectTasteFacts(snapshot) {
    const cuisines = [];
    const dislikedFlavors = [];
    const favoriteRestaurantIds = [];
    const favoriteMenuItemIds = [];
    let spice = null;
    let explicitEvidenceCount = 0;
    let behavioralEvidenceCount = 0;
    for (const preference of snapshot.preferences) {
        if (preference.scope !== "food_taste")
            continue;
        if (preference.facet === "cuisine") {
            cuisines.push(preference.value);
            explicitEvidenceCount += 1;
        }
        else if (preference.facet === "flavor") {
            dislikedFlavors.push(preference.value);
            explicitEvidenceCount += 1;
        }
        else if (preference.facet === "spice") {
            // Snapshot preferences are deduplicated and sorted by evidenceId upstream; a taste profile row
            // is unique per user, so at most one spice value can exist. Taking the first keeps the read
            // deterministic even if that ever changes.
            if (spice === null) {
                spice = preference.value;
                explicitEvidenceCount += 1;
            }
        }
    }
    // Distinct meal-occurrence evidence ids per canonical target. Keyed by evidence id because that is
    // the frozen dedup authority (`normalizeTasteEvidenceList` collapses identical records by id and
    // rejects conflicting ones), so a record repeated under the SAME id can never fake repetition.
    const restaurantOccurrenceIds = new Map();
    const menuItemOccurrenceIds = new Map();
    for (const behavior of snapshot.behavior) {
        if (behavior.behaviorKind === "favorite") {
            const target = behavior.evidence.target;
            if (behavior.favoriteKind === "restaurant" && target.kind === "restaurant") {
                favoriteRestaurantIds.push(target.restaurantId);
                behavioralEvidenceCount += 1;
            }
            else if (behavior.favoriteKind === "menu_item" && target.kind === "menu_item") {
                // Menu items are addressed by the canonical restaurant + menu item pair, never by name.
                favoriteMenuItemIds.push(`${target.restaurantId}::${target.menuItemId}`);
                behavioralEvidenceCount += 1;
            }
            continue;
        }
        // TS-3B-R1. Only durable, observed meal consumption is eligible. `interpretation` and the
        // meal-record origin are already pinned by the frozen normalizer; `confidenceBasis` is not, so it
        // is checked here — a meal record carrying any other basis is not observed consumption and is
        // not counted. Ratings, corrections, planned meals, searches and recommendation feedback are
        // never `meal_occurrence` behavior and therefore cannot reach this branch at all.
        if (behavior.behaviorKind !== "meal_occurrence")
            continue;
        if (behavior.interpretation !== "observed")
            continue;
        if (behavior.evidence.confidenceBasis !== "observed_consumption")
            continue;
        const target = behavior.evidence.target;
        if (target === null)
            continue;
        // `consumedRatio` is deliberately not read: the frozen contract normalizes it to 0..1 and
        // attaches no meaning to any particular value, so any threshold here would be an invented
        // product rule. A durable meal occurrence is the unit of evidence.
        //
        // A `branch` target is skipped outright. R1 introduces no branch dimension, and treating a
        // branch reference as a restaurant visit would be an inference this round never authorized.
        if (target.kind === "restaurant") {
            addOccurrence(restaurantOccurrenceIds, target.restaurantId, behavior.evidence.evidenceId);
        }
        else if (target.kind === "menu_item") {
            addOccurrence(menuItemOccurrenceIds, `${target.restaurantId}::${target.menuItemId}`, behavior.evidence.evidenceId);
        }
    }
    const repeatedRestaurantIds = selectRepeatedTargets(restaurantOccurrenceIds);
    const repeatedMenuItemIds = selectRepeatedTargets(menuItemOccurrenceIds);
    const favoritesState = snapshot.sourceStates.favorites.status;
    const tasteProfileState = snapshot.sourceStates.taste_profile.status;
    const mealsState = snapshot.sourceStates.meals.status;
    return {
        cuisines: cuisines.length ? sortUnique(cuisines) : null,
        dislikedFlavors: dislikedFlavors.length ? sortUnique(dislikedFlavors) : null,
        spice,
        favoriteRestaurantIds: favoriteRestaurantIds.length ? sortUnique(favoriteRestaurantIds) : null,
        favoriteMenuItemIds: favoriteMenuItemIds.length ? sortUnique(favoriteMenuItemIds) : null,
        repeatedRestaurantIds: repeatedRestaurantIds.length ? repeatedRestaurantIds : null,
        repeatedMenuItemIds: repeatedMenuItemIds.length ? repeatedMenuItemIds : null,
        // "Any eligible meal evidence was observed for this identity family", which is what decides
        // whether the fallback dimension exists at all. A family with no meal evidence on either side is
        // omitted from the result entirely, preserving pre-R1 output byte for byte.
        observedMealRestaurants: restaurantOccurrenceIds.size > 0,
        observedMealMenuItems: menuItemOccurrenceIds.size > 0,
        evidenceCount: explicitEvidenceCount + behavioralEvidenceCount,
        explicitEvidenceCount,
        behavioralEvidenceCount,
        hasTasteProfileSource: tasteProfileState === "available" || tasteProfileState === "empty",
        hasFavoritesSource: favoritesState === "available" || favoritesState === "empty",
        hasMealsSource: mealsState === "available" || mealsState === "empty",
        favoritesTruncated: snapshot.evidenceWindow.favorites.truncation !== "not_truncated",
        // Truncation is REPORTED, never acted on. A short window can only under-report repetition, so it
        // must not be converted into a negative assertion about the pair.
        mealsTruncated: snapshot.evidenceWindow.meals.truncation !== "not_truncated"
    };
}
function addOccurrence(index, targetKey, evidenceId) {
    const existing = index.get(targetKey);
    if (existing) {
        existing.add(evidenceId);
        return;
    }
    index.set(targetKey, new Set([evidenceId]));
}
// Binary qualification: a target either crossed the repetition boundary or it did not. How far past
// it a target went is deliberately discarded here, which is what makes an occurrence multiplier
// impossible to add downstream without changing this function.
function selectRepeatedTargets(index) {
    const qualifying = [];
    for (const [targetKey, evidenceIds] of index) {
        if (evidenceIds.size >= policy_1.MIN_REPEATED_MEAL_OCCURRENCES)
            qualifying.push(targetKey);
    }
    return sortUnique(qualifying);
}
// Returns null when the dimension is NOT comparable — i.e. at least one side contributed no
// evidence. A returned agreement of 0 means both sides had evidence and shared none.
function compareSets(left, right) {
    if (left === null || right === null)
        return null;
    const rightSet = new Set(right);
    let intersectionSize = 0;
    for (const value of left) {
        if (rightSet.has(value))
            intersectionSize += 1;
    }
    const unionSize = new Set([...left, ...right]).size;
    if (unionSize === 0)
        return null;
    return { agreement: intersectionSize / unionSize, intersectionSize };
}
function buildConfidenceInputs(left, right, leftFacts, rightFacts, comparableDimensionCount, unknownDimensionCount, repeated) {
    void left;
    void right;
    // Only repetition that actually entered a comparable dimension counts as behavioural evidence.
    // Suppressed fallback evidence did not contribute to the score and must not inflate the count that
    // decides whether the pair is flagged as thinly evidenced.
    const behavioralEvidenceCount = leftFacts.behavioralEvidenceCount + rightFacts.behavioralEvidenceCount + repeated.repeatedBehavioralContribution;
    return {
        comparableDimensionCount,
        unknownDimensionCount,
        evidenceCount: leftFacts.evidenceCount + rightFacts.evidenceCount + repeated.repeatedBehavioralContribution,
        explicitEvidenceCount: leftFacts.explicitEvidenceCount + rightFacts.explicitEvidenceCount,
        behavioralEvidenceCount,
        sourceAvailability: {
            tasteProfileAvailableForBoth: leftFacts.hasTasteProfileSource && rightFacts.hasTasteProfileSource,
            favoritesAvailableForBoth: leftFacts.hasFavoritesSource && rightFacts.hasFavoritesSource,
            mealsAvailableForBoth: leftFacts.hasMealsSource && rightFacts.hasMealsSource
        },
        truncation: {
            favoritesTruncatedForEither: leftFacts.favoritesTruncated || rightFacts.favoritesTruncated,
            mealsTruncatedForEither: leftFacts.mealsTruncated || rightFacts.mealsTruncated
        },
        repeatedMealEvidence: {
            qualifyingRestaurantTargets: (leftFacts.repeatedRestaurantIds?.length ?? 0) + (rightFacts.repeatedRestaurantIds?.length ?? 0),
            qualifyingMenuItemTargets: (leftFacts.repeatedMenuItemIds?.length ?? 0) + (rightFacts.repeatedMenuItemIds?.length ?? 0),
            restaurantSuppressedByFavorites: repeated.restaurantSuppressedByFavorites,
            menuItemSuppressedByFavorites: repeated.menuItemSuppressedByFavorites
        }
    };
}
function emptyConfidenceInputs() {
    return {
        comparableDimensionCount: 0,
        unknownDimensionCount: 0,
        evidenceCount: 0,
        explicitEvidenceCount: 0,
        behavioralEvidenceCount: 0,
        sourceAvailability: { tasteProfileAvailableForBoth: false, favoritesAvailableForBoth: false, mealsAvailableForBoth: false },
        truncation: { favoritesTruncatedForEither: false, mealsTruncatedForEither: false },
        repeatedMealEvidence: {
            qualifyingRestaurantTargets: 0,
            qualifyingMenuItemTargets: 0,
            restaurantSuppressedByFavorites: false,
            menuItemSuppressedByFavorites: false
        }
    };
}
// Canonical pair ordering. `subjectUserId` is an opaque normalized id, compared by code unit so the
// result never depends on host locale.
function orderSnapshotPair(first, second) {
    return compareCodeUnits(first.subjectUserId, second.subjectUserId) <= 0 ? [first, second] : [second, first];
}
function sortUnique(values) {
    return Object.freeze([...new Set(values)].sort(compareCodeUnits));
}
function freezeDimensions(values) {
    return Object.freeze([...values]);
}
function compareCodeUnits(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
});

__registry.set("packages/shared/src/domain/taste-similarity/similarity/index.ts", (require, module, exports) => {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./policy"), exports);
__exportStar(require("./reasonCodes"), exports);
__exportStar(require("./types"), exports);
__exportStar(require("./comparator"), exports);
});

__registry.set("packages/shared/src/domain/taste-similarity/similarity/policy.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASTE_SIMILARITY_SCORE_PRECISION = exports.TASTE_SIMILARITY_SCORE_MAX = exports.TASTE_SIMILARITY_SCORE_MIN = exports.TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = exports.MIN_REPEATED_MEAL_OCCURRENCES = exports.TASTE_SIMILARITY_POLICY_VERSION_HISTORY = exports.TASTE_SIMILARITY_POLICY_VERSION = void 0;
exports.roundTasteSimilarityScore = roundTasteSimilarityScore;
const snapshot_1 = require("../snapshot");
// TS-3A — the versioned scoring policy authority.
//
// A similarity result is only interpretable against the PAIR (policy version, snapshot schema
// version). Weight or semantic changes in a later policy must never silently reinterpret a result
// produced by this one, so both versions are stamped onto every result — including results that
// were not scored.
//
// TS-3B-R1 bumped this from `taste-similarity-v1` to `taste-similarity-v1.1`. The bump is MANDATORY,
// not cosmetic: R1 adds two behavioural fallback dimensions, so the same snapshot pair can now
// produce a different score than v1 produced. A minor successor is the accurate signal — the
// comparable EVIDENCE surface changed while the mathematical model (unweighted mean of 0..1
// agreements, Jaccard set agreement, 6-decimal rounding, unknown excluded from the denominator) did
// not. A major bump would falsely imply the model itself was replaced.
exports.TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-v1.1";
// Ordered version history. Kept so a result stamped with a superseded version stays unambiguous
// rather than being silently reinterpretable as the current policy. There is no durable score
// persistence in this system today, so no migration or backfill accompanies the bump — but the
// history must exist BEFORE persistence does, not after.
exports.TASTE_SIMILARITY_POLICY_VERSION_HISTORY = [
    "taste-similarity-v1",
    "taste-similarity-v1.1"
];
// TS-3B-R1 repetition authority.
//
// A canonical target counts as REPEATEDLY consumed once it is observed in at least this many
// DISTINCT meal-occurrence evidence records inside the bounded snapshot. Two is the minimal semantic
// distinction between "consumed once" and "consumed again" — it is a definition boundary, not a
// tunable similarity weight. Crossing it is binary: 2, 3, 5 and 20 qualifying occurrences all mean
// exactly `repeated evidence exists`, and none of them means "more affinity" than another.
// Occurrence multipliers, logarithmic frequency scaling, streak rewards, crowd-size uplift and
// threshold tiers are all deliberately absent, and the guard enforces their absence.
exports.MIN_REPEATED_MEAL_OCCURRENCES = 2;
// The only snapshot schema this policy is allowed to read. Anything else fails closed as
// `unsupported_snapshot_schema` rather than being scored on assumptions about its shape.
exports.TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = snapshot_1.TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION;
// Canonical INTERNAL range. 0..1 composes without rescaling and matches the existing 0..1
// convention already used by sourceConfidence. Converting to a 0..100 display value is a UI
// concern and deliberately does not exist in this domain.
exports.TASTE_SIMILARITY_SCORE_MIN = 0;
exports.TASTE_SIMILARITY_SCORE_MAX = 1;
// Deterministic rounding authority.
//
// Floating point addition/division is order sensitive, so "same input, same policy, same score"
// only holds if the final value is quantised. Six decimals is the smallest precision that keeps the
// small rationals this policy actually produces (halves, thirds, quarters, fifths) distinguishable
// while removing binary representation noise. It is part of the frozen policy: changing it changes
// results and therefore requires a new policy version.
exports.TASTE_SIMILARITY_SCORE_PRECISION = 6;
function roundTasteSimilarityScore(value) {
    if (!Number.isFinite(value)) {
        throw new RangeError("Taste similarity score must be a finite number.");
    }
    const factor = 10 ** exports.TASTE_SIMILARITY_SCORE_PRECISION;
    const rounded = Math.round(value * factor) / factor;
    // Guard the contract itself rather than trusting callers: an out-of-range score is a defect, not
    // something to silently clamp into looking valid.
    if (rounded < exports.TASTE_SIMILARITY_SCORE_MIN || rounded > exports.TASTE_SIMILARITY_SCORE_MAX) {
        throw new RangeError("Taste similarity score must fall within the canonical 0..1 range.");
    }
    return rounded;
}
});

__registry.set("packages/shared/src/domain/taste-similarity/similarity/reasonCodes.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASTE_SIMILARITY_REASON_CODES = void 0;
exports.orderTasteSimilarityReasonCodes = orderTasteSimilarityReasonCodes;
// TS-3A — closed reason-code vocabulary.
//
// Reason codes are the ONLY thing a caller may turn into user-facing wording. They are enum values
// carrying no evidence values at all: never a cuisine name, never a flavor, never a restaurant or
// menu item id, never a count. That is what keeps an explanation safe to render even though the
// scorer itself reads evidence classified `sensitive_internal` elsewhere in the snapshot.
//
// Shared positive preference and shared avoidance get DIFFERENT codes on purpose. "You both like
// Japanese food" and "you both avoid coriander" are not the same statement, and collapsing them
// would make an avoidance render as a liking.
exports.TASTE_SIMILARITY_REASON_CODES = [
    "shared_cuisine_preference",
    "shared_flavor_avoidance",
    "shared_spice_preference",
    "shared_favorite_restaurant",
    "shared_favorite_menu_item",
    // TS-3B-R1. Repeated CONSUMPTION is a weaker, observed signal than an explicit favorite, so it
    // gets its own codes rather than reusing the favorite codes. "You have both eaten there more than
    // once" must never be renderable as "you both marked it a favorite". The codes are ranked below
    // the favorite codes, which keeps every pre-R1 reason sequence byte-identical.
    "shared_repeated_restaurant_consumption",
    "shared_repeated_menu_item_consumption",
    "limited_evidence"
];
// Deterministic ordering authority: reason codes are emitted in this fixed declaration order, never
// in discovery order, so two runs over the same pair — and the same pair supplied in either
// argument order — produce an identical sequence.
const REASON_CODE_RANK = new Map(exports.TASTE_SIMILARITY_REASON_CODES.map((code, index) => [code, index]));
function orderTasteSimilarityReasonCodes(codes) {
    return [...new Set(codes)].sort((left, right) => (REASON_CODE_RANK.get(left) ?? 0) - (REASON_CODE_RANK.get(right) ?? 0));
}
});

__registry.set("packages/shared/src/domain/taste-similarity/similarity/types.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASTE_SIMILARITY_DIMENSIONS = void 0;
// TS-3A — the versioned taste similarity result contract.
//
// The v1 comparable dimensions. Each is a FOOD-OBJECT dimension: meal_pattern, dining_context and
// social_logistics preferences exist in the snapshot but are deliberately absent from this union,
// so "logistics leaked into taste" is not a bug that can be introduced without changing this type.
exports.TASTE_SIMILARITY_DIMENSIONS = [
    "cuisine_preference",
    "flavor_avoidance",
    "spice_preference",
    "favorite_restaurant",
    "favorite_menu_item",
    // TS-3B-R1 behavioural FALLBACK dimensions. Repeated observed consumption of a canonical target is
    // weaker evidence than an explicit favorite, so each one only becomes comparable when the favorite
    // dimension of the SAME identity family is not comparable. They are named for what they are —
    // repeated consumption — so no caller can read them as an explicit liking.
    "repeated_meal_restaurant",
    "repeated_meal_menu_item"
];
});

__registry.set("packages/shared/src/domain/taste-similarity/snapshot.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION = void 0;
exports.composeTasteProfileSnapshot = composeTasteProfileSnapshot;
const evidence_1 = require("./evidence");
const normalization_1 = require("./normalization");
const evidenceWindow_1 = require("./evidenceWindow");
const sourceState_1 = require("./sourceState");
exports.TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION = "taste-profile-snapshot-v1";
function composeTasteProfileSnapshot(input) {
    const subjectUserId = (0, normalization_1.normalizeOpaqueCanonicalId)(input.subjectUserId);
    const generatedAt = requireTimestamp(input.generatedAt, "Snapshot generation time");
    const preferences = sortEvidence((input.preferences ?? []).map(normalization_1.normalizePreferenceEvidence));
    const goals = sortEvidence((input.goals ?? []).map(normalization_1.normalizeGoalEvidence));
    const restrictions = sortEvidence((input.restrictions ?? []).map(normalization_1.normalizeRestrictionEvidence));
    const behavior = sortEvidence((input.behavior ?? []).map(normalization_1.normalizeBehavioralEvidence));
    const sourceStates = normalizeSourceStates(input.sourceStates);
    const evidenceWindow = (0, evidenceWindow_1.normalizeTasteProfileEvidenceWindow)(input.evidenceWindow);
    const allEvidence = [...preferences, ...goals, ...restrictions, ...behavior];
    const timestamps = allEvidence
        .map((entry) => entry.evidence.recordedAt ?? entry.evidence.updatedAt ?? null)
        .filter((entry) => entry !== null)
        .sort(compareCodeUnits);
    const unavailableSources = sourceState_1.TASTE_PROFILE_SOURCE_NAMES.filter((name) => ["disabled", "unauthenticated", "failed", "deferred"].includes(sourceStates[name].status));
    const truncatedSources = ["meals", "favorites", "ratings"]
        .filter((name) => evidenceWindow[name].truncation !== "not_truncated");
    return {
        schemaVersion: exports.TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION,
        subjectUserId,
        preferences,
        goals,
        restrictions,
        behavior,
        confidenceMetadata: {
            evidenceCounts: {
                preferences: preferences.length,
                goals: goals.length,
                restrictions: restrictions.length,
                behavior: behavior.length,
                total: allEvidence.length
            },
            oldestEvidenceAt: timestamps[0] ?? null,
            latestEvidenceAt: timestamps[timestamps.length - 1] ?? null,
            coverageIndicators: {
                availableSources: sourceState_1.TASTE_PROFILE_SOURCE_NAMES.filter((name) => sourceStates[name].status === "available"),
                emptySources: sourceState_1.TASTE_PROFILE_SOURCE_NAMES.filter((name) => sourceStates[name].status === "empty"),
                unavailableSources,
                truncatedSources
            }
        },
        evidenceWindow,
        sourceStates,
        generatedAt
    };
}
function normalizeSourceStates(input) {
    const output = {};
    for (const name of sourceState_1.TASTE_PROFILE_SOURCE_NAMES) {
        const state = input[name];
        if (!state || !Number.isInteger(state.evidenceCount) || state.evidenceCount < 0) {
            throw new evidence_1.TasteEvidenceNormalizationError(`Source state ${name} is invalid.`);
        }
        if (state.status === "available" && state.evidenceCount < 1) {
            throw new evidence_1.TasteEvidenceNormalizationError(`Available source ${name} must contain evidence.`);
        }
        if (["empty", "disabled", "unauthenticated", "deferred"].includes(state.status) && state.evidenceCount !== 0) {
            throw new evidence_1.TasteEvidenceNormalizationError(`Unavailable source ${name} cannot claim evidence.`);
        }
        output[name] = { ...state };
    }
    return output;
}
function sortEvidence(values) {
    return [...values].sort((left, right) => compareCodeUnits(left.evidence.evidenceId, right.evidence.evidenceId));
}
function requireTimestamp(value, label) {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
        throw new evidence_1.TasteEvidenceNormalizationError(`${label} is invalid.`);
    return value.trim();
}
function compareCodeUnits(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
});

__registry.set("packages/shared/src/domain/taste-similarity/sourceState.ts", (require, module, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASTE_PROFILE_SOURCE_NAMES = void 0;
exports.TASTE_PROFILE_SOURCE_NAMES = [
    "taste_profile",
    "nutrition_goals",
    "dietary_restrictions",
    "meals",
    "favorites",
    "ratings"
];
});

const __resolve = new Map([["apps/mobile/features/consumer-taste-profile/foundationMappers.ts",{"../../../../packages/shared/src/domain/taste-similarity":"packages/shared/src/domain/taste-similarity/index.ts","./types":"apps/mobile/features/consumer-taste-profile/types.ts"}],["apps/mobile/features/consumer-taste-profile/types.ts",{"../../../../packages/shared/src/domain/taste-similarity":"packages/shared/src/domain/taste-similarity/index.ts"}],["packages/shared/src/domain/taste-similarity/behavior.ts",{"./evidence":"packages/shared/src/domain/taste-similarity/evidence.ts"}],["packages/shared/src/domain/taste-similarity/cold-start/assess.ts",{"../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts","../similarity":"packages/shared/src/domain/taste-similarity/similarity/index.ts","../compatibility":"packages/shared/src/domain/taste-similarity/compatibility/index.ts","../goal-restriction":"packages/shared/src/domain/taste-similarity/goal-restriction/index.ts","../comparison":"packages/shared/src/domain/taste-similarity/comparison/index.ts","../confidence":"packages/shared/src/domain/taste-similarity/confidence/index.ts","./policy":"packages/shared/src/domain/taste-similarity/cold-start/policy.ts","./types":"packages/shared/src/domain/taste-similarity/cold-start/types.ts"}],["packages/shared/src/domain/taste-similarity/cold-start/index.ts",{"./policy":"packages/shared/src/domain/taste-similarity/cold-start/policy.ts","./types":"packages/shared/src/domain/taste-similarity/cold-start/types.ts","./assess":"packages/shared/src/domain/taste-similarity/cold-start/assess.ts"}],["packages/shared/src/domain/taste-similarity/cold-start/policy.ts",{}],["packages/shared/src/domain/taste-similarity/cold-start/types.ts",{"../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts","../similarity":"packages/shared/src/domain/taste-similarity/similarity/index.ts","../compatibility":"packages/shared/src/domain/taste-similarity/compatibility/index.ts","../goal-restriction":"packages/shared/src/domain/taste-similarity/goal-restriction/index.ts","../comparison":"packages/shared/src/domain/taste-similarity/comparison/index.ts","../confidence":"packages/shared/src/domain/taste-similarity/confidence/index.ts","./policy":"packages/shared/src/domain/taste-similarity/cold-start/policy.ts"}],["packages/shared/src/domain/taste-similarity/comparison/compose.ts",{"../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts","../similarity":"packages/shared/src/domain/taste-similarity/similarity/index.ts","../compatibility":"packages/shared/src/domain/taste-similarity/compatibility/index.ts","../goal-restriction":"packages/shared/src/domain/taste-similarity/goal-restriction/index.ts","./policy":"packages/shared/src/domain/taste-similarity/comparison/policy.ts","./types":"packages/shared/src/domain/taste-similarity/comparison/types.ts"}],["packages/shared/src/domain/taste-similarity/comparison/index.ts",{"./policy":"packages/shared/src/domain/taste-similarity/comparison/policy.ts","./types":"packages/shared/src/domain/taste-similarity/comparison/types.ts","./compose":"packages/shared/src/domain/taste-similarity/comparison/compose.ts"}],["packages/shared/src/domain/taste-similarity/comparison/policy.ts",{"../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts"}],["packages/shared/src/domain/taste-similarity/comparison/types.ts",{"../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts","../similarity":"packages/shared/src/domain/taste-similarity/similarity/index.ts","../compatibility":"packages/shared/src/domain/taste-similarity/compatibility/index.ts","../goal-restriction":"packages/shared/src/domain/taste-similarity/goal-restriction/index.ts","./policy":"packages/shared/src/domain/taste-similarity/comparison/policy.ts"}],["packages/shared/src/domain/taste-similarity/compatibility/comparator.ts",{"../preference":"packages/shared/src/domain/taste-similarity/preference.ts","../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts","./policy":"packages/shared/src/domain/taste-similarity/compatibility/policy.ts","./reasonCodes":"packages/shared/src/domain/taste-similarity/compatibility/reasonCodes.ts","./types":"packages/shared/src/domain/taste-similarity/compatibility/types.ts"}],["packages/shared/src/domain/taste-similarity/compatibility/index.ts",{"./policy":"packages/shared/src/domain/taste-similarity/compatibility/policy.ts","./reasonCodes":"packages/shared/src/domain/taste-similarity/compatibility/reasonCodes.ts","./types":"packages/shared/src/domain/taste-similarity/compatibility/types.ts","./comparator":"packages/shared/src/domain/taste-similarity/compatibility/comparator.ts"}],["packages/shared/src/domain/taste-similarity/compatibility/policy.ts",{"../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts"}],["packages/shared/src/domain/taste-similarity/compatibility/reasonCodes.ts",{}],["packages/shared/src/domain/taste-similarity/compatibility/types.ts",{"./policy":"packages/shared/src/domain/taste-similarity/compatibility/policy.ts","../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts","./reasonCodes":"packages/shared/src/domain/taste-similarity/compatibility/reasonCodes.ts"}],["packages/shared/src/domain/taste-similarity/confidence/compute.ts",{"../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts","../similarity":"packages/shared/src/domain/taste-similarity/similarity/index.ts","../compatibility":"packages/shared/src/domain/taste-similarity/compatibility/index.ts","../goal-restriction":"packages/shared/src/domain/taste-similarity/goal-restriction/index.ts","../comparison":"packages/shared/src/domain/taste-similarity/comparison/index.ts","./policy":"packages/shared/src/domain/taste-similarity/confidence/policy.ts","./types":"packages/shared/src/domain/taste-similarity/confidence/types.ts"}],["packages/shared/src/domain/taste-similarity/confidence/index.ts",{"./policy":"packages/shared/src/domain/taste-similarity/confidence/policy.ts","./types":"packages/shared/src/domain/taste-similarity/confidence/types.ts","./compute":"packages/shared/src/domain/taste-similarity/confidence/compute.ts"}],["packages/shared/src/domain/taste-similarity/confidence/policy.ts",{"../similarity":"packages/shared/src/domain/taste-similarity/similarity/index.ts"}],["packages/shared/src/domain/taste-similarity/confidence/types.ts",{"../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts","../similarity":"packages/shared/src/domain/taste-similarity/similarity/index.ts","../compatibility":"packages/shared/src/domain/taste-similarity/compatibility/index.ts","../goal-restriction":"packages/shared/src/domain/taste-similarity/goal-restriction/index.ts","../comparison":"packages/shared/src/domain/taste-similarity/comparison/index.ts","./policy":"packages/shared/src/domain/taste-similarity/confidence/policy.ts"}],["packages/shared/src/domain/taste-similarity/evidence.ts",{}],["packages/shared/src/domain/taste-similarity/evidenceWindow.ts",{"./evidence":"packages/shared/src/domain/taste-similarity/evidence.ts"}],["packages/shared/src/domain/taste-similarity/goal-restriction/comparator.ts",{"../goal":"packages/shared/src/domain/taste-similarity/goal.ts","../restriction":"packages/shared/src/domain/taste-similarity/restriction.ts","../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts","./policy":"packages/shared/src/domain/taste-similarity/goal-restriction/policy.ts","./reasonCodes":"packages/shared/src/domain/taste-similarity/goal-restriction/reasonCodes.ts","./types":"packages/shared/src/domain/taste-similarity/goal-restriction/types.ts"}],["packages/shared/src/domain/taste-similarity/goal-restriction/index.ts",{"./policy":"packages/shared/src/domain/taste-similarity/goal-restriction/policy.ts","./reasonCodes":"packages/shared/src/domain/taste-similarity/goal-restriction/reasonCodes.ts","./types":"packages/shared/src/domain/taste-similarity/goal-restriction/types.ts","./comparator":"packages/shared/src/domain/taste-similarity/goal-restriction/comparator.ts"}],["packages/shared/src/domain/taste-similarity/goal-restriction/policy.ts",{"../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts"}],["packages/shared/src/domain/taste-similarity/goal-restriction/reasonCodes.ts",{}],["packages/shared/src/domain/taste-similarity/goal-restriction/types.ts",{"./policy":"packages/shared/src/domain/taste-similarity/goal-restriction/policy.ts","../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts","./reasonCodes":"packages/shared/src/domain/taste-similarity/goal-restriction/reasonCodes.ts"}],["packages/shared/src/domain/taste-similarity/goal.ts",{"./evidence":"packages/shared/src/domain/taste-similarity/evidence.ts"}],["packages/shared/src/domain/taste-similarity/index.ts",{"./evidence":"packages/shared/src/domain/taste-similarity/evidence.ts","./preference":"packages/shared/src/domain/taste-similarity/preference.ts","./behavior":"packages/shared/src/domain/taste-similarity/behavior.ts","./goal":"packages/shared/src/domain/taste-similarity/goal.ts","./restriction":"packages/shared/src/domain/taste-similarity/restriction.ts","./normalization":"packages/shared/src/domain/taste-similarity/normalization.ts","./sourceState":"packages/shared/src/domain/taste-similarity/sourceState.ts","./evidenceWindow":"packages/shared/src/domain/taste-similarity/evidenceWindow.ts","./snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts","./similarity":"packages/shared/src/domain/taste-similarity/similarity/index.ts","./compatibility":"packages/shared/src/domain/taste-similarity/compatibility/index.ts","./goal-restriction":"packages/shared/src/domain/taste-similarity/goal-restriction/index.ts","./comparison":"packages/shared/src/domain/taste-similarity/comparison/index.ts","./confidence":"packages/shared/src/domain/taste-similarity/confidence/index.ts","./cold-start":"packages/shared/src/domain/taste-similarity/cold-start/index.ts","./shared-adapter":"packages/shared/src/domain/taste-similarity/shared-adapter/index.ts"}],["packages/shared/src/domain/taste-similarity/normalization.ts",{"./behavior":"packages/shared/src/domain/taste-similarity/behavior.ts","./evidence":"packages/shared/src/domain/taste-similarity/evidence.ts","./goal":"packages/shared/src/domain/taste-similarity/goal.ts","./preference":"packages/shared/src/domain/taste-similarity/preference.ts","./restriction":"packages/shared/src/domain/taste-similarity/restriction.ts"}],["packages/shared/src/domain/taste-similarity/preference.ts",{"./evidence":"packages/shared/src/domain/taste-similarity/evidence.ts"}],["packages/shared/src/domain/taste-similarity/restriction.ts",{"./evidence":"packages/shared/src/domain/taste-similarity/evidence.ts"}],["packages/shared/src/domain/taste-similarity/shared-adapter/adapt.ts",{"../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts","../similarity":"packages/shared/src/domain/taste-similarity/similarity/index.ts","../compatibility":"packages/shared/src/domain/taste-similarity/compatibility/index.ts","../goal-restriction":"packages/shared/src/domain/taste-similarity/goal-restriction/index.ts","../comparison":"packages/shared/src/domain/taste-similarity/comparison/index.ts","../confidence":"packages/shared/src/domain/taste-similarity/confidence/index.ts","../cold-start":"packages/shared/src/domain/taste-similarity/cold-start/index.ts","./policy":"packages/shared/src/domain/taste-similarity/shared-adapter/policy.ts","./types":"packages/shared/src/domain/taste-similarity/shared-adapter/types.ts"}],["packages/shared/src/domain/taste-similarity/shared-adapter/index.ts",{"./policy":"packages/shared/src/domain/taste-similarity/shared-adapter/policy.ts","./types":"packages/shared/src/domain/taste-similarity/shared-adapter/types.ts","./adapt":"packages/shared/src/domain/taste-similarity/shared-adapter/adapt.ts"}],["packages/shared/src/domain/taste-similarity/shared-adapter/policy.ts",{}],["packages/shared/src/domain/taste-similarity/shared-adapter/types.ts",{"../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts","../similarity":"packages/shared/src/domain/taste-similarity/similarity/index.ts","../compatibility":"packages/shared/src/domain/taste-similarity/compatibility/index.ts","../goal-restriction":"packages/shared/src/domain/taste-similarity/goal-restriction/index.ts","../comparison":"packages/shared/src/domain/taste-similarity/comparison/index.ts","../confidence":"packages/shared/src/domain/taste-similarity/confidence/index.ts","../cold-start":"packages/shared/src/domain/taste-similarity/cold-start/index.ts","./policy":"packages/shared/src/domain/taste-similarity/shared-adapter/policy.ts"}],["packages/shared/src/domain/taste-similarity/similarity/comparator.ts",{"../preference":"packages/shared/src/domain/taste-similarity/preference.ts","../behavior":"packages/shared/src/domain/taste-similarity/behavior.ts","../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts","./policy":"packages/shared/src/domain/taste-similarity/similarity/policy.ts","./reasonCodes":"packages/shared/src/domain/taste-similarity/similarity/reasonCodes.ts","./types":"packages/shared/src/domain/taste-similarity/similarity/types.ts"}],["packages/shared/src/domain/taste-similarity/similarity/index.ts",{"./policy":"packages/shared/src/domain/taste-similarity/similarity/policy.ts","./reasonCodes":"packages/shared/src/domain/taste-similarity/similarity/reasonCodes.ts","./types":"packages/shared/src/domain/taste-similarity/similarity/types.ts","./comparator":"packages/shared/src/domain/taste-similarity/similarity/comparator.ts"}],["packages/shared/src/domain/taste-similarity/similarity/policy.ts",{"../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts"}],["packages/shared/src/domain/taste-similarity/similarity/reasonCodes.ts",{}],["packages/shared/src/domain/taste-similarity/similarity/types.ts",{"./policy":"packages/shared/src/domain/taste-similarity/similarity/policy.ts","../snapshot":"packages/shared/src/domain/taste-similarity/snapshot.ts","./reasonCodes":"packages/shared/src/domain/taste-similarity/similarity/reasonCodes.ts"}],["packages/shared/src/domain/taste-similarity/snapshot.ts",{"./behavior":"packages/shared/src/domain/taste-similarity/behavior.ts","./evidence":"packages/shared/src/domain/taste-similarity/evidence.ts","./goal":"packages/shared/src/domain/taste-similarity/goal.ts","./normalization":"packages/shared/src/domain/taste-similarity/normalization.ts","./preference":"packages/shared/src/domain/taste-similarity/preference.ts","./restriction":"packages/shared/src/domain/taste-similarity/restriction.ts","./evidenceWindow":"packages/shared/src/domain/taste-similarity/evidenceWindow.ts","./sourceState":"packages/shared/src/domain/taste-similarity/sourceState.ts"}],["packages/shared/src/domain/taste-similarity/sourceState.ts",{}]]);
const __rawRequire = __require;
function __scopedRequire(fromId) {
  return (specifier) => __rawRequire(__resolve.get(fromId)[specifier]);
}
for (const [id, factory] of [...__registry.entries()]) {
  __registry.set(id, (_require, module, exports) => factory(__scopedRequire(id), module, exports));
}

const __entry_09d2154ec289 = __require("packages/shared/src/domain/taste-similarity/index.ts");
const __entry_efe2cf47a5f8 = __require("apps/mobile/features/consumer-taste-profile/foundationMappers.ts");

const __exports = Object.assign({}, __entry_09d2154ec289, __entry_efe2cf47a5f8);

export const COLD_START_COMPARISON_FAMILIES = __exports["COLD_START_COMPARISON_FAMILIES"];
export const COLD_START_DEGRADED_SOURCE_BASES = __exports["COLD_START_DEGRADED_SOURCE_BASES"];
export const COLD_START_LIMITED_COVERAGE_BASIS = __exports["COLD_START_LIMITED_COVERAGE_BASIS"];
export const COLD_START_POLICY_VERSION = __exports["COLD_START_POLICY_VERSION"];
export const COLD_START_REASON_CODES = __exports["COLD_START_REASON_CODES"];
export const COLD_START_SIGNAL_FAMILIES = __exports["COLD_START_SIGNAL_FAMILIES"];
export const EVIDENCE_CONFIDENCE_BASIS_PRECEDENCE = __exports["EVIDENCE_CONFIDENCE_BASIS_PRECEDENCE"];
export const EVIDENCE_CONFIDENCE_POLICY_VERSION = __exports["EVIDENCE_CONFIDENCE_POLICY_VERSION"];
export const EVIDENCE_CONFIDENCE_VALUE_MAX = __exports["EVIDENCE_CONFIDENCE_VALUE_MAX"];
export const EVIDENCE_CONFIDENCE_VALUE_MIN = __exports["EVIDENCE_CONFIDENCE_VALUE_MIN"];
export const EVIDENCE_CONFIDENCE_VALUE_PRECISION = __exports["EVIDENCE_CONFIDENCE_VALUE_PRECISION"];
export const GOAL_COMPATIBILITY_SCORE_MAX = __exports["GOAL_COMPATIBILITY_SCORE_MAX"];
export const GOAL_COMPATIBILITY_SCORE_MIN = __exports["GOAL_COMPATIBILITY_SCORE_MIN"];
export const GOAL_COMPATIBILITY_SCORE_PRECISION = __exports["GOAL_COMPATIBILITY_SCORE_PRECISION"];
export const GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION = __exports["GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION"];
export const GOAL_RESTRICTION_REASON_CODES = __exports["GOAL_RESTRICTION_REASON_CODES"];
export const GOAL_RESTRICTION_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = __exports["GOAL_RESTRICTION_SUPPORTED_SNAPSHOT_SCHEMA_VERSION"];
export const MIN_REPEATED_MEAL_OCCURRENCES = __exports["MIN_REPEATED_MEAL_OCCURRENCES"];
export const RESTRICTION_ELIGIBILITY_VERDICTS = __exports["RESTRICTION_ELIGIBILITY_VERDICTS"];
export const SHARED_TASTE_ADAPTER_POLICY_VERSION = __exports["SHARED_TASTE_ADAPTER_POLICY_VERSION"];
export const SHARED_TASTE_ADAPTER_STATUSES = __exports["SHARED_TASTE_ADAPTER_STATUSES"];
export const SHARED_TASTE_ADAPTER_UNSUPPORTED_REASONS = __exports["SHARED_TASTE_ADAPTER_UNSUPPORTED_REASONS"];
export const SOCIAL_CONTEXT_COMPATIBILITY_DIMENSIONS = __exports["SOCIAL_CONTEXT_COMPATIBILITY_DIMENSIONS"];
export const SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION = __exports["SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION"];
export const SOCIAL_CONTEXT_COMPATIBILITY_REASON_CODES = __exports["SOCIAL_CONTEXT_COMPATIBILITY_REASON_CODES"];
export const SOCIAL_CONTEXT_SCORE_MAX = __exports["SOCIAL_CONTEXT_SCORE_MAX"];
export const SOCIAL_CONTEXT_SCORE_MIN = __exports["SOCIAL_CONTEXT_SCORE_MIN"];
export const SOCIAL_CONTEXT_SCORE_PRECISION = __exports["SOCIAL_CONTEXT_SCORE_PRECISION"];
export const SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = __exports["SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION"];
export const TASTE_COMPARISON_BUNDLE_VERSION = __exports["TASTE_COMPARISON_BUNDLE_VERSION"];
export const TASTE_COMPARISON_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = __exports["TASTE_COMPARISON_SUPPORTED_SNAPSHOT_SCHEMA_VERSION"];
export const TASTE_CONFIDENCE_DIMENSION_FAMILIES = __exports["TASTE_CONFIDENCE_DIMENSION_FAMILIES"];
export const TASTE_CONFIDENCE_EXPLICIT_FAMILIES = __exports["TASTE_CONFIDENCE_EXPLICIT_FAMILIES"];
export const TASTE_CONFIDENCE_LIMITED_COVERAGE_FAMILY_COUNT = __exports["TASTE_CONFIDENCE_LIMITED_COVERAGE_FAMILY_COUNT"];
export const TASTE_CONFIDENCE_RELEVANT_SOURCE_COUNT = __exports["TASTE_CONFIDENCE_RELEVANT_SOURCE_COUNT"];
export const TASTE_CONFIDENCE_SUPPORTED_DIMENSION_COUNT = __exports["TASTE_CONFIDENCE_SUPPORTED_DIMENSION_COUNT"];
export const TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION = __exports["TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION"];
export const TASTE_PROFILE_SOURCE_NAMES = __exports["TASTE_PROFILE_SOURCE_NAMES"];
export const TASTE_SIMILARITY_DIMENSIONS = __exports["TASTE_SIMILARITY_DIMENSIONS"];
export const TASTE_SIMILARITY_POLICY_VERSION = __exports["TASTE_SIMILARITY_POLICY_VERSION"];
export const TASTE_SIMILARITY_POLICY_VERSION_HISTORY = __exports["TASTE_SIMILARITY_POLICY_VERSION_HISTORY"];
export const TASTE_SIMILARITY_REASON_CODES = __exports["TASTE_SIMILARITY_REASON_CODES"];
export const TASTE_SIMILARITY_SCORE_MAX = __exports["TASTE_SIMILARITY_SCORE_MAX"];
export const TASTE_SIMILARITY_SCORE_MIN = __exports["TASTE_SIMILARITY_SCORE_MIN"];
export const TASTE_SIMILARITY_SCORE_PRECISION = __exports["TASTE_SIMILARITY_SCORE_PRECISION"];
export const TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = __exports["TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION"];
export const TasteEvidenceNormalizationError = __exports["TasteEvidenceNormalizationError"];
export const adaptSharedTasteComparison = __exports["adaptSharedTasteComparison"];
export const assessColdStart = __exports["assessColdStart"];
export const calculateEvidenceConfidence = __exports["calculateEvidenceConfidence"];
export const compareGoalRestrictionCompatibility = __exports["compareGoalRestrictionCompatibility"];
export const compareSocialContextCompatibility = __exports["compareSocialContextCompatibility"];
export const compareTasteProfiles = __exports["compareTasteProfiles"];
export const compareTasteSimilarity = __exports["compareTasteSimilarity"];
export const composeTasteProfileSnapshot = __exports["composeTasteProfileSnapshot"];
export const mapDietaryRestrictionRows = __exports["mapDietaryRestrictionRows"];
export const mapNutritionGoalRows = __exports["mapNutritionGoalRows"];
export const mapTasteProfileRow = __exports["mapTasteProfileRow"];
export const normalizeBehavioralEvidence = __exports["normalizeBehavioralEvidence"];
export const normalizeCanonicalTarget = __exports["normalizeCanonicalTarget"];
export const normalizeGoalEvidence = __exports["normalizeGoalEvidence"];
export const normalizeOpaqueCanonicalId = __exports["normalizeOpaqueCanonicalId"];
export const normalizePreferenceEvidence = __exports["normalizePreferenceEvidence"];
export const normalizeRestrictionEvidence = __exports["normalizeRestrictionEvidence"];
export const normalizeStringSet = __exports["normalizeStringSet"];
export const normalizeTasteEvidence = __exports["normalizeTasteEvidence"];
export const normalizeTasteEvidenceList = __exports["normalizeTasteEvidenceList"];
export const normalizeTasteProfileEvidenceWindow = __exports["normalizeTasteProfileEvidenceWindow"];
export const normalizeUnicodeText = __exports["normalizeUnicodeText"];
export const orderColdStartReasonCodes = __exports["orderColdStartReasonCodes"];
export const orderGoalRestrictionReasonCodes = __exports["orderGoalRestrictionReasonCodes"];
export const orderSocialContextCompatibilityReasonCodes = __exports["orderSocialContextCompatibilityReasonCodes"];
export const orderTasteSimilarityReasonCodes = __exports["orderTasteSimilarityReasonCodes"];
export const roundEvidenceConfidenceValue = __exports["roundEvidenceConfidenceValue"];
export const roundGoalCompatibilityScore = __exports["roundGoalCompatibilityScore"];
export const roundSocialContextCompatibilityScore = __exports["roundSocialContextCompatibilityScore"];
export const roundTasteSimilarityScore = __exports["roundTasteSimilarityScore"];
