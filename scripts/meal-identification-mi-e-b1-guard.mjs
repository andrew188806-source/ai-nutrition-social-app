#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const baseline = "e19a528221ca0fa2a3b54ccc48b865fff88cb70b";
const protectedPath =
  "supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql";
const protectedSha =
  "4e08de96d28a5e6d9911b074fa73769ea5b3e21d9e14a089c7f420e16a4fbe72";
const migrationPath =
  "supabase/migrations/20260724030000_meal_source_record_timing_contract_correction.sql";
const implementationPaths = [
  "apps/mobile/app/analysis.tsx",
  "apps/mobile/features/analysis/mealIdentificationFinalizationAdapter.ts",
  "apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationRuntime.ts",
  "apps/mobile/features/meal-identification-finalization/index.ts",
  "apps/mobile/features/meal-identification-finalization/mealIdentificationFinalizationReadMapper.ts",
  "apps/mobile/features/meal-identification-finalization/mealIdentificationFinalizationMappers.ts",
  "apps/mobile/features/meal-identification-finalization/supabaseMealIdentificationFinalizationContracts.ts",
  "apps/mobile/features/meal-identification-finalization/validation.ts",
  "apps/mobile/features/meal-identification/finalizationContract.ts",
  "apps/mobile/features/meal-identification/index.ts",
  "apps/mobile/features/meal-identification/types.ts",
  "package.json",
  "scripts/meal-identification-mi-c-a-contract-smoke.mjs",
  "scripts/meal-identification-mi-c-d-contract-smoke.mjs",
  "scripts/meal-identification-mi-d-b-contract-smoke.mjs",
  "scripts/meal-identification-mi-e-b1-contract-smoke.mjs",
  "scripts/meal-identification-mi-e-b1-guard.mjs",
  migrationPath
].sort();
const allowed = new Set([...implementationPaths, protectedPath]);
const checks = [];

