// RA-2H-P1 successor manifest and shared contract. Every value here is an exact pin: nothing is a
// prefix, a suffix or a pattern. Every claim is what a specific mutation is designed to break.
//
// SCOPE. This round governs FOUR independent Restaurant Owner temporal concerns on a per-branch
// basis: a per-branch IANA timezone (onboarding data, not Owner-editable through this round), a
// weekly wall-clock schedule, local-calendar-date exceptions, and absolute operational closure
// windows -- plus one canonical read-only OPEN/CLOSED/UNKNOWN evaluator. See
// docs/restaurant-owner-branch-temporal-foundation-ra-2h-p0.md for the frozen product/architecture
// contract this migration implements exactly; where this file abbreviates, P0 wins.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const H1_BASELINE = "2e5be8ed064c636d1bb1ab772e47f8067caa36d9";
export const H1_ORIGIN_MAIN = "2e5be8ed064c636d1bb1ab772e47f8067caa36d9";
export const H1_SUBJECT = "Add governed Restaurant branch temporal authority";
export const H1_BASELINE_MIGRATION_COUNT = 100;
export const H1_PROJECT_REF = "msbgnnoorsoefuiwluye";
export const H1_PROJECT_NAME = "tastkind-development";

export const H1_MIGRATION =
  "supabase/migrations/20260906030000_restaurant_owner_branch_temporal_authority.sql";
export const H1_MIGRATION_SHA256 =
  "a4cbdcad2f83bde7fa08b0496b48d55b95c4c228353705b3ed2decc2dbbcf151";

/** RA-1C and RA-2A-F are frozen predecessors this round asserts and never edits. */
export const H1_FROZEN_MIGRATIONS = Object.freeze([
  Object.freeze({
    path: "supabase/migrations/20260904020000_platform_admin_branch_status_authority.sql",
    sha256: null
  }),
  Object.freeze({
    path: "supabase/migrations/20260906020000_restaurant_owner_branch_menu_item_display_name_authority.sql",
    sha256: "fbbd5a2c4955af3343af61ed00fd5c61686679ad1158a4b0986a789c8e4074f4"
  })
]).map((item) => Object.freeze({
  path: item.path,
  sha256: item.sha256 ?? crypto.createHash("sha256")
    .update(fs.readFileSync(item.path, "utf8").replace(/\r\n/g, "\n"), "utf8").digest("hex")
}));

export const H1_CLIENT_ROLES = Object.freeze(["anon", "authenticated", "authenticator", "service_role"]);

export const H1_WEEKLY_ROLE = "restaurant_owner_branch_weekly_hours_write_authority";
export const H1_SPECIAL_ROLE = "restaurant_owner_branch_special_hours_write_authority";
export const H1_CLOSURE_ROLE = "restaurant_owner_branch_operational_closure_write_authority";
export const H1_READER_ROLE = "restaurant_branch_temporal_context_reader";
export const H1_ROLES = Object.freeze([H1_WEEKLY_ROLE, H1_SPECIAL_ROLE, H1_CLOSURE_ROLE, H1_READER_ROLE]);

export const H1_FROZEN_RA1C_ROLE = "platform_admin_branch_status_authority";
export const H1_FROZEN_RA2AF_ROLES = Object.freeze([
  "restaurant_owner_branch_menu_item_write_authority",
  "restaurant_owner_branch_menu_item_availability_write_authority",
  "restaurant_owner_branch_menu_item_price_write_authority",
  "restaurant_owner_branch_menu_item_visibility_write_authority",
  "restaurant_owner_branch_display_name_write_authority",
  "restaurant_owner_branch_menu_item_display_name_write_authority"
]);

export const H1_INVENTORY = Object.freeze({
  // discoverRepositoryRoleDefinitions() counts every CREATE ROLE in supabase/migrations. Before
  // this round: 25 (per RA-2F-P1's own evidence). This round adds exactly four CREATE ROLE.
  repositoryRoleDefinitionsBefore: 25,
  repositoryRoleDefinitionsAfter: 29,
  newRolesThisRound: 4
});

export const H1_PERMISSION_KEYS = Object.freeze([
  "branch.hours.weekly.write", "branch.hours.special.write", "branch.operational_closure.write"
]);
export const H1_PERMISSION_ROLE = "owner";
export const H1_PERMISSION_SCOPE = "restaurant";
export const H1_LEGACY_PERMISSION_KEYS = Object.freeze([
  "access_context.read", "restaurant.read", "branch.read", "menu.read", "nutrition.read",
  "branch_menu_item.sold_out.write", "branch_menu_item.availability.write",
  "branch_menu_item.price.write", "branch_menu_item.visibility.write",
  "branch.profile.display_name.write", "branch_menu_item.display_name.write"
]);

