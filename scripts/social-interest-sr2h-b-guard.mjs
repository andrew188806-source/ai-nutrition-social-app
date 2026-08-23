#!/usr/bin/env node
// SR-2H-B lifecycle-aware local authority guard. Read-only: no network, database, credentials,
// deployment or repository writes.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  classifySr2hbLifecycle,
  createSr2hbCanonicalManifest,
  SR2HB_BASELINE,
  SR2HB_BASELINE_SUBJECT,
  SR2HB_MIGRATION,
  SR2HB_SUCCESSOR_PATHS,
  validateSr2hbMigrationAuthority
} from "./social-interest-sr2h-b-successor-manifest.mjs";
import { SR2IA_SUCCESSOR_PATHS } from "./meal-buddy-relationship-sr2i-a-successor-manifest.mjs";
import { SR2IB_SUCCESSOR_PATHS } from "./meal-buddy-relationship-sr2i-b-successor-manifest.mjs";

const root = process.cwd(); const checks = []; const failures = [];
function check(name, condition, detail) {
  const result = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(result); if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}
function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return result.stdout;
}
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const lines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const statusPaths = () => git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .split("\0").filter(Boolean).map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
const head = git(["rev-parse", "HEAD"]).trim();
const originHead = git(["rev-parse", "origin/main"]).trim();
const [ahead, behind] = git(["rev-list", "--left-right", "--count", "HEAD...origin/main"]).trim().split(/\s+/).map(Number);
const delta = head === SR2HB_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-status", "--no-renames", "-r", "HEAD"]));
const state = Object.freeze({
  head, originHead, ahead, behind,
  headParent: head === SR2HB_BASELINE ? null : git(["rev-parse", "HEAD^"]).trim(),
  worktreePaths: statusPaths(), stagedPaths: lines(git(["diff", "--cached", "--name-only"])),
  headDeltaPaths: delta.map((entry) => entry.split("\t")[1]),
  headDeleted: delta.some((entry) => entry.startsWith("D\t"))
});
const lifecycle = classifySr2hbLifecycle(state);
const migration = read(SR2HB_MIGRATION);
const oldMigration = read("supabase/migrations/20260818010000_social_interest_catalog_and_profile_selections.sql");
const repository = read("apps/mobile/features/social-interest-settings/repository.ts");
const contracts = read("apps/mobile/features/social-interest-settings/supabaseContracts.ts");
const controller = read("apps/mobile/features/social-interest-settings/controller.ts");
const hook = read("apps/mobile/features/social-interest-settings/useSocialInterestSettings.ts");
const binding = read("apps/mobile/features/social-interest-settings/runtimeBinding.ts");
const composition = read("apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts");
const route = read("apps/mobile/app/social-interest-settings.tsx");
const me = read("apps/mobile/app/me.tsx");
const layout = read("apps/mobile/app/_layout.tsx");
const i18n = read("lib/i18n/zh-TW.ts");
const packageJson = JSON.parse(read("package.json"));
const baselinePackage = JSON.parse(git(["show", `${SR2HB_BASELINE}:package.json`]));
const packageWithout = structuredClone(packageJson);
for (const name of ["test:social-interest-sr2h-b", "test:social-interest-sr2h-b-smoke", "test:social-interest-sr2h-b-mutations", "test:social-interest-sr2h-b-concurrency"]) delete packageWithout.scripts[name];
for (const name of ["test:meal-buddy-relationship-sr2i-a", "test:meal-buddy-relationship-sr2i-a-smoke", "test:meal-buddy-relationship-sr2i-a-mutations", "test:meal-buddy-relationship-sr2i-a-concurrency"]) delete packageWithout.scripts[name];
for (const name of ["test:meal-buddy-relationship-sr2i-b", "test:meal-buddy-relationship-sr2i-b-smoke", "test:meal-buddy-relationship-sr2i-b-mutations"]) delete packageWithout.scripts[name];

check("01 lifecycle is exact candidate, frozen-unpushed or frozen-pushed", lifecycle.valid, { phase: lifecycle.phase, head, originHead, ahead, behind });
const expectedLifecyclePaths = lifecycle.phase.startsWith("successor_successor_") ? SR2IB_SUCCESSOR_PATHS
  : lifecycle.phase.startsWith("successor_") ? SR2IA_SUCCESSOR_PATHS : SR2HB_SUCCESSOR_PATHS;