function git(args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function record(name, condition) {
  const pass = Boolean(condition);
  checks.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

function changedPaths() {
  const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (status.status !== 0) throw new Error(status.stderr);
  return status.stdout
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll("\\", "/"))
    .sort();
}

const paths = changedPaths();
const stagedPaths = git(["diff", "--cached", "--name-only"]).stdout
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .sort();
const types = read("apps/mobile/features/meal-identification/types.ts");
const contract = read("apps/mobile/features/meal-identification/finalizationContract.ts");
const adapter = read("apps/mobile/features/analysis/mealIdentificationFinalizationAdapter.ts");
const screen = read("apps/mobile/app/analysis.tsx");
const runtime = read(
  "apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationRuntime.ts"
);
const validation = read("apps/mobile/features/meal-identification-finalization/validation.ts");
const rpcMapper = read(
  "apps/mobile/features/meal-identification-finalization/mealIdentificationFinalizationMappers.ts"
);
const rpcContracts = read(
  "apps/mobile/features/meal-identification-finalization/supabaseMealIdentificationFinalizationContracts.ts"
);
const readMapper = read(
  "apps/mobile/features/meal-identification-finalization/mealIdentificationFinalizationReadMapper.ts"
);
const migration = read(migrationPath);
const normalizedMigration = migration.toLowerCase().replace(/\s+/g, " ");
const packageJson = JSON.parse(read("package.json"));
const migrationDiffPaths = git([
  "diff",
  "--name-only",
  baseline,
  "--",
  "supabase/migrations"
]).stdout
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
const sourceContextBlock = contract.slice(
  contract.indexOf("const sourceContexts"),
  contract.indexOf("const unresolvedReasons")
);

record("branch remains main", git(["branch", "--show-current"]).stdout.trim() === "main");
record("HEAD remains the authorized MI-E-B1 baseline", git(["rev-parse", "HEAD"]).stdout.trim() === baseline);
record("staged state is pre-freeze empty or the exact freeze inventory",
  stagedPaths.length === 0 ||
    (
      stagedPaths.length === implementationPaths.length &&
      stagedPaths.every((entry) => implementationPaths.includes(entry))
    ));
record("candidate contains only exact MI-E-B1 paths plus protected migration",
  paths.every((entry) => allowed.has(entry)) &&
    implementationPaths.every((entry) => paths.includes(entry)) &&
    paths.includes(protectedPath));
record("protected migration remains untracked and excluded",
  git(["ls-files", "--error-unmatch", protectedPath]).status !== 0 &&
    !implementationPaths.includes(protectedPath));
record("protected migration SHA-256 is frozen",
  createHash("sha256")
    .update(fs.readFileSync(path.join(root, protectedPath)))
    .digest("hex") === protectedSha);

record("new meal source type excludes post_hoc",
  /export type MealSourceContext =[\s\S]*"unknown";/.test(types) &&
    !/export type MealSourceContext =[\s\S]*\|\s*"post_hoc"[\s\S]*"unknown";/.test(types));
record("legacy source compatibility names post_hoc without admitting it to new source input",
  /LegacyMealSourceContext = MealSourceContext \| "post_hoc"/.test(types));
record("record timing is an independent exact union",
  /MealRecordTiming = "current" \| "post_hoc"/.test(types));
record("canonical contract is v2 and carries timing plus actual occurrence",
  /meal-identification-finalization-v2/.test(contract) &&
    /recordTiming: MealRecordTiming/.test(contract) &&
    /occurredAt: MealOccurrenceTimestamp/.test(contract));
record("builder rejects invalid timing and invalid actual timestamp explicitly",
  /invalid_record_timing/.test(contract) &&
    /invalid_occurred_at/.test(contract) &&
    /parseRequiredTimestamp/.test(contract));
record("canonical source validator has no post_hoc source value",
  /"self_cooked",[\s\S]*"unknown"/.test(sourceContextBlock) &&
    !/"post_hoc"/.test(sourceContextBlock));

record("temporary pre-UI flow explicitly supplies current timing and an actual timestamp",
  /recordTiming: "current"/.test(screen) &&
    /occurredAt: analysisObservedAt/.test(screen) &&
    /recordTiming: input\.recordTiming/.test(adapter) &&
    /occurredAt: input\.occurredAt/.test(adapter));
record("runtime derives date ownership from actual meal occurrence",
  /new Date\(draft\.finalization\.occurredAt\)/.test(runtime) &&
    /occurredAt: draft\.finalization\.occurredAt/.test(runtime) &&
    /mealDate: toDateKeyInTimeZone\(occurredAt, timezone\)/.test(runtime));
record("outer RPC timestamp must equal canonical command timestamp",
  /revalidated\.value\.occurredAt !== input\.occurredAt/.test(validation));
record("RPC mapper passes the typed canonical command without an unsafe assertion",
  /p_finalization: input\.finalization/.test(rpcMapper) &&
    !/as unknown as/.test(rpcMapper) &&
    /p_finalization: MealIdentificationFinalizationCommand/.test(rpcContracts));
record("read mapper normalizes legacy post_hoc to unknown plus post_hoc without guessing",
  /row\.source_context === "post_hoc" \? "unknown"/.test(readMapper) &&
    /row\.source_context === "post_hoc" \? "post_hoc" : "current"/.test(readMapper));

record("migration is append-only and historical migrations remain unchanged",
  migrationDiffPaths.every((entry) => entry === migrationPath) &&
    fs.existsSync(path.join(root, migrationPath)));
record("migration backfill is deterministic and uses canonical meal record occurred_at",
  /when finalization\.source_context = 'post_hoc' then 'unknown'/.test(normalizedMigration) &&
    /when finalization\.source_context = 'post_hoc' then 'post_hoc'/.test(normalizedMigration) &&
    /occurred_at = record\.occurred_at/.test(normalizedMigration));
record("migration never uses migration execution time as meal occurrence",
  !/occurred_at\s*=\s*(pg_catalog\.)?now\(\)/.test(normalizedMigration));
record("v2 source constraint excludes post_hoc while timing admits it",
  /meal_source_context in \('dine_in', 'takeout', 'delivery', 'self_cooked', 'unknown'\)/.test(normalizedMigration) &&
    /record_timing in \('current', 'post_hoc'\)/.test(normalizedMigration));
record("legacy internal implementation is private",
  /rename to finalize_current_user_meal_identification_v1_legacy_internal/.test(normalizedMigration) &&
    (normalizedMigration.match(/revoke all on function public\.finalize_current_user_meal_identification_v1_legacy_internal\(/g) ?? []).length === 3 &&
    /from public;[\s\S]*from anon;[\s\S]*from authenticated;/.test(normalizedMigration));
record("one public canonical RPC name and unchanged six-argument signature remain",
  (normalizedMigration.match(/create function public\.finalize_current_user_meal_identification_v1\(/g) ?? []).length === 1 &&
    /p_client_request_id uuid, p_meal_type public\.meal_type, p_occurred_at timestamptz, p_meal_date date, p_timezone text, p_finalization jsonb/.test(normalizedMigration));
record("wrapper accepts v1 and v2 without a PostgREST overload",
  /v_version = 'meal-identification-finalization-v1'/.test(normalizedMigration) &&
    /v_version <> 'meal-identification-finalization-v2'/.test(normalizedMigration) &&
    !/create function public\.finalize_current_user_meal_identification_v2/.test(normalizedMigration));
record("v2 rejects post_hoc as source and requires explicit timing",
  /v_source_context not in \('dine_in', 'takeout', 'delivery', 'self_cooked', 'unknown'\)/.test(normalizedMigration) &&
    /v_record_timing not in \('current', 'post_hoc'\)/.test(normalizedMigration));
record("RPC cross-checks command occurredAt against canonical p_occurred_at",
  /v_command_occurred_at is distinct from p_occurred_at/.test(normalizedMigration));
record("idempotency comparison includes source timing actual time and full command",
  /v_stored_command is distinct from p_finalization/.test(normalizedMigration) &&
    /v_stored_source is distinct from v_source_context/.test(normalizedMigration) &&
    /v_stored_timing is distinct from v_record_timing/.test(normalizedMigration) &&
    /v_stored_occurred_at is distinct from p_occurred_at/.test(normalizedMigration));
record("actor-key advisory lock and auth-derived ownership remain",
  /v_user_id uuid := auth\.uid\(\)/.test(normalizedMigration) &&
    /pg_advisory_xact_lock/.test(normalizedMigration) &&
    /user_id = v_user_id/.test(normalizedMigration));
record("canonical RPC remains authenticated-only",
  (normalizedMigration.match(/revoke all on function public\.finalize_current_user_meal_identification_v1\(/g) ?? []).length === 3 &&
    /grant execute on function public\.finalize_current_user_meal_identification_v1[\s\S]*to authenticated/.test(normalizedMigration));
record("wrapper delegates creation to the one legacy atomic graph and never writes a second meal",
  /v_result := public\.finalize_current_user_meal_identification_v1_legacy_internal/.test(normalizedMigration) &&
    !/create_current_user_meal_record/.test(normalizedMigration));

record("package scripts wire only the MI-E-B1 guard and smoke",
  packageJson.scripts["test:meal-identification-mi-e-b1"] ===
    "node scripts/meal-identification-mi-e-b1-guard.mjs" &&
    packageJson.scripts["test:meal-identification-mi-e-b1-smoke"] ===
    "node scripts/meal-identification-mi-e-b1-contract-smoke.mjs");
const productionDiff = git([
  "diff",
  "--",
  ...implementationPaths.filter((entry) => !entry.startsWith("scripts/") && entry !== "package.json")
]).stdout;
record("candidate adds no GPS search alias Food Memory benchmark or remote credential scope",
  !/expo-location|geolocation|\bgps\b|nearby|alias.?resolver|food.?memory|benchmark|service.?role|credential|https?:\/\//i.test(
    productionDiff
  ));
record("guard itself is read-only",
  !/writeFile|appendFile|mkdir|rmSync|unlink|renameSync|copyFile|execFileSync/.test(
    read("scripts/meal-identification-mi-e-b1-guard.mjs").slice(
      0,
      read("scripts/meal-identification-mi-e-b1-guard.mjs").indexOf(
        'record("guard itself is read-only"'
      )
    )
  ));

const passed = checks.filter(Boolean).length;
console.log(`RESULT ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);
