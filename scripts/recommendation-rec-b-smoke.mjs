#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const featureRoot = path.join(root, "apps", "mobile", "features", "consumer-meals");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "recommendation-rec-b-"));
const targets = {
  tastePolicy: path.join(featureRoot, "tasteRankingPolicy.ts"),
  compositionPolicy: path.join(featureRoot, "recommendationCompositionPolicy.ts"),
  engine: path.join(featureRoot, "recommendationTasteRanking.ts"),
  reasons: path.join(featureRoot, "recommendationReasons.ts"),
  nutrition: path.join(featureRoot, "nextMealNutritionRanker.ts")
};

const mutations = Object.freeze({
  cuisine_weight: [targets.tastePolicy, 'facetKey: "cuisine" as const, weight: 0.30', 'facetKey: "cuisine" as const, weight: 0.10'],
  meal_type_weight: [targets.tastePolicy, 'facetKey: "meal_type" as const, weight: 0.20', 'facetKey: "meal_type" as const, weight: 0.10'],
  flavor_weight: [targets.tastePolicy, 'facetKey: "flavor" as const, weight: 0.35', 'facetKey: "flavor" as const, weight: 0.10'],
  spice_weight: [targets.tastePolicy, 'facetKey: "spice" as const, weight: 0.15', 'facetKey: "spice" as const, weight: 0.10'],
  minimum_comparable: [targets.tastePolicy, 'minimumComparableFacetCount: 2,', 'minimumComparableFacetCount: 1,'],
  cuisine_match: [targets.tastePolicy, 'categoricalMatch: 1,', 'categoricalMatch: 0,'],
  flavor_overlap: [targets.tastePolicy, 'dislikedFlavorOverlap: -1,', 'dislikedFlavorOverlap: 0,'],
  spice_distance_one: [targets.tastePolicy, '{ distance: 1, score: 0.5 }', '{ distance: 1, score: 1 }'],
  lane_a_tolerance: [targets.compositionPolicy, 'nutritionTolerance: 0.02,', 'nutritionTolerance: 0.20,'],
  taste_weight: [targets.compositionPolicy, 'tasteRankWeight: 0.60,', 'tasteRankWeight: 0.40,'],
  nutrition_weight: [targets.compositionPolicy, 'nutritionRankWeight: 0.40,', 'nutritionRankWeight: 0.60,'],
  chained_bands: [targets.engine, 'anchor.score - nutritionOrder[end].score', 'nutritionOrder[end - 1].score - nutritionOrder[end].score'],
  move_unknown_slots: [targets.engine, 'taste?.state === "valid"', 'taste?.state !== "valid"'],
  admit_invalid_lane_b: [targets.engine, '?.state === "valid");', '?.state !== "valid");'],
  single_rank_zero: [targets.engine, 'return count === 1 ? 1 :', 'return count === 1 ? 0 :'],
  reverse_interleave: [targets.engine, 'const requestedA = entries.length % 2 === 0;', 'const requestedA = entries.length % 2 !== 0;'],
  dedupe_menu_item: [targets.engine, 'used.add(selected);', 'used.add(byId.get(selected)?.candidate.menuItemId ?? selected);'],
  lane_a_taste_ascending: [targets.engine, 'return rightTaste - leftTaste', 'return leftTaste - rightTaste'],
  lane_b_raw_scores: [targets.engine, 'policy.laneB.tasteRankWeight * rankUtility(leftTasteRank, count)', 'policy.laneB.tasteRankWeight * leftTaste'],
  card_taste_before_nutrition: [targets.reasons, 'if (tasteFirst && tasteSummary)', 'if (tasteSummary)'],
  fabricate_avoidance: [targets.reasons, 'return "";', 'return "避開你不喜歡的風味。";']
});