check("02 lifecycle inventory is exact and wildcard-free", lifecycle.manifest.length === expectedLifecyclePaths.length && lifecycle.manifest.every((entry, index) => [...expectedLifecyclePaths].sort()[index] === [...lifecycle.manifest].sort()[index]));
check("03 pushed SR-2H-A baseline and subject are pinned", git(["cat-file", "-t", SR2HB_BASELINE]).trim() === "commit" && git(["log", "-1", "--format=%s", SR2HB_BASELINE]).trim() === SR2HB_BASELINE_SUBJECT);
check("04 no staged or deleted path exists", state.stagedPaths.length === 0 && !state.headDeleted);
check("05 every exact path exists", SR2HB_SUCCESSOR_PATHS.every((file) => fs.existsSync(path.join(root, file))));
check("06 package adds only four exact local SR-2H-B commands", JSON.stringify(packageWithout) === JSON.stringify(baselinePackage));
check("07 dependencies, workspaces and lockfiles are unchanged", JSON.stringify(packageJson.dependencies) === JSON.stringify(baselinePackage.dependencies) && JSON.stringify(packageJson.devDependencies) === JSON.stringify(baselinePackage.devDependencies) && JSON.stringify(packageJson.workspaces) === JSON.stringify(baselinePackage.workspaces) && !SR2HB_SUCCESSOR_PATHS.some((file) => /lock/.test(file)));
check("08 exactly one narrowly scoped successor migration exists", SR2HB_SUCCESSOR_PATHS.filter((file) => file.startsWith("supabase/migrations/")).length === 1 && SR2HB_SUCCESSOR_PATHS.includes(SR2HB_MIGRATION));

check("09 combined RPC signature carries only the two complete sets", /replace_authenticated_social_interest_settings\(\s*p_general_tag_keys text\[\],\s*p_food_tag_keys text\[\]\s*\)/.test(migration) && !/p_(user|actor|owner)_id/i.test(migration));
check("10 identity is auth.uid only", migration.includes("v_user_id uuid := auth.uid()") && migration.includes("AUTHENTICATION_REQUIRED"));
check("11 both inputs preserve trim, empty and dedup semantics", (migration.match(/array_agg\(distinct pg_catalog\.btrim/g) ?? []).length === 2 && (migration.match(/coalesce\(p_(general|food)_tag_keys, '\{\}'::text\[\]\)/g) ?? []).length === 2);
check("12 null elements are rejected in both namespaces", migration.includes("array_position(v_general_keys, null::text)") && migration.includes("array_position(v_food_keys, null::text)"));
check("13 frozen limits remain general eight and food five", /array_length\(v_general_keys, 1\), 0\) > 8(?!\d)/.test(migration) && /array_length\(v_food_keys, 1\), 0\) > 5(?!\d)/.test(migration));
check("14 unknown inactive nonselectable and wrong-namespace keys fail closed", ["c.tag_key = candidate.tag_key", "c.namespace = candidate.namespace", "c.active", "c.selectable", "SOCIAL_INTEREST_TAG_NOT_SELECTABLE"].every((marker) => migration.includes(marker)));
const generalLock = "v_user_id::text || ':social_interest:general'";
const foodLock = "v_user_id::text || ':social_interest:food'";
check("15 exact predecessor advisory lock keys are reused", oldMigration.includes("v_user_id::text || ':social_interest:' || v_namespace") && migration.includes(generalLock) && migration.includes(foodLock));
check("16 combined locks have deterministic general then food order", migration.indexOf(generalLock) < migration.indexOf(foodLock) && (migration.match(/pg_advisory_xact_lock/g) ?? []).length === 2);
check("17 both sets validate before either write", migration.indexOf("SOCIAL_INTEREST_TAG_NOT_SELECTABLE") < migration.indexOf("delete from public.social_profile_interest_selection"));
check("18 both namespaces replace in one function transaction", /namespace in \('general', 'food'\)/.test(migration) && /select v_user_id, k, 'general'[\s\S]*union all[\s\S]*select v_user_id, k, 'food'/.test(migration));
check("19 exact two-set success response is server-built", migration.includes("'general_tag_keys'") && migration.includes("'food_tag_keys'") && (migration.match(/jsonb_agg/g) ?? []).length === 2);
check("20 old single-namespace RPC is not redefined", !migration.includes("create function public.replace_authenticated_social_interests(") && git(["diff", "--name-only", SR2HB_BASELINE, "--", "supabase/migrations/20260818010000_social_interest_catalog_and_profile_selections.sql"]).trim() === "");
check("21 execution is authenticated-only and direct table writes are not broadened", migration.includes("revoke all on function public.replace_authenticated_social_interest_settings(text[], text[]) from public") && migration.includes("from anon") && migration.includes("grant execute on function public.replace_authenticated_social_interest_settings(text[], text[]) to authenticated") && !/grant (insert|update|delete).*social_profile_interest_selection.*authenticated/i.test(migration));