export const H1_WEEKDAY_MIN = 1;
export const H1_WEEKDAY_MAX = 7;
export const H1_MAX_INTERVALS_PER_WEEKDAY = 8;
export const H1_MAX_INTERVALS_PER_WEEK = 56;
export const H1_MAX_SPECIAL_INTERVALS = 8;

export const H1_WEEKLY_OPERATIONS = Object.freeze(["REPLACE_WEEKLY_SCHEDULE", "CLEAR_WEEKLY_SCHEDULE"]);
export const H1_SPECIAL_OPERATIONS = Object.freeze(["SET_CLOSED", "SET_CUSTOM_HOURS", "CLEAR_OVERRIDE"]);
export const H1_CLOSURE_OPERATIONS = Object.freeze([
  "CLOSE_NOW_INDEFINITE", "CLOSE_NOW_UNTIL", "SCHEDULE_CLOSURE", "REOPEN_NOW", "CANCEL_FUTURE_CLOSURE"
]);

export const H1_EVALUATOR_STATES = Object.freeze(["OPEN", "CLOSED", "UNKNOWN"]);
export const H1_EVALUATOR_REASONS = Object.freeze([
  "ADMIN_LIFECYCLE_BLOCKED", "OPERATIONALLY_CLOSED", "SPECIAL_DATE_CLOSED", "OUTSIDE_SPECIAL_HOURS",
  "OUTSIDE_WEEKLY_HOURS", "HOURS_UNKNOWN", "OPEN_SPECIAL_HOURS", "OPEN_WEEKLY_HOURS"
]);

export const H1_RELATIONS = Object.freeze([
  "public.restaurant_branch_temporal_state",
  "public.restaurant_branch_weekly_hour_intervals",
  "public.restaurant_branch_special_hour_overrides",
  "public.restaurant_branch_special_hour_intervals",
  "public.restaurant_branch_operational_closures",
  "restaurant_internal.branch_weekly_hours_audit_log",
  "restaurant_internal.branch_weekly_hours_audit_intervals",
  "restaurant_internal.branch_special_hours_audit_log",
  "restaurant_internal.branch_special_hours_audit_intervals",
  "restaurant_internal.branch_operational_closure_audit_log"
]);

export const H1_EVALUATOR_FN = "restaurant_internal.evaluate_branch_temporal_state_v1";
export const H1_RESOLVE_FN = "restaurant_internal.resolve_branch_local_datetime_v1";
export const H1_PREVIEW_FN = "public.restaurant_owner_preview_branch_temporal_v1";
export const H1_WEEKLY_FN = "public.restaurant_owner_replace_branch_weekly_hours_v1";
export const H1_SPECIAL_FN = "public.restaurant_owner_set_branch_special_hours_v1";
export const H1_CLOSE_NOW_FN = "public.restaurant_owner_close_branch_now_v1";
export const H1_SCHEDULE_FN = "public.restaurant_owner_schedule_branch_closure_v1";
export const H1_REOPEN_FN = "public.restaurant_owner_reopen_branch_now_v1";
export const H1_CANCEL_FN = "public.restaurant_owner_cancel_future_branch_closure_v1";

export const H1_PUBLIC_FUNCTION_SIGNATURES = Object.freeze([
  `${H1_PREVIEW_FN}(text, text, date, date)`,
  `${H1_WEEKLY_FN}(text, text, text, jsonb, bigint)`,
  `${H1_SPECIAL_FN}(text, text, date, text, jsonb, bigint)`,
  `${H1_CLOSE_NOW_FN}(text, text, text, timestamp, text, bigint)`,
  `${H1_SCHEDULE_FN}(text, text, timestamp, text, timestamp, text, bigint)`,
  `${H1_REOPEN_FN}(text, text, uuid, bigint)`,
  `${H1_CANCEL_FN}(text, text, uuid, bigint)`
]);

export const H1_MUTATION_ERRORS = Object.freeze([
  "unauthenticated", "permission_denied", "invalid_request", "target_not_found",
  "stale_state", "no_change"
]);
export const H1_CLOSURE_EXTRA_ERRORS = Object.freeze([
  "lifecycle_blocked", "closure_conflict", "invalid_local_time"
]);

export const H1_PACKAGE_KEYS = Object.freeze([
  "test:restaurant-owner-branch-temporal-ra-2h-p1",
  "test:restaurant-owner-branch-temporal-ra-2h-p1-smoke",
  "test:restaurant-owner-branch-temporal-ra-2h-p1-mutations",
  "test:restaurant-owner-branch-temporal-ra-2h-p1-postgres"
]);

