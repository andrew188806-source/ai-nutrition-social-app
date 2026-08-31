#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import {
  RECA_BASELINE, RECA_COMMIT_SUBJECT, RECA_NPM_KEYS, RECA_PATHS,
  RECA_PREDECESSOR_VALIDATION_PATHS, RECA_PRODUCT_PATHS,
  classifyRecaLifecycle, createRecaManifest
} from "./recommendation-rec-a-successor-manifest.mjs";
import { RECBP0_BASELINE, RECBP0_MIGRATION } from "./recommendation-rec-b-p0-successor-manifest.mjs";
import { classifyRecbp1Lifecycle, RECBP1_BASELINE, RECBP1_MIGRATION } from "./recommendation-rec-b-p1-successor-manifest.mjs";
import { RECB_BASELINE, classifyRecbLifecycle } from "./recommendation-rec-b-successor-manifest.mjs";
import { RECCP0_BASELINE, RECCP0_MIGRATION, classifyReccp0Lifecycle } from "./recommendation-rec-c-p0-successor-manifest.mjs";
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
const checks = []; const failures = [];
const check = (name, ok, detail) => {
  const result = { name, pass: Boolean(ok), ...(ok ? {} : { detail }) };
  checks.push(result); if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
};

const head = git(["rev-parse", "HEAD"]);
const originHead = git(["rev-parse", "origin/main"]);
const counts = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"]).split(/\s+/).map(Number);
const unstaged = lines(git(["diff", "--name-only"]));
const untracked = lines(git(["ls-files", "--others", "--exclude-standard"]));
const worktreePaths = [...new Set([...unstaged, ...untracked])].sort();
const stagedPaths = lines(git(["diff", "--cached", "--name-only"]));
const deltaPaths = head === RECA_BASELINE ? [] : lines(git(["diff", "--name-only", `${RECA_BASELINE}..HEAD`]));
const recaLifecycle = classifyRecaLifecycle({
  head, parent: head === RECA_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths, stagedPaths, deltaPaths,
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recbp1Lifecycle = classifyRecbp1Lifecycle({
  head, parent: head === RECBP1_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths, stagedPaths,
  deltaPaths: head === RECBP1_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recbLifecycle = classifyRecbLifecycle({
  head, parent: head === RECB_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths, stagedPaths,
  deltaPaths: head === RECB_BASELINE ? [] : lines(git(["diff", "--name-only", `${RECB_BASELINE}..HEAD`])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
// REC-C-P0 successor seam ONLY. Recognising the next round's exact state stops this guard failing
// on work that is not its own. Its origin/main assertion below is deliberately NOT relaxed.
const reccp0Lifecycle = classifyReccp0Lifecycle({
  head, parent: head === RECCP0_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths, stagedPaths,
  deltaPaths: head === RECCP0_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const reccp0Successor = reccp0Lifecycle.valid;
const reccp1Lifecycle = classifyReccp1Lifecycle({
  head, parent: head === RECCP1_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths, stagedPaths,
  deltaPaths: head === RECCP1_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const reccp1Successor = reccp1Lifecycle.valid;
const reccLifecycle = classifyReccLifecycle({
  head, parent: head === RECCP1_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths, stagedPaths,
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
  head, originHead, behind: counts[0], ahead: counts[1], stagedPaths, worktreePaths,
  deltaPaths: head === RECDP0_BASELINE ? []
    : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  parent: head === RECDP0_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recdp0Successor = recdp0Lifecycle.valid;
const recdp1Lifecycle = classifyRecdp1Lifecycle({
  head, originHead, behind: counts[0], ahead: counts[1], stagedPaths, worktreePaths,
  deltaPaths: head === RECDP1_BASELINE ? []
    : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  parent: head === RECDP1_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recdp1Successor = recdp1Lifecycle.valid;
const recdLifecycle = classifyRecdLifecycle({
  head, originHead, behind: counts[0], ahead: counts[1], stagedPaths, worktreePaths,
  deltaPaths: head === RECD_BASELINE ? []
    : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  parent: head === RECD_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recdSuccessor = recdLifecycle.valid;

const lifecycle = recdSuccessor ? recdLifecycle
  : recdp1Successor ? recdp1Lifecycle
  : reccSuccessor ? reccLifecycle
  : recbLifecycle.valid ? recbLifecycle
  : reccp1Successor ? reccp1Lifecycle
  : reccp0Successor ? reccp0Lifecycle
  : recbp1Lifecycle.valid ? recbp1Lifecycle : recaLifecycle;

check("lifecycle is exact REC-A candidate or frozen local",
  lifecycle.valid || reccp0Successor || reccp1Successor || reccSuccessor || recdp0Successor || recdp1Successor || recdSuccessor,
  { active: lifecycle, reccp0: reccp0Lifecycle.phase, reccp1: reccp1Lifecycle.phase,
    recc: reccLifecycle.phase, recdp1: recdp1Lifecycle.phase, recd: recdLifecycle.phase });
check("branch remains main", git(["branch", "--show-current"]) === "main");
check("nothing is staged", stagedPaths.length === 0, stagedPaths);
check("origin/main remains the frozen REC-A/REC-B predecessor authority",
  originHead === RECA_BASELINE || originHead === RECBP0_BASELINE || originHead === RECBP1_BASELINE || originHead === RECB_BASELINE
    || (recbp1Lifecycle.phase === "frozen_pushed" && originHead === head), originHead);
check("exact wildcard-free manifest", new Set(RECA_PATHS).size === RECA_PATHS.length
  && RECA_PATHS.every((file) => !/[?*]/.test(file) && !file.endsWith("/")));
check("every manifest path exists", RECA_PATHS.every((file) => fs.existsSync(path.join(root, file))));
const schemaDelta = lines(git(["diff", "--name-only", RECA_BASELINE, "--", "supabase/migrations", "supabase/schema"]));
check("REC-B-P0 successor adds only its one migration; REC-A itself changed none",
  recdSuccessor || recdp1Successor
    ? schemaDelta.length <= 6 && schemaDelta.every((file) => file === RECBP0_MIGRATION
        || file === RECBP1_MIGRATION || file === RECCP0_MIGRATION || file === RECCP1_MIGRATION
        || file === RECDP0_MIGRATION || file === RECDP1_MIGRATION)
    : reccSuccessor || recdp0Successor
    ? schemaDelta.length <= 5 && schemaDelta.every((file) => file === RECBP0_MIGRATION
        || file === RECBP1_MIGRATION || file === RECCP0_MIGRATION || file === RECCP1_MIGRATION
        || (recdp0Successor && file === RECDP0_MIGRATION))
    : reccp1Successor
    ? schemaDelta.length <= 4 && schemaDelta.every((file) => file === RECBP0_MIGRATION
        || file === RECBP1_MIGRATION || file === RECCP0_MIGRATION || file === RECCP1_MIGRATION)
    : reccp0Successor
    ? schemaDelta.length <= 3 && schemaDelta.every((file) => file === RECBP0_MIGRATION
        || file === RECBP1_MIGRATION || file === RECCP0_MIGRATION)
    : recbLifecycle.valid
    ? schemaDelta.length <= 2 && schemaDelta.every((file) => file === RECBP0_MIGRATION || file === RECBP1_MIGRATION)
    : recbp1Lifecycle.valid
    ? schemaDelta.length <= 2 && schemaDelta.every((file) => file === RECBP0_MIGRATION || file === RECBP1_MIGRATION)
    : lifecycle.phase.startsWith("rec_b_p0_")
    ? schemaDelta.length <= 1 && schemaDelta.every((file) => file === RECBP0_MIGRATION)
    : schemaDelta.length === 0,
  schemaDelta);
check("no dependency or lock bytes changed", lines(git(["diff", "--name-only", RECA_BASELINE, "--", "apps/mobile/package.json", "package-lock.json"])).length === 0);
check("Production and deployment paths are untouched", !lifecycle.manifest.some((file) => /production|deploy|\.github\/workflows/i.test(file)));
check("predecessor edits are validation-only", RECA_PREDECESSOR_VALIDATION_PATHS.every((file) =>
  file.endsWith("-guard.mjs") || file.endsWith("-smoke.mjs") || file.endsWith("-mutations.mjs")));
check("product manifest contains only scoped Mobile integration surfaces", RECA_PRODUCT_PATHS.every((file) => file.startsWith("apps/mobile/")));

const ranker = read("apps/mobile/features/consumer-meals/nextMealNutritionRanker.ts");
const service = read("apps/mobile/features/consumer-meals/consumerNextMealRecommendationService.ts");
const repository = read("apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts");
const rows = read("apps/mobile/features/consumer-meals/adapters/supabaseRestaurantMenuRows.ts");
const mapper = read("apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.ts");
const composition = read("apps/mobile/features/next-meal-prototype/canonicalNextMealPrototypeComposition.ts");
const policy = read("apps/mobile/features/consumer-meals/nutritionRankingPolicy.ts");
const types = read("apps/mobile/features/consumer-meals/types.ts");
const product = RECA_PRODUCT_PATHS.map(read).join("\n");

check("pure ranker covers the five authorized dimensions", ["calories", "protein", "carbohydrates", "fat", "fiber"].every((name) => types.includes(`\"${name}\"`)));
check("ranker implements gap reward and added-overage penalty", /remainingGap/.test(ranker) && /improvement - addedOveragePenalty/.test(ranker));
check("ranker combines usable dimensions by the policy weights, not a fixed average",
  /weightedTotal \/ weightTotal/.test(ranker) && /\* entry\.weight/.test(ranker)
  && !/terms\.length/.test(ranker));

// ---- nutrition ranking policy boundary ----------------------------------------------------------
// The formula may live in the ranker; WHICH dimensions count and HOW MUCH is policy. These checks
// exist so a later weighting decision can never be made by editing Mobile.
check("a canonical nutrition ranking policy contract exists",
  /export type NutritionRankingPolicy = Readonly<\{/.test(types)
  && /policyId: string;/.test(types) && /policyVersion: number;/.test(types)
  && /targetStrategy: NutritionRankingTargetStrategy;/.test(types)
  && /dimensions: readonly NutritionRankingDimensionPolicy\[\];/.test(types));
check("the policy carries per-dimension weights and overage penalty parameters",
  /weight: number;/.test(types) && /overagePenaltyWeight: number;/.test(types));
check("the ranker CONSUMES a policy rather than owning the formula authority",
  /policyCandidate\?: NutritionRankingPolicy/.test(ranker)
  && /resolveNutritionRankingPolicy\(policyCandidate\)/.test(ranker)
  && /for \(const entry of policy\.dimensions\)/.test(ranker));
check("scoring iterates the policy's enabled dimensions, never the module constant",
  !/for \(const dimension of CONSUMER_NEXT_MEAL_NUTRITION_DIMENSIONS\)/.test(ranker));
check("exactly one default policy ships, identified and versioned",
  /DEFAULT_NUTRITION_RANKING_POLICY_ID = "tastkind\.nutrition\.balanced_gap"/.test(policy)
  && /DEFAULT_NUTRITION_RANKING_POLICY_VERSION = 1/.test(policy));
check("default policy v1 is equal contribution across the five dimensions",
  /CONSUMER_NEXT_MEAL_NUTRITION_DIMENSIONS\.map\(\(dimension\) =>[\s\S]{0,120}?weight: 1, overagePenaltyWeight: 1/.test(policy));
check("a replaceable provider is the attachment point for a future backend or admin",
  /export interface NutritionRankingPolicyProvider/.test(policy)
  && /getActiveNutritionRankingPolicy\(\): NutritionRankingPolicy/.test(policy)
  && /nutritionRankingPolicyProvider\?: NutritionRankingPolicyProvider/.test(service));
check("an invalid supplied policy degrades to the default instead of corrupting ranking",
  /export function isNutritionRankingPolicy/.test(policy)
  && /isNutritionRankingPolicy\(candidate\) \? candidate : DEFAULT_NUTRITION_RANKING_POLICY/.test(policy));
check("the policy is resolved once per recommendation, so Geo and fallback rank alike",
  /const nutritionRankingPolicy = \(/.test(service)
  && (service.match(/nutritionRankingPolicy,/g) ?? []).length === 2);
check("the applied policy identity is observable in the basis",
  /appliedPolicyId: policy\.policyId/.test(ranker)
  && /appliedPolicyVersion: policy\.policyVersion/.test(ranker)
  && /appliedPolicyId: string;/.test(types));
check("no weight, goal or consumed value leaks into the ranking summary",
  !/weight/.test(read("apps/mobile/features/consumer-meals/nextMealNutritionRanker.ts")
    .slice(ranker.indexOf("ranking: Object.freeze("), ranker.indexOf("ranking: Object.freeze(") + 420))
  && !/dailyGoals|consumedTotals/.test(
    ranker.slice(ranker.indexOf("ranking: Object.freeze("), ranker.indexOf("ranking: Object.freeze(") + 420)));
check("missing and non-positive goals are excluded", /value > 0 \? value : null/.test(ranker));
check("deterministic tie-break is candidate identity", /candidateId\.localeCompare/.test(ranker));
check("canonical goals are read with the same Supabase client", /SupabaseConsumerTasteFoundationRepository/.test(composition)
  && /nutritionGoalsReader/.test(service) && /readCurrentUserNutritionGoals/.test(service));
check("non-Geo candidates are ordered and paged before ranking", /order\(column: "candidate_id"/.test(rows)
  && /\.order\("candidate_id"/.test(repository) && /\.range\(/.test(repository)
  && /rankNextMealCandidatesByNutrition/.test(repository));
check("preferred identity does not collapse branch offers or override REC-B exposure",
  recbLifecycle.valid || reccp0Successor || reccp1Successor || reccSuccessor || recdp0Successor || recdp1Successor || recdSuccessor
    ? /void preferredMenuItemId/.test(mapper) && !/preferredIndex/.test(mapper) && /candidate\.candidateId/.test(product)
    : /preferredMenuItemId/.test(mapper) && /c\.menuItemId === preferredMenuItemId/.test(mapper));
check("neutral fallback is explicit and fixed 520 is absent", /neutral_fallback/.test(ranker + service) && !/\b520\b/.test(ranker + service + repository));
check("planned meals remain excluded", /plannedMealsAppliedToRanking:\s*false/.test(service));
check("no excluded ranking authority is introduced",
  reccSuccessor || recdp0Successor || recdp1Successor || recdSuccessor
    ? /applyAllergyEligibility/.test(repository)
      && (!recdSuccessor || /applyIngredientAvoidanceEligibility/.test(repository))
      && !/tasteScore|similarityScore|dietaryRestriction|foodContext|geocodeOnRequest/.test(product)
      && !/ingredientAvoidance(?:Score|Weight|Bonus|Penalty)|restriction(?:Score|Weight|Bonus|Penalty)/i.test(product)
    : !/tasteScore|similarityScore|dietaryRestriction|allergen|foodContext|geocodeOnRequest/.test(product));
check("no distance-based ranking is introduced", !/distanceMeters[^\n]*(?:score|sort|rank)|sort\([\s\S]{0,120}distanceMeters/i.test(product));

const packageJson = JSON.parse(read("package.json"));
check("every REC-A command is registered", RECA_NPM_KEYS.every((key) => typeof packageJson.scripts[key] === "string"
  && packageJson.scripts[key].includes("recommendation-rec-a")));
if (recaLifecycle.phase === "frozen_local") check("freeze commit subject is exact", git(["log", "-1", "--pretty=%s"]) === RECA_COMMIT_SUBJECT);
const manifest = createRecaManifest((file) => fs.readFileSync(path.join(root, file)));
check("raw-byte manifest covers exact sorted paths", manifest.entries.length === RECA_PATHS.length
  && manifest.entries.every((entry, index) => entry.path === RECA_PATHS[index] && /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log("\n" + JSON.stringify({
  suite: "recommendation-rec-a-guard", lifecycle: lifecycle.phase,
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((item) => item.name), canonicalManifestSha256: manifest.aggregateSha256,
  migration: null, networkUsed: false, databaseUsed: false, productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