const mutationName = process.env.RECB_MUTATION ?? "";
const mutation = mutationName ? mutations[mutationName] : undefined;
if (mutationName && !mutation) throw new Error(`Unknown REC-B mutation: ${mutationName}`);
const TARGET_NOT_FOUND = 97;
const compilerOptions = {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, strict: true,
  esModuleInterop: true, skipLibCheck: true, outDir: tempRoot, rootDir: root
};
const host = ts.createCompilerHost(compilerOptions);
const baseRead = host.readFile.bind(host);
host.readFile = (fileName) => {
  const source = baseRead(fileName);
  if (!source || !mutation || path.normalize(fileName) !== path.normalize(mutation[0])) return source;
  if (!source.includes(mutation[1])) {
    console.error(`RECB_MUTATION_TARGET_NOT_FOUND ${mutationName}`);
    process.exit(TARGET_NOT_FOUND);
  }
  return source.replace(mutation[1], mutation[2]);
};
const program = ts.createProgram(Object.values(targets), compilerOptions, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: (file) => file, getCurrentDirectory: () => root, getNewLine: () => "\n"
}));
program.emit();

const requireFromTemp = createRequire(path.join(tempRoot, "apps", "mobile", "features", "consumer-meals", "types.js"));
const tastePolicy = requireFromTemp("./tasteRankingPolicy.js");
const compositionPolicy = requireFromTemp("./recommendationCompositionPolicy.js");
const engine = requireFromTemp("./recommendationTasteRanking.js");
const reasons = requireFromTemp("./recommendationReasons.js");

const checks = [];
const expect = (pass, name, detail) => checks.push({ name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) });

const tp = tastePolicy.DEFAULT_TASTE_RANKING_POLICY;
const cp = compositionPolicy.DEFAULT_RECOMMENDATION_COMPOSITION_POLICY;
expect(tp.policyId === "tastkind.taste.explicit_preferences" && tp.policyVersion === 1,
  "P01 exact Taste policy identity");
expect(tp.candidateTaxonomyVersion === "candidate-taste-v1"
  && tp.normalizationPolicyId === "private-taste-normalization-v1" && tp.normalizationPolicyVersion === 1,
  "P02 exact taxonomy and versioned normalization reference");
expect(JSON.stringify(Object.fromEntries(tp.enabledFacets.map((entry) => [entry.facetKey, entry.weight])))
  === JSON.stringify({ cuisine: 0.30, meal_type: 0.20, flavor: 0.35, spice: 0.15 }),
  "P03 exact facet weights");
expect(tp.minimumComparableFacetCount === 2 && tp.unknownTreatment === "abstain",
  "P04 exact coverage and unknown policy");
expect(tastePolicy.isTasteRankingPolicy(tp), "P05 default Taste policy validates");
expect(cp.policyId === "tastkind.recommendation.dual_lane_interleave" && cp.policyVersion === 1,
  "P06 exact composition policy identity");
expect(cp.laneA.nutritionTolerance === 0.02 && cp.laneA.tasteApplication === "eligible_taste_slots_only",
  "P07 exact Lane A policy");
expect(cp.laneB.tasteRankWeight === 0.60 && cp.laneB.nutritionRankWeight === 0.40,
  "P08 exact Lane B ratio");
expect(compositionPolicy.isRecommendationCompositionPolicy(cp), "P09 default composition policy validates");

const sourceValues = [
  source("cuisine", "japanese", "日本料理"), source("cuisine", "thai", "泰式料理"),
  source("flavor", "sweet", "甜味"), source("flavor", "smoky", "煙燻味"),
  source("spice", "none", "不辣"), source("spice", "mild", "微辣"),
  source("spice", "medium", "中辣"), source("spice", "hot", "愛吃辣")
];
const authority = {
  sourceValues,
  mappings: sourceValues.flatMap((entry) => [entry.sourceValueKey, entry.label].map((alias, index) => ({
    normalizationPolicyId: "private-taste-normalization", normalizationPolicyVersion: 1,
    sourceVocabularyId: entry.sourceVocabularyId, sourceVocabularyVersion: 1,
    sourceFacet: entry.sourceFacet, sourceValueKey: entry.sourceValueKey,
    normalizedSourceValue: alias, aliasKind: index === 0 ? "stable_key" : "localized_label",
    sourceLocale: index === 0 ? null : "zh-TW", targetTaxonomyVersion: "candidate-taste-v1",
    targetFacet: entry.sourceFacet, targetValueKey: entry.sourceValueKey,
    semanticOrdinal: entry.sourceFacet === "spice" ? ["none", "mild", "medium", "hot"].indexOf(entry.sourceValueKey) : null,
    provenance: "canonical_mapping", auditReference: "rec-b-smoke"
  })))
};
const profile = engine.normalizeExplicitTasteProfile(profileRow(), authority, tp);
expect(JSON.stringify(profile.cuisineKeys) === JSON.stringify(["japanese"])
  && JSON.stringify(profile.mealTypeKeys) === JSON.stringify(["lunch"])
  && JSON.stringify(profile.dislikedFlavorKeys) === JSON.stringify(["sweet"])
  && profile.spice?.semanticOrdinal === 1, "N01 explicit private profile normalizes through frozen P1 authority");
