#!/usr/bin/env node
// RA-2D-P1 mutation suite.
//
// A claim no mutant can break is decoration, not a test. This suite corrupts the frozen migration
// source one edit at a time, in memory, and requires every corruption to be caught by at least one
// contract claim. A mutant that survives is a hole in the contract; a mutant whose edit does not
// apply is STALE, which is a failure too.
import { auditMigrationSource, readMigrationSource }
  from "./restaurant-owner-visibility-ra-2d-p1-contract.mjs";

const SUITE = "restaurant-owner-visibility-ra-2d-p1-mutations";
const source = readMigrationSource(process.cwd());

const baseline = auditMigrationSource(source);
const baselineFailures = baseline.filter((c) => !c.pass);

const MUTANTS = [
  // --- permission vocabulary ---------------------------------------------------------------------
  ["permission key silently renamed",
    "'branch_menu_item.visibility.write', 'restaurant'", "'branch_menu_item.state.write', 'restaurant'"],
  ["permission granted at branch scope instead of restaurant",
    "'branch_menu_item.visibility.write', 'restaurant'", "'branch_menu_item.visibility.write', 'branch'"],
  ["permission seeded for manager as well as owner",
    "where role.role_key = 'owner';", "where role.role_key in ('owner', 'manager');"],
  ["a predecessor permission key dropped from the widened CHECK",
    "    'branch_menu_item.price.write',\n", ""],
  ["FORCE row level security never suspended for the seed",
    "alter table public.role_permissions no force row level security;", ""],
  ["FORCE row level security never restored after the seed",
    "alter table public.role_permissions force row level security;\nalter table public.restaurant_roles force row level security;", ""],
  ["seed row-count verification removed",
    "raise exception 'RA-2D-P1: expected exactly one visibility permission row, found %', v_total;",
    "null;"],
  ["predecessor permission preservation check removed",
    "raise exception 'RA-2D-P1: a frozen predecessor permission row was disturbed';", "null;"],

  // --- the version token and the discontinued boundary ---------------------------------------------
  ["version advances on every write, not only a status change",
    "    new.branch_specific_status_version := old.branch_specific_status_version + 1;\n  else\n    new.branch_specific_status_version := old.branch_specific_status_version;",
    "    new.branch_specific_status_version := old.branch_specific_status_version + 1;\n  else\n    new.branch_specific_status_version := old.branch_specific_status_version + 1;"],
  ["version never advances",
    "new.branch_specific_status_version := old.branch_specific_status_version + 1;",
    "new.branch_specific_status_version := old.branch_specific_status_version;"],
  ["INSERT no longer seeded at zero",
    "    new.branch_specific_status_version := 0;\n    return new;", "    return new;"],
  ["trigger loses its pinned empty search_path",
    "returns trigger\nlanguage plpgsql\nset search_path = ''", "returns trigger\nlanguage plpgsql"],
  ["trigger fires only on UPDATE, so inserts skip version seeding",
    "before insert or update on public.branch_menu_items", "before update on public.branch_menu_items"],
  ["version column made nullable",
    "add column branch_specific_status_version bigint not null default 0",
    "add column branch_specific_status_version bigint default 0"],
  ["version non-negative constraint removed",
    "  add constraint branch_menu_items_branch_specific_status_version_non_negative\n  check (branch_specific_status_version >= 0);", ""],
  ["a trigger-level transition restriction reintroduced, coupling this round to discontinued's future governance",
    "  if new.branch_specific_status is distinct from old.branch_specific_status then",
    "  if new.branch_specific_status = 'discontinued' or old.branch_specific_status = 'discontinued' then\n    raise exception 'blocked';\n  elsif new.branch_specific_status is distinct from old.branch_specific_status then"],
  ["a naive table CHECK on branch_specific_status reintroduced",
    "  add constraint branch_menu_items_branch_specific_status_version_non_negative\n  check (branch_specific_status_version >= 0);",
    "  add constraint branch_menu_items_branch_specific_status_version_non_negative\n  check (branch_specific_status_version >= 0);\nalter table public.branch_menu_items add constraint branch_menu_items_visibility_lock check (branch_specific_status <> 'discontinued');"],

  // --- the sealed role -----------------------------------------------------------------------------
  ["sealed role given LOGIN",
    "create role restaurant_owner_branch_menu_item_visibility_write_authority\n  nologin",
    "create role restaurant_owner_branch_menu_item_visibility_write_authority\n  login"],
  ["sealed role given INHERIT", "  nologin\n  noinherit\n  nobypassrls;", "  nologin\n  inherit\n  nobypassrls;"],
  ["sealed role given BYPASSRLS", "  nologin\n  noinherit\n  nobypassrls;", "  nologin\n  noinherit\n  bypassrls;"],
  ["transient membership granted WITH ADMIN",
    "with admin false, inherit false, set true;", "with admin true, inherit false, set true;"],
  ["transient membership never released",
    "revoke restaurant_owner_branch_menu_item_visibility_write_authority\n  from postgres granted by postgres;", ""],
  ["transient CREATE on schema public never released",
    "revoke create on schema public\n  from restaurant_owner_branch_menu_item_visibility_write_authority;", ""],
  ["sealed role handed to a client role",
    "grant usage on schema restaurant_internal\n  to restaurant_owner_branch_menu_item_visibility_write_authority;",
    "grant usage on schema restaurant_internal\n  to restaurant_owner_branch_menu_item_visibility_write_authority;\ngrant restaurant_owner_branch_menu_item_visibility_write_authority to authenticated;"],
  ["a predecessor role altered by this migration",
    "create role restaurant_owner_branch_menu_item_visibility_write_authority",
    "alter role restaurant_owner_branch_menu_item_price_write_authority nobypassrls;\ncreate role restaurant_owner_branch_menu_item_visibility_write_authority"],

  // --- least privilege -----------------------------------------------------------------------------
  ["column UPDATE widened to the whole table",
    "grant update (branch_specific_status)\n  on table public.branch_menu_items",
    "grant update\n  on table public.branch_menu_items"],
  ["writer allowed to write the version counter",
    "grant update (branch_specific_status)\n  on table public.branch_menu_items",
    "grant update (branch_specific_status, branch_specific_status_version)\n  on table public.branch_menu_items"],
  ["writer allowed to write sold_out",
    "grant update (branch_specific_status)\n  on table public.branch_menu_items",
    "grant update (branch_specific_status, sold_out)\n  on table public.branch_menu_items"],
  ["writer allowed to write availability",
    "grant update (branch_specific_status)\n  on table public.branch_menu_items",
    "grant update (branch_specific_status, availability)\n  on table public.branch_menu_items"],
  ["writer allowed to write price",
    "grant update (branch_specific_status)\n  on table public.branch_menu_items",
    "grant update (branch_specific_status, price)\n  on table public.branch_menu_items"],
  ["a frozen predecessor writer widened to branch_specific_status",
    "grant update (branch_specific_status)\n  on table public.branch_menu_items\n  to restaurant_owner_branch_menu_item_visibility_write_authority;",
    "grant update (branch_specific_status)\n  on table public.branch_menu_items\n  to restaurant_owner_branch_menu_item_visibility_write_authority;\ngrant update (branch_specific_status) on table public.branch_menu_items to restaurant_owner_branch_menu_item_price_write_authority;"],

  // --- audit ---------------------------------------------------------------------------------------
  ["audit relation loses FORCE row level security",
    "alter table restaurant_internal.branch_menu_item_visibility_audit_log\n  force row level security;", ""],
  ["audit relation gains an UPDATE policy",
    "revoke all on table restaurant_internal.branch_menu_item_visibility_audit_log",
    "create policy branch_menu_item_visibility_audit_log_writer_update\n  on restaurant_internal.branch_menu_item_visibility_audit_log\n  for update to restaurant_owner_branch_menu_item_visibility_write_authority using (true);\nrevoke all on table restaurant_internal.branch_menu_item_visibility_audit_log"],
  ["audit relation exposed to a client role",
    "revoke all on table restaurant_internal.branch_menu_item_visibility_audit_log\n  from public, anon, authenticated, authenticator, service_role;", ""],
  ["no-op transitions become auditable",
    "    check (previous_status <> next_status),", "    check (previous_status = previous_status),"],
  ["discontinued allowed into the audited previous_status",
    "    check (previous_status in ('available', 'hidden')),", "    check (previous_status is not null),"],
  ["discontinued allowed into the audited next_status",
    "    check (next_status in ('available', 'hidden')),", "    check (next_status is not null),"],
  ["audit version advance no longer exactly one",
    "    check (next_version = previous_version + 1),", "    check (next_version >= previous_version),"],
  ["actor taken from a caller-supplied parameter",
    "  p_expected_version bigint\n)\nreturns jsonb\nlanguage plpgsql\nvolatile",
    "  p_expected_version bigint,\n  p_actor uuid\n)\nreturns jsonb\nlanguage plpgsql\nvolatile"],

  // --- row level security ------------------------------------------------------------------------------
  ["tenant SELECT policy downgraded from RESTRICTIVE to permissive",
    "create policy branch_menu_items_owner_visibility_tenant_select\n  on public.branch_menu_items\n  as restrictive",
    "create policy branch_menu_items_owner_visibility_tenant_select\n  on public.branch_menu_items"],
  ["tenant UPDATE policy downgraded from RESTRICTIVE to permissive",
    "create policy branch_menu_items_owner_visibility_tenant_update\n  on public.branch_menu_items\n  as restrictive",
    "create policy branch_menu_items_owner_visibility_tenant_update\n  on public.branch_menu_items"],
  ["permissive visibility policies dropped, leaving restrictive-only which grants nothing",
    "create policy branch_menu_items_owner_visibility_select\n  on public.branch_menu_items\n  for select to restaurant_owner_branch_menu_item_visibility_write_authority\n  using (true);\n", ""],
  ["permissive UPDATE policy stops constraining the written value",
    "  with check (branch_specific_status in ('available', 'hidden'));", "  with check (true);"],
  ["permissive UPDATE policy allows writing discontinued",
    "  with check (branch_specific_status in ('available', 'hidden'));",
    "  with check (branch_specific_status in ('available', 'hidden', 'discontinued'));"],
  ["tenant policy stops requiring the owner role key",
    "        and role.role_key = 'owner'\n        and permission.permission_key = 'branch_menu_item.visibility.write'",
    "        and permission.permission_key = 'branch_menu_item.visibility.write'"],
  ["tenant policy stops requiring this round's permission",
    "        and permission.permission_key = 'branch_menu_item.visibility.write'\n        and permission.permission_scope = 'restaurant'",
    "        and permission.permission_scope = 'restaurant'"],
  ["restrictive UPDATE policy loses its WITH CHECK half",
    "  )\n  with check (\n    exists (\n      select 1\n      from public.restaurant_users as caller\n      join public.restaurant_memberships as membership\n        on membership.restaurant_user_id = caller.id\n      join public.restaurant_roles as role\n        on role.id = membership.role_id\n      join public.role_permissions as permission\n        on permission.role_id = role.id\n      where caller.auth_user_id = (\n          coalesce(\n            nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),\n            (\n              nullif(pg_catalog.current_setting('request.jwt.claims', true), '')\n                ::pg_catalog.jsonb ->> 'sub'\n            )\n          )\n        )::pg_catalog.uuid\n        and caller.login_status = 'enabled'\n        and membership.status = 'active'\n        and membership.restaurant_id = branch_menu_items.restaurant_id\n        and role.status = 'active'\n        and role.role_key = 'owner'\n        and permission.permission_key = 'branch_menu_item.visibility.write'\n        and permission.permission_scope = 'restaurant'\n    )\n  );",
    "  );"],

  // --- the RPCs -----------------------------------------------------------------------------------------
  ["preview downgraded from STABLE to VOLATILE",
    ")\nreturns jsonb\nlanguage plpgsql\nstable\nsecurity definer", ")\nreturns jsonb\nlanguage plpgsql\nvolatile\nsecurity definer"],
  ["mutation loses SECURITY DEFINER",
    "returns jsonb\nlanguage plpgsql\nvolatile\nsecurity definer", "returns jsonb\nlanguage plpgsql\nvolatile"],
  ["an RPC loses its pinned empty search_path",
    "volatile\nsecurity definer\nset search_path = ''", "volatile\nsecurity definer"],
  ["preview trusts row level security instead of joining the caller's membership chain",
    "  join public.restaurant_memberships as membership\n    on membership.restaurant_id = item.restaurant_id\n   and membership.status = 'active'\n  join public.restaurant_users as caller\n    on caller.id = membership.restaurant_user_id\n   and caller.auth_user_id = v_actor\n   and caller.login_status = 'enabled'\n  join public.restaurant_roles as role\n    on role.id = membership.role_id\n   and role.status = 'active'\n   and role.role_key = 'owner'\n  join public.role_permissions as permission\n    on permission.role_id = role.id\n   and permission.permission_key = 'branch_menu_item.visibility.write'\n   and permission.permission_scope = 'restaurant'\n  where item.id = p_branch_menu_item_id\n    and item.restaurant_id = p_restaurant_id\n    and item.branch_id = p_branch_id;",
    "  where item.id = p_branch_menu_item_id\n    and item.restaurant_id = p_restaurant_id\n    and item.branch_id = p_branch_id;"],
  ["cross-tenant target distinguishable from a nonexistent one",
    "    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');\n  end if;\n\n  -- A row that is genuinely discontinued",
    "    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'foreign_tenant');\n  end if;\n\n  -- A row that is genuinely discontinued"],
  ["ORDERING INVERTED: transition legality checked after permission",
    "  if p_expected_status = 'discontinued' then\n    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_transition');\n  end if;\n\n  if not exists (",
    "  if not exists ("],
  ["next-status vocabulary widened to admit discontinued",
    "or p_next_status not in ('available', 'hidden')", "or p_next_status not in ('available', 'hidden', 'discontinued')"],
  ["expected-status vocabulary narrowed, rejecting a legitimate discontinued concurrency claim",
    "or p_expected_status not in ('available', 'hidden', 'discontinued')",
    "or p_expected_status not in ('available', 'hidden')"],
  ["the invalid_transition guard for a discontinued expected status removed entirely",
    "  if p_expected_status = 'discontinued' then\n    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_transition');\n  end if;\n\n", ""],
  ["negative expected version accepted",
    "    or p_expected_version < 0\n", ""],
  ["expected version no longer checked",
    "  if v_target.branch_specific_status <> p_expected_status\n    or v_target.branch_specific_status_version <> p_expected_version\n  then",
    "  if v_target.branch_specific_status <> p_expected_status\n  then"],
  ["expected status no longer checked",
    "  if v_target.branch_specific_status <> p_expected_status\n    or v_target.branch_specific_status_version <> p_expected_version\n  then",
    "  if v_target.branch_specific_status_version <> p_expected_version\n  then"],
  ["target row no longer locked before the precondition is judged",
    "  where item.id = p_branch_menu_item_id\n  for update of item;", "  where item.id = p_branch_menu_item_id;"],
  ["mutation writes availability as well as branch_specific_status",
    "  set branch_specific_status = p_next_status\n", "  set branch_specific_status = p_next_status, availability = 'available'\n"],
  ["mutation drives the version counter by hand",
    "  set branch_specific_status = p_next_status\n",
    "  set branch_specific_status = p_next_status, branch_specific_status_version = v_target.branch_specific_status_version + 1\n"],
  ["a raw PostgreSQL condition allowed to escape to the caller",
    "    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');",
    "    raise exception 'status unchanged';"],

  // --- ACL ordering and ownership -----------------------------------------------------------------------
  ["EXECUTE granted to anon",
    "grant execute on function public.restaurant_owner_set_branch_menu_item_visibility_v1(text, text, text, bigint)\n  to authenticated;",
    "grant execute on function public.restaurant_owner_set_branch_menu_item_visibility_v1(text, text, text, bigint)\n  to anon;"],
  ["PUBLIC never revoked from the mutation",
    "revoke all on function public.restaurant_owner_set_branch_menu_item_visibility_v1(text, text, text, bigint)\n  from public, anon, authenticated, authenticator, service_role;", ""],
  ["ownership moved BEFORE privileges are settled, so the revokes silently no-op",
    "revoke all on function public.restaurant_owner_preview_branch_menu_item_visibility_v1(text, text, text)\n  from public, anon, authenticated, authenticator, service_role;",
    "alter function public.restaurant_owner_preview_branch_menu_item_visibility_v1(text, text, text)\n  owner to restaurant_owner_branch_menu_item_visibility_write_authority;\nrevoke all on function public.restaurant_owner_preview_branch_menu_item_visibility_v1(text, text, text)\n  from public, anon, authenticated, authenticator, service_role;"],
  ["an RPC left owned by the migration runner",
    "alter function public.restaurant_owner_set_branch_menu_item_visibility_v1(text, text, text, bigint)\n  owner to restaurant_owner_branch_menu_item_visibility_write_authority;", ""],

  // --- fail-closed epilogue -------------------------------------------------------------------------------
  ["epilogue downgraded from exception to warning",
    "raise exception 'RA-2D-P1: the tenant policies are not RESTRICTIVE (found % of 2)', v_count;",
    "raise warning 'RA-2D-P1: the tenant policies are not RESTRICTIVE (found % of 2)', v_count;"],
  ["epilogue stops proving the tenant policies are restrictive",
    "    and policy.polpermissive = false;", "    and policy.polpermissive is not null;"],
  ["epilogue stops proving FORCE row level security was restored",
    "raise exception 'RA-2D-P1: the seed suspension did not restore FORCE row level security';", "null;"],
  ["epilogue stops proving writer independence",
    "raise exception 'RA-2D-P1: the visibility writer can write a column it must never write';", "null;"],
  ["epilogue stops proving predecessors were not widened",
    "raise exception 'RA-2D-P1: a frozen predecessor writer was widened to branch_specific_status';", "null;"],
  ["epilogue stops proving no client role reached the sealed role",
    "raise exception 'RA-2D-P1: a client role holds membership of the visibility writer';", "null;"],
  ["epilogue stops proving branch_specific_status carries no unexpected constraint",
    "raise exception 'RA-2D-P1: an unexpected constraint on branch_specific_status was added (found %, expected the pre-existing enum CHECK only)', v_count;",
    "null;"],
  ["epilogue reads the RLS-protected authority tables instead of pg_catalog",
    "  from pg_catalog.pg_policy as policy\n  where policy.polrelid = 'public.branch_menu_items'::pg_catalog.regclass\n    and policy.polname in ('branch_menu_items_owner_visibility_tenant_select',",
    "  from public.restaurant_users as policy\n  where policy.polrelid = 'public.branch_menu_items'::pg_catalog.regclass\n    and policy.polname in ('branch_menu_items_owner_visibility_tenant_select',"],

  // --- transaction integrity -------------------------------------------------------------------------------
  ["the migration stops being a single transaction", "\ncommit;\n", "\n"],
  ["the migration never opens its transaction", "begin;\n", ""]
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