export const H1_PATHS = Object.freeze([
  "docs/restaurant-owner-branch-temporal-ra-2h-p1.md",
  "package.json",
  "scripts/restaurant-owner-branch-temporal-ra-2h-p1-contract.mjs",
  "scripts/restaurant-owner-branch-temporal-ra-2h-p1-guard.mjs",
  "scripts/restaurant-owner-branch-temporal-ra-2h-p1-mutations.mjs",
  "scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs",
  "scripts/restaurant-owner-branch-temporal-ra-2h-p1-smoke.mjs",
  H1_MIGRATION
].sort());

export const H1_FROZEN_PATHS = Object.freeze([
  "docs/restaurant-owner-branch-temporal-foundation-ra-2h-p0.md",
  "scripts/restaurant-owner-temporal-ra-2h-p0-guard.mjs",
  ...H1_FROZEN_MIGRATIONS.map((item) => item.path)
]);

// -------------------------------------------------------------------------------------------------
export const readNormalized = (root, file) =>
  fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
export const readMigrationSource = (root = process.cwd()) => readNormalized(root, H1_MIGRATION);

const stripComments = (text) => text.replace(/^\s*--.*$/gm, "");

function fnBody(sql, name) {
  const start = sql.indexOf(`create function ${name}`);
  if (start < 0) return "";
  const open = sql.indexOf("as $$", start);
  if (open < 0) return "";
  const close = sql.indexOf("$$;", open + 5);
  if (close < 0) return "";
  return stripComments(sql.slice(open + 5, close));
}

function tableBody(sql, name) {
  const start = sql.indexOf(`create table ${name} (`);
  if (start < 0) return "";
  const close = sql.indexOf(");", start);
  if (close < 0) return "";
  return stripComments(sql.slice(start, close));
}

