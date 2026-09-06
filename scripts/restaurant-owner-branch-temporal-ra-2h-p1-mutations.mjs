#!/usr/bin/env node
// RA-2H-P1 mutation suite. A claim no mutant can break is decoration, not a test.
import { auditMigrationSource, readMigrationSource }
  from "./restaurant-owner-branch-temporal-ra-2h-p1-contract.mjs";

const SUITE = "restaurant-owner-branch-temporal-ra-2h-p1-mutations";
const source = readMigrationSource(process.cwd());

const baseline = auditMigrationSource(source);
const baselineFailures = baseline.filter((c) => !c.pass);

const MUTANTS = [
  // --- timezone -------------------------------------------------------------------------------------
  ["timezone gets a universal database default (silent Taiwanese hardcode)",
    "alter table public.restaurant_branches add column timezone_name text;",
    "alter table public.restaurant_branches add column timezone_name text default 'Asia/Taipei';"],
  ["timezone validation trusts a hand-written allowlist instead of pg_timezone_names",
    "if not exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name = new.timezone_name) then",
    "if new.timezone_name not in ('Asia/Taipei', 'America/Los_Angeles') then"],
  ["backfill verification removed, risking a silent NULL surviving to NOT NULL",
    "raise exception 'RA-2H-P1: % branch rows still lack a timezone after backfill', v_unset;", "null;"],
  ["the timezone trigger revalidates on every update, not only a real change",
    "if tg_op = 'UPDATE' and new.timezone_name is not distinct from old.timezone_name then",
    "if false then"],
  ["a weekly/special/closure RPC accepts a caller-supplied timezone parameter",
    "  p_expected_version bigint\n)\nreturns jsonb\nlanguage plpgsql\nvolatile\nsecurity definer\nset search_path = ''\nset row_security = 'on'\nas $$\ndeclare\n  v_actor uuid;\n  v_membership_id uuid;\n  v_target record;\n  v_elem jsonb;\n  v_key text;\n  v_next_configured boolean;",
    "  p_expected_version bigint,\n  p_timezone text\n)\nreturns jsonb\nlanguage plpgsql\nvolatile\nsecurity definer\nset search_path = ''\nset row_security = 'on'\nas $$\ndeclare\n  v_actor uuid;\n  v_membership_id uuid;\n  v_target record;\n  v_elem jsonb;\n  v_key text;\n  v_next_configured boolean;"],

  // --- weekday / interval shape -----------------------------------------------------------------------
  ["weekday bound becomes 0..6 (off-by-one), matching the incompatible superseded draft",
    "constraint restaurant_branch_weekly_hour_intervals_weekday_check check (weekday between 1 and 7),",
    "constraint restaurant_branch_weekly_hour_intervals_weekday_check check (weekday between 0 and 6),"],
  ["the shape check drops the overnight branch, collapsing to a single-interval same-day-only schema",
    "    or (end_day_offset = 1 and start_local_time > end_local_time)\n    or (end_day_offset = 1 and start_local_time = '00:00:00' and end_local_time = '00:00:00')\n  )\n);\ncreate index restaurant_branch_weekly_hour_intervals_branch_idx",
    "  )\n);\ncreate index restaurant_branch_weekly_hour_intervals_branch_idx"],
  ["the shape check accepts a zero-length same-day interval (start<=end instead of start<end)",
    "(end_day_offset = 0 and start_local_time < end_local_time)\n    or (end_day_offset = 1 and start_local_time > end_local_time)\n    or (end_day_offset = 1 and start_local_time = '00:00:00' and end_local_time = '00:00:00')\n  )\n);\ncreate index restaurant_branch_weekly_hour_intervals_branch_idx",
    "(end_day_offset = 0 and start_local_time <= end_local_time)\n  )\n);\ncreate index restaurant_branch_weekly_hour_intervals_branch_idx"],
  ["any offset-1 equal-time pair is accepted as 24h, not only 00:00->00:00 (ambiguous encoding)",
    "or (end_day_offset = 1 and start_local_time = '00:00:00' and end_local_time = '00:00:00')\n  )\n);\ncreate index restaurant_branch_weekly_hour_intervals_branch_idx",
    "or (end_day_offset = 1 and start_local_time = end_local_time)\n  )\n);\ncreate index restaurant_branch_weekly_hour_intervals_branch_idx"],
  ["the weekly composite unique constraint is removed, allowing exact duplicate rows",
    "constraint restaurant_branch_weekly_hour_intervals_unique\n    unique (branch_id, weekday, start_local_time, end_day_offset, end_local_time),\n  constraint restaurant_branch_weekly_hour_intervals_weekday_check",
    "constraint restaurant_branch_weekly_hour_intervals_weekday_check"],

  // --- overlap guards ------------------------------------------------------------------------------
  ["the weekly overlap trigger is downgraded to skip the Sunday-Monday circular shift",
    "cross join (values (-10080), (0), (10080)) as shift(s)\n    where a.branch_id = new.branch_id",
    "cross join (values (0)) as shift(s)\n    where a.branch_id = new.branch_id"],
  ["the weekly overlap trigger is quietly dropped (create trigger removed)",
    "create trigger restaurant_branch_weekly_hour_intervals_overlap_guard\n  after insert or update on public.restaurant_branch_weekly_hour_intervals\n  for each row execute function restaurant_internal.restaurant_branch_weekly_hours_overlap_guard();",
    ""],
  ["the RPC's own overlap pre-check is silently dropped, relying on the trigger alone",
    "    if exists (\n      select 1\n      from pg_catalog.jsonb_to_recordset(p_intervals)\n        as a(weekday smallint, \"startLocalTime\" time, \"endLocalTime\" time, \"endDayOffset\" smallint)\n      join pg_catalog.jsonb_to_recordset(p_intervals)\n        as b(weekday smallint, \"startLocalTime\" time, \"endLocalTime\" time, \"endDayOffset\" smallint)\n        on true\n      cross join (values (-10080), (0), (10080)) as shift(s)\n      where (a.weekday, a.\"startLocalTime\", a.\"endDayOffset\", a.\"endLocalTime\")\n          < (b.weekday, b.\"startLocalTime\", b.\"endDayOffset\", b.\"endLocalTime\")\n        and (a.weekday - 1) * 1440 + pg_catalog.date_part('epoch', a.\"startLocalTime\")::integer / 60\n          < (b.weekday - 1) * 1440 + pg_catalog.date_part('epoch', b.\"endLocalTime\")::integer / 60\n            + b.\"endDayOffset\" * 1440 + shift.s\n        and (b.weekday - 1) * 1440 + pg_catalog.date_part('epoch', b.\"startLocalTime\")::integer / 60 + shift.s\n          < (a.weekday - 1) * 1440 + pg_catalog.date_part('epoch', a.\"endLocalTime\")::integer / 60\n            + a.\"endDayOffset\" * 1440\n    ) then\n      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');\n    end if;\n\n    if (select pg_catalog.count(*) from pg_catalog.jsonb_to_recordset(p_intervals)",
    "    if (select pg_catalog.count(*) from pg_catalog.jsonb_to_recordset(p_intervals)"],
  ["the weekly limit check silently allows more than 56 per week",
    "if v_candidate_count > 56 then", "if v_candidate_count > 5600 then"],
  ["the per-weekday limit check silently allows more than 8",
    "if v_weekday_counts[v_weekday] > 8 then", "if v_weekday_counts[v_weekday] > 800 then"],

  // --- weekly configured/UNKNOWN & canonicalization --------------------------------------------------
  ["REPLACE with an empty array is silently coerced to CLEAR (UNKNOWN), erasing the closed-all-week state",
    "v_next_configured := true;\n  else\n    v_next_configured := false;\n  end if;",
    "v_next_configured := v_candidate_count > 0;\n  else\n    v_next_configured := false;\n  end if;"],
  ["canonical no_change compares raw input order instead of canonical order",
    "if v_next_configured = v_target.weekly_hours_configured and v_next_canonical = v_current_canonical then",
    "if false then"],
  ["weekly version advances even on a canonical no_change",
    "return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');\n  end if;\n\n  delete from public.restaurant_branch_weekly_hour_intervals where branch_id = p_branch_id;",
    "update public.restaurant_branch_temporal_state set weekly_hours_version = weekly_hours_version + 1 where branch_id = p_branch_id;\n  end if;\n\n  delete from public.restaurant_branch_weekly_hour_intervals where branch_id = p_branch_id;"],
  ["weekly stale check uses <> tolerance instead of exact version equality (accepts a lower version)",
    "if v_target.weekly_hours_version <> p_expected_version then",
    "if v_target.weekly_hours_version > p_expected_version then"],

  // --- special dates ---------------------------------------------------------------------------------
  ["special custom hours accept an empty array as valid (inferred closed, contrary to the frozen contract)",
    "if v_candidate_count < 1 or v_candidate_count > 8 then",
    "if v_candidate_count > 8 then"],
  ["special adopts a PER-DATE version instead of the frozen branch-level shared token",
    "update public.restaurant_branch_temporal_state\n    set special_hours_version = special_hours_version + 1\n    where branch_id = p_branch_id;",
    "update public.restaurant_branch_special_hour_overrides\n    set special_hours_version = special_hours_version + 1\n    where local_date = p_local_date;"],
  ["CLEAR_OVERRIDE stores an empty custom array instead of deleting the override row",
    "  if v_existing.id is not null then\n    delete from public.restaurant_branch_special_hour_overrides where id = v_existing.id;\n  end if;",
    "  null;"],
  ["the special operation vocabulary is widened beyond SET_CLOSED|SET_CUSTOM_HOURS|CLEAR_OVERRIDE",
    "or p_operation not in ('SET_CLOSED', 'SET_CUSTOM_HOURS', 'CLEAR_OVERRIDE')", "or false"],

  // --- evaluator precedence / spillover / merging -----------------------------------------------------
  ["a special override for the current date is merged with weekly instead of fully replacing it",
    "  if v_today_has_override then\n    if v_today_mode = 'closed' then\n      return query select 'CLOSED'::text, 'SPECIAL_DATE_CLOSED'::text;\n      return;\n    end if;",
    "  if false then\n    if v_today_mode = 'closed' then\n      return query select 'CLOSED'::text, 'SPECIAL_DATE_CLOSED'::text;\n      return;\n    end if;"],
  ["previous-date spillover check is skipped entirely, breaking overnight service across midnight",
    "  if v_spillover then\n    return query select 'OPEN'::text,\n      case when v_prev_has_source then 'OPEN_SPECIAL_HOURS' else 'OPEN_WEEKLY_HOURS' end;\n    return;\n  end if;",
    "  if false then\n    return query select 'OPEN'::text, 'OPEN_WEEKLY_HOURS'::text;\n    return;\n  end if;"],
  ["Admin lifecycle block is checked AFTER operational closure instead of before it",
    "  if v_restaurant_status is distinct from 'active' or v_branch_status is distinct from 'active' then\n    return query select 'CLOSED'::text, 'ADMIN_LIFECYCLE_BLOCKED'::text;\n    return;\n  end if;\n\n  select exists (",
    "  select exists ("],
  ["UNKNOWN is manufactured as CLOSED merely because there are zero interval rows",
    "if not coalesce(v_configured, false) then\n    return query select 'UNKNOWN'::text, 'HOURS_UNKNOWN'::text;\n    return;\n  end if;",
    "if not coalesce(v_configured, false) then\n    return query select 'CLOSED'::text, 'HOURS_UNKNOWN'::text;\n    return;\n  end if;"],
  ["the 24h boundary check uses <= instead of < for containment, letting the 24h interval leak into the next day",
    "(w.end_day_offset = 0 and v_local_time >= w.start_local_time and v_local_time < w.end_local_time)",
    "(w.end_day_offset = 0 and v_local_time >= w.start_local_time and v_local_time <= w.end_local_time)"],

  // --- operational closure -----------------------------------------------------------------------------
  ["CLOSE_NOW derives starts_at from a caller-influenced value instead of pg_catalog.now()",
    "v_now := pg_catalog.now();\n  v_ends_at := null;\n\n  if p_operation = 'CLOSE_NOW_UNTIL' then",
    "v_now := coalesce(p_until_local_datetime::timestamptz, pg_catalog.now());\n  v_ends_at := null;\n\n  if p_operation = 'CLOSE_NOW_UNTIL' then"],
  ["operational closure is allowed to overlap another effective window (conflict pre-check removed)",
    "  if exists (\n    select 1 from public.restaurant_branch_operational_closures c\n    where c.branch_id = p_branch_id and c.cancelled_at is null\n      and c.starts_at <= v_now and (c.ends_at is null or c.ends_at > v_now)\n  ) then\n    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'closure_conflict');\n  end if;\n\n  begin\n    insert into public.restaurant_branch_operational_closures (branch_id, starts_at, ends_at)\n      values (p_branch_id, v_now, v_ends_at)\n      returning id into v_closure_id;\n  exception when exclusion_violation then\n    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'closure_conflict');\n  end;",
    "  insert into public.restaurant_branch_operational_closures (branch_id, starts_at, ends_at)\n      values (p_branch_id, v_now, v_ends_at)\n      returning id into v_closure_id;"],
  ["closure mutation writes restaurant_branches.status directly",
    "  insert into restaurant_internal.branch_operational_closure_audit_log\n    (actor_auth_user_id, membership_id, restaurant_id, branch_id, closure_id, operation,\n     previous_starts_at, previous_ends_at, previous_cancelled_at,\n     next_starts_at, next_ends_at, next_cancelled_at, previous_version, next_version)\n  values (v_actor, v_membership_id, v_target.restaurant_id, p_branch_id, v_closure_id, p_operation,\n     null, null, null, v_now, v_ends_at, null,\n     v_target.operational_closure_version, v_target.operational_closure_version + 1)\n  returning id into v_audit_id;",
    "  update public.restaurant_branches set status = 'active' where id = p_branch_id;\n  insert into restaurant_internal.branch_operational_closure_audit_log\n    (actor_auth_user_id, membership_id, restaurant_id, branch_id, closure_id, operation,\n     previous_starts_at, previous_ends_at, previous_cancelled_at,\n     next_starts_at, next_ends_at, next_cancelled_at, previous_version, next_version)\n  values (v_actor, v_membership_id, v_target.restaurant_id, p_branch_id, v_closure_id, p_operation,\n     null, null, null, v_now, v_ends_at, null,\n     v_target.operational_closure_version, v_target.operational_closure_version + 1)\n  returning id into v_audit_id;"],
  ["closure mutations skip the Restaurant/Admin lifecycle gate entirely, letting Owner reopen a blocked branch",
    "  if v_target.restaurant_status is distinct from 'active' or v_target.branch_status is distinct from 'active' then\n    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'lifecycle_blocked');\n  end if;\n\n  v_now := pg_catalog.now();\n  v_ends_at := null;",
    "  v_now := pg_catalog.now();\n  v_ends_at := null;"],
  ["REOPEN_NOW deletes the closure row instead of setting ends_at (loses history)",
    "  update public.restaurant_branch_operational_closures\n    set ends_at = v_now where id = p_closure_id;",
    "  delete from public.restaurant_branch_operational_closures where id = p_closure_id;"],
  ["CANCEL_FUTURE_CLOSURE accepts an already-started closure",
    "  if v_closure.starts_at <= v_now then\n    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');\n  end if;",
    "  null;"],
  ["closure stale check is removed, accepting a mismatched expected version",
    "if v_target.operational_closure_version <> p_expected_version then\n    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');\n  end if;\n\n  if v_target.restaurant_status is distinct from 'active' or v_target.branch_status is distinct from 'active' then\n    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'lifecycle_blocked');\n  end if;\n\n  v_now := pg_catalog.now();\n  v_ends_at := null;\n\n  if p_operation = 'CLOSE_NOW_UNTIL' then",
    "  if v_target.restaurant_status is distinct from 'active' or v_target.branch_status is distinct from 'active' then\n    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'lifecycle_blocked');\n  end if;\n\n  v_now := pg_catalog.now();\n  v_ends_at := null;\n\n  if p_operation = 'CLOSE_NOW_UNTIL' then"],

  // --- DST ------------------------------------------------------------------------------------------
  ["the DST resolver trusts PostgreSQL's own direct conversion without round-trip verification",
    "if (v_probe at time zone p_timezone) = p_local_datetime and not (v_probe = any (v_distinct)) then",
    "if not (v_probe = any (v_distinct)) then"],
  ["fold validation is removed, accepting an arbitrary fold string",
    "if p_fold is not null and p_fold not in ('earlier', 'later') then\n    return query select 'invalid_fold', null::timestamptz;\n    return;\n  end if;",
    "null;"],

  // --- least privilege / cross-writer isolation ---------------------------------------------------------
  ["the closure writer is granted UPDATE on weekly_hours_version",
    "grant select (branch_id, restaurant_id, operational_closure_version),\n      update (operational_closure_version)\n  on table public.restaurant_branch_temporal_state to restaurant_owner_branch_operational_closure_write_authority;",
    "grant select (branch_id, restaurant_id, operational_closure_version, weekly_hours_version),\n      update (operational_closure_version, weekly_hours_version)\n  on table public.restaurant_branch_temporal_state to restaurant_owner_branch_operational_closure_write_authority;"],
  ["the reader role is granted table-level UPDATE on temporal_state",
    "create policy restaurant_branch_temporal_state_reader_select\n  on public.restaurant_branch_temporal_state for select\n  to restaurant_branch_temporal_context_reader using (true);",
    "create policy restaurant_branch_temporal_state_reader_select\n  on public.restaurant_branch_temporal_state for select\n  to restaurant_branch_temporal_context_reader using (true);\ngrant update (weekly_hours_version) on table public.restaurant_branch_temporal_state to restaurant_branch_temporal_context_reader;"],
  ["a temporal writer is granted UPDATE on branch_menu_items.price",
    "grant select (id, restaurant_id, status, timezone_name) on table public.restaurant_branches\n  to restaurant_owner_branch_operational_closure_write_authority;",
    "grant select (id, restaurant_id, status, timezone_name) on table public.restaurant_branches\n  to restaurant_owner_branch_operational_closure_write_authority;\ngrant update (price) on table public.branch_menu_items to restaurant_owner_branch_operational_closure_write_authority;"],
  ["a temporal writer is granted UPDATE on restaurant_branches.status",
    "grant select (id, restaurant_id, status, timezone_name) on table public.restaurant_branches\n  to restaurant_owner_branch_operational_closure_write_authority;",
    "grant select (id, restaurant_id, status, timezone_name) on table public.restaurant_branches\n  to restaurant_owner_branch_operational_closure_write_authority;\ngrant update (status) on table public.restaurant_branches to restaurant_owner_branch_operational_closure_write_authority;"],
  ["a client role (authenticated) is granted membership of a sealed temporal writer",
    "revoke restaurant_owner_branch_weekly_hours_write_authority from postgres granted by postgres;",
    "grant restaurant_owner_branch_weekly_hours_write_authority to authenticated;\nrevoke restaurant_owner_branch_weekly_hours_write_authority from postgres granted by postgres;"],

  // --- RLS ------------------------------------------------------------------------------------------
  ["RLS is never enabled on the weekly interval table (policies created but inert)",
    "alter table public.restaurant_branch_weekly_hour_intervals enable row level security;\nalter table public.restaurant_branch_weekly_hour_intervals force row level security;",
    ""],
  ["the tenant-narrowing policy on temporal_state is downgraded from RESTRICTIVE to permissive",
    "create policy restaurant_branch_temporal_state_tenant_select\n  on public.restaurant_branch_temporal_state as restrictive for select",
    "create policy restaurant_branch_temporal_state_tenant_select\n  on public.restaurant_branch_temporal_state for select"],
  ["audit table gains an UPDATE policy (should be append-only, immutable)",
    "create policy branch_weekly_hours_audit_log_writer_insert",
    "create policy branch_weekly_hours_audit_log_writer_update\n  on restaurant_internal.branch_weekly_hours_audit_log\n  for update to restaurant_owner_branch_weekly_hours_write_authority using (true);\ncreate policy branch_weekly_hours_audit_log_writer_insert"],

  // --- generic patch / ACL ordering ------------------------------------------------------------------
  ["a generic patch_temporal_settings-style function name sneaks into the RPC manifest",
    "create function public.restaurant_owner_replace_branch_weekly_hours_v1(",
    "create function public.restaurant_owner_patch_temporal_settings_v1(jsonb) returns jsonb language sql as $inert$ select '{}'::jsonb $inert$;\ncreate function public.restaurant_owner_replace_branch_weekly_hours_v1("],
  ["EXECUTE on a public RPC is granted to anon",
    "grant execute on function public.restaurant_owner_reopen_branch_now_v1(text, text, uuid, bigint)\n  to authenticated;",
    "grant execute on function public.restaurant_owner_reopen_branch_now_v1(text, text, uuid, bigint)\n  to anon;"],
  ["ownership moves to the sealed role BEFORE privileges are settled (revokes silently no-op)",
    "revoke all on function public.restaurant_owner_cancel_future_branch_closure_v1(text, text, uuid, bigint)\n  from public, anon, authenticated, authenticator, service_role;",
    "alter function public.restaurant_owner_cancel_future_branch_closure_v1(text, text, uuid, bigint)\n  owner to restaurant_owner_branch_operational_closure_write_authority;\nrevoke all on function public.restaurant_owner_cancel_future_branch_closure_v1(text, text, uuid, bigint)\n  from public, anon, authenticated, authenticator, service_role;"],

  // --- fail-closed epilogue -----------------------------------------------------------------------------
  ["epilogue timezone-NOT-NULL check downgraded to a warning",
    "raise exception 'RA-2H-P1: restaurant_branches.timezone_name is not NOT NULL';",
    "raise warning 'RA-2H-P1: restaurant_branches.timezone_name is not NOT NULL';"],
  ["epilogue stops proving RA-1C independence",
    "raise exception 'RA-2H-P1: a temporal role holds UPDATE on restaurant_branches.status or status_version';",
    "null;"],
  ["epilogue stops proving RA-2A-F independence",
    "raise exception 'RA-2H-P1: a temporal role holds UPDATE on a frozen RA-2A-F column';", "null;"],
  ["epilogue stops proving btree_gist/exclusion-constraint presence",
    "raise exception 'RA-2H-P1: btree_gist extension is not installed';", "null;"],
  ["the migration stops being a single transaction",
    "\ncommit;\n", "\n"]
];

