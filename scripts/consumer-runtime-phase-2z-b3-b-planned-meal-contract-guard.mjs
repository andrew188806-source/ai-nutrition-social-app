#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const root = process.cwd(); const head = "846d76b4ada80c13a754d95dade3844ad0d3fda7";
const migration39 = "supabase/migrations/20260720020000_consumer_planned_meal_contract_v2.sql";
const migration40 = "supabase/migrations/20260721010000_consumer_planned_meal_version_conflict_sqlstate.sql";
const migration39Sha = "9a3dc8d1030498cc55bc056e66141777e28962dc1b42543c6474a6677e678e11";
const candidates = new Set([
  "apps/mobile/features/consumer-meals/types.ts", "apps/mobile/features/consumer-meals/supabaseMealContracts.ts",
  "apps/mobile/features/consumer-meals/plannedMealMappers.ts", "apps/mobile/features/consumer-meals/adapters/supabaseConsumerPlannedMealsRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/mockConsumerPlannedMealsRepository.ts", "apps/mobile/features/consumer-meals/factories.ts",
  "apps/mobile/features/consumer-meals/index.ts", migration39, migration40, "apps/mobile/features/consumer-meals/plannedMealV2Mappers.ts",
  "apps/mobile/features/consumer-meals/consumerPlannedMealV2Service.ts", "apps/mobile/features/consumer-meals/adapters/supabaseConsumerPlannedMealV2Repository.ts",
  "apps/mobile/features/consumer-meals/adapters/mockConsumerPlannedMealV2Repository.ts", "apps/mobile/features/consumer-meals/adapters/supabaseDisabledConsumerPlannedMealV2Repository.ts",
  "apps/mobile/features/consumer-runtime/consumerPlannedMealRuntime.ts", "apps/mobile/features/consumer-runtime/consumerPlannedMealOperationStore.ts",
  "apps/mobile/features/consumer-runtime/consumerPlannedMealMapper.ts", "scripts/consumer-runtime-phase-2z-b3-b-planned-meal-contract-guard.mjs",
  "scripts/consumer-runtime-phase-2z-b3-b-planned-meal-contract-smoke.mjs", "docs/consumer-runtime-phase-2z/phase-2z-b3-planned-meal-contract.md"
]);
const checks = []; const failures = []; const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sha = (file) => createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
function record(name, pass, detail) { const item = { name, pass: Boolean(pass), detail }; checks.push(item); if (!item.pass) failures.push(item); }
function changed() { return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout.split("\0").filter(Boolean).map((entry) => entry.slice(3).replaceAll("\\", "/")); }
function tree(prefix) { return git(["ls-tree", "-r", "--name-only", head, "--", prefix]).stdout.trim().split("\n").filter(Boolean); }
function drift(files) { return files.filter((file) => git(["diff", "--quiet", head, "--", file]).status !== 0); }
function definition(source, name) {
  const start = source.search(new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${name}\\s*\\(`, "i"));
  if (start < 0) return "";
  const end = source.indexOf("$$;", start);
  return end < 0 ? "" : source.slice(start, end + 3);
}
function normalizedDefinition(value) { return value.replace(/create\s+or\s+replace\s+function/i, "create function").replace(/\s+/g, " ").trim(); }
try {
  const files = changed(); const sql = read(migration39); const clean = sql.replace(/--.*$/gm, "").toLowerCase();
  const correctionSql = read(migration40); const correctionClean = correctionSql.replace(/--.*$/gm, "").toLowerCase();
  const migrationFiles = fs.readdirSync(path.join(root, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
  record("branch is main", git(["branch", "--show-current"]).stdout.trim() === "main");
  record("HEAD is exact B2-B Frozen commit", git(["rev-parse", "HEAD"]).stdout.trim() === head);
  for (const [name, commit] of [["B1", "424f99f7d62f102b2e6c902cde5224dc5d5241f3"], ["B2-A", "171f7294c120c8ab0ec4c97c4ee657f6133d8f1b"], ["B2-B", head]]) record(`${name} Frozen commit is a HEAD ancestor`, git(["merge-base", "--is-ancestor", commit, "HEAD"]).status === 0);
  record("candidate inventory is exactly 20 files", files.length === 20 && files.every((file) => candidates.has(file)), files);
  record("staged diff is empty", git(["diff", "--cached", "--quiet"]).status === 0);
  record("migration inventory is exactly 40", migrationFiles.length === 40, migrationFiles.length);
  record("Migration 40 is latest", migrationFiles.at(-1) === path.basename(migration40));
  const oldMigrations = tree("supabase/migrations"); record("existing 38 migrations are byte-equivalent", oldMigrations.length === 38 && drift(oldMigrations).length === 0, drift(oldMigrations));
  record("Migration 39 SHA is exact and immutable", sha(migration39) === migration39Sha, sha(migration39));
  record("existing 39 migrations are byte-equivalent", oldMigrations.length === 38 && drift(oldMigrations).length === 0 && sha(migration39) === migration39Sha);
  record("package and lockfiles are byte-equivalent", drift(["package.json", ...tree("").filter((file) => /(^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|npm-shrinkwrap\.json)$/.test(file))]).length === 0);
  const frozenV1Ts = ["apps/mobile/features/consumer-meals/plannedMealWriteMappers.ts", "apps/mobile/features/consumer-meals/consumerPlannedMealWriteService.ts", "apps/mobile/features/consumer-meals/adapters/supabaseConsumerPlannedMealWriteRepository.ts"];
  record("historical V1 Planned Meal TypeScript write path is byte-equivalent", drift(frozenV1Ts).length === 0, drift(frozenV1Ts));
  record("historical V1 Planned Meal SQL RPC migration is byte-equivalent", drift(["supabase/migrations/20260713090100_consumer_schema_phase_1_3_atomic_planned_meal_write_functions.sql"]).length === 0);
  record("Migration 39 is forward-only", !/create\s+or\s+replace|drop\s+(?:function|table|column)|alter\s+column/i.test(clean));
  record("Migration 39 retains three historical 40001 definitions", (clean.match(/planned_meal_version_conflict'\s+using\s+errcode\s*=\s*'40001'/g) ?? []).length === 3);
  const replacementNames = [...correctionClean.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(/g)].map((match) => match[1]);
  const approvedReplacementNames = ["update_authenticated_planned_meal_v2", "cancel_authenticated_planned_meal_v2", "convert_authenticated_planned_meal_v2"];
  record("Migration 40 replaces exactly three approved RPCs", replacementNames.length === 3 && replacementNames.every((name) => approvedReplacementNames.includes(name)) && approvedReplacementNames.every((name) => replacementNames.includes(name)), replacementNames);
  record("Migration 40 has no schema index column or constraint change", !/(?:alter|create|drop)\s+table|create\s+(?:unique\s+)?index|add\s+column|add\s+constraint/.test(correctionClean));
  record("Migration 40 does not replace create RPC or private helpers", !/create\s+or\s+replace\s+function\s+public\.(?:create_authenticated_planned_meal_v2|_consumer_planned_meal_v2_[a-z0-9_]*)\s*\(/.test(correctionClean));
  record("Migration 40 contains no retryable 40001", !/40001/.test(correctionClean));
  record("Migration 40 uses P0001 for all three stable version conflicts", (correctionClean.match(/planned_meal_version_conflict'\s+using\s+errcode\s*=\s*'p0001'/g) ?? []).length === 3);
  const equivalenceFailures = approvedReplacementNames.filter((name) => {
    const historicalCurrent = definition(sql, name).replace(/(PLANNED_MEAL_VERSION_CONFLICT'\s+using\s+errcode\s*=\s*)'40001'/g, "$1'P0001'");
    return normalizedDefinition(historicalCurrent) !== normalizedDefinition(definition(correctionSql, name));
  });
  record("Migration 40 RPC definitions differ only by CREATE OR REPLACE and version SQLSTATE", equivalenceFailures.length === 0, equivalenceFailures);
  record("Migration 40 repeats SECURITY DEFINER and safe search_path", (correctionClean.match(/security\s+definer/g) ?? []).length === 3 && (correctionClean.match(/set\s+search_path\s*=\s*pg_catalog\s*,\s*public\s*,\s*pg_temp/g) ?? []).length === 3);
  record("Migration 40 derives all actors only from auth.uid", (correctionClean.match(/v_actor\s+uuid\s*:=\s*auth\.uid\(\)/g) ?? []).length === 3 && !/p_(?:user|actor|owner|profile)_id/.test(correctionClean));
  record("Migration 40 explicitly restores postgres ownership", (correctionClean.match(/alter\s+function\s+public\.(?:update|cancel|convert)_authenticated_planned_meal_v2[\s\S]*?owner\s+to\s+postgres/g) ?? []).length === 3);
  record("Migration 40 explicitly restores authenticated-only execute", (correctionClean.match(/revoke\s+all\s+on\s+function\s+public\.(?:update|cancel|convert)_authenticated_planned_meal_v2/g) ?? []).length === 3 && (correctionClean.match(/grant\s+execute\s+on\s+function\s+public\.(?:update|cancel|convert)_authenticated_planned_meal_v2/g) ?? []).length === 3);
  record("Migration 40 adds no direct DML grant", !/grant\s+(?:insert|update|delete)/.test(correctionClean) && /revoke\s+insert\s*,\s*update\s*,\s*delete\s+on\s+table\s+public\.planned_meals/.test(correctionClean));
  record("Migration 40 contains no dynamic SQL service role or secret", !/\bexecute\s+format\b|service[_-]?role|supabase_service|eyj[a-z0-9_-]+\./i.test(correctionSql));
  const requiredColumns = ["planned_local_time time without time zone", "planned_timezone text", "meal_category text", "restaurant_name_snapshot text", "create_client_request_id uuid", "create_request_fingerprint jsonb", "conversion_request_fingerprint jsonb", "converted_at timestamptz"];
  record("exact eight nullable V2 columns are present", requiredColumns.every((value) => clean.includes(`add column ${value}`)));
  record("prohibited schema expansion is absent", !/planned_meal_items|\bmenu_id\b|row_version|soft_delete|automatic_expiry|audit_table/.test(clean));
  record("actor-scoped partial create index exists", /unique\s+index[\s\S]*\(user_id\s*,\s*create_client_request_id\)[\s\S]*where\s+create_client_request_id\s+is\s+not\s+null/.test(clean));
  record("canonical ordering index exists", /\(user_id\s*,\s*planned_for\s*,\s*planned_local_time\s*,\s*id\)/.test(clean));
  record("create key fingerprint pair constraint exists", /create_request_pair_check[\s\S]*create_client_request_id is null[\s\S]*create_request_fingerprint is null/.test(clean));
  record("local time requires timezone", /local_time_timezone_check[\s\S]*planned_local_time is null or planned_timezone is not null/.test(clean));
  record("conversion fingerprint constraint is legacy-safe", /conversion_request_fingerprint is null or[\s\S]*status = 'converted'[\s\S]*converted_at is not null/.test(clean));
  const publicNames = [...clean.matchAll(/create\s+function\s+public\.(create_authenticated_planned_meal_v2|update_authenticated_planned_meal_v2|cancel_authenticated_planned_meal_v2|convert_authenticated_planned_meal_v2)\s*\(/g)].map((match) => match[1]);
  record("exactly four public V2 product RPCs exist", publicNames.length === 4 && new Set(publicNames).size === 4, publicNames);
  record("only two private helpers are added", (clean.match(/create\s+function\s+public\._consumer_planned_meal_v2_/g) ?? []).length === 2);
  record("all V2 RPCs are SECURITY DEFINER", (clean.match(/security\s+definer/g) ?? []).length === 4);
  record("all V2 RPCs use safe search_path", (clean.match(/set\s+search_path\s*=\s*pg_catalog\s*,\s*public\s*,\s*pg_temp/g) ?? []).length >= 6);
  record("all V2 function owners are explicit postgres", (clean.match(/alter\s+function[\s\S]*?owner\s+to\s+postgres/g) ?? []).length >= 6);
  record("actor derives only from auth.uid", (clean.match(/v_actor\s+uuid\s*:=\s*auth\.uid\(\)/g) ?? []).length === 4 && !/p_(?:user|actor|owner|profile)_id/.test(clean));
  record("no caller fingerprint parameter exists", !/p_(?:create_request|conversion_request|request)_fingerprint/.test(clean));
  record("create requires UUID v4 and actor-key lock", /invalid_create_client_request_id/.test(clean) && /pg_advisory_xact_lock[\s\S]*v_actor::text[\s\S]*p_create_client_request_id::text/.test(clean));
  record("create fingerprint covers temporal category identity and nutrition", ["'plannedlocaltime'", "'plannedtimezone'", "'mealcategory'", "'restaurantnamesnapshot'", "'nutritionsnapshot'"].every((value) => clean.includes(value)));
  record("create replay and conflict are explicit", /create_request_fingerprint is distinct from v_fingerprint/.test(clean) && /planned_meal_create_idempotency_conflict/.test(clean));
  record("update rejects unknown keys", /unknown_update_patch_key/.test(clean) && /p_patch\s*-\s*array/.test(clean));
  record("update is planned-only and optimistic", /v_row\.status <> 'planned'/.test(clean) && /v_row\.updated_at is distinct from p_expected_updated_at/.test(clean));
  const updateRpc = clean.slice(clean.indexOf("create function public.update_authenticated"), clean.indexOf("create function public.cancel_authenticated"));
  record("update preserves lifecycle and idempotency metadata", !/(?:status|create_client_request_id|create_request_fingerprint|conversion_idempotency_key|conversion_request_fingerprint|converted_at)\s*=/.test(updateRpc.slice(updateRpc.indexOf("update public.planned_meals set"))));
  record("cancel replay precedes version check", clean.indexOf("if v_row.status = 'cancelled'") < clean.indexOf("v_row.updated_at is distinct from p_expected_updated_at", clean.indexOf("create function public.cancel_authenticated")));
  record("cancel protects converted and expired", /planned_meal_already_converted/.test(clean) && /planned_meal_expired/.test(clean));
  const conversion = clean.slice(clean.indexOf("create function public.convert_authenticated"));
  record("conversion locks actor-owned planned row", /where id=p_planned_meal_id and user_id=v_actor for update/.test(conversion));
  record("conversion same-key replay precedes version check", conversion.indexOf("conversion_idempotency_key = p_conversion_idempotency_key") < conversion.indexOf("updated_at is distinct from p_expected_updated_at"));
  record("conversion fingerprint includes locked snapshot version confirmation and timezone", ["'expectedupdatedat'", "'confirmationtimestamp'", "'actortimezone'", "'nutritionsnapshot'"].every((value) => conversion.includes(value)));
  record("conversion reuses B2-A V2 in same transaction", /public\.create_current_user_meal_record_v2\s*\(/.test(conversion));
  record("conversion maps one item and no menu identity", /jsonb_build_array\(pg_catalog\.jsonb_build_object/.test(conversion) && /'menuid',null/.test(conversion));
  record("conversion uses confirmation instant not planned time", /p_occurred_at\s*=>\s*p_confirmation_timestamp/.test(conversion) && /p_meal_date\s*=>\s*\(p_confirmation_timestamp at time zone v_timezone\)::date/.test(conversion));
  record("converted_at is database transaction time", /v_converted_at\s*:=\s*pg_catalog\.transaction_timestamp\(\)/.test(conversion));
  record("conversion calls no summary persistence", !/persist_authenticated_daily_nutrition_summary/.test(conversion));
  record("authenticated-only execute and direct DML revocation remain", (clean.match(/grant execute on function public\.(?:create|update|cancel|convert)_authenticated_planned_meal_v2/g) ?? []).length === 4 && /revoke insert, update, delete on table public\.planned_meals from public, anon, authenticated/.test(clean));
  const runtime = [...candidates].filter((file) => file.startsWith("apps/mobile/")).map(read).join("\n");
  record("runtime has no credential service role or direct Supabase DML", !/process\.env|service[_-]?role|SUPABASE_SERVICE|\.from\([^)]*\)[\s\S]{0,200}\.\s*(?:insert|update|upsert|delete)\s*\(/i.test(runtime));
  record("operation store is actor-scoped with 24-hour TTL", /encodeURIComponent\(actor\)/.test(read("apps/mobile/features/consumer-runtime/consumerPlannedMealOperationStore.ts")) && /24 \* 60 \* 60 \* 1000/.test(runtime));
  record("restore never auto-submits", /const create = await this\.options\.operationStore\.load/.test(runtime) && !/restore[\s\S]{0,200}(?:service|execute)\./i.test(runtime));
  record("Provider composition routes and UI are outside candidate scope", !files.some((file) => /ConsumerRuntimeProvider|consumerRuntimeComposition|apps\/mobile\/app\//.test(file)));
  record("Production N4 and Phase 2V-F are excluded", !files.some((file) => /production|n4|phase-2v/i.test(file)));
  record("guard smoke and contract documentation exist", [migration39, migration40, "scripts/consumer-runtime-phase-2z-b3-b-planned-meal-contract-smoke.mjs", "docs/consumer-runtime-phase-2z/phase-2z-b3-planned-meal-contract.md"].every((file) => fs.existsSync(path.join(root, file))));
  for (const check of checks) console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}${check.pass || check.detail === undefined ? "" : ` ${JSON.stringify(check.detail)}`}`);
  console.log(`RESULT ${checks.length - failures.length}/${checks.length} ${failures.length ? "FAIL" : "PASS"}`); if (failures.length) process.exitCode = 1;
} catch (error) { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; }
