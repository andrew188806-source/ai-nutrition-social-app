#!/usr/bin/env node
// SR-2G-G lifecycle-aware local guard. Read-only; no network, database, credentials or deployment.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  classifySr2ggLifecycle, createSr2ggCanonicalManifest, SR2GG_BASELINE,
  SR2GG_BASELINE_SUBJECT, SR2GG_MIGRATION, SR2GG_SUCCESSOR_PATHS
} from "./social-candidate-sr2g-g-successor-manifest.mjs";
import { SR2HA_BASELINE } from "./social-candidate-sr2h-a-successor-manifest.mjs";

const root = process.cwd();
const checks = []; const failures = [];
function check(name, condition, detail) {
  const result = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(result); if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}
function git(args, binary = false) {
  const result = spawnSync("git", args, { cwd: root, encoding: binary ? null : "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return result.stdout;
}
const lines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const statusPaths = () => git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .split("\0").filter(Boolean).map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
const head = git(["rev-parse", "HEAD"]).trim();
const originHead = git(["rev-parse", "origin/main"]).trim();
const [ahead, behind] = git(["rev-list", "--left-right", "--count", "HEAD...origin/main"]).trim().split(/\s+/).map(Number);
const delta = head === SR2GG_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-status", "--no-renames", "-r", "HEAD"]));
const state = Object.freeze({
  head, originHead, ahead, behind,
  headParent: head === SR2GG_BASELINE ? null : git(["rev-parse", "HEAD^"]).trim(),
  worktreePaths: statusPaths(), stagedPaths: lines(git(["diff", "--cached", "--name-only"])),
  headDeltaPaths: delta.map((entry) => entry.split("\t")[1]),
  headDeleted: delta.some((entry) => entry.startsWith("D\t"))
});
const lifecycle = classifySr2ggLifecycle(state);
const frozenGPaths = lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", SR2HA_BASELINE]));
const frozenGAuthority = git(["rev-parse", `${SR2HA_BASELINE}^`]).trim() === SR2GG_BASELINE
  && frozenGPaths.length === SR2GG_SUCCESSOR_PATHS.length
  && frozenGPaths.every((entry, index) => entry === [...SR2GG_SUCCESSOR_PATHS].sort()[index]);
const migration = read(SR2GG_MIGRATION);
const handoff = read("apps/mobile/features/next-meal-prototype/nextMealBuddyPrefill.ts");
const handoffTypes = read("apps/mobile/features/next-meal-prototype/types.ts");
const ui = read("apps/mobile/app/meal-buddies.tsx");
const validation = read("supabase/functions/_shared/meal-buddy-card-api/validate.ts");
const runtime = read("supabase/functions/_shared/meal-buddy-card-api/runtime.ts");
const composition = read("apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts");
const packageJson = JSON.parse(read("package.json"));
const baselinePackage = JSON.parse(git(["show", `${SR2GG_BASELINE}:package.json`]));
const packageWithout = structuredClone(packageJson);
for (const name of ["test:social-candidate-sr2g-g", "test:social-candidate-sr2g-g-smoke", "test:social-candidate-sr2g-g-mutations"]) delete packageWithout.scripts[name];
for (const name of ["test:social-candidate-sr2h-a", "test:social-candidate-sr2h-a-smoke", "test:social-candidate-sr2h-a-mutations"]) delete packageWithout.scripts[name];

check("01 lifecycle is exactly candidate, frozen-unpushed or frozen-pushed", lifecycle.valid, { phase: lifecycle.phase, head, originHead, ahead, behind });
check("02 frozen SR-2G-G authority commit retains its exact wildcard-free inventory", frozenGAuthority);
check("03 predecessor commit and subject are pinned", git(["cat-file", "-t", SR2GG_BASELINE]).trim() === "commit" && git(["log", "-1", "--format=%s", SR2GG_BASELINE]).trim() === SR2GG_BASELINE_SUBJECT);
check("04 staged bytes are prohibited", state.stagedPaths.length === 0);
check("05 every successor path exists and none is deleted", SR2GG_SUCCESSOR_PATHS.every((file) => fs.existsSync(path.join(root, file))) && !state.headDeleted);
check("06 package differs only by the exact SR-2G-G and successor SR-2H-A commands", JSON.stringify(packageWithout) === JSON.stringify(baselinePackage));
check("07 no dependency or lockfile changes", JSON.stringify(packageJson.dependencies) === JSON.stringify(baselinePackage.dependencies) && JSON.stringify(packageJson.devDependencies) === JSON.stringify(baselinePackage.devDependencies) && !SR2GG_SUCCESSOR_PATHS.some((file) => /lock/.test(file)));
check("08 exactly one successor migration is added", SR2GG_SUCCESSOR_PATHS.filter((file) => file.startsWith("supabase/migrations/")).length === 1);

const frozenMatching = [
  "supabase/migrations/20260820010000_meal_buddy_food_context_authority.sql",
  "supabase/functions/_shared/meal-buddy-context/composeContextRanking.ts",
  "supabase/functions/_shared/meal-buddy-context/policy.ts",
  "supabase/functions/_shared/meal-buddy-context/types.ts",
  "supabase/functions/_shared/meal-buddy-candidate-api/compose.ts",
  "supabase/functions/_shared/social-ranking/rankCandidates.ts",
  "supabase/functions/_shared/social-exposure/applySocialExposure.ts"
];
check("09 frozen SR-2G-F matching, SR-2A and SR-2B bytes are unchanged", frozenMatching.every((file) => git(["diff", "--name-only", SR2GG_BASELINE, "--", file]).trim() === ""));
check("10 no frozen migration is edited", lines(git(["diff", "--name-only", SR2GG_BASELINE, "--", "supabase/migrations"])).every((file) => file === SR2GG_MIGRATION));

check("11 mapping is keyed by canonical menu identity, not display text", /menu_item_id text primary key/.test(migration) && !/ilike|to_tsvector|similar to/i.test(migration));
check("12 mapping points to the existing food taxonomy", /references public\.social_interest_catalog \(tag_key, namespace\)/.test(migration) && /food_context_namespace = 'food'/.test(migration));
check("13 mapping lifecycle is non-destructive", /active boolean not null default true/.test(migration) && /retired_at timestamptz/.test(migration));
check("14 mapping table is not readable by Mobile roles", ["public", "anon", "authenticated", "authenticator", "service_role"].every((role) => migration.includes(`revoke all on table public.meal_buddy_menu_item_food_context_mapping from ${role}`)));
check("15 mapping is readable only by its NOBYPASSRLS write authority", migration.includes("create policy meal_buddy_menu_item_food_context_mapping_write_authority_read") && migration.includes("for select to meal_buddy_card_write_authority using (true)"));
check("16 automatic create validates the complete active restaurant/menu chain", ["branch_item.id = p_branch_menu_item_id", "branch_item.menu_item_id = p_menu_item_id", "branch_item.restaurant_id = p_recommendation_restaurant_id", "branch_item.branch_id = p_branch_id", "item.status = 'active'", "menu.status = 'published'", "restaurant.status = 'active'"].every((marker) => migration.includes(marker)));
check("17 cross-restaurant spoof fails closed", migration.includes("p_restaurant_id is distinct from p_recommendation_restaurant_id") && migration.includes("INVALID_RECOMMENDATION_IDENTITY"));
check("18 no mapping produces null rather than blocking or fabricating", migration.includes("v_derived_context := null") && migration.includes("create_meal_buddy_card_with_context"));
check("19 historical card context is a creation-time snapshot", !/update public\.meal_buddy_cards|alter table public\.meal_buddy_cards/i.test(migration));

check("20 handoff preserves only the selected canonical identity", ["branchMenuItemId", "menuItemId", "restaurantId", "branchId"].every((key) => handoff.includes(key)) && !handoffTypes.includes("foodContextTagKey"));
check("21 sample/display recommendations are never trusted as canonical", handoff.includes("!recommendation.isSampleData"));
check("22 no first-item, stale or Profile-interest substitution exists", !/recommendations?\[0\]|foodInterestTags|selectedEatingTags/.test(handoff));
check("23 Product UI has no category/context picker", !ui.includes('label="餐點類型"') && !ui.includes("foodContextTagKey"));
check("24 Product UI invokes automatic create with the selected handoff", ui.includes("buildRecommendationMealBuddyCardCreateRequest(formTarget.prefill)") && ui.includes("createRecommendationMealBuddyCard(request)"));
check("25 explicit context and selected recommendation cannot coexist", validation.includes("recommendation && foodContextTagKey !== null"));
check("26 selected recommendation request object is exact and closed", validation.includes("keys.length !== RECOMMENDATION_KEYS.length") && validation.includes("keys.every((key) => RECOMMENDATION_KEYS.includes(key))"));
check("27 runtime forwards all four IDs to the atomic successor", runtime.includes("create_meal_buddy_card_from_recommendation") && ["branchMenuItemId", "menuItemId", "restaurantId", "branchId"].every((key) => runtime.includes(`selectedRecommendation?.${key}`)));
check("28 Mobile uses the canonical auth client binding only when writes are enabled", composition.includes("bindMealBuddyCardCreateRuntimeDependencies") && composition.includes("capabilityFlags.supabaseWritesEnabled"));
check("29 Mobile does not create a second client or handle a JWT", !read("apps/mobile/features/meal-buddy-card-create/createRecommendationMealBuddyCard.ts").includes("createClient") && !/Authorization|serviceRole|service_role/.test(read("apps/mobile/features/meal-buddy-card-create/createRecommendationMealBuddyCard.ts")));

const manifest = createSr2ggCanonicalManifest((file) => fs.readFileSync(path.join(root, file)));
check("30 canonical raw-byte manifest covers every exact path", manifest.entries.length === SR2GG_SUCCESSOR_PATHS.length && manifest.entries.every((entry) => /^[0-9a-f]{64}$/.test(entry.sha256)));
check("31 guard, smoke and mutation commands are exact", packageJson.scripts["test:social-candidate-sr2g-g"] === "node scripts/social-candidate-sr2g-g-guard.mjs" && packageJson.scripts["test:social-candidate-sr2g-g-smoke"] === "node scripts/social-candidate-sr2g-g-smoke.mjs" && packageJson.scripts["test:social-candidate-sr2g-g-mutations"] === "node scripts/social-candidate-sr2g-g-mutations.mjs");
const implementationSources = SR2GG_SUCCESSOR_PATHS.filter((file) => !file.startsWith("scripts/") && file !== "package.json").map(read).join("\n");
check("32 no Production, deployment or remote operator tooling is introduced", !SR2GG_SUCCESSOR_PATHS.some((file) => /deploy|production/i.test(file)) && !/supabase\s+(db push|functions deploy)|--project-ref/.test(implementationSources));

console.log(JSON.stringify({ suite: "social-candidate-sr2g-g-guard", lifecycle: lifecycle.phase, total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, canonicalManifestSha256: manifest.aggregateSha256, networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false }, null, 2));
if (failures.length) process.exitCode = 1;