const results = [];
const report = (status, name, detail) => {
  results.push({ status, name, ...(detail === undefined ? {} : { detail }) });
  const label = status === "killed" ? "KILL" : status === "survived" ? "SURV" : "STAL";
  console.log(`${label} ${String(results.length).padStart(2, "0")} ${name}`);
  if (status !== "killed" && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 300)}`);
};

for (const [name, find, replace] of MUTANTS) {
  if (!source.includes(find)) { report("stale", name, { find: find.slice(0, 120) }); continue; }
  const mutated = source.replace(find, replace);
  if (mutated === source) { report("stale", name, { reason: "edit produced identical source" }); continue; }
  const broken = auditMigrationSource(mutated).filter((c) => !c.pass).map((c) => c.name);
  const newlyBroken = broken.filter((n) => !baselineFailures.some((b) => b.name === n));
  if (newlyBroken.length === 0) report("survived", name, { broken });
  else report("killed", name);
}

const killed = results.filter((r) => r.status === "killed").length;
const survived = results.filter((r) => r.status === "survived");
const stale = results.filter((r) => r.status === "stale");
const ok = baselineFailures.length === 0 && survived.length === 0 && stale.length === 0;

console.log("\n" + JSON.stringify({
  suite: SUITE,
  status: ok ? "passed" : "failed",
  baselineClaims: baseline.length,
  baselineFailures: baselineFailures.map((c) => c.name),
  total: results.length,
  killed,
  survived: survived.map((r) => r.name),
  stale: stale.map((r) => r.name)
}, null, 2));
process.exitCode = ok ? 0 : 1;
