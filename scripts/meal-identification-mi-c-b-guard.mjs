#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const baseline = "616c85c9269a60d8dd775fa760b00f8ef60a64f2";
const miCbFrozenHead = "d9f76317f052636be7c72a209370d021aa882a98";
const protectedMigration =
  "supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql";
const migration =
  "supabase/migrations/20260724020000_consumer_meal_identification_atomic_finalization.sql";
// The MI-C-B commit (miCbFrozenHead) is already frozen; this correction round
// edits only the migration syntax and this guard on top of that commit.
const correctionCandidatePaths = new Set([
  migration,
  "scripts/meal-identification-mi-c-b-guard.mjs"
]);
const expectedCorrectionChangedPaths = new Set([
  ...correctionCandidatePaths,
  protectedMigration
]);
const checks = [];
const failures = [];

const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const git = (args) =>
  spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
const cleanSql = (value) =>
  value.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim().toLowerCase();

function record(name, condition) {
  const pass = Boolean(condition);
  checks.push({ name, pass });
  if (!pass) failures.push(name);
}

function changedPaths() {
  const status = git([
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all"
  ]);
  return status.stdout
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll("\\", "/"))
    .sort();
}

try {
  const sql = read(migration);
  const normalized = cleanSql(sql);
  const packageJson = JSON.parse(read("package.json"));
  const baselinePackage = JSON.parse(
    git(["show", `${baseline}:package.json`]).stdout
  );
  const baselineSchema = cleanSql(
    read(
      "supabase/migrations/20260712120000_create_restaurant_platform_baseline.sql"
    )
  );
  const paths = changedPaths();

  record("branch remains main", git(["branch", "--show-current"]).stdout.trim() === "main");
  record(
    "HEAD remains MI-C-B Frozen pending this correction",
    git(["rev-parse", "HEAD"]).stdout.trim() === miCbFrozenHead
  );
  record("staged diff is empty", git(["diff", "--cached", "--quiet"]).status === 0);
  record(
    "exact correction candidate plus protected migration",
    paths.length === expectedCorrectionChangedPaths.size &&
      paths.every((entry) => expectedCorrectionChangedPaths.has(entry))
  );
  record(
    "protected migration is excluded from candidate",
    !correctionCandidatePaths.has(protectedMigration) &&
      paths.includes(protectedMigration)
  );

  record(
    "migration has one transaction wrapper",
    /^\s*begin\s*;/i.test(sql) &&
      /commit\s*;\s*$/i.test(sql) &&
      (normalized.match(/\bbegin\s*;/g) ?? []).length === 1 &&
      (normalized.match(/\bcommit\s*;/g) ?? []).length === 1
  );
  record(
    "analysis nullable evidence columns and defaults are corrected",
    [
      "alter column model_name drop not null",
      "alter column model_version drop not null",
      "alter column estimated_nutrition drop not null",
      "alter column estimated_nutrition drop default",
      "alter column analyzed_at drop not null",
      "alter column analyzed_at drop default"
    ].every((fragment) => normalized.includes(fragment))
  );
  record(
    "available analysis contract is scoped and fail closed",
    /analysis_status not in \('available', 'unavailable'\)[\s\S]*analysis_status = 'available'[\s\S]*jsonb_array_length\(detected_items\) > 0[\s\S]*analyzed_at is not null/.test(
      normalized
    )
  );
  record(
    "unavailable analysis requires null provenance",
    /analysis_status = 'unavailable'[\s\S]*cardinality\(source_photo_ids\) = 0[\s\S]*detected_items = '\[\]'::jsonb[\s\S]*model_name is null[\s\S]*model_version is null[\s\S]*estimated_nutrition is null[\s\S]*confidence_score is null[\s\S]*analyzed_at is null/.test(
      normalized
    )
  );
  record(
    "analysis model provenance is paired",
    /meal_analyses_mi_c_model_pair_check[\s\S]*model_name is null\) = \(model_version is null/.test(
      normalized
    )
  );
  record(
    "correction ordinal and nonnegative check exist",
    /add column correction_ordinal integer[\s\S]*correction_ordinal is null or correction_ordinal >= 0/.test(
      normalized
    )
  );
  record(
    "correction ordinal partial unique index exists",
    /create unique index meal_corrections_analysis_ordinal_unique[\s\S]*\(meal_analysis_id, correction_ordinal\)[\s\S]*where correction_ordinal is not null/.test(
      normalized
    )
  );

  record(
    "all six Catalog primary keys are tracked text",
    [
      "create table public.restaurants ( id text primary key",
      "create table public.restaurant_branches ( id text primary key",
      "create table public.menus ( id text primary key",
      "create table public.menu_categories ( id text primary key",
      "create table public.menu_items ( id text primary key",
      "create table public.branch_menu_items ( id text primary key"
    ].every((fragment) => baselineSchema.includes(fragment))
  );
  record(
    "ledger uses actual text Catalog ID types",
    [
      "restaurant_id text",
      "branch_id text",
      "menu_id text",
      "menu_category_id text",
      "menu_item_id text",
      "branch_menu_item_id text"
    ].every((fragment) => normalized.includes(fragment))
  );
  record(
    "same-actor same-parent unique shapes exist",
    /unique \(id, user_id\)/.test(normalized) &&
      (normalized.match(/unique \(id, meal_record_id, user_id\)/g) ?? []).length === 2
  );
  record(
    "ledger has three composite ownership FKs",
    /foreign key \(meal_record_id, user_id\)[\s\S]*references public\.meal_records \(id, user_id\)/.test(
      normalized
    ) &&
      /foreign key \(meal_record_item_id, meal_record_id, user_id\)[\s\S]*references public\.meal_record_items \(id, meal_record_id, user_id\)/.test(
        normalized
      ) &&
      /foreign key \(meal_analysis_id, meal_record_id, user_id\)[\s\S]*references public\.meal_analyses \(id, meal_record_id, user_id\)/.test(
        normalized
      )
  );
  record(
    "ledger record item and analysis links are one-to-one",
    [
      "unique (meal_record_id)",
      "unique (meal_record_item_id)",
      "unique (meal_analysis_id)"
    ].every((fragment) => normalized.includes(fragment))
  );
  record(
    "ledger contract and JSON object checks are exact",
    /contract_version = 'meal-identification-finalization-v1'/.test(normalized) &&
      /jsonb_typeof\(command_snapshot\) = 'object'/.test(normalized)
  );
  record(
    "ledger confirmed selection requires six IDs",
    /selection_kind = 'catalog_item'[\s\S]*identity_validation_status = 'server_validated'[\s\S]*restaurant_id is not null[\s\S]*branch_id is not null[\s\S]*menu_id is not null[\s\S]*menu_category_id is not null[\s\S]*menu_item_id is not null[\s\S]*branch_menu_item_id is not null/.test(
      normalized
    )
  );
  record(
    "ledger unresolved selection requires frozen reasons and six null IDs",
    /selection_kind = 'personal_unresolved'[\s\S]*unresolved_reason in \('manual', 'self_cooked', 'none_of_the_above', 'catalog_unavailable'\)[\s\S]*identity_validation_status = 'not_applicable'[\s\S]*restaurant_id is null[\s\S]*branch_id is null[\s\S]*menu_id is null[\s\S]*menu_category_id is null[\s\S]*menu_item_id is null[\s\S]*branch_menu_item_id is null/.test(
      normalized
    )
  );
  record(
    "Catalog IDs are historical snapshots without Catalog FKs",
    !/references public\.(restaurants|restaurant_branches|menus|menu_categories|menu_items|branch_menu_items)/.test(
      normalized
    )
  );

  record(
    "atomic RPC signature is exact",
    /create function public\.finalize_current_user_meal_identification_v1\( p_client_request_id uuid, p_meal_type public\.meal_type, p_occurred_at timestamptz, p_meal_date date, p_timezone text, p_finalization jsonb \) returns jsonb/.test(
      normalized
    )
  );
  record(
    "RPC is security definer with fixed search path",
    /security definer set search_path = pg_catalog, public, pg_temp/.test(
      normalized
    )
  );
  record(
    "actor derives only from auth.uid",
    /v_user_id uuid := auth\.uid\(\)/.test(normalized) &&
      !/\bp_(user|owner|profile|meal_record|meal_record_item|meal_analysis)_id\b/.test(
        normalized
      )
  );
  record(
    "UUID v4 request key is validated",
    /p_client_request_id is null[\s\S]*pg_catalog\.substr\(p_client_request_id::text, 15, 1\) <> '4'/.test(
      normalized
    )
  );
  record(
    "migration never reintroduces schema-qualified substring special-form syntax",
    !/pg_catalog\.substring\s*\(/.test(normalized)
  );
  record(
    "legal pg_catalog.substr three-argument form is used for the UUID v4 nibble read",
    /pg_catalog\.substr\(p_client_request_id::text, 15, 1\)/.test(normalized)
  );
  record(
    "UUID v4 version nibble is still compared to character 4",
    /pg_catalog\.substr\(p_client_request_id::text, 15, 1\) <> '4'/.test(normalized)
  );
  record(
    "confirmed identity JSON values must be strings",
    /foreach v_key in array array\[ 'restaurantid', 'branchid', 'menuid', 'menucategoryid', 'menuitemid', 'branchmenuitemid' \][\s\S]*jsonb_typeof\(v_identity -> v_key\) <> 'string'/.test(
      normalized
    )
  );
  record(
    "candidate snapshot shape and identity are exact",
    /jsonb_object_keys\(v_candidate\)[\s\S]*'availability', 'branchcontext', 'branchname', 'confidence', 'identity',[\s\S]*'source', 'tags'[\s\S]*v_candidate -> 'identity' is distinct from v_identity/.test(
      normalized
    )
  );
  record(
    "function execute privilege is authenticated-only",
    (normalized.match(/revoke all on function public\.finalize_current_user_meal_identification_v1/g) ?? [])
      .length === 3 &&
      /from public;[\s\S]*from anon;[\s\S]*from authenticated;[\s\S]*grant execute on function public\.finalize_current_user_meal_identification_v1[\s\S]*to authenticated;/.test(
        normalized
      )
  );
  record(
    "private tables expose owner reads but no direct writes",
    /enable row level security[\s\S]*meal_identification_finalizations_owner_select[\s\S]*user_id = auth\.uid\(\)/.test(
      normalized
    ) &&
      [
        "grant select on table public.meal_identification_finalizations to authenticated",
        "grant select on table public.meal_analyses to authenticated",
        "grant select on table public.meal_corrections to authenticated",
        "revoke insert, update, delete on table public.meal_analyses from authenticated",
        "revoke insert, update, delete on table public.meal_corrections from authenticated"
      ].every((fragment) => normalized.includes(fragment))
  );

  record(
    "server derives canonical fingerprint",
    /'operation', 'finalize_current_user_meal_identification_v1'[\s\S]*'rpccontractversion', 1[\s\S]*'mealtype', p_meal_type::text[\s\S]*'finalization', p_finalization/.test(
      normalized
    ) && !/\bp_(request_)?fingerprint\b/.test(normalized)
  );
  record(
    "actor-key advisory transaction lock exists",
    /pg_advisory_xact_lock[\s\S]*v_user_id::text \|\| ':' \|\| p_client_request_id::text/.test(
      normalized
    )
  );
  record(
    "different fingerprint conflicts",
    /request_fingerprint is distinct from v_fingerprint[\s\S]*idempotency_key_conflict[\s\S]*errcode = '23505'/.test(
      normalized
    )
  );
  record(
    "same fingerprint replay requires complete durable linkage",
    /join public\.meal_record_items[\s\S]*join public\.meal_analyses[\s\S]*command_snapshot = p_finalization[\s\S]*durable_state_inconsistency/.test(
      normalized
    ) &&
      /correction\.meal_record_item_id is distinct from v_existing_item_id[\s\S]*correction\.user_id is distinct from v_user_id[\s\S]*correction\.correction_ordinal is distinct from/.test(
        normalized
      )
  );
  record(
    "replay returns stable complete IDs",
    /'replayed', true[\s\S]*'meal_record_id'[\s\S]*'meal_record_item_id'[\s\S]*'meal_analysis_id'[\s\S]*'meal_identification_finalization_id'[\s\S]*'meal_correction_ids'/.test(
      normalized
    )
  );
  record(
    "six-table hierarchy join is complete",
    [
      "from public.restaurants as restaurant",
      "join public.restaurant_branches as branch",
      "join public.menus as menu",
      "join public.menu_categories as category",
      "join public.menu_items as item",
      "join public.branch_menu_items as branch_item",
      "branch.restaurant_id = restaurant.id",
      "menu.restaurant_id = restaurant.id",
      "category.menu_id = menu.id",
      "item.restaurant_id = restaurant.id",
      "item.menu_category_id = category.id",
      "branch_item.restaurant_id = restaurant.id",
      "branch_item.branch_id = branch.id",
      "branch_item.menu_item_id = item.id"
    ].every((fragment) => normalized.includes(fragment))
  );
  record(
    "Catalog status checks are fail closed",
    [
      "restaurant.status = 'active'",
      "branch.status = 'active'",
      "branch.is_active = true",
      "menu.status = 'published'",
      "item.status = 'active'",
      "branch_item.availability in ('available', 'limited')",
      "branch_item.sold_out = false",
      "branch_item.branch_specific_status = 'available'"
    ].every((fragment) => normalized.includes(fragment))
  );
  record(
    "Catalog rows are locked through write completion",
    /for share of restaurant, branch, menu, category, item, branch_item/.test(
      normalized
    )
  );
  record(
    "unresolved identity is rechecked before write",
    /elsif v_restaurant_id is not null[\s\S]*or v_branch_menu_item_id is not null[\s\S]*identity_invariant_violation/.test(
      normalized
    )
  );
  record(
    "server builds one frozen meal-write projection",
    /v_items := pg_catalog\.jsonb_build_array\([\s\S]*'restaurantid', v_restaurant_id[\s\S]*'menuitemid', v_menu_item_id[\s\S]*'displayname', v_meal_name[\s\S]*'portion', v_portion[\s\S]*'nutrition', v_nutrition/.test(
      normalized
    )
  );
  record(
    "V1 creates the one record and item atomically",
    /v_created := public\.create_current_user_meal_record\(/.test(normalized) &&
      /jsonb_array_length\(v_created -> 'meal_record_items'\) <> 1/.test(
        normalized
      )
  );
  record(
    "record fingerprint update is actor-bound",
    /update public\.meal_records set client_request_id = p_client_request_id,[\s\S]*where id = v_record_id and user_id = v_user_id/.test(
      normalized
    )
  );
  record(
    "original analysis is inserted and never updated",
    /insert into public\.meal_analyses/.test(normalized) &&
      !/update public\.meal_analyses/.test(normalized)
  );
  record(
    "correction parents are server-generated and ordinal-bound",
    /insert into public\.meal_corrections[\s\S]*v_user_id,[\s\S]*v_analysis_id,[\s\S]*v_item_id,[\s\S]*v_event_index/.test(
      normalized
    )
  );
  record(
    "Phase 2P nutrition correction snapshots are validated",
    /v_detail ->> 'correctiontype' = 'nutrition_override'[\s\S]*foreach v_snapshot_key in array array\['before', 'after'\][\s\S]*v_nutrient_key not in \('calories', 'protein', 'carbohydrates', 'fat', 'fiber'\)/.test(
      normalized
    )
  );
  record(
    "all writes and ledger response share one failure boundary",
    /insert into public\.meal_analyses[\s\S]*insert into public\.meal_corrections[\s\S]*insert into public\.meal_identification_finalizations[\s\S]*'replayed', false/.test(
      normalized
    ) &&
      /exception when others[\s\S]*v_error_message ~ '\^\[a-z0-9_\]\+\$'[\s\S]*durable_finalization_failed/.test(
        normalized
      )
  );

  const v1Migration =
    "supabase/migrations/20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql";
  const v2Migration =
    "supabase/migrations/20260720010000_consumer_meal_record_create_idempotency.sql";
  record(
    "existing V1 and V2 migrations remain byte-equivalent",
    git(["diff", "--quiet", baseline, "--", v1Migration]).status === 0 &&
      git(["diff", "--quiet", baseline, "--", v2Migration]).status === 0 &&
      !/create (or replace )?function public\.create_current_user_meal_record(_v2)?\s*\(/.test(
        normalized
      )
  );

  const scriptNames = [
    "test:meal-identification-mi-c-b",
    "test:meal-identification-mi-c-b-smoke"
  ];
  const addedScriptNames = Object.keys(packageJson.scripts).filter(
    (name) => !(name in baselinePackage.scripts)
  );
  record(
    "package adds only two MI-C-B scripts",
    addedScriptNames.length === 2 &&
      addedScriptNames.every((name) => scriptNames.includes(name)) &&
      packageJson.scripts["test:meal-identification-mi-c-b"] ===
        "node scripts/meal-identification-mi-c-b-guard.mjs" &&
      packageJson.scripts["test:meal-identification-mi-c-b-smoke"] ===
        "node scripts/meal-identification-mi-c-b-contract-smoke.mjs"
  );
  record(
    "all pre-existing package scripts are unchanged",
    Object.entries(baselinePackage.scripts).every(
      ([name, value]) => packageJson.scripts[name] === value
    )
  );
  record(
    "migration excludes GPS alias Food Memory UI network and credentials",
    !/expo-location|gps|alias[_ -]?resolver|food[_ -]?memory|fetch\s*\(|https?:\/\/|service[_ -]?role|credential|apps\/mobile\/app/i.test(
      sql
    )
  );
  const guardSource = read("scripts/meal-identification-mi-c-b-guard.mjs");
  const mutationApis = [
    "write" + "File",
    "append" + "File",
    "mk" + "dir",
    "rm" + "Sync",
    "un" + "link",
    "re" + "name",
    "copy" + "File",
    "exec" + "FileSync"
  ];
  record(
    "guard is read-only and creates no artifacts",
    mutationApis.every((name) => !guardSource.includes(`fs.${name}`)) &&
      guardSource.includes('spawnSync("git"')
  );

  for (const check of checks) {
    console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}`);
  }
  console.log(
    `RESULT ${checks.length - failures.length}/${checks.length} ${
      failures.length ? "FAIL" : "PASS"
    }`
  );
  if (failures.length) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