expect(engine.normalizeExplicitTasteProfile(profileRow({ preferred_cuisine_tags: ["日式"] }), authority, tp)
  .cuisineKeys.length === 0, "N02 unauthorized legacy free string abstains");

const evalFor = (facts, spiceOrdinals = { none: 0, mild: 1, medium: 2, hot: 3 }) =>
  engine.evaluateCandidateTaste(profile, projection("X", facts, spiceOrdinals), tp);
expect(evalFor({ cuisine: ["japanese"], meal_type: ["lunch"] }).score === 1,
  "F01 cuisine and meal-type intersections score positive");
const disjoint = evalFor({ cuisine: ["thai"], meal_type: ["dinner"] });
expect(disjoint.state === "valid" && disjoint.score === 0,
  "F02 known cuisine and meal-type disjoint evidence is neutral");
const flavorOverlap = evalFor({ cuisine: ["japanese"], flavor: ["sweet"] });
expect(flavorOverlap.state === "valid" && flavorOverlap.dislikedFlavorOverlap && flavorOverlap.score < 0,
  "F03 disliked-flavor overlap is negative soft evidence");
const flavorNoOverlap = evalFor({ cuisine: ["japanese"], flavor: ["smoky"] });
expect(flavorNoOverlap.state === "valid" && !flavorNoOverlap.dislikedFlavorOverlap
  && flavorNoOverlap.facetEvidence.find((entry) => entry.facetKey === "flavor")?.score === 0,
  "F04 known disliked-flavor non-overlap is neutral only");
for (const [key, expected] of [["mild", 1], ["none", 0.5], ["medium", 0.5], ["hot", 0]]) {
  const value = evalFor({ cuisine: ["japanese"], spice: [key] });
  expect(value.facetEvidence.find((entry) => entry.facetKey === "spice")?.score === expected,
    `spice distance semantics: ${key}`);
}
const noneSpiceProfile = engine.normalizeExplicitTasteProfile(profileRow({ spice_preference: "none" }), authority, tp);
const distanceThree = engine.evaluateCandidateTaste(
  noneSpiceProfile,
  projection("distance-three", { cuisine: ["japanese"], spice: ["hot"] }, { hot: 3 }),
  tp
);
expect(distanceThree.facetEvidence.find((entry) => entry.facetKey === "spice")?.score === -0.5,
  "spice distance semantics: distance three");
expect(evalFor({ cuisine: ["japanese"], spice: ["mild", "medium"] }).state === "insufficient_evidence",
  "F09 multi-valued candidate spice abstains");
expect(evalFor({ cuisine: ["japanese"] }).state === "insufficient_evidence",
  "C01 one comparable facet is insufficient evidence");
expect(evalFor({ cuisine: ["japanese"], flavor: ["sweet"] }).comparableFacetCount === 2,
  "C02 two comparable facets produce valid Taste");
expect(Math.abs(flavorOverlap.score - ((0.30 - 0.35) / 0.65)) < 1e-12,
  "C03 abstaining facets are omitted from weighted denominator");

const baseline = [nutrition("A", 0.120, 0), nutrition("B", 0.105, 1), nutrition("C", 0.090, 2), nutrition("D", 0.085, 3)];
const tasteMap = new Map([
  ["A", taste("A", 0.1)], ["B", taste("B", 0.9)], ["C", taste("C", 0.2)], ["D", taste("D", 0.8)]
]);
const composed = engine.composeDualLaneRecommendation(baseline, tasteMap, cp);
expect(JSON.stringify(composed.laneA) === JSON.stringify(["B", "A", "D", "C"]),
  "A01 Lane A reorders only inside anchor-based 0.02 bands", composed.laneA);
