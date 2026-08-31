#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import crypto from "node:crypto";
import {
  RECB_BASELINE, RECB_COMMIT_SUBJECT, RECB_MIGRATIONS, RECB_NPM_KEYS, RECB_PATHS,
  classifyRecbLifecycle, createRecbManifest
} from "./recommendation-rec-b-successor-manifest.mjs";
import { RECCP0_BASELINE, RECCP0_MIGRATION, RECCP0_NPM_KEYS, RECCP0_PATHS, classifyReccp0Lifecycle } from "./recommendation-rec-c-p0-successor-manifest.mjs";
import { RECCP1_BASELINE, RECCP1_MIGRATION, classifyReccp1Lifecycle } from "./recommendation-rec-c-p1-successor-manifest.mjs";
import { classifyReccLifecycle } from "./recommendation-rec-c-successor-manifest.mjs";
import {
  RECDP0_BASELINE,
  RECDP0_MIGRATION,
  classifyRecdp0Lifecycle
} from "./recommendation-rec-d-p0-successor-manifest.mjs";
import {
  RECDP1_BASELINE, RECDP1_MIGRATION, classifyRecdp1Lifecycle
} from "./recommendation-rec-d-p1-successor-manifest.mjs";
import { RECD_BASELINE, classifyRecdLifecycle } from "./recommendation-rec-d-successor-manifest.mjs";