check("22 Mobile reads canonical catalog, labels and owner-RLS selections", ["SOCIAL_INTEREST_CATALOG_TABLE", "SOCIAL_INTEREST_CATALOG_LABEL_TABLE", "SOCIAL_PROFILE_INTEREST_SELECTION_TABLE"].every((marker) => repository.includes(marker)) && repository.includes("SOCIAL_INTEREST_SETTINGS_LOCALE"));
check("23 Mobile authenticates before read and write", (repository.match(/authPort\.getCurrentSession\(\)/g) ?? []).length === 2);
check("24 one Save calls only the combined RPC without user identity", repository.includes("this.client.rpc(REPLACE_SOCIAL_INTEREST_SETTINGS_RPC") && !/p_(user|actor|owner)_id/.test(repository + contracts));
check("25 repository validates exact combined success payload", repository.includes('"food_tag_keys,general_tag_keys"') && repository.includes("parseUniqueStringArray"));
check("26 no raw server error reaches product state", !/error\.message|response\.error\.message|JSON\.stringify\(response\.error/.test(repository + controller + hook + route));
check("27 actor and generation invalidate stale load/save", controller.includes("request.actorKey === this.actorKey") && controller.includes("request.actorGeneration === this.actorGeneration") && controller.includes("request.sequence === this.requestSequence"));
check("28 mutating success occurs only after repository save resolves and validates", controller.indexOf("await this.repository.save") < controller.lastIndexOf('phase: "saved"') && controller.includes("saveMatchesDraft"));
check("29 local maxima block the ninth general and sixth food choices", controller.includes("SOCIAL_INTEREST_LIMITS[namespace]") && controller.includes("limitError: namespace"));
check("30 live composition binds the existing client only when writes are enabled", composition.includes("bindSocialInterestSettingsRuntimeDependencies") && composition.includes("client as unknown as SupabaseSocialInterestSettingsClientLike") && /if \(capabilityFlags\.supabaseWritesEnabled\)[\s\S]*bindSocialInterestSettingsRuntimeDependencies/.test(composition));
check("31 sign-out/disabled compositions clear the availability binding", composition.includes("clearSocialInterestSettingsRuntimeDependencies()") && binding.includes("dependencies = null"));
check("32 no second Supabase client, JWT or service role exists in Mobile feature", !/createClient|Authorization|service[_-]?role|accessToken/i.test(repository + contracts + controller + hook + binding));

check("33 Me has the smallest canonical entry and route is registered", me.includes('router.push("/social-interest-settings")') && layout.includes('name="social-interest-settings"'));
check("34 general and food render separately with one combined Save", route.includes('namespace="general"') && route.includes('namespace="food"') && (route.match(/controller\.save\(\)/g) ?? []).length === 1);
check("35 catalog labels are the only taxonomy text rendered", route.includes("category.label") && route.includes("option.label") && !/<Text[^>]*>[^<]*tagKey/.test(route));
check("36 loading, load error, retry, pending, error, success, empty and safe back are present", ["ActivityIndicator", 'phase === "load_failed"', "controller.retryLoad()", 'phase === "saving"', 'phase === "save_failed"', 'phase === "saved"', "copy.empty", "disabled={saving}"].every((marker) => route.includes(marker)));
check("37 user-facing copy describes public interests without health authority", i18n.includes("這些是你主動公開的個人興趣") && i18n.includes("不會成為健康、過敏或飲食限制資料"));
check("38 Settings is not Premium gated", !/premium|entitlement|tier/i.test(route + controller + repository));

const protectedPaths = [
  "apps/mobile/features/meal-buddy-card-create",
  "apps/mobile/features/next-meal-prototype",
  "apps/mobile/features/meal-buddy-candidates/MealBuddyCandidateCard.tsx",
  "supabase/functions/_shared/meal-buddy-context",
  "supabase/functions/_shared/social-ranking",
  "supabase/functions/_shared/social-exposure",
  "supabase/functions/_shared/meal-buddy-card-api"
];
check("39 Meal Buddy snapshot/context/ranking/exposure authority is byte-unchanged", protectedPaths.every((file) => git(["diff", "--name-only", SR2HB_BASELINE, "--", file]).trim() === ""));
check("40 public/food interests never write meal_buddy_cards or food_context_tag_key", !/meal_buddy_cards|food_context_tag_key|interest_snapshot/i.test(migration + repository + controller + route));
check("41 SR-2H-A current-data profile and compact max-three bytes are unchanged", [
  "supabase/functions/_shared/meal-buddy-candidate-profile-api/compose.ts",
  "supabase/functions/_shared/social-interest/aggregate.ts",
  "apps/mobile/features/meal-buddy-candidates/MealBuddyCandidateCard.tsx"
].every((file) => git(["diff", "--name-only", SR2HB_BASELINE, "--", file]).trim() === ""));

const frozenMigrations = Object.freeze({
  "supabase/migrations/20260818010000_social_interest_catalog_and_profile_selections.sql": "313cfc323970d69a9e4d7e4d0849a3facbe45dc43512ddfd01fdd38f3b10d012",
  "supabase/migrations/20260818020000_social_interest_catalog_v1_data.sql": "b731d78590880c9a82acc582589ac8b73eb28ba99a9d1a4119ad2e9907b61e46",
  "supabase/migrations/20260818030000_social_public_interest_projection.sql": "d34ff29d2a317efad6da6aacc8a36d087b95d4812778e0e0d2a9de5aab70bca1"
});
check("42 all three frozen predecessor migration hashes remain exact", Object.entries(frozenMigrations).every(([file, expected]) => sha256(fs.readFileSync(path.join(root, file))) === expected));
check("43 frozen SR-2H-B migration and exact lifecycle migration inventory remain authoritative", validateSr2hbMigrationAuthority({
  lifecycle,
  changedMigrationPaths: lines(git(["diff", "--name-only", SR2HB_BASELINE, "--", "supabase/migrations"])),
  predecessorMigrationExists: fs.existsSync(path.join(root, SR2HB_MIGRATION)),
  predecessorMigrationSha256: sha256(fs.readFileSync(path.join(root, SR2HB_MIGRATION)))
}));
check("44 dedicated commands are exact", packageJson.scripts["test:social-interest-sr2h-b"] === "node scripts/social-interest-sr2h-b-guard.mjs" && packageJson.scripts["test:social-interest-sr2h-b-smoke"] === "node scripts/social-interest-sr2h-b-smoke.mjs" && packageJson.scripts["test:social-interest-sr2h-b-mutations"] === "node scripts/social-interest-sr2h-b-mutations.mjs" && packageJson.scripts["test:social-interest-sr2h-b-concurrency"] === "node scripts/social-interest-sr2h-b-concurrency.mjs");
const implementationSources = SR2HB_SUCCESSOR_PATHS.filter((file) => !file.startsWith("scripts/") && file !== "package.json").map(read).join("\n");
check("45 no deployment, remote operator or credential command is introduced", !/supabase\s+(db push|functions deploy)|--project-ref|DATABASE_URL|SUPABASE_SERVICE_ROLE/.test(implementationSources));
const manifest = createSr2hbCanonicalManifest((file) => fs.readFileSync(path.join(root, file)));
check("46 canonical raw-byte manifest covers every exact path", manifest.entries.length === SR2HB_SUCCESSOR_PATHS.length && manifest.entries.every((entry) => /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log(JSON.stringify({ suite: "social-interest-sr2h-b-guard", lifecycle: lifecycle.phase, total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, canonicalManifestSha256: manifest.aggregateSha256, migrationSha256: sha256(fs.readFileSync(path.join(root, SR2HB_MIGRATION))), frozenMigrationSha256: frozenMigrations, networkUsed: false, databaseUsed: false, credentialsUsed: false, developmentTouched: false, productionTouched: false }, null, 2));
if (failures.length) process.exitCode = 1;