const antiChain = engine.composeDualLaneRecommendation([
  nutrition("A", 0.120, 0), nutrition("B", 0.105, 1), nutrition("C", 0.090, 2)
], new Map([["A", taste("A", 0)], ["B", taste("B", 0.5)], ["C", taste("C", 1)]]), cp);
expect(JSON.stringify(antiChain.laneA) === JSON.stringify(["B", "A", "C"]),
  "A02 adjacency cannot chain C into A's anchor band", antiChain.laneA);
const fixedUnknown = engine.composeDualLaneRecommendation([
  nutrition("A", 0.1, 0), nutrition("B", 0.1, 1), nutrition("C", 0.1, 2), nutrition("D", 0.1, 3)
], new Map([["A", taste("A", 0)], ["B", insufficient("B")], ["C", taste("C", 1)], ["D", insufficient("D")]]), cp);
expect(JSON.stringify(fixedUnknown.laneA) === JSON.stringify(["C", "B", "A", "D"]),
  "A03 insufficient-Taste slots remain fixed", fixedUnknown.laneA);

expect(engine.rankUtility(0, 1) === 1 && engine.rankUtility(0, 3) === 1
  && engine.rankUtility(1, 3) === 0.5 && engine.rankUtility(2, 3) === 0,
  "B01 rank utility is bounded with exact singleton/top/bottom behavior");
expect(!composed.laneB.includes("missing"), "B02 Lane B contains only valid Taste candidates");
const withInvalid = engine.composeDualLaneRecommendation(
  [nutrition("A", 3, 0), nutrition("B", 2, 1), nutrition("C", 1, 2)],
  new Map([["A", insufficient("A")], ["B", taste("B", 0)], ["C", taste("C", 1)]]), cp
);
expect(!withInvalid.laneB.includes("A"), "B03 invalid Taste is excluded rather than assigned zero");
expect(JSON.stringify(withInvalid.laneB) === JSON.stringify(["C", "B"]),
  "B04 exact 60/40 rank-utility composition is deterministic", withInvalid.laneB);
const singleton = engine.composeDualLaneRecommendation([nutrition("A", 1, 0)], new Map([["A", taste("A", 0)]]), cp);
expect(JSON.stringify(singleton.laneB) === JSON.stringify(["A"]), "B05 singleton Lane B remains truthful");

const interleave = engine.composeDualLaneRecommendation(
  [nutrition("A", 4, 0), nutrition("B", 3, 1), nutrition("C", 2, 2), nutrition("D", 1, 3), nutrition("E", 0, 4), nutrition("F", -1, 5)],
  new Map([["A", taste("A", 0.8)], ["B", taste("B", 1)], ["E", taste("E", 0.7)], ["F", taste("F", 0.6)]]), cp
);
const finalIds = interleave.entries.map((entry) => entry.candidate.candidateId);
expect(finalIds[0] === interleave.laneA[0] && interleave.entries[1].lane === "taste_forward",
  "I01 odd slot asks Lane A and even slot asks Lane B", finalIds);
expect(new Set(finalIds).size === finalIds.length && finalIds.length === 6,
  "I02 interleave globally dedupes candidateId and preserves full eligible pool", finalIds);
const sameMenu = [nutrition("branch-1", 1, 0, "menu-shared"), nutrition("branch-2", 0, 1, "menu-shared")];
const branches = engine.composeDualLaneRecommendation(sameMenu,
  new Map([["branch-1", taste("branch-1", 1)], ["branch-2", taste("branch-2", 0)]]), cp);
expect(branches.entries.length === 2, "I03 different branch offers sharing menuItemId remain distinct");
const exhausted = engine.composeDualLaneRecommendation(
  [nutrition("A", 2, 0), nutrition("B", 1, 1), nutrition("C", 0, 2)],
  new Map([["A", taste("A", 1)]]), cp
);
expect(exhausted.entries.length === 3 && exhausted.entries[2].candidate.candidateId === "C",
  "I04 lane exhaustion truthfully falls through other lane then baseline");