export function auditMigrationSource(source) {
  const claims = [];
  const claim = (name, pass, detail) => claims.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
  const sql = source.replace(/\r\n/g, "\n");
  const bare = stripComments(sql);
  const has = (needle) => bare.includes(needle);
  const count = (needle) => bare.split(needle).length - 1;
  const evaluator = fnBody(bare, H1_EVALUATOR_FN);
  const resolve = fnBody(bare, H1_RESOLVE_FN);
  const preview = fnBody(bare, H1_PREVIEW_FN);
  const weekly = fnBody(bare, H1_WEEKLY_FN);
  const special = fnBody(bare, H1_SPECIAL_FN);
  const closeNow = fnBody(bare, H1_CLOSE_NOW_FN);
  const schedule = fnBody(bare, H1_SCHEDULE_FN);
  const reopen = fnBody(bare, H1_REOPEN_FN);
  const cancel = fnBody(bare, H1_CANCEL_FN);
  const weeklyIntervalsTable = tableBody(bare, "public.restaurant_branch_weekly_hour_intervals");
  const specialIntervalsTable = tableBody(bare, "public.restaurant_branch_special_hour_intervals");
  const weeklyOverlapGuard = fnBody(bare, "restaurant_internal.restaurant_branch_weekly_hours_overlap_guard()");
  const specialOverlapGuard = fnBody(bare, "restaurant_internal.restaurant_branch_special_hours_overlap_guard()");

  // --- predecessor assertions and transaction shape ------------------------------------------------
  claim("the migration is a single transaction", /^begin;/m.test(bare) && /^commit;\s*$/m.test(bare));
  claim("the migration asserts the RA-1C sealed role before doing anything else",
    bare.indexOf(`'${H1_FROZEN_RA1C_ROLE}'`) < bare.indexOf("alter table public.restaurant_branches add column timezone_name"));
  claim("the migration asserts all six RA-2A-F sealed writers are present",
    H1_FROZEN_RA2AF_ROLES.every((role) => has(`'${role}'`))
    && has("expected all 6 RA-2A-F sealed writers present"));

  // --- timezone --------------------------------------------------------------------------------------
  claim("timezone_name is added nullable first, never with a table-level default",
    has("alter table public.restaurant_branches add column timezone_name text;")
    && !/add column timezone_name text[^;]*default/i.test(bare));
  claim("existing rows are backfilled to Asia/Taipei as one-time data, not a database default",
    has("update public.restaurant_branches set timezone_name = 'Asia/Taipei' where timezone_name is null;"));
  claim("timezone_name becomes NOT NULL only after backfill is verified",
    bare.indexOf("update public.restaurant_branches set timezone_name = 'Asia/Taipei'")
      < bare.indexOf("alter column timezone_name set not null"));
  claim("the backfill is verified to leave zero NULL rows, and fails closed if it did not",
    has("raise exception 'RA-2H-P1: % branch rows still lack a timezone after backfill', v_unset;"));
  claim("timezone validation uses pg_catalog.pg_timezone_names exact-name membership, no hand-written allowlist",
    has("select 1 from pg_catalog.pg_timezone_names tz where tz.name = new.timezone_name"));
  claim("the timezone trigger revalidates only on insert or on an actual change of timezone_name",
    has("if tg_op = 'UPDATE' and new.timezone_name is not distinct from old.timezone_name then")
    && has("before insert or update on public.restaurant_branches"));
  claim("timezone is excluded from all three Owner temporal writers (grep-level: no UPDATE grant names it)",
    !/grant update[^;]*timezone_name[^;]*to restaurant_owner_branch_(weekly_hours|special_hours|operational_closure)_write_authority/i.test(bare));

  // --- weekly interval shape and limits --------------------------------------------------------------
  claim("weekly interval weekday is constrained to 1..7",
    has("constraint restaurant_branch_weekly_hour_intervals_weekday_check check (weekday between 1 and 7)"));
  claim("weekly interval end_day_offset is constrained to {0,1}",
    has("constraint restaurant_branch_weekly_hour_intervals_offset_check check (end_day_offset in (0, 1))"));
  claim("the weekly shape check admits same-day (strict <), overnight, and exactly the 00:00->00:00 24h pair, nothing else",
    weeklyIntervalsTable.includes("(end_day_offset = 0 and start_local_time < end_local_time)")
    && !weeklyIntervalsTable.includes("start_local_time <= end_local_time")
    && weeklyIntervalsTable.includes("(end_day_offset = 1 and start_local_time > end_local_time)")
    && weeklyIntervalsTable.includes("(end_day_offset = 1 and start_local_time = '00:00:00' and end_local_time = '00:00:00')")
    && !weeklyIntervalsTable.includes("(end_day_offset = 1 and start_local_time = end_local_time)"));
  claim("the special shape check independently admits the same 3-branch contract",
    specialIntervalsTable.includes("(end_day_offset = 0 and start_local_time < end_local_time)")
    && specialIntervalsTable.includes("(end_day_offset = 1 and start_local_time > end_local_time)")
    && specialIntervalsTable.includes("(end_day_offset = 1 and start_local_time = '00:00:00' and end_local_time = '00:00:00')"));
  claim("the weekly composite unique constraint rejects exact duplicate rows",
    weeklyIntervalsTable.includes("constraint restaurant_branch_weekly_hour_intervals_unique")
    && weeklyIntervalsTable.includes("unique (branch_id, weekday, start_local_time, end_day_offset, end_local_time)"));
  claim("a deferred-free (immediate) AFTER ROW overlap guard exists on weekly intervals, circular (3-way shift)",
    has("create trigger restaurant_branch_weekly_hour_intervals_overlap_guard")
    && !has("create constraint trigger restaurant_branch_weekly_hour_intervals_overlap_guard")
    && weeklyOverlapGuard.includes("cross join (values (-10080), (0), (10080)) as shift(s)"));
  claim("the special overlap guard trigger exists and is scoped to one override (no circular shift needed)",
    has("create trigger restaurant_branch_special_hour_intervals_overlap_guard")
    && specialOverlapGuard.includes("where a.override_id = new.override_id"));
  claim("the RPC enforces the max-8-per-weekday and max-56-per-week limits before writing",
    weekly.includes(`> ${H1_MAX_INTERVALS_PER_WEEKDAY} then`) && weekly.includes(`> ${H1_MAX_INTERVALS_PER_WEEK} then`));
  claim("the RPC rejects duplicate candidate intervals with a dedicated count-distinct check",
    weekly.includes("count(distinct (x.weekday, x.\"startLocalTime\""));
  claim("the RPC's own overlap pre-check is circular (3-way shift), matching the DB constraint trigger",
    weekly.includes("cross join (values (-10080), (0), (10080)) as shift(s)"));

  // --- weekly configured/UNKNOWN and canonicalization -------------------------------------------------
  claim("weekly_hours_configured/version/special_hours_version/operational_closure_version all default correctly",
    has("weekly_hours_configured boolean not null default false")
    && has("weekly_hours_version bigint not null default 0")
    && has("special_hours_version bigint not null default 0")
    && has("operational_closure_version bigint not null default 0"));
  claim("REPLACE with an empty array sets configured=true (explicitly closed all week), distinct from CLEAR",
    weekly.includes("v_next_configured := true;") && weekly.includes("v_next_configured := false;"));
  claim("canonical order is weekday, start time, end-day offset, end time, ascending",
    weekly.includes("order by w.weekday, w.start_local_time, w.end_day_offset, w.end_local_time")
    && weekly.includes("order by x.weekday, x.\"startLocalTime\", x.\"endDayOffset\", x.\"endLocalTime\""));
  claim("no_change compares canonical configured+schedule, not raw input order",
    weekly.includes("v_next_configured = v_target.weekly_hours_configured and v_next_canonical = v_current_canonical"));
  claim("weekly stale/ABA use exact version equality (a single writer-owned counter, never client-predicted)",
    weekly.includes("v_target.weekly_hours_version <> p_expected_version"));
  claim("the weekly version only advances AFTER the no_change check, never before it",
    weekly.indexOf("'no_change'") >= 0
    && weekly.indexOf("weekly_hours_version = weekly_hours_version + 1") >= 0
    && weekly.indexOf("'no_change'") < weekly.indexOf("weekly_hours_version = weekly_hours_version + 1"));

  // --- special-date model --------------------------------------------------------------------------
  claim("exactly one override per (branch_id, local_date)",
    has("constraint restaurant_branch_special_hour_overrides_unique unique (branch_id, local_date)"));
  claim("special mode is constrained to closed|custom",
    has("constraint restaurant_branch_special_hour_overrides_mode_check check (mode in ('closed', 'custom'))"));
  claim("special intervals reuse the identical interval shape contract as weekly",
    has("constraint restaurant_branch_special_hour_intervals_shape_check check (")
    && has("(end_day_offset = 1 and start_local_time = '00:00:00' and end_local_time = '00:00:00')"));
  claim("special custom hours require 1..8 intervals; empty is invalid, never inferred as closed",
    special.includes("v_candidate_count < 1 or v_candidate_count > 8"));
  claim("special uses ONE branch-level special_hours_version shared across all dates (not per-date)",
    special.includes("t.special_hours_version") && special.includes("special_hours_version = special_hours_version + 1")
    && special.includes("update public.restaurant_branch_temporal_state\n    set special_hours_version = special_hours_version + 1\n    where branch_id = p_branch_id;")
    && !/update public\.restaurant_branch_special_hour_overrides\s+set special_hours_version/.test(special));
  claim("CLEAR_OVERRIDE deletes the override row rather than storing an empty custom array",
    special.includes("if v_existing.id is not null then") && special.includes("delete from public.restaurant_branch_special_hour_overrides"));
  claim("special mutation vocabulary is exactly SET_CLOSED|SET_CUSTOM_HOURS|CLEAR_OVERRIDE",
    special.includes("p_operation not in ('SET_CLOSED', 'SET_CUSTOM_HOURS', 'CLEAR_OVERRIDE')"));

  // --- special precedence / spillover in the evaluator -----------------------------------------------
  claim("the evaluator checks previous-date spillover before current-date special/weekly",
    evaluator.indexOf("v_prev_date") < evaluator.indexOf("v_today_has_override"));
  claim("previous-date spillover prefers a special override over weekly for that anchor date",
    evaluator.includes("if v_prev_has_source then") && evaluator.includes("select o.mode into v_prev_mode"));
  claim("current-date special override fully replaces weekly (no merge) when present",
    evaluator.indexOf("if v_today_has_override then") >= 0
    && evaluator.lastIndexOf("select t.weekly_hours_configured into v_configured") >= 0
    && evaluator.indexOf("if v_today_has_override then")
      < evaluator.lastIndexOf("select t.weekly_hours_configured into v_configured"));
  claim("previous-date spillover, once detected, actually returns OPEN with the source-derived reason",
    evaluator.includes("if v_spillover then")
    && evaluator.includes("return query select 'OPEN'::text,\n      case when v_prev_has_source then 'OPEN_SPECIAL_HOURS' else 'OPEN_WEEKLY_HOURS' end;"));
  claim("spillover/containment use half-open semantics (>=/< , never <=)",
    evaluator.includes("v_local_time < i.end_local_time") && evaluator.includes("v_local_time >= i.start_local_time")
    && !/v_local_time\s*<=/.test(evaluator));

  // --- operational closure ---------------------------------------------------------------------------
  claim("btree_gist is installed for the partial exclusion constraint",
    has("create extension if not exists btree_gist;"));
  claim("the exclusion constraint scopes by branch_id and excludes only non-cancelled rows",
    has("exclude using gist (") && has("branch_id with =,") && has("where (cancelled_at is null)"));
  claim("ends_at IS NULL means indefinite (no coalesce-to-infinity hack in the constraint)",
    has("tstzrange(starts_at, ends_at, '[)')"));
  claim("closure rows are never deleted: cancel sets cancelled_at, reopen sets ends_at",
    !/delete from public\.restaurant_branch_operational_closures/i.test(bare));
  claim("CLOSE_NOW derives starts_at from pg_catalog.now(), never a caller parameter",
    closeNow.includes("v_now := pg_catalog.now();") && !/p_starts_at|p_now|p_clock/.test(bare));
  claim("SCHEDULE_CLOSURE requires the resolved start to be strictly in the future at the locked instant",
    schedule.includes("v_starts_at <= v_now"));
  claim("REOPEN_NOW sets ends_at to the DB instant and never deletes the row",
    reopen.includes("set ends_at = v_now where id = p_closure_id"));
  claim("CANCEL_FUTURE_CLOSURE only accepts a not-yet-started, non-cancelled row",
    cancel.includes("v_closure.starts_at <= v_now") && cancel.includes("v_closure.cancelled_at is not null"));
  claim("closure mutations require Restaurant/Admin lifecycle active and fail closed with lifecycle_blocked",
    closeNow.includes("'lifecycle_blocked'") && schedule.includes("'lifecycle_blocked'")
    && !reopen.includes("'lifecycle_blocked'") && !cancel.includes("'lifecycle_blocked'"));
  claim("closure mutations pre-check overlap and also catch a raw exclusion_violation as closure_conflict",
    closeNow.includes("'closure_conflict'") && closeNow.includes("exception when exclusion_violation")
    && schedule.includes("'closure_conflict'") && schedule.includes("exception when exclusion_violation"));
  claim("no closure RPC ever writes restaurant_branches (status or any other column)",
    [closeNow, schedule, reopen, cancel].every((body) => !body.includes("update public.restaurant_branches")));
  claim("every closure RPC checks its own stale version before proceeding",
    [closeNow, schedule, reopen, cancel].every((body) =>
      body.includes("v_target.operational_closure_version <> p_expected_version")));

  // --- DST / civil datetime -----------------------------------------------------------------------
  claim("the resolver enumerates candidates via round-trip verification, never trusting implicit resolution",
    resolve.includes("if (v_probe at time zone p_timezone) = p_local_datetime"));
  claim("the resolver never raises; every outcome is a bounded status value",
    !/raise exception/.test(resolve));
  claim("the resolver distinguishes nonexistent, unambiguous, and ambiguous-needs-fold outcomes",
    resolve.includes("'nonexistent'") && resolve.includes("'ambiguous_fold_required'")
    && resolve.includes("'unambiguous_fold_not_allowed'"));
  claim("fold disambiguation is only 'earlier' or 'later', validated up front",
    resolve.includes("p_fold not in ('earlier', 'later')"));

  // --- canonical evaluator --------------------------------------------------------------------------
  claim("the evaluator takes a deterministic p_at timestamptz and never calls now() itself",
    /p_at timestamptz/.test(bare) && !/select .*now\(\)/.test(evaluator));
  claim("Restaurant publication and Admin lifecycle are checked before any closure/hours logic",
    evaluator.indexOf("v_restaurant_status is distinct from 'active'") < evaluator.indexOf("if v_closure_active then"));
  claim("an active operational closure short-circuits before any special/weekly evaluation",
    evaluator.indexOf("if v_closure_active then") < evaluator.indexOf("v_local_date := "));
  claim("the evaluator returns exactly the 8 approved machine reasons and nothing else",
    H1_EVALUATOR_REASONS.every((reason) => evaluator.includes(`'${reason}'`)));
  claim("UNKNOWN is returned only when there is no override and weekly is unconfigured (never from zero rows alone)",
    evaluator.includes("if not coalesce(v_configured, false) then\n    return query select 'UNKNOWN'::text, 'HOURS_UNKNOWN'::text;"));

  // --- permissions and sealed roles --------------------------------------------------------------------
  const checkClause = /add constraint role_permissions_permission_key_check\s*\n\s*check \(permission_key in \(([\s\S]*?)\)\);/
    .exec(bare)?.[1] ?? "";
  const checkKeys = checkClause.split(",").map((k) => k.trim()).filter(Boolean);
  claim("the permission CHECK is widened by exactly this round's 3 keys, preserving every predecessor key",
    checkKeys.length === H1_LEGACY_PERMISSION_KEYS.length + H1_PERMISSION_KEYS.length
    && H1_PERMISSION_KEYS.every((key) => checkKeys.includes(`'${key}'`))
    && H1_LEGACY_PERMISSION_KEYS.every((key) => checkKeys.includes(`'${key}'`)),
    { checkKeys });
  claim("all 3 temporal permissions are seeded for owner at restaurant scope only",
    has("cross join (values") && has("where role.role_key = 'owner';"));
  claim("the seed suspends and restores FORCE row level security on both authority tables",
    has("alter table public.role_permissions no force row level security")
    && has("alter table public.restaurant_roles no force row level security")
    && has("alter table public.role_permissions force row level security")
    && has("alter table public.restaurant_roles force row level security"));
  claim("exactly four roles are created, all sealed NOLOGIN NOINHERIT NOBYPASSRLS",
    count("create role restaurant_owner_branch_weekly_hours_write_authority nologin noinherit nobypassrls;") === 1
    && count("create role restaurant_owner_branch_special_hours_write_authority nologin noinherit nobypassrls;") === 1
    && count("create role restaurant_owner_branch_operational_closure_write_authority nologin noinherit nobypassrls;") === 1
    && count("create role restaurant_branch_temporal_context_reader nologin noinherit nobypassrls;") === 1);
  claim("every transient creator membership is released before commit",
    H1_ROLES.every((role) => has(`revoke ${role} from postgres granted by postgres;`)));
  claim("every transient CREATE on schema public is released before commit",
    H1_ROLES.every((role) => has(`revoke create on schema public from ${role};`)));
  claim("no client role is ever granted membership of any temporal sealed role",
    H1_CLIENT_ROLES.every((client) => H1_ROLES.every((role) =>
      !new RegExp(`grant ${role} to ${client}\\b`).test(bare))));

  // --- least privilege -------------------------------------------------------------------------------
  claim("only the weekly writer can UPDATE weekly_hours_configured/weekly_hours_version",
    !new RegExp(`update \\([^)]*weekly_hours_(configured|version)[^)]*\\)\\s*\\n?\\s*on table public\\.restaurant_branch_temporal_state to (?!restaurant_owner_branch_weekly_hours_write_authority)`).test(bare));
  claim("only the special writer can UPDATE special_hours_version",
    has(`update (special_hours_version)\n  on table public.restaurant_branch_temporal_state to ${H1_SPECIAL_ROLE};`));
  claim("only the closure writer can UPDATE operational_closure_version",
    has(`update (operational_closure_version)\n  on table public.restaurant_branch_temporal_state to ${H1_CLOSURE_ROLE};`));
  claim("the reader role has zero UPDATE/INSERT/DELETE grant anywhere in this migration",
    !new RegExp(`(update|insert|delete)[^;]*to ${H1_READER_ROLE}\\b`).test(bare));
  claim("the closure writer's only restaurant_branches privilege is narrow SELECT (id, restaurant_id, status, timezone_name)",
    has(`grant select (id, restaurant_id, status, timezone_name) on table public.restaurant_branches\n  to ${H1_CLOSURE_ROLE};`)
    && !new RegExp(`update[^;]*restaurant_branches[^;]*to ${H1_CLOSURE_ROLE}`).test(bare));
  claim("no temporal role is granted table-level UPDATE on restaurant_branches",
    !new RegExp(`grant\\s+update\\s+on table public\\.restaurant_branches`).test(bare));
  claim("no temporal role is granted any privilege on branch_menu_items",
    !/restaurant_branch_(weekly_hours|special_hours|operational_closure)_write_authority[\s\S]{0,5}branch_menu_items|branch_menu_items[\s\S]{0,80}restaurant_owner_branch_(weekly_hours|special_hours|operational_closure)_write_authority/i.test(bare));

  // --- RLS enable+force on every new relation -------------------------------------------------------
  claim("every one of the 5 new business relations has RLS explicitly enabled and forced (not just policies)",
    H1_RELATIONS.slice(0, 5).every((rel) => {
      const table = rel.split(".")[1];
      return has(`alter table public.${table} enable row level security;`)
        && has(`alter table public.${table} force row level security;`);
    }));
  claim("every one of the 5 new audit relations has RLS explicitly enabled and forced",
    H1_RELATIONS.slice(5).every((rel) => {
      const table = rel.split(".")[1];
      return has(`alter table restaurant_internal.${table} enable row level security;`)
        && has(`alter table restaurant_internal.${table} force row level security;`);
    }));
  claim("audit relations carry an explicit writer SELECT+INSERT policy pair (grants alone are not enough under FORCE RLS)",
    count("_audit_log_writer_select") + count("_audit_intervals_writer_select") === 5
    && count("_audit_log_writer_insert") + count("_audit_intervals_writer_insert") === 5);
  claim("no update/delete policy exists on any temporal audit relation",
    !/create policy \w*audit\w*[\s\S]{0,220}?for (update|delete)/i.test(bare));
  claim("each of the 6 core tenant-narrowing policies is declared exactly `as restrictive`",
    ["restaurant_branch_temporal_state_tenant_select", "restaurant_branch_temporal_state_tenant_update",
     "restaurant_branch_weekly_hour_intervals_tenant_all", "restaurant_branch_special_hour_overrides_tenant_all",
     "restaurant_branch_special_hour_intervals_tenant_all", "restaurant_branch_operational_closures_tenant_all"
    ].every((policyName) => new RegExp(`create policy ${policyName}\\s+on [\\w.]+ as restrictive`).test(bare)));
  claim("restaurant_branches/restaurants each get their own new permissive+restrictive pair for the closure writer/reader",
    has("create policy restaurant_branches_temporal_select") && has("create policy restaurant_branches_temporal_tenant_select")
    && has("create policy restaurants_temporal_select") && has("create policy restaurants_temporal_tenant_select"));

  // --- RPC security posture -------------------------------------------------------------------------
  claim("every public RPC is SECURITY DEFINER with an empty search_path and row_security on",
    count("security definer\nset search_path = ''\nset row_security = 'on'") === H1_PUBLIC_FUNCTION_SIGNATURES.length);
  claim("no public RPC accepts a caller-supplied actor, membership, role, permission, or timezone "
    + "(the internal DST resolver's own p_timezone parameter is fed only from the branch's stored "
    + "value, never a public RPC parameter)",
    H1_PUBLIC_FUNCTION_SIGNATURES.every((sig) => {
      const params = bare.slice(bare.indexOf(`create function ${sig.split("(")[0]}(`),
        bare.indexOf(")", bare.indexOf(`create function ${sig.split("(")[0]}(`)) + 400);
      return !/p_actor|p_auth_user_id|p_user_id|p_membership_id|p_owner_id|p_timezone\b/.test(
        params.slice(0, params.indexOf("\nreturns")));
    }));
  claim("no generic JSON patch authority exists (no patch_temporal_settings or arbitrary field selector)",
    !/patch_temporal_settings|p_patch\b|p_field\b|p_column\b/i.test(bare));
  claim("privileges are settled before ownership moves to each RPC's sealed role (ACL ordering)",
    H1_PUBLIC_FUNCTION_SIGNATURES.every((sig) => {
      const name = sig.split("(")[0];
      const execIdx = bare.indexOf(`grant execute on function ${sig}`);
      const ownerIdx = bare.indexOf(`alter function ${sig}\n  owner to`);
      return execIdx >= 0 && ownerIdx >= 0 && execIdx < ownerIdx;
    }));
  claim("PUBLIC and every client role are revoked from every public RPC",
    count("from public, anon, authenticated, authenticator, service_role;") >= H1_PUBLIC_FUNCTION_SIGNATURES.length);
  claim("only authenticated is ever granted execute on a public RPC (never anon/service_role/authenticator)",
    count("  to authenticated;") === H1_PUBLIC_FUNCTION_SIGNATURES.length
    && !/grant execute[^;]*to (anon|service_role|authenticator)\b/.test(bare));
  claim("the result vocabulary never leaks a raw PostgreSQL exception (no bare RAISE EXCEPTION inside any public RPC body)",
    [preview, weekly, special, closeNow, schedule, reopen, cancel].every((body) => !/raise exception/.test(body)));

  // --- fail-closed epilogue -------------------------------------------------------------------------
  const epilogue = bare.slice(bare.lastIndexOf("do $$"));
  claim("the epilogue exists and every failure raises rather than warns",
    epilogue.includes("RA-2H-P1:") && !/raise warning/.test(bare));
  claim("the epilogue proves timezone NOT NULL and full pg_timezone_names recognition",
    epilogue.includes("timezone_name is not NOT NULL") && epilogue.includes("carry an unrecognized timezone"));
  claim("the epilogue proves all 4 sealed roles are exactly NOLOGIN NOINHERIT NOBYPASSRLS",
    epilogue.includes("rolcanlogin = false and rolinherit = false and rolbypassrls = false"));
  claim("the epilogue proves the transient creator membership was released for all 4 roles",
    epilogue.includes("a transient postgres membership into a temporal sealed role was not released"));
  claim("the epilogue proves no client role holds membership of any temporal sealed role",
    epilogue.includes("a client role holds membership of a temporal sealed role"));
  claim("the epilogue proves RLS enabled+forced on both the 5 audit and 5 business relations",
    epilogue.includes("not every temporal audit relation is RLS-enabled and FORCE-d")
    && epilogue.includes("not every temporal business relation is RLS-enabled and FORCE-d"));
  claim("the epilogue proves exactly 6 RESTRICTIVE tenant policies on the 5 core business tables",
    epilogue.includes("expected exactly 6 RESTRICTIVE temporal tenant policies"));
  claim("the epilogue proves RA-1C independence (no temporal role can UPDATE status/status_version)",
    epilogue.includes("a temporal role holds UPDATE on restaurant_branches.status or status_version"));
  claim("the epilogue proves RA-2A-F independence across every frozen column",
    epilogue.includes("a temporal role holds UPDATE on a frozen RA-2A-F column"));
  claim("the epilogue proves btree_gist is installed and the exclusion constraint exists",
    epilogue.includes("btree_gist extension is not installed")
    && epilogue.includes("operational closure exclusion constraint is missing"));

  return claims;
}
