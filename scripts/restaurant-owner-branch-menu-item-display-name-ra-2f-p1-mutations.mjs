#!/usr/bin/env node
// RA-2F-P1 mutation suite.
//
// A claim no mutant can break is decoration, not a test. This suite corrupts the frozen migration
// source one edit at a time, in memory, and requires every corruption to be caught by at least one
// contract claim. A mutant that survives is a hole in the contract; a mutant whose edit does not
// apply is STALE, which is a failure too.
import { auditMigrationSource, readMigrationSource }
  from "./restaurant-owner-branch-menu-item-display-name-ra-2f-p1-contract.mjs";

const SUITE = "restaurant-owner-branch-menu-item-display-name-ra-2f-p1-mutations";
const source = readMigrationSource(process.cwd());

const baseline = auditMigrationSource(source);
const baselineFailures = baseline.filter((c) => !c.pass);

const MUTANTS = [
  // --- permission vocabulary ---------------------------------------------------------------------
  ["permission key silently renamed",
    "'branch_menu_item.display_name.write', 'restaurant'", "'branch_menu_item.label.write', 'restaurant'"],
  ["permission granted at branch scope instead of restaurant",
    "'branch_menu_item.display_name.write', 'restaurant'", "'branch_menu_item.display_name.write', 'branch'"],
  ["permission seeded for manager as well as owner",
    "where role.role_key = 'owner';", "where role.role_key in ('owner', 'manager');"],
  ["a predecessor permission key dropped from the widened CHECK",
    "    'branch.profile.display_name.write',\n", ""],
  ["FORCE row level security never suspended for the seed",
    "alter table public.role_permissions no force row level security;", ""],
  ["FORCE row level security never restored after the seed",
    "alter table public.role_permissions force row level security;\nalter table public.restaurant_roles force row level security;", ""],
  ["seed row-count verification removed",
    "raise exception 'RA-2F-P1: expected exactly one display-name-override permission row, found %', v_total;",
    "null;"],
  ["predecessor permission preservation check removed",
    "raise exception 'RA-2F-P1: a frozen predecessor permission row was disturbed';", "null;"],

  // --- the version token, NULL-aware canonical guard --------------------------------------------------
  ["canonical validation is applied to NULL as well as non-NULL, breaking CLEAR",
    "if new.branch_specific_name is not null then",
    "if true then"],
  ["version advances on every write, not only a real change",
    "  if new.branch_specific_name is distinct from old.branch_specific_name then",
    "  if true then"],
  ["INSERT no longer seeds the version at zero",
    "  if tg_op = 'INSERT' then\n    new.branch_specific_name_version := 0;\n    return new;\n  end if;\n\n",
    ""],
  ["the length floor is removed from the defense-in-depth guard",
    "if pg_catalog.char_length(new.branch_specific_name) < 1\n        or pg_catalog.char_length(new.branch_specific_name) > 80 then",
    "if pg_catalog.char_length(new.branch_specific_name) > 80 then"],
  ["the length ceiling is removed from the defense-in-depth guard",
    "if pg_catalog.char_length(new.branch_specific_name) < 1\n        or pg_catalog.char_length(new.branch_specific_name) > 80 then",
    "if pg_catalog.char_length(new.branch_specific_name) < 1 then"],
  ["the outer-trim guard is removed",
    "if new.branch_specific_name <> pg_catalog.btrim(new.branch_specific_name) then\n        raise exception 'RA-2F-P1: a branch-menu display-name override must not carry leading or trailing whitespace';\n      end if;\n",
    ""],
  ["the control-character guard is removed",
    "if new.branch_specific_name ~ '[\\x00-\\x1F\\x7F-\\x9F]' then\n        raise exception 'RA-2F-P1: a branch-menu display-name override must not contain control characters';\n      end if;\n",
    ""],
  ["the version column's non-negative constraint is removed",
    "  add constraint branch_menu_items_branch_specific_name_version_non_negative\n  check (branch_specific_name_version >= 0);", ""],
  ["a naive table CHECK on branch_specific_name is reintroduced, breaking legacy rows",
    "  add constraint branch_menu_items_branch_specific_name_version_non_negative\n  check (branch_specific_name_version >= 0);",
    "  add constraint branch_menu_items_branch_specific_name_version_non_negative\n  check (branch_specific_name_version >= 0);\nalter table public.branch_menu_items add constraint branch_menu_items_display_name_canonical check (branch_specific_name is null or pg_catalog.char_length(branch_specific_name) between 1 and 80);"],

  // --- the sealed role -----------------------------------------------------------------------------
  ["sealed role given LOGIN",
    "create role restaurant_owner_branch_menu_item_display_name_write_authority\n  nologin",
    "create role restaurant_owner_branch_menu_item_display_name_write_authority\n  login"],
  ["sealed role given INHERIT", "  nologin\n  noinherit\n  nobypassrls;", "  nologin\n  inherit\n  nobypassrls;"],
  ["sealed role given BYPASSRLS", "  nologin\n  noinherit\n  nobypassrls;", "  nologin\n  noinherit\n  bypassrls;"],
  ["transient membership granted WITH ADMIN",
    "with admin false, inherit false, set true;", "with admin true, inherit false, set true;"],
  ["transient membership never released",
    "revoke restaurant_owner_branch_menu_item_display_name_write_authority\n  from postgres granted by postgres;", ""],
  ["transient CREATE on schema public never released",
    "revoke create on schema public\n  from restaurant_owner_branch_menu_item_display_name_write_authority;", ""],
  ["sealed role handed to a client role",
    "grant usage on schema restaurant_internal\n  to restaurant_owner_branch_menu_item_display_name_write_authority;",
    "grant usage on schema restaurant_internal\n  to restaurant_owner_branch_menu_item_display_name_write_authority;\ngrant restaurant_owner_branch_menu_item_display_name_write_authority to authenticated;"],
  ["a frozen predecessor writer role is altered by this migration",
    "create role restaurant_owner_branch_menu_item_display_name_write_authority",
    "alter role restaurant_owner_branch_menu_item_visibility_write_authority nobypassrls;\ncreate role restaurant_owner_branch_menu_item_display_name_write_authority"],

  // --- least privilege, including total description exclusion -----------------------------------------
  ["column UPDATE widened to the whole table",
    "grant update (branch_specific_name)\n  on table public.branch_menu_items",
    "grant update\n  on table public.branch_menu_items"],
  ["writer allowed to write the version counter",
    "grant update (branch_specific_name)\n  on table public.branch_menu_items",
    "grant update (branch_specific_name, branch_specific_name_version)\n  on table public.branch_menu_items"],
  ["writer allowed to write branch_specific_description",
    "grant update (branch_specific_name)\n  on table public.branch_menu_items",
    "grant update (branch_specific_name, branch_specific_description)\n  on table public.branch_menu_items"],
  ["writer allowed to read branch_specific_description",
    "grant select (id, restaurant_id, branch_id, menu_item_id, branch_specific_name,\n    branch_specific_name_version)",
    "grant select (id, restaurant_id, branch_id, menu_item_id, branch_specific_name,\n    branch_specific_name_version, branch_specific_description)"],
  ["writer allowed to write menu_item_id",
    "grant update (branch_specific_name)\n  on table public.branch_menu_items",
    "grant update (branch_specific_name, menu_item_id)\n  on table public.branch_menu_items"],
  ["writer allowed to write sold_out",
    "grant update (branch_specific_name)\n  on table public.branch_menu_items",
    "grant update (branch_specific_name, sold_out)\n  on table public.branch_menu_items"],
  ["writer allowed to write price",
    "grant update (branch_specific_name)\n  on table public.branch_menu_items",
    "grant update (branch_specific_name, price)\n  on table public.branch_menu_items"],
  ["writer allowed to update menu_items.name (canonical identity)",
    "grant select (id, name)\n  on table public.menu_items\n  to restaurant_owner_branch_menu_item_display_name_write_authority;",
    "grant select (id, name)\n  on table public.menu_items\n  to restaurant_owner_branch_menu_item_display_name_write_authority;\ngrant update (name) on table public.menu_items to restaurant_owner_branch_menu_item_display_name_write_authority;"],
  ["a frozen predecessor writer widened to branch_specific_name",
    "grant update (branch_specific_name)\n  on table public.branch_menu_items\n  to restaurant_owner_branch_menu_item_display_name_write_authority;",
    "grant update (branch_specific_name)\n  on table public.branch_menu_items\n  to restaurant_owner_branch_menu_item_display_name_write_authority;\ngrant update (branch_specific_name) on table public.branch_menu_items to restaurant_owner_branch_menu_item_visibility_write_authority;"],

  // --- audit, nullable-aware -----------------------------------------------------------------------------
  ["audit relation loses FORCE row level security",
    "alter table restaurant_internal.branch_menu_item_display_name_audit_log\n  force row level security;", ""],
  ["audit relation gains an UPDATE policy",
    "revoke all on table restaurant_internal.branch_menu_item_display_name_audit_log",
    "create policy branch_menu_item_display_name_audit_log_writer_update\n  on restaurant_internal.branch_menu_item_display_name_audit_log\n  for update to restaurant_owner_branch_menu_item_display_name_write_authority using (true);\nrevoke all on table restaurant_internal.branch_menu_item_display_name_audit_log"],
  ["audit relation exposed to a client role",
    "revoke all on table restaurant_internal.branch_menu_item_display_name_audit_log\n  from public, anon, authenticated, authenticator, service_role;", ""],
  ["previous/next display-name are made NOT NULL, breaking CLEAR's audit trail",
    "previous_display_name text,\n  next_display_name text,",
    "previous_display_name text not null,\n  next_display_name text not null,"],
  ["no-op transitions become auditable via a non-nullable-safe comparison",
    "check (previous_display_name is distinct from next_display_name),",
    "check (previous_display_name <> next_display_name),"],
  ["CLEAR (NULL) audited destination is no longer treated as always valid",
    "check (next_display_name is null or (", "check (("],
  ["the audited non-NULL destination loses its canonical length ceiling",
    "and pg_catalog.char_length(next_display_name) <= 80", "and true"],
  ["audit version advance no longer exactly one",
    "check (next_version = previous_version + 1),", "check (next_version >= previous_version),"],
  ["actor taken from a caller-supplied parameter",
    "  p_expected_version bigint\n)\nreturns jsonb\nlanguage plpgsql\nvolatile",
    "  p_expected_version bigint,\n  p_actor uuid\n)\nreturns jsonb\nlanguage plpgsql\nvolatile"],

  // --- row level security ------------------------------------------------------------------------------
  ["tenant SELECT policy downgraded from RESTRICTIVE to permissive",
    "create policy branch_menu_items_owner_display_name_tenant_select\n  on public.branch_menu_items\n  as restrictive",
    "create policy branch_menu_items_owner_display_name_tenant_select\n  on public.branch_menu_items"],
  ["tenant UPDATE policy downgraded from RESTRICTIVE to permissive",
    "create policy branch_menu_items_owner_display_name_tenant_update\n  on public.branch_menu_items\n  as restrictive",
    "create policy branch_menu_items_owner_display_name_tenant_update\n  on public.branch_menu_items"],
  ["permissive visibility policies dropped, leaving restrictive-only which grants nothing",
    "create policy branch_menu_items_owner_display_name_select\n  on public.branch_menu_items\n  for select to restaurant_owner_branch_menu_item_display_name_write_authority\n  using (true);\n", ""],
  ["permissive UPDATE policy stops accepting NULL as a valid write",
    "  with check (\n    branch_specific_name is null or (",
    "  with check (\n    branch_specific_name is not null and ("],
  ["permissive UPDATE policy stops constraining a non-NULL written value",
    "      pg_catalog.char_length(branch_specific_name) >= 1\n      and pg_catalog.char_length(branch_specific_name) <= 80\n      and branch_specific_name = pg_catalog.btrim(branch_specific_name)\n      and branch_specific_name !~ '[\\x00-\\x1F\\x7F-\\x9F]'\n    )\n  );",
    "true)\n  );"],
  ["tenant policy stops requiring the owner role key",
    "        and role.role_key = 'owner'\n        and permission.permission_key = 'branch_menu_item.display_name.write'",
    "        and permission.permission_key = 'branch_menu_item.display_name.write'"],
  ["tenant policy stops requiring this round's permission",
    "        and permission.permission_key = 'branch_menu_item.display_name.write'\n        and permission.permission_scope = 'restaurant'",
    "        and permission.permission_scope = 'restaurant'"],

  // --- the RPCs -----------------------------------------------------------------------------------------
  ["preview downgraded from STABLE to VOLATILE",
    ")\nreturns jsonb\nlanguage plpgsql\nstable\nsecurity definer", ")\nreturns jsonb\nlanguage plpgsql\nvolatile\nsecurity definer"],
  ["mutation loses SECURITY DEFINER",
    "returns jsonb\nlanguage plpgsql\nvolatile\nsecurity definer", "returns jsonb\nlanguage plpgsql\nvolatile"],
  ["an RPC loses its pinned empty search_path",
    "volatile\nsecurity definer\nset search_path = ''", "volatile\nsecurity definer"],
  ["the operation vocabulary is widened beyond {set, clear}",
    "p_operation not in ('set', 'clear')", "p_operation not in ('set', 'clear', 'rename')"],
  ["clear no longer requires a NULL next value",
    "or (p_operation = 'clear' and p_next_display_name is not null)\n", ""],
  ["set no longer requires a non-NULL next value",
    "or (p_operation = 'set' and p_next_display_name is null)\n", ""],
  ["expected-override comparison uses `<>` instead of IS DISTINCT FROM, breaking NULL-current concurrency",
    "if v_target.branch_specific_name is distinct from p_expected_display_name",
    "if v_target.branch_specific_name <> p_expected_display_name"],
  ["no-change comparison uses `=` instead of IS NOT DISTINCT FROM, breaking CLEAR-on-NULL detection",
    "if v_canonical_next is not distinct from v_target.branch_specific_name then",
    "if v_canonical_next = v_target.branch_specific_name then"],
  ["CLEAR copies the canonical menu name instead of storing NULL",
    "if p_operation = 'clear' then\n    v_canonical_next := null;",
    "if p_operation = 'clear' then\n    select name into v_canonical_next from public.menu_items where id = v_target.menu_item_id;"],
  ["canonical validation of the SET value is removed entirely",
    "v_canonical_next := pg_catalog.btrim(p_next_display_name);\n    if pg_catalog.char_length(v_canonical_next) < 1 or pg_catalog.char_length(v_canonical_next) > 80\n      or v_canonical_next ~ '[\\x00-\\x1F\\x7F-\\x9F]'\n    then\n      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');\n    end if;",
    "v_canonical_next := pg_catalog.btrim(p_next_display_name);"],
  ["SET canonicalization collapses interior whitespace instead of trimming outer only",
    "v_canonical_next := pg_catalog.btrim(p_next_display_name);",
    "v_canonical_next := pg_catalog.regexp_replace(pg_catalog.btrim(p_next_display_name), '\\s+', ' ', 'g');"],
  ["SET canonicalization case-folds the next value",
    "v_canonical_next := pg_catalog.btrim(p_next_display_name);",
    "v_canonical_next := pg_catalog.lower(pg_catalog.btrim(p_next_display_name));"],
  ["a negative expected version is accepted",
    "    or p_expected_version < 0\n", ""],
  ["target row no longer locked before the precondition is judged",
    "  where item.id = p_branch_menu_item_id\n  for update of item;", "  where item.id = p_branch_menu_item_id;"],
  ["mutation writes branch_specific_description as well as branch_specific_name",
    "  set branch_specific_name = v_canonical_next\n", "  set branch_specific_name = v_canonical_next, branch_specific_description = 'x'\n"],
  ["mutation writes availability as well as branch_specific_name",
    "  set branch_specific_name = v_canonical_next\n", "  set branch_specific_name = v_canonical_next, availability = 'available'\n"],
  ["mutation drives the version counter by hand",
    "  set branch_specific_name = v_canonical_next\n",
    "  set branch_specific_name = v_canonical_next, branch_specific_name_version = v_target.branch_specific_name_version + 1\n"],
  ["a raw PostgreSQL condition allowed to escape to the caller",
    "    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');",
    "    raise exception 'override unchanged';"],
  ["preview stops distinguishing the override from the canonical name",
    "'branchSpecificDisplayName', v_target.branch_specific_name,\n    'branchSpecificDisplayNameVersion', v_target.branch_specific_name_version::text,\n    'canonicalDisplayName', v_target.canonical_name",
    "'branchSpecificDisplayName', coalesce(v_target.branch_specific_name, v_target.canonical_name),\n    'branchSpecificDisplayNameVersion', v_target.branch_specific_name_version::text"],

  // --- ACL ordering and ownership -----------------------------------------------------------------------
  ["EXECUTE granted to anon",
    "grant execute on function public.restaurant_owner_set_branch_menu_item_display_name_v1(text, text, text, text, bigint)\n  to authenticated;",
    "grant execute on function public.restaurant_owner_set_branch_menu_item_display_name_v1(text, text, text, text, bigint)\n  to anon;"],
  ["PUBLIC never revoked from the mutation",
    "revoke all on function public.restaurant_owner_set_branch_menu_item_display_name_v1(text, text, text, text, bigint)\n  from public, anon, authenticated, authenticator, service_role;", ""],
  ["ownership moved BEFORE privileges are settled, so the revokes silently no-op",
    "revoke all on function public.restaurant_owner_preview_branch_menu_item_display_name_v1(text, text, text)\n  from public, anon, authenticated, authenticator, service_role;",
    "alter function public.restaurant_owner_preview_branch_menu_item_display_name_v1(text, text, text)\n  owner to restaurant_owner_branch_menu_item_display_name_write_authority;\nrevoke all on function public.restaurant_owner_preview_branch_menu_item_display_name_v1(text, text, text)\n  from public, anon, authenticated, authenticator, service_role;"],
  ["an RPC left owned by the migration runner",
    "alter function public.restaurant_owner_set_branch_menu_item_display_name_v1(text, text, text, text, bigint)\n  owner to restaurant_owner_branch_menu_item_display_name_write_authority;", ""],

  // --- fail-closed epilogue -------------------------------------------------------------------------------
  ["epilogue downgraded from exception to warning",
    "raise exception 'RA-2F-P1: the tenant policies are not RESTRICTIVE (found % of 2)', v_count;",
    "raise warning 'RA-2F-P1: the tenant policies are not RESTRICTIVE (found % of 2)', v_count;"],
  ["epilogue stops proving the tenant policies are restrictive",
    "    and policy.polpermissive = false;", "    and policy.polpermissive is not null;"],
  ["epilogue stops proving FORCE row level security was restored",
    "raise exception 'RA-2F-P1: the seed suspension did not restore FORCE row level security';", "null;"],
  ["epilogue stops proving writer independence",
    "raise exception 'RA-2F-P1: the display-name-override writer can write a column it must never write';", "null;"],
  ["epilogue stops proving predecessors were not widened",
    "raise exception 'RA-2F-P1: a frozen predecessor writer was widened to branch_specific_name';", "null;"],
  ["epilogue stops proving no client role reached the sealed role",
    "raise exception 'RA-2F-P1: a client role holds membership of the display-name-override writer';", "null;"],
  ["epilogue stops proving description independence",
    "raise exception 'RA-2F-P1: the writer has any privilege at all on branch_specific_description';", "null;"],
  ["epilogue reads the RLS-protected authority tables instead of pg_catalog",
    "  from pg_catalog.pg_policy as policy\n  where policy.polrelid = 'public.branch_menu_items'::pg_catalog.regclass\n    and policy.polname in ('branch_menu_items_owner_display_name_tenant_select',",
    "  from public.restaurant_users as policy\n  where policy.polrelid = 'public.branch_menu_items'::pg_catalog.regclass\n    and policy.polname in ('branch_menu_items_owner_display_name_tenant_select',"],

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