const laneAReason = reasons.buildRecommendationReason({
  ...fixedUnknown.entries.find((entry) => entry.candidate.candidateId === "C"),
  lane: "nutrition_primary", nutrition: { ...nutrition("C", 1, 0), hasPositiveGapContribution: true },
  taste: taste("C", 1, ["cuisine"])
});
expect(laneAReason.reasonCode === "nutrition_gap_match", "R01 Lane A prefers truthful Nutrition reason");
const laneBReason = reasons.buildRecommendationReason({
  ...fixedUnknown.entries.find((entry) => entry.candidate.candidateId === "C"),
  lane: "taste_forward", nutrition: { ...nutrition("C", 1, 0), hasPositiveGapContribution: true },
  taste: taste("C", 1, ["cuisine"])
});
expect(laneBReason.reasonCode === "preferred_cuisine_match", "R02 Lane B prefers positive Taste reason");
const neutralFlavorReason = reasons.buildRecommendationReason({
  ...fixedUnknown.entries.find((entry) => entry.candidate.candidateId === "C"),
  lane: "taste_forward", nutrition: { ...nutrition("C", 1, 0), hasPositiveGapContribution: false },
  taste: { ...taste("C", 0), positiveFacetKeys: [], dislikedFlavorOverlap: false }
});
expect(neutralFlavorReason.reasonSummary === "" && !JSON.stringify(neutralFlavorReason).includes("避開"),
  "R03 no positive evidence makes no positive or avoidance claim");
const caveat = reasons.buildRecommendationReason({
  ...fixedUnknown.entries.find((entry) => entry.candidate.candidateId === "C"),
  lane: "taste_forward", nutrition: { ...nutrition("C", 1, 0), hasPositiveGapContribution: false },
  taste: { ...taste("C", -0.2), positiveFacetKeys: [], dislikedFlavorOverlap: true }
});
expect(caveat.detailSummaries.some((value) => value.includes("較不一致")),
  "R04 known disliked-flavor overlap produces only a coarse caveat");

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  suite: "recommendation-rec-b-smoke", status: failed.length ? "failed" : "passed",
  mutation: mutationName || null, total: checks.length, passed: checks.length - failed.length,
  failed: failed.length, failures: failed.map((entry) => entry.name),
  networkUsed: false, databaseUsed: false, developmentTouched: false, productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);

function source(facet, key, label) {
  const ids = { cuisine: "private-taste-cuisine-v1", flavor: "private-taste-flavor-v1", spice: "private-taste-spice-v1" };
  return { sourceVocabularyId: ids[facet], sourceVocabularyVersion: 1, sourceFacet: facet, sourceValueKey: key, locale: "zh-TW", label };
}
function profileRow(patch = {}) {
  return {
    id: "profile-1", user_id: "user-1", preferred_cuisine_tags: ["japanese"],
    preferred_meal_types: ["lunch"], disliked_tastes: ["sweet"], spice_preference: "mild",
    dining_style: null, payment_preference: null, created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z", ...patch
  };
}
function projection(id, facts, spiceOrdinals = {}) {
  return { candidateId: id, restaurantId: `restaurant-${id}`, branchId: `branch-${id}`,
    menuItemId: `menu-${id}`, taxonomyVersion: "candidate-taste-v1", mappingState: "partial",
    facts, spiceOrdinals };
}
function candidate(id, menuItemId = `menu-${id}`) {
  return { candidateId: id, branchMenuItemId: id, menuItemId, restaurantId: `restaurant-${id}`,
    branchId: `branch-${id}`, mealName: id, restaurantName: `restaurant-${id}`, nutrition: { calories: 100 },
    tags: [], reason: { reasonSummary: "", reasonBasis: "neutral_nutrition_fallback",
      reasonCode: "neutral_nutrition_fallback", detailSummaries: [] }, rankOrdinal: 0 };
}
function nutrition(id, score, rankOrdinal, menuItemId) {
  return { candidate: candidate(id, menuItemId), score, usableDimensions: ["calories"],
    hasPositiveGapContribution: true, rankOrdinal };
}
function taste(id, score, positiveFacetKeys = []) {
  return { candidateId: id, state: "valid", comparableFacetCount: 2, score,
    facetEvidence: [], positiveFacetKeys, dislikedFlavorOverlap: false };
}
function insufficient(id) {
  return { candidateId: id, state: "insufficient_evidence", comparableFacetCount: 1,
    score: null, facetEvidence: [], positiveFacetKeys: [], dislikedFlavorOverlap: false };
}