const root = process.cwd();
const git = (args) => {
  const result = child.spawnSync("git", ["-c", "core.safecrlf=false", ...args], {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) throw result.error ?? new Error(result.stderr || "git_failed");
  return (result.stdout ?? "").trim();
};
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const checks = []; const failures = [];
const check = (name, pass, detail) => {
  const item = { name, pass: Boolean(pass), ...(pass ? {} : { detail }) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
};

const head = git(["rev-parse", "HEAD"]);
const originHead = git(["rev-parse", "origin/main"]);
const [behind, ahead] = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"])
  .split(/\s+/).map(Number);
const unstaged = lines(git(["diff", "--name-only"]));
const untracked = lines(git(["ls-files", "--others", "--exclude-standard"]));
const worktreePaths = [...new Set([...unstaged, ...untracked])].sort();
const stagedPaths = lines(git(["diff", "--cached", "--name-only"]));
const deltaPaths = head === RECB_BASELINE ? [] : lines(git(["diff", "--name-only", `${RECB_BASELINE}..HEAD`]));
const lifecycle = classifyRecbLifecycle({
  head, parent: head === RECB_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind, ahead, worktreePaths, stagedPaths, deltaPaths,
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});


// REC-C-P0 is the uncommitted/frozen successor sitting on this round's pushed freeze. Recognising it
// here keeps this guard meaningful while that round is in flight; every other state still fails.
const reccp0WorktreePaths = [...new Set([
  ...lines(git(["diff", "--name-only"])),
  ...lines(git(["ls-files", "--others", "--exclude-standard"]))
])].sort();
const reccp0Lifecycle = classifyReccp0Lifecycle({
  head, parent: head === RECCP0_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind, ahead, worktreePaths: reccp0WorktreePaths, stagedPaths,
  deltaPaths: head === RECCP0_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const reccp0Successor = reccp0Lifecycle.valid;
const reccp1Lifecycle = classifyReccp1Lifecycle({
  head, parent: head === RECCP1_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind, ahead, worktreePaths, stagedPaths,
  deltaPaths: head === RECCP1_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const reccp1Successor = reccp1Lifecycle.valid;
const reccLifecycle = classifyReccLifecycle({
  head, parent: head === RECCP1_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind, ahead, worktreePaths, stagedPaths,
  deltaPaths: head === RECCP1_BASELINE ? [] : lines(git([
    "diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"
  ])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const reccSuccessor = reccLifecycle.valid;
// REC-D-P0 successor seam ONLY, recognised on exactly the terms the REC-C successor above is:
// by its own exact lifecycle and exact path set. Widening only; the stale-origin assertion in
// this guard is deliberately NOT relaxed.
const recdp0Lifecycle = classifyRecdp0Lifecycle({
  head, originHead, behind, ahead, stagedPaths, worktreePaths,
  deltaPaths: head === RECDP0_BASELINE ? []
    : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  parent: head === RECDP0_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recdp0Successor = recdp0Lifecycle.valid;
const recdp1Lifecycle = classifyRecdp1Lifecycle({
  head, originHead, behind, ahead, stagedPaths, worktreePaths,
  deltaPaths: head === RECDP1_BASELINE ? []
    : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  parent: head === RECDP1_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recdp1Successor = recdp1Lifecycle.valid;
const recdLifecycle = classifyRecdLifecycle({
  head, originHead, behind, ahead, stagedPaths, worktreePaths,
  deltaPaths: head === RECD_BASELINE ? []
    : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  parent: head === RECD_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recdSuccessor = recdLifecycle.valid;


check("lifecycle is exact REC-B candidate or freeze",
  lifecycle.valid || reccp0Successor || reccp1Successor || reccSuccessor || recdp0Successor || recdp1Successor || recdSuccessor,
  { recb: lifecycle, reccp0: reccp0Lifecycle.phase, reccp1: reccp1Lifecycle.phase,
    recc: reccLifecycle.phase, recdp1: recdp1Lifecycle.phase, recd: recdLifecycle.phase });
check("branch remains main", git(["branch", "--show-current"]) === "main");
check("origin/main remains the exact pushed predecessor or REC-B pushed freeze",
  originHead === RECB_BASELINE || (lifecycle.phase === "frozen_pushed" && originHead === head)
  || (reccp0Successor && originHead === RECCP0_BASELINE), originHead);
check("nothing is staged", stagedPaths.length === 0, stagedPaths);
check("manifest is exact, unique, sorted, and wildcard-free",
  JSON.stringify(RECB_PATHS) === JSON.stringify([...RECB_PATHS].sort())
  && new Set(RECB_PATHS).size === RECB_PATHS.length
  && RECB_PATHS.every((file) => !/[?*]/.test(file) && !file.endsWith("/")));
check("every exact manifest path exists", RECB_PATHS.every((file) => fs.existsSync(path.join(root, file))));
check("REC-B creates no migration", RECB_MIGRATIONS.length === 0
  && lines(git(["diff", "--name-only", RECB_BASELINE, "--", "supabase/migrations", "supabase/schema"]))
    .every((file) => file === RECCP0_MIGRATION
      || ((reccp1Successor || reccSuccessor || recdp0Successor || recdp1Successor || recdSuccessor) && file === RECCP1_MIGRATION)
      || ((recdp0Successor || recdp1Successor || recdSuccessor) && file === RECDP0_MIGRATION)
      || ((recdp1Successor || recdSuccessor) && file === RECDP1_MIGRATION)));
check("dependency and lock bytes are unchanged",
  lines(git(["diff", "--name-only", RECB_BASELINE, "--", "apps/mobile/package.json", "package-lock.json"])).length === 0);
check("Production, deployment, and workflow paths are untouched",
  !lifecycle.manifest.some((file) => /production|deploy|\.github\/workflows/i.test(file)));

const tastePolicy = read("apps/mobile/features/consumer-meals/tasteRankingPolicy.ts");
const compositionPolicy = read("apps/mobile/features/consumer-meals/recommendationCompositionPolicy.ts");
const engine = read("apps/mobile/features/consumer-meals/recommendationTasteRanking.ts");
const reader = read("apps/mobile/features/consumer-meals/adapters/supabaseRecommendationTasteReader.ts");
const repository = read("apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts");
const service = read("apps/mobile/features/consumer-meals/consumerNextMealRecommendationService.ts");
const ranker = read("apps/mobile/features/consumer-meals/nextMealNutritionRanker.ts");
const reasons = read("apps/mobile/features/consumer-meals/recommendationReasons.ts");
const ui = read("apps/mobile/features/next-meal-prototype/NextMealPrototypeContent.tsx");
const mapper = read("apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.ts");
const route = read("apps/mobile/app/recommendation.tsx");
const writeMapper = read("apps/mobile/features/consumer-runtime/consumerMealWriteMapper.ts");
const prefill = read("apps/mobile/features/next-meal-prototype/nextMealBuddyPrefill.ts");
const docs = read("docs/recommendation/rec-b-dual-lane-taste-ranking.md");
const types = read("apps/mobile/features/consumer-meals/types.ts");

check("Taste policy has exact identity, taxonomy, and versioned normalization reference",
  /tastkind\.taste\.explicit_preferences/.test(tastePolicy)
  && /candidateTaxonomyVersion: "candidate-taste-v1"/.test(tastePolicy)
  && /private-taste-normalization-v1/.test(tastePolicy));
check("Taste policy owns exact four weights", [
  /facetKey: "cuisine" as const, weight: 0\.30/,
  /facetKey: "meal_type" as const, weight: 0\.20/,
  /facetKey: "flavor" as const, weight: 0\.35/,
  /facetKey: "spice" as const, weight: 0\.15/
].every((pattern) => pattern.test(tastePolicy)));
check("Taste policy owns abstention and two-facet minimum",
  /minimumComparableFacetCount: 2/.test(tastePolicy) && /unknownTreatment: "abstain"/.test(tastePolicy));
check("Taste evidence semantics are explicit policy values",
  /categoricalMatch: 1/.test(tastePolicy) && /categoricalKnownDisjoint: 0/.test(tastePolicy)
  && /dislikedFlavorOverlap: -1/.test(tastePolicy) && /dislikedFlavorKnownNoOverlap: 0/.test(tastePolicy)
  && ["0, score: 1", "1, score: 0.5", "2, score: 0", "3, score: -0.5"]
    .every((value) => tastePolicy.includes(value)));
check("Taste policy is injectable and validated",
  /export interface TasteRankingPolicyProvider/.test(tastePolicy)
  && /export function isTasteRankingPolicy/.test(tastePolicy));
check("composition policy exact identity and strategies",
  /tastkind\.recommendation\.dual_lane_interleave/.test(compositionPolicy)
  && /alternating_dual_lane/.test(compositionPolicy)
  && /nutrition_primary_tolerance_band/.test(compositionPolicy)
  && /taste_forward_rank_composite/.test(compositionPolicy));
check("composition policy owns 0.02 and 60/40 rank utility",
  /nutritionTolerance: 0\.02/.test(compositionPolicy)
  && /tasteRankWeight: 0\.60/.test(compositionPolicy)
  && /nutritionRankWeight: 0\.40/.test(compositionPolicy)
  && /linear_zero_based/.test(compositionPolicy));
check("composition policy owns candidateId dedupe, fallback, and post-interleave clipping",
  /dedupeKey: "candidateId"/.test(compositionPolicy)
  && /other_lane_then_nutrition_baseline/.test(compositionPolicy)
  && /clippingOrder: "after_interleave"/.test(compositionPolicy));
check("composition policy is injectable and validated",
  /export interface RecommendationCompositionPolicyProvider/.test(compositionPolicy)
  && /export function isRecommendationCompositionPolicy/.test(compositionPolicy));
check("both new providers resolve exactly once per request",
  (service.match(/getActiveTasteRankingPolicy\(\)/g) ?? []).length === 1
  && (service.match(/getActiveRecommendationCompositionPolicy\(\)/g) ?? []).length === 1);

check("reader uses exact P0 candidate facts and coverage projections",
  /consumer_public_next_meal_candidate_taste_facts_v1/.test(reader)
  && /consumer_public_next_meal_candidate_taste_state_v1/.test(reader));
check("reader loads facts only for eligible candidate IDs",
  (reader.match(/\.in\("candidate_id", candidateIds\)/g) ?? []).length === 2
  && /readForEligibleCandidates/.test(repository));
check("reader preserves branch-offer candidate identity and validates coverage",
  /Candidate Taste state identity mismatch/.test(reader)
  && /Candidate Taste coverage mismatch/.test(reader)
  && /candidateId: candidate\.candidateId/.test(reader));
check("reader consumes exact P1 vocabulary-only views",
  /consumer_private_taste_source_values_v1/.test(reader)
  && /consumer_private_taste_normalization_dictionary_v1/.test(reader));
check("versioned policy reference reconciles only through frozen P1 backing identity",
  /PRIVATE_TASTE_NORMALIZATION_POLICY_ID/.test(engine)
  && /single intentional reconciliation point/.test(engine)
  && !/private-taste-normalization-v1/.test(read("packages/shared/src/domain/user-taste-normalization/privateTasteNormalization.ts")));
check("only explicit private Taste fields are consumed",
  /preferred_cuisine_tags/.test(engine) && /preferred_meal_types/.test(engine)
  && /disliked_tastes/.test(engine) && /spice_preference/.test(engine)
  && !/favorite|rating|mealHistory|recency|publicInterest|foodInterest/.test(engine + service + repository));

check("Cuisine and meal type use intersection/known-disjoint/abstain semantics",
  /pushCategoricalEvidence/.test(engine) && /categoricalKnownDisjoint/.test(engine)
  && /if \(userValues\.length === 0 \|\| candidateValues\.length === 0\) return/.test(engine));
check("flavor overlap is negative and non-overlap is neutral without avoidance inference",
  /dislikedFlavorOverlap/.test(engine) && /dislikedFlavorKnownNoOverlap/.test(engine)
  && !/避開你不喜歡/.test(reasons + mapper + ui));
check("spice requires exactly one candidate value and uses semantic ordinal distance",
  /candidateValues\.length === 1/.test(engine)
  && /Math\.abs\(profile\.spice\.semanticOrdinal - candidateOrdinal\)/.test(engine));
check("minimum coverage gates score and comparable-only denominator",
  /comparableFacetCount >= policy\.minimumComparableFacetCount/.test(engine)
  && /weightedTotal \/ weightTotal/.test(engine) && /score: number \| null/.test(engine));
check("raw Taste score is neither persisted nor projected to recommendation UI",
  !/tasteScore|rankUtility|nutritionTolerance|tasteRankWeight/.test(types + mapper + ui));

check("REC-A formula remains remaining-gap minus added-overage weighted mean",
  /improvement - addedOveragePenalty/.test(ranker) && /weightedTotal \/ weightTotal/.test(ranker));
check("REC-A internal seam exposes only evaluation needed by REC-B",
  /ConsumerNextMealNutritionEvaluation/.test(types)
  && /hasPositiveGapContribution/.test(ranker) && /evaluations: Object\.freeze/.test(ranker));
check("Lane A is anchor-based, not chained adjacency",
  /anchor\.score - nutritionOrder\[end\]\.score <= policy\.laneA\.nutritionTolerance/.test(engine)
  && !/nutritionOrder\[end - 1\]\.score - nutritionOrder\[end\]\.score/.test(engine));
check("Lane A reorders only valid-Taste slots with exact tie chain",
  /taste\?\.state === "valid"/.test(engine) && /rightTaste - leftTaste/.test(engine)
  && /right\.score - left\.score/.test(engine) && /left\.rankOrdinal - right\.rankOrdinal/.test(engine));
check("Lane B excludes invalid Taste and computes bounded rank utilities",
  /filter\(\(entry\) => tasteByCandidateId\.get\(entry\.candidate\.candidateId\)\?\.state === "valid"\)/.test(engine)
  && /count === 1 \? 1 : 1 - rank \/ \(count - 1\)/.test(engine));
check("Lane B combines rank utilities only with policy 60/40 values",
  /policy\.laneB\.tasteRankWeight \* rankUtility/.test(engine)
  && /policy\.laneB\.nutritionRankWeight \* rankUtility/.test(engine));
check("interleave requests odd A/even B and globally dedupes candidateId",
  /entries\.length % 2 === 0/.test(engine) && /const used = new Set<string>/.test(engine)
  && /used\.add\(selected\)/.test(engine) && !/used\.add\([^)]*menuItemId/.test(engine));
check("interleave falls through other lane then REC-A baseline",
  /take\(laneB, cursorB\)/.test(engine) && /take\(laneA, cursorA\)/.test(engine)
  && /take\(baseline, cursorBaseline\)/.test(engine));
check("entitlement clips the already-composed canonical order",
  /Array\.from\(recommendation\.candidates\)\.slice\(0, visibleLimit\)/.test(mapper)
  && !/preferredIndex/.test(mapper));

check("Taste/provider/projection failures preserve REC-A candidates",
  /const unavailable = Object\.freeze\(\{[\s\S]*candidates: ranked\.candidates/.test(repository)
  && /catch \{[\s\S]*return unavailable/.test(repository));
check("composition validation failure returns REC-A before candidate Taste read",
  (() => {
    const method = repository.slice(repository.indexOf("private async applyTasteRanking"));
    return method.indexOf("!isRecommendationCompositionPolicy") < method.indexOf("readForEligibleCandidates");
  })());
check("GEO fallback path passes the same resolved policies without widening zero-nearby",
  (service.match(/tasteRankingPolicy,/g) ?? []).length === 2
  && (service.match(/recommendationCompositionPolicy,/g) ?? []).length === 2
  && /repoResult\.status === "read_failed" && input\.currentLocation/.test(service));

check("reason generation is separate and Lane A prefers Nutrition",
  /export function buildRecommendationReason/.test(reasons)
  && /tasteFirst && tasteSummary/.test(reasons)
  && reasons.indexOf("else if (nutrition)") < reasons.indexOf("else if (tasteSummary)"));
check("Lane B positive reason requires actual positive facet evidence",
  /entry\.taste\.positiveFacetKeys/.test(reasons) && /entry\.score > 0/.test(engine));
check("compact cards render thumbnail and at most one short reason",
  /style=\{styles\.mealImage\}/.test(ui) && /numberOfLines=\{1\}/.test(ui)
  && (ui.match(/candidate\.reasonSummary/g) ?? []).length === 2);
check("tap opens the existing inline selected detail with larger image and nutrition",
  /selectedCandidate \? \(/.test(ui) && /style=\{styles\.detailImage\}/.test(ui)
  && /nutritionSummary\(selectedCandidate\)/.test(ui));
check("detail explanation remains coarse and leaks no mechanics",
  !/TasteScore|NutritionScore|60\s*\/\s*40|0\.02|facet weight|auditReference|sourceReference/.test(ui + mapper + reasons));

check("Today Intake action calls the existing runtime explicitly with selected canonical identity",
  /onAddToTodayIntake\(candidate\)/.test(ui) && /runtime\.createMealRecord\(\{/.test(route)
  && /restaurantId: candidate\.restaurantId/.test(route)
  && /branchId: candidate\.branchId/.test(route)
  && /menuItemId: candidate\.menuItemId/.test(route));
check("Today Intake preserves canonical nutrition provenance through the existing mapper",
  /trustedNutritionSource: candidate\.nutritionSource/.test(route)
  && /input\.trustedNutritionSource \?\? "ai_estimated"/.test(writeMapper)
  && /trustedMealSource: "restaurant"/.test(route));
check("Meal Buddy action remains the frozen selected-recommendation prefill handoff",
  /onUseForMealBuddy\(selectedCandidate\)/.test(ui)
  && /stageU1NextMealBuddyPrefill\(\s*buildU1NextMealBuddyPrefill\(candidate\)\s*\)/.test(route)
  && /branchMenuItemId: recommendation\.branchMenuItemId/.test(prefill));
check("both actions receive the same selected view model and neither consults lane",
  /onAddToTodayIntake\(candidate\)/.test(ui) && /onUseForMealBuddy\(selectedCandidate\)/.test(ui)
  && !/recommendationLane/.test(route));
check("actions are independent with no cross-write",
  !/openMealBuddyPrefill/.test(route.slice(route.indexOf("async function addRecommendationToTodayIntake"), route.indexOf("return (")))
  && !/createMealRecord/.test(route.slice(route.indexOf("function openMealBuddyPrefill"), route.indexOf("async function addRecommendationToTodayIntake"))));
check("selection and presentation trigger no intake or Meal Buddy write",
  !/onAddToTodayIntake/.test(ui.slice(ui.indexOf("function selectCandidate"), ui.indexOf("async function confirmSelectedCandidate")))
  && !/onUseForMealBuddy/.test(ui.slice(ui.indexOf("function selectCandidate"), ui.indexOf("async function confirmSelectedCandidate"))));

const product = RECB_PATHS.filter((file) => file.startsWith("apps/mobile/") || file.startsWith("lib/"))
  .map(read).join("\n");
check("Social Taste, Public Interests, Meal Context ranking, restrictions, and behavioral Taste stay disconnected",
  !/taste-similarity|publicInterestTags|foodInterestTags|dietaryRestrictionsReader|mealHistoryReader|favoriteService|ratingService/.test(product));
check("frozen Meal Buddy context authority and handoff implementation bytes are unchanged",
  git(["diff", "--name-only", RECB_BASELINE, "--",
    "supabase/migrations/20260820010000_meal_buddy_food_context_authority.sql",
    "apps/mobile/features/next-meal-prototype/nextMealBuddyPrefill.ts"]) === "");
check("all three dedicated commands are registered",
  RECB_NPM_KEYS.every((key) => JSON.parse(read("package.json")).scripts[key]?.includes("recommendation-rec-b")));
check("Development acceptance and cleanup handoff is complete and Production forbidden",
  /Claude Development acceptance handoff/.test(docs) && /zero candidate/.test(docs)
  && /Production must never be addressed/.test(docs));

const secretPatterns = [
  new RegExp(["ey", "J[A-Za-z0-9_-]{30,}\\.[A-Za-z0-9_-]{20,}"].join("")),
  new RegExp(["sb", "_secret_[A-Za-z0-9_-]{10,}"].join("")),
  new RegExp(["postgres", "(?:ql)?://[^\\s\"']*:[^\\s\"']*@"].join(""))
];
check("manifest bytes contain no credentials, CRLF, BOM, or NUL", RECB_PATHS.every((file) => {
  const bytes = fs.readFileSync(path.join(root, file)); const text = bytes.toString("utf8");
  return !secretPatterns.some((pattern) => pattern.test(text)) && !bytes.includes(Buffer.from("\r\n"))
    && !bytes.includes(0) && !(bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);
}));

if (!recdSuccessor && (lifecycle.phase === "frozen_local" || lifecycle.phase === "frozen_pushed")) {
  check("freeze commit subject is exact", git(["log", "-1", "--pretty=%s"]) === RECB_COMMIT_SUBJECT);
}
const manifest = createRecbManifest((file) => fs.readFileSync(path.join(root, file)));
check("raw-byte manifest covers exact sorted paths", manifest.entries.length === RECB_PATHS.length
  && manifest.entries.every((entry, index) => entry.path === RECB_PATHS[index]
    && /^[0-9a-f]{64}$/.test(entry.sha256)));

const p0Migration = "supabase/migrations/20260828010000_candidate_taste_data_authority.sql";
const p1Migration = "supabase/migrations/20260829010000_private_taste_normalization_authority.sql";
console.log("\n" + JSON.stringify({
  suite: "recommendation-rec-b-guard", lifecycle: lifecycle.phase,
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((item) => item.name), canonicalManifestSha256: manifest.aggregateSha256,
  p0MigrationSha256: sha(p0Migration), p1MigrationSha256: sha(p1Migration), migration: null,
  networkUsed: false, databaseUsed: false, developmentTouched: false, productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
