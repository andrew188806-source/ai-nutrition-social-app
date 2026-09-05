#!/usr/bin/env node
// RA-2C-P1 mutation suite.
//
// A claim no mutant can break is decoration, not a test. This suite corrupts the frozen migration
// source one edit at a time, in memory, and requires every corruption to be caught by at least one
// contract claim. A mutant that survives is a hole in the contract; a mutant whose edit does not
// apply is STALE, which is a failure too — a mutation that silently no-ops proves nothing and would
// quietly rot as the migration changes.
//
// Nothing here touches the working tree, Development or any cluster.
import { auditMigrationSource, readMigrationSource }
  from "./restaurant-owner-price-ra-2c-p1-contract.mjs";

const SUITE = "restaurant-owner-price-ra-2c-p1-mutations";
const source = readMigrationSource(process.cwd());

const baseline = auditMigrationSource(source);
const baselineFailures = baseline.filter((c) => !c.pass);

/**
 * Each mutant is one plausible mistake or one deliberate weakening. `find` must occur in the source
 * (else STALE), and the mutated source must fail at least one claim (else SURVIVED).
 */
const MUTANTS = [
  // --- permission vocabulary ---------------------------------------------------------------------
  ["permission key silently renamed",
    "'branch_menu_item.price.write', 'restaurant'", "'branch_menu_item.cost.write', 'restaurant'"],
  ["permission granted at branch scope instead of restaurant",
    "'branch_menu_item.price.write', 'restaurant'", "'branch_menu_item.price.write', 'branch'"],
  ["permission seeded for manager as well as owner",
    "where role.role_key = 'owner';", "where role.role_key in ('owner', 'manager');"],
  ["a predecessor permission key dropped from the widened CHECK",
    "    'branch_menu_item.availability.write',\n", ""],
  ["FORCE row level security never suspended for the seed",
    "alter table public.role_permissions no force row level security;", ""],
  ["FORCE row level security never restored after the seed",
    "alter table public.role_permissions force row level security;\nalter table public.restaurant_roles force row level security;", ""],
  ["seed verified AFTER the window closes instead of inside it",
    "alter table public.role_permissions force row level security;\nalter table public.restaurant_roles force row level security;\n",
    ""],
  ["seed row-count verification removed",
    "raise exception 'RA-2C-P1: expected exactly one price permission row, found %', v_total;",
    "null;"],
  ["predecessor permission preservation check removed",
    "raise exception 'RA-2C-P1: a frozen predecessor permission row was disturbed';", "null;"],

  // --- the change-scoped canonical guard, the heart of this round ---------------------------------
  ["canonical guard made unconditional, which would break every legacy row",
    "  if new.price is distinct from old.price then", "  if true then"],
  ["canonical guard removed entirely",
    "new.price is distinct from old.price", "false"],
  ["canonical floor lowered to admit zero",
    "or new.price < 1::pg_catalog.numeric", "or new.price < 0::pg_catalog.numeric"],
  ["canonical ceiling raised past the contract",
    "or new.price > 999999::pg_catalog.numeric", "or new.price > 99999999::pg_catalog.numeric"],
  ["fractional prices rounded instead of refused",
    "or new.price <> pg_catalog.trunc(new.price) then", "or new.price <> pg_catalog.round(new.price) then"],
  ["fractional check dropped",
    "\n      or new.price <> pg_catalog.trunc(new.price) then", " then"],
  ["version advances on every write, not only a price change",
    "    new.price_version := old.price_version + 1;\n  else\n    new.price_version := old.price_version;",
    "    new.price_version := old.price_version + 1;\n  else\n    new.price_version := old.price_version + 1;"],
  ["version never advances",
    "new.price_version := old.price_version + 1;", "new.price_version := old.price_version;"],
  ["INSERT no longer seeded at zero",
    "    new.price_version := 0;\n    return new;", "    return new;"],
  ["trigger loses its pinned empty search_path",
    "returns trigger\nlanguage plpgsql\nset search_path = ''", "returns trigger\nlanguage plpgsql"],
  ["trigger fires only on UPDATE, so inserts skip version seeding",
    "before insert or update on public.branch_menu_items", "before update on public.branch_menu_items"],
  ["version column made nullable",
    "add column price_version bigint not null default 0", "add column price_version bigint default 0"],
  ["version non-negative constraint removed",
    "  add constraint branch_menu_items_price_version_non_negative\n  check (price_version >= 0);", ""],
  ["a naive table CHECK on price reintroduced, breaking legacy rows",
    "  add constraint branch_menu_items_price_version_non_negative\n  check (price_version >= 0);",
    "  add constraint branch_menu_items_price_canonical\n  check (price >= 1 and price = pg_catalog.trunc(price));"],

  // --- the sealed role -----------------------------------------------------------------------------
  ["sealed role given LOGIN", "create role restaurant_owner_branch_menu_item_price_write_authority\n  nologin",
    "create role restaurant_owner_branch_menu_item_price_write_authority\n  login"],
  ["sealed role given INHERIT", "  nologin\n  noinherit\n  nobypassrls;", "  nologin\n  inherit\n  nobypassrls;"],
  ["sealed role given BYPASSRLS", "  nologin\n  noinherit\n  nobypassrls;", "  nologin\n  noinherit\n  bypassrls;"],
  ["transient membership granted WITH ADMIN",
    "with admin false, inherit false, set true;", "with admin true, inherit false, set true;"],
  ["transient membership granted WITH INHERIT",
    "with admin false, inherit false, set true;", "with admin false, inherit true, set true;"],
  ["transient membership never released",
    "revoke restaurant_owner_branch_menu_item_price_write_authority\n  from postgres granted by postgres;", ""],
  ["transient CREATE on schema public never released",
    "revoke create on schema public\n  from restaurant_owner_branch_menu_item_price_write_authority;", ""],
  ["sealed role handed to a client role",
    "grant usage on schema restaurant_internal\n  to restaurant_owner_branch_menu_item_price_write_authority;",
    "grant usage on schema restaurant_internal\n  to restaurant_owner_branch_menu_item_price_write_authority;\ngrant restaurant_owner_branch_menu_item_price_write_authority to authenticated;"],
  ["a second role created in the same round",
    "comment on role restaurant_owner_branch_menu_item_price_write_authority is",
    "create role restaurant_owner_branch_menu_item_price_shadow nologin;\ncomment on role restaurant_owner_branch_menu_item_price_write_authority is"],

  // --- least privilege -----------------------------------------------------------------------------
  ["column UPDATE widened to the whole table",
    "grant update (price)\n  on table public.branch_menu_items", "grant update\n  on table public.branch_menu_items"],
  ["writer allowed to write the version counter",
    "grant update (price)\n  on table public.branch_menu_items", "grant update (price, price_version)\n  on table public.branch_menu_items"],
  ["writer allowed to write sold_out",
    "grant update (price)\n  on table public.branch_menu_items", "grant update (price, sold_out)\n  on table public.branch_menu_items"],
  ["writer allowed to write availability",
    "grant update (price)\n  on table public.branch_menu_items", "grant update (price, availability)\n  on table public.branch_menu_items"],
  ["RA-2A's frozen sold-out writer widened to price",
    "grant update (price)\n  on table public.branch_menu_items\n  to restaurant_owner_branch_menu_item_price_write_authority;",
    "grant update (price)\n  on table public.branch_menu_items\n  to restaurant_owner_branch_menu_item_price_write_authority;\ngrant update (price) on table public.branch_menu_items to restaurant_owner_branch_menu_item_write_authority;"],
  ["RA-2B's frozen availability writer widened to price",
    "grant update (price)\n  on table public.branch_menu_items\n  to restaurant_owner_branch_menu_item_price_write_authority;",
    "grant update (price)\n  on table public.branch_menu_items\n  to restaurant_owner_branch_menu_item_price_write_authority;\ngrant update (price) on table public.branch_menu_items to restaurant_owner_branch_menu_item_availability_write_authority;"],
  ["a predecessor role altered by this migration",
    "create role restaurant_owner_branch_menu_item_price_write_authority",
    "alter role restaurant_owner_branch_menu_item_write_authority nobypassrls;\ncreate role restaurant_owner_branch_menu_item_price_write_authority"],

  // --- audit ---------------------------------------------------------------------------------------
  ["audit relation loses menu_item_id", "  menu_item_id text not null,\n", ""],
  ["audit relation loses FORCE row level security",
    "alter table restaurant_internal.branch_menu_item_price_audit_log\n  force row level security;", ""],
  ["audit relation gains an UPDATE policy",
    "-- No UPDATE policy and no DELETE policy exist on this relation, for any role.",
    "create policy branch_menu_item_price_audit_log_writer_update\n  on restaurant_internal.branch_menu_item_price_audit_log\n  for update to restaurant_owner_branch_menu_item_price_write_authority using (true);"],
  ["audit relation exposed to a client role",
    "revoke all on table restaurant_internal.branch_menu_item_price_audit_log\n  from public, anon, authenticated, authenticator, service_role;", ""],
  ["no-op transitions become auditable",
    "    check (previous_price <> next_price),", "    check (previous_price >= 0),"],
  ["audited destination no longer required to be canonical",
    "    check (next_price >= 1 and next_price <= 999999 and next_price = pg_catalog.trunc(next_price)),",
    "    check (next_price >= 0),"],
  ["audit version advance no longer exactly one",
    "    check (next_price_version = previous_price_version + 1),",
    "    check (next_price_version >= previous_price_version),"],
  ["actor taken from a caller-supplied parameter",
    "  p_expected_version bigint\n)", "  p_expected_version bigint,\n  p_actor uuid\n)"],

  // --- row level security ------------------------------------------------------------------------------
  ["tenant SELECT policy downgraded from RESTRICTIVE to permissive",
    "create policy branch_menu_items_owner_price_tenant_select\n  on public.branch_menu_items\n  as restrictive",
    "create policy branch_menu_items_owner_price_tenant_select\n  on public.branch_menu_items"],
  ["tenant UPDATE policy downgraded from RESTRICTIVE to permissive",
    "create policy branch_menu_items_owner_price_tenant_update\n  on public.branch_menu_items\n  as restrictive",
    "create policy branch_menu_items_owner_price_tenant_update\n  on public.branch_menu_items"],
  ["permissive visibility policies dropped, leaving restrictive-only which grants nothing",
    "create policy branch_menu_items_owner_price_select\n  on public.branch_menu_items\n  for select to restaurant_owner_branch_menu_item_price_write_authority\n  using (true);\n", ""],
  ["permissive UPDATE policy stops constraining the written value",
    "  with check (price >= 1 and price <= 999999 and price = pg_catalog.trunc(price));",
    "  with check (true);"],
  ["tenant policy stops requiring the owner role key",
    "        and role.role_key = 'owner'\n        and permission.permission_key = 'branch_menu_item.price.write'",
    "        and permission.permission_key = 'branch_menu_item.price.write'"],
  ["tenant policy stops requiring this round's permission",
    "        and permission.permission_key = 'branch_menu_item.price.write'\n        and permission.permission_scope = 'restaurant'",
    "        and permission.permission_scope = 'restaurant'"],
  ["restrictive UPDATE policy loses its WITH CHECK half",
    "  )\n  with check (\n    exists (\n      select 1\n      from public.restaurant_users as caller", "  );\n-- removed: with check (\n    exists (\n      select 1\n      from public.restaurant_users as caller"],

  // --- the RPCs -----------------------------------------------------------------------------------------
  ["preview downgraded from STABLE to VOLATILE",
    ")\nreturns jsonb\nlanguage plpgsql\nstable\nsecurity definer", ")\nreturns jsonb\nlanguage plpgsql\nvolatile\nsecurity definer"],
  ["mutation loses SECURITY DEFINER",
    "returns jsonb\nlanguage plpgsql\nvolatile\nsecurity definer", "returns jsonb\nlanguage plpgsql\nvolatile"],
  ["an RPC loses its pinned empty search_path",
    "volatile\nsecurity definer\nset search_path = ''", "volatile\nsecurity definer"],
  ["an RPC loses row_security = on",
    "set search_path = ''\nset row_security = 'on'\nas $$\ndeclare\n  v_actor uuid;\n  v_target record;\n  v_expected numeric(10, 2);",
    "set search_path = ''\nas $$\ndeclare\n  v_actor uuid;\n  v_target record;\n  v_expected numeric(10, 2);"],
  ["preview trusts row level security instead of joining the caller's membership chain",
    "  join public.restaurant_memberships as membership\n    on membership.restaurant_id = item.restaurant_id\n   and membership.status = 'active'\n  join public.restaurant_users as caller\n    on caller.id = membership.restaurant_user_id\n   and caller.auth_user_id = v_actor\n   and caller.login_status = 'enabled'\n  join public.restaurant_roles as role\n    on role.id = membership.role_id\n   and role.status = 'active'\n   and role.role_key = 'owner'\n  join public.role_permissions as permission\n    on permission.role_id = role.id\n   and permission.permission_key = 'branch_menu_item.price.write'\n   and permission.permission_scope = 'restaurant'\n  where item.id = p_branch_menu_item_id\n    and item.restaurant_id = p_restaurant_id\n    and item.branch_id = p_branch_id;",
    "  where item.id = p_branch_menu_item_id\n    and item.restaurant_id = p_restaurant_id\n    and item.branch_id = p_branch_id;"],
  ["price projected as a JSON number instead of lossless text",
    "'price', v_target.price::text", "'price', v_target.price"],
  ["version projected as a JSON number instead of text",
    "'priceVersion', v_target.price_version::text", "'priceVersion', v_target.price_version"],
  ["cross-tenant target distinguishable from a nonexistent one",
    "    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');\n  end if;\n\n  -- Exact numeric comparison on both concurrency facts.",
    "    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'foreign_tenant');\n  end if;\n\n  -- Exact numeric comparison on both concurrency facts."],
  ["ORDERING INVERTED: no_change judged before canonical validation",
    "    or p_expected_price !~ '^(0|[1-9][0-9]{0,7})(\\.[0-9]{1,2})?$'\n    or p_next_price !~ '^[1-9][0-9]{0,5}$'\n  then",
    "    or p_expected_price !~ '^(0|[1-9][0-9]{0,7})(\\.[0-9]{1,2})?$'\n  then"],
  ["destination pattern unanchored at the end",
    "p_next_price !~ '^[1-9][0-9]{0,5}$'", "p_next_price !~ '^[1-9][0-9]{0,5}'"],
  ["destination pattern admits zero",
    "p_next_price !~ '^[1-9][0-9]{0,5}$'", "p_next_price !~ '^[0-9][0-9]{0,5}$'"],
  ["destination pattern admits fractions",
    "p_next_price !~ '^[1-9][0-9]{0,5}$'", "p_next_price !~ '^[1-9][0-9]{0,5}(\\.[0-9]{1,2})?$'"],
  ["prices compared as floating point",
    "v_expected := p_expected_price::pg_catalog.numeric;", "v_expected := p_expected_price::double precision;"],
  ["expected version no longer checked",
    "  if v_target.price <> v_expected\n    or v_target.price_version <> p_expected_version\n  then", "  if v_target.price <> v_expected\n  then"],
  ["expected price no longer checked",
    "  if v_target.price <> v_expected\n    or v_target.price_version <> p_expected_version\n  then", "  if v_target.price_version <> p_expected_version\n  then"],
  ["target row no longer locked before the precondition is judged",
    "  where item.id = p_branch_menu_item_id\n  for update of item;", "  where item.id = p_branch_menu_item_id;"],
  ["mutation writes availability as well as price",
    "  set price = v_next\n", "  set price = v_next, availability = 'available'\n"],
  ["mutation drives the version counter by hand",
    "  set price = v_next\n", "  set price = v_next, price_version = v_target.price_version + 1\n"],
  ["a raw PostgreSQL condition allowed to escape to the caller",
    "    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');",
    "    raise exception 'price unchanged';"],
  ["negative expected version accepted",
    "    or p_expected_version < 0\n", ""],

  // --- ACL ordering and ownership -----------------------------------------------------------------------
  ["EXECUTE granted to anon",
    "grant execute on function public.restaurant_owner_set_branch_menu_item_price_v1(text, text, text, bigint)\n  to authenticated;",
    "grant execute on function public.restaurant_owner_set_branch_menu_item_price_v1(text, text, text, bigint)\n  to anon;"],
  ["EXECUTE granted to service_role as well",
    "grant execute on function public.restaurant_owner_preview_branch_menu_item_price_v1(text, text, text)\n  to authenticated;",
    "grant execute on function public.restaurant_owner_preview_branch_menu_item_price_v1(text, text, text)\n  to authenticated, service_role;"],
  ["PUBLIC never revoked from the mutation",
    "revoke all on function public.restaurant_owner_set_branch_menu_item_price_v1(text, text, text, bigint)\n  from public, anon, authenticated, authenticator, service_role;", ""],
  ["ownership moved BEFORE privileges are settled, so the revokes silently no-op",
    "revoke all on function public.restaurant_owner_preview_branch_menu_item_price_v1(text, text, text)\n  from public, anon, authenticated, authenticator, service_role;",
    "alter function public.restaurant_owner_preview_branch_menu_item_price_v1(text, text, text)\n  owner to restaurant_owner_branch_menu_item_price_write_authority;\nrevoke all on function public.restaurant_owner_preview_branch_menu_item_price_v1(text, text, text)\n  from public, anon, authenticated, authenticator, service_role;"],
  ["an RPC left owned by the migration runner",
    "alter function public.restaurant_owner_set_branch_menu_item_price_v1(text, text, text, bigint)\n  owner to restaurant_owner_branch_menu_item_price_write_authority;", ""],

  // --- fail-closed epilogue -------------------------------------------------------------------------------
  ["epilogue downgraded from exception to warning",
    "raise exception 'RA-2C-P1: the tenant policies are not RESTRICTIVE (found % of 2)', v_count;",
    "raise warning 'RA-2C-P1: the tenant policies are not RESTRICTIVE (found % of 2)', v_count;"],
  ["epilogue stops proving the tenant policies are restrictive",
    "    and policy.polpermissive = false;", "    and policy.polpermissive is not null;"],
  ["epilogue stops proving FORCE row level security was restored",
    "raise exception 'RA-2C-P1: the seed suspension did not restore FORCE row level security';", "null;"],
  ["epilogue stops proving writer independence",
    "raise exception 'RA-2C-P1: the price writer can write a column it must never write';", "null;"],
  ["epilogue stops proving predecessors were not widened",
    "raise exception 'RA-2C-P1: a frozen predecessor writer was widened to price';", "null;"],
  ["epilogue stops proving no client role reached the sealed role",
    "raise exception 'RA-2C-P1: a client role holds membership of the price writer';", "null;"],
  ["epilogue stops proving no table CHECK constrains price",
    "raise exception 'RA-2C-P1: a table CHECK on price would break legacy rows (found %)', v_count;", "null;"],
  ["epilogue reads the RLS-protected authority tables instead of pg_catalog",
    "  from pg_catalog.pg_policy as policy\n  where policy.polrelid = 'public.branch_menu_items'::pg_catalog.regclass\n    and policy.polname in ('branch_menu_items_owner_price_tenant_select',",
    "  from public.restaurant_users as policy\n  where policy.polrelid = 'public.branch_menu_items'::pg_catalog.regclass\n    and policy.polname in ('branch_menu_items_owner_price_tenant_select',"],

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
