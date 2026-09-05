#!/usr/bin/env node
// RA-2E-P1 mutation suite.
//
// A claim no mutant can break is decoration, not a test. This suite corrupts the frozen migration
// source one edit at a time, in memory, and requires every corruption to be caught by at least one
// contract claim. A mutant that survives is a hole in the contract; a mutant whose edit does not
// apply is STALE, which is a failure too.
import { auditMigrationSource, readMigrationSource }
  from "./restaurant-owner-branch-display-name-ra-2e-p1-contract.mjs";

const SUITE = "restaurant-owner-branch-display-name-ra-2e-p1-mutations";
const source = readMigrationSource(process.cwd());

const baseline = auditMigrationSource(source);
const baselineFailures = baseline.filter((c) => !c.pass);

const MUTANTS = [
  // --- permission vocabulary ---------------------------------------------------------------------
  ["permission key silently renamed",
    "'branch.profile.display_name.write', 'restaurant'", "'branch.profile.name.write', 'restaurant'"],
  ["permission granted at branch scope instead of restaurant",
    "'branch.profile.display_name.write', 'restaurant'", "'branch.profile.display_name.write', 'branch'"],
  ["permission seeded for manager as well as owner",
    "where role.role_key = 'owner';", "where role.role_key in ('owner', 'manager');"],
  ["a predecessor permission key dropped from the widened CHECK",
    "    'branch_menu_item.visibility.write',\n", ""],
  ["FORCE row level security never suspended for the seed",
    "alter table public.role_permissions no force row level security;", ""],
  ["FORCE row level security never restored after the seed",
    "alter table public.role_permissions force row level security;\nalter table public.restaurant_roles force row level security;", ""],
  ["seed row-count verification removed",
    "raise exception 'RA-2E-P1: expected exactly one display-name permission row, found %', v_total;",
    "null;"],
  ["predecessor permission preservation check removed",
    "raise exception 'RA-2E-P1: a frozen predecessor permission row was disturbed';", "null;"],

  // --- the version token and structural trigger scoping ---------------------------------------------
  ["trigger widened from UPDATE OF name to a broad UPDATE, breaking structural GEO/status independence",
    "before update of name on public.restaurant_branches", "before update on public.restaurant_branches"],
  ["trigger's WHEN guard removed, so it would fire even without a real name change",
    "when (old.name is distinct from new.name)\n  execute function", "execute function"],
  ["version never advances",
    "new.display_name_version := old.display_name_version + 1;",
    "new.display_name_version := old.display_name_version;"],
  ["an INSERT branch is added, diverging from this table's own status_version convention",
    "begin\n  -- Change-scoped canonical guard",
    "begin\n  if tg_op = 'INSERT' then new.display_name_version := 0; return new; end if;\n  -- Change-scoped canonical guard"],
  ["the length floor is removed from the defense-in-depth guard",
    "if pg_catalog.char_length(new.name) < 1 or pg_catalog.char_length(new.name) > 80 then",
    "if pg_catalog.char_length(new.name) > 80 then"],
  ["the length ceiling is removed from the defense-in-depth guard",
    "if pg_catalog.char_length(new.name) < 1 or pg_catalog.char_length(new.name) > 80 then",
    "if pg_catalog.char_length(new.name) < 1 then"],
  ["the outer-trim guard is removed, allowing a stored name with leading/trailing whitespace",
    "if new.name <> pg_catalog.btrim(new.name) then\n    raise exception 'RA-2E-P1: a branch display-name change must not carry leading or trailing whitespace';\n  end if;\n",
    ""],
  ["the control-character guard is removed",
    "if new.name ~ '[\\x00-\\x1F\\x7F-\\x9F]' then\n    raise exception 'RA-2E-P1: a branch display-name change must not contain control characters';\n  end if;\n",
    ""],
  ["the version column's non-negative constraint is removed",
    "  add constraint restaurant_branches_display_name_version_non_negative\n  check (display_name_version >= 0);", ""],
  ["a naive table CHECK on name is reintroduced, breaking legacy rows",
    "  add constraint restaurant_branches_display_name_version_non_negative\n  check (display_name_version >= 0);",
    "  add constraint restaurant_branches_display_name_version_non_negative\n  check (display_name_version >= 0);\nalter table public.restaurant_branches add constraint restaurant_branches_name_canonical check (pg_catalog.char_length(name) between 1 and 80);"],

  // --- the sealed role -----------------------------------------------------------------------------
  ["sealed role given LOGIN",
    "create role restaurant_owner_branch_display_name_write_authority\n  nologin",
    "create role restaurant_owner_branch_display_name_write_authority\n  login"],
  ["sealed role given INHERIT", "  nologin\n  noinherit\n  nobypassrls;", "  nologin\n  inherit\n  nobypassrls;"],
  ["sealed role given BYPASSRLS", "  nologin\n  noinherit\n  nobypassrls;", "  nologin\n  noinherit\n  bypassrls;"],
  ["transient membership granted WITH ADMIN",
    "with admin false, inherit false, set true;", "with admin true, inherit false, set true;"],
  ["transient membership never released",
    "revoke restaurant_owner_branch_display_name_write_authority\n  from postgres granted by postgres;", ""],
  ["transient CREATE on schema public never released",
    "revoke create on schema public\n  from restaurant_owner_branch_display_name_write_authority;", ""],
  ["sealed role handed to a client role",
    "grant usage on schema restaurant_internal\n  to restaurant_owner_branch_display_name_write_authority;",
    "grant usage on schema restaurant_internal\n  to restaurant_owner_branch_display_name_write_authority;\ngrant restaurant_owner_branch_display_name_write_authority to authenticated;"],
  ["RA-1C's status writer role is altered by this migration",
    "create role restaurant_owner_branch_display_name_write_authority",
    "alter role platform_admin_branch_status_authority nobypassrls;\ncreate role restaurant_owner_branch_display_name_write_authority"],

  // --- least privilege -----------------------------------------------------------------------------
  ["column UPDATE widened to the whole table",
    "grant update (name)\n  on table public.restaurant_branches", "grant update\n  on table public.restaurant_branches"],
  ["writer allowed to write the version counter",
    "grant update (name)\n  on table public.restaurant_branches",
    "grant update (name, display_name_version)\n  on table public.restaurant_branches"],
  ["writer allowed to write status",
    "grant update (name)\n  on table public.restaurant_branches",
    "grant update (name, status)\n  on table public.restaurant_branches"],
  ["writer allowed to write address",
    "grant update (name)\n  on table public.restaurant_branches",
    "grant update (name, address)\n  on table public.restaurant_branches"],
  ["writer allowed to write GEO coordinates",
    "grant update (name)\n  on table public.restaurant_branches",
    "grant update (name, latitude, longitude)\n  on table public.restaurant_branches"],
  ["writer allowed to write geocode_status",
    "grant update (name)\n  on table public.restaurant_branches",
    "grant update (name, geocode_status)\n  on table public.restaurant_branches"],
  ["a frozen predecessor writer widened to name",
    "grant update (name)\n  on table public.restaurant_branches\n  to restaurant_owner_branch_display_name_write_authority;",
    "grant update (name)\n  on table public.restaurant_branches\n  to restaurant_owner_branch_display_name_write_authority;\ngrant update (name) on table public.restaurant_branches to platform_admin_branch_status_authority;"],

  // --- audit ---------------------------------------------------------------------------------------
  ["audit relation loses FORCE row level security",
    "alter table restaurant_internal.branch_display_name_audit_log\n  force row level security;", ""],
  ["audit relation gains an UPDATE policy",
    "revoke all on table restaurant_internal.branch_display_name_audit_log",
    "create policy branch_display_name_audit_log_writer_update\n  on restaurant_internal.branch_display_name_audit_log\n  for update to restaurant_owner_branch_display_name_write_authority using (true);\nrevoke all on table restaurant_internal.branch_display_name_audit_log"],
  ["audit relation exposed to a client role",
    "revoke all on table restaurant_internal.branch_display_name_audit_log\n  from public, anon, authenticated, authenticator, service_role;", ""],
  ["no-op transitions become auditable",
    "check (previous_display_name <> next_display_name),", "check (previous_display_name is not null),"],
  ["the audited destination loses its canonical length ceiling",
    "and pg_catalog.char_length(next_display_name) <= 80", "and true"],
  ["the audited destination loses its outer-trim requirement",
    "and next_display_name = pg_catalog.btrim(next_display_name)", "and true"],
  ["audit version advance no longer exactly one",
    "check (next_version = previous_version + 1),", "check (next_version >= previous_version),"],
  ["actor taken from a caller-supplied parameter",
    "  p_expected_version bigint\n)\nreturns jsonb\nlanguage plpgsql\nvolatile",
    "  p_expected_version bigint,\n  p_actor uuid\n)\nreturns jsonb\nlanguage plpgsql\nvolatile"],

  // --- row level security ------------------------------------------------------------------------------
  ["tenant SELECT policy downgraded from RESTRICTIVE to permissive",
    "create policy restaurant_branches_owner_display_name_tenant_select\n  on public.restaurant_branches\n  as restrictive",
    "create policy restaurant_branches_owner_display_name_tenant_select\n  on public.restaurant_branches"],
  ["tenant UPDATE policy downgraded from RESTRICTIVE to permissive",
    "create policy restaurant_branches_owner_display_name_tenant_update\n  on public.restaurant_branches\n  as restrictive",
    "create policy restaurant_branches_owner_display_name_tenant_update\n  on public.restaurant_branches"],
  ["permissive visibility policies dropped, leaving restrictive-only which grants nothing",
    "create policy restaurant_branches_owner_display_name_select\n  on public.restaurant_branches\n  for select to restaurant_owner_branch_display_name_write_authority\n  using (true);\n", ""],
  ["permissive UPDATE policy stops constraining the written value",
    "  with check (\n    pg_catalog.char_length(name) >= 1 and pg_catalog.char_length(name) <= 80\n    and name = pg_catalog.btrim(name)\n    and name !~ '[\\x00-\\x1F\\x7F-\\x9F]'\n  );",
    "  with check (true);"],
  ["tenant policy stops requiring the owner role key",
    "        and role.role_key = 'owner'\n        and permission.permission_key = 'branch.profile.display_name.write'",
    "        and permission.permission_key = 'branch.profile.display_name.write'"],
  ["tenant policy stops requiring this round's permission",
    "        and permission.permission_key = 'branch.profile.display_name.write'\n        and permission.permission_scope = 'restaurant'",
    "        and permission.permission_scope = 'restaurant'"],
  ["restrictive UPDATE policy loses its WITH CHECK half",
    "  )\n  with check (\n    exists (\n      select 1\n      from public.restaurant_users as caller\n      join public.restaurant_memberships as membership\n        on membership.restaurant_user_id = caller.id\n      join public.restaurant_roles as role\n        on role.id = membership.role_id\n      join public.role_permissions as permission\n        on permission.role_id = role.id\n      where caller.auth_user_id = (\n          coalesce(\n            nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),\n            (\n              nullif(pg_catalog.current_setting('request.jwt.claims', true), '')\n                ::pg_catalog.jsonb ->> 'sub'\n            )\n          )\n        )::pg_catalog.uuid\n        and caller.login_status = 'enabled'\n        and membership.status = 'active'\n        and membership.restaurant_id = restaurant_branches.restaurant_id\n        and role.status = 'active'\n        and role.role_key = 'owner'\n        and permission.permission_key = 'branch.profile.display_name.write'\n        and permission.permission_scope = 'restaurant'\n    )\n  );",
    "  );"],

  // --- the RPCs -----------------------------------------------------------------------------------------
  ["preview downgraded from STABLE to VOLATILE",
    ")\nreturns jsonb\nlanguage plpgsql\nstable\nsecurity definer", ")\nreturns jsonb\nlanguage plpgsql\nvolatile\nsecurity definer"],
  ["mutation loses SECURITY DEFINER",
    "returns jsonb\nlanguage plpgsql\nvolatile\nsecurity definer", "returns jsonb\nlanguage plpgsql\nvolatile"],
  ["an RPC loses its pinned empty search_path",
    "volatile\nsecurity definer\nset search_path = ''", "volatile\nsecurity definer"],
  ["preview trusts row level security instead of joining the caller's membership chain",
    "  join public.restaurant_memberships as membership\n    on membership.restaurant_id = branch.restaurant_id\n   and membership.status = 'active'\n  join public.restaurant_users as caller\n    on caller.id = membership.restaurant_user_id\n   and caller.auth_user_id = v_actor\n   and caller.login_status = 'enabled'\n  join public.restaurant_roles as role\n    on role.id = membership.role_id\n   and role.status = 'active'\n   and role.role_key = 'owner'\n  join public.role_permissions as permission\n    on permission.role_id = role.id\n   and permission.permission_key = 'branch.profile.display_name.write'\n   and permission.permission_scope = 'restaurant'\n  where branch.id = p_branch_id\n    and branch.restaurant_id = p_restaurant_id;",
    "  where branch.id = p_branch_id\n    and branch.restaurant_id = p_restaurant_id;"],
  ["cross-tenant target distinguishable from a nonexistent one",
    "    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');\n  end if;\n\n  -- expectedDisplayName is compared EXACTLY",
    "    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'foreign_tenant');\n  end if;\n\n  -- expectedDisplayName is compared EXACTLY"],
  ["expectedDisplayName is trimmed before comparison, breaking exact-match concurrency evidence",
    "if v_target.name <> p_expected_display_name", "if v_target.name <> pg_catalog.btrim(p_expected_display_name)"],
  ["ORDERING INVERTED: no-change checked before canonical validation of the next value",
    "  if v_canonical_next = v_target.name then\n    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');\n  end if;",
    ""],
  ["canonical validation of the next value is removed entirely",
    "  if pg_catalog.char_length(v_canonical_next) < 1 or pg_catalog.char_length(v_canonical_next) > 80\n    or v_canonical_next ~ '[\\x00-\\x1F\\x7F-\\x9F]'\n  then\n    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');\n  end if;\n\n",
    ""],
  ["canonicalization collapses interior whitespace instead of trimming outer only",
    "v_canonical_next := pg_catalog.btrim(p_next_display_name);",
    "v_canonical_next := pg_catalog.regexp_replace(pg_catalog.btrim(p_next_display_name), '\\s+', ' ', 'g');"],
  ["canonicalization case-folds the next value",
    "v_canonical_next := pg_catalog.btrim(p_next_display_name);",
    "v_canonical_next := pg_catalog.lower(pg_catalog.btrim(p_next_display_name));"],
  ["a negative expected version is accepted",
    "    or p_expected_version < 0\n", ""],
  ["expected version no longer checked",
    "  if v_target.name <> p_expected_display_name\n    or v_target.display_name_version <> p_expected_version\n  then",
    "  if v_target.name <> p_expected_display_name\n  then"],
  ["expected name no longer checked",
    "  if v_target.name <> p_expected_display_name\n    or v_target.display_name_version <> p_expected_version\n  then",
    "  if v_target.display_name_version <> p_expected_version\n  then"],
  ["target row no longer locked before the precondition is judged",
    "  where branch.id = p_branch_id\n  for update of branch;", "  where branch.id = p_branch_id;"],
  ["mutation writes status as well as name",
    "  set name = v_canonical_next\n", "  set name = v_canonical_next, status = 'active'\n"],
  ["mutation drives the version counter by hand",
    "  set name = v_canonical_next\n",
    "  set name = v_canonical_next, display_name_version = v_target.display_name_version + 1\n"],
  ["a raw PostgreSQL condition allowed to escape to the caller",
    "    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');",
    "    raise exception 'name unchanged';"],

  // --- ACL ordering and ownership -----------------------------------------------------------------------
  ["EXECUTE granted to anon",
    "grant execute on function public.restaurant_owner_set_branch_display_name_v1(text, text, text, bigint)\n  to authenticated;",
    "grant execute on function public.restaurant_owner_set_branch_display_name_v1(text, text, text, bigint)\n  to anon;"],
  ["PUBLIC never revoked from the mutation",
    "revoke all on function public.restaurant_owner_set_branch_display_name_v1(text, text, text, bigint)\n  from public, anon, authenticated, authenticator, service_role;", ""],
  ["ownership moved BEFORE privileges are settled, so the revokes silently no-op",
    "revoke all on function public.restaurant_owner_preview_branch_display_name_v1(text, text)\n  from public, anon, authenticated, authenticator, service_role;",
    "alter function public.restaurant_owner_preview_branch_display_name_v1(text, text)\n  owner to restaurant_owner_branch_display_name_write_authority;\nrevoke all on function public.restaurant_owner_preview_branch_display_name_v1(text, text)\n  from public, anon, authenticated, authenticator, service_role;"],
  ["an RPC left owned by the migration runner",
    "alter function public.restaurant_owner_set_branch_display_name_v1(text, text, text, bigint)\n  owner to restaurant_owner_branch_display_name_write_authority;", ""],

  // --- fail-closed epilogue -------------------------------------------------------------------------------
  ["epilogue downgraded from exception to warning",
    "raise exception 'RA-2E-P1: the tenant policies are not RESTRICTIVE (found % of 2)', v_count;",
    "raise warning 'RA-2E-P1: the tenant policies are not RESTRICTIVE (found % of 2)', v_count;"],
  ["epilogue stops proving the tenant policies are restrictive",
    "    and policy.polpermissive = false;", "    and policy.polpermissive is not null;"],
  ["epilogue stops proving FORCE row level security was restored",
    "raise exception 'RA-2E-P1: the seed suspension did not restore FORCE row level security';", "null;"],
  ["epilogue stops proving writer independence",
    "raise exception 'RA-2E-P1: the display-name writer can write a column it must never write';", "null;"],
  ["epilogue stops proving predecessors were not widened",
    "raise exception 'RA-2E-P1: a frozen predecessor writer was widened to name';", "null;"],
  ["epilogue stops proving no client role reached the sealed role",
    "raise exception 'RA-2E-P1: a client role holds membership of the display-name writer';", "null;"],
  ["epilogue stops proving the version trigger is structurally scoped",
    "raise exception 'RA-2E-P1: the display-name version trigger is not scoped to UPDATE OF name';", "null;"],
  ["epilogue reads the RLS-protected authority tables instead of pg_catalog",
    "  from pg_catalog.pg_policy as policy\n  where policy.polrelid = 'public.restaurant_branches'::pg_catalog.regclass\n    and policy.polname in ('restaurant_branches_owner_display_name_tenant_select',",
    "  from public.restaurant_users as policy\n  where policy.polrelid = 'public.restaurant_branches'::pg_catalog.regclass\n    and policy.polname in ('restaurant_branches_owner_display_name_tenant_select',"],

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
