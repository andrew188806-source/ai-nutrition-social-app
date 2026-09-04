#!/usr/bin/env node
// RA-2A-P1 mutations. Each mutant is a specific way this authority could have been built wrong.
// Copies stay in memory; the repository is never modified. A mutant that does not change the source
// is reported STALE and fails the run, so a rotted anchor cannot masquerade as a kill.
import {
  auditAcceptanceSource, auditMigrationSource, readMigrationSource, readNormalized
} from "./restaurant-owner-sold-out-ra-2a-p1-contract.mjs";

const SUITE = "restaurant-owner-sold-out-ra-2a-p1-mutations";
const ACCEPTANCE = "scripts/restaurant-owner-sold-out-ra-2a-p1-development-acceptance.mjs";

const MIGRATION_MUTANTS = [
  ["manager granted the sold-out permission",
    "where role.role_key = 'owner';", "where role.role_key in ('owner', 'manager');"],
  ["staff granted the sold-out permission",
    "where role.role_key = 'owner';", "where role.role_key in ('owner', 'staff');"],
  ["permission scope widened beyond restaurant",
    "'branch_menu_item.sold_out.write', 'restaurant'", "'branch_menu_item.sold_out.write', 'branch'"],
  ["permission vocabulary widened by a second write key",
    "'branch_menu_item.sold_out.write'\n  ));", "'branch_menu_item.sold_out.write',\n    'branch_menu_item.price.write'\n  ));"],
  ["the RPC accepts an actor parameter",
    "  p_branch_menu_item_id text,", "  p_actor_auth_user_id uuid,\n  p_branch_menu_item_id text,"],
  ["the RPC accepts caller-supplied restaurant authority",
    "  p_expected_sold_out boolean,", "  p_restaurant_id text,\n  p_expected_sold_out boolean,"],
  ["cross-tenant rows become reachable (a tenant predicate is dropped)",
    "        and membership.restaurant_id = branch_menu_items.restaurant_id\n        and role.status = 'active'\n        and role.role_key = 'owner'\n        and permission.permission_key = 'branch_menu_item.sold_out.write'\n        and permission.permission_scope = 'restaurant'\n    )\n  )\n  with check (",
    "        and role.status = 'active'\n        and role.role_key = 'owner'\n        and permission.permission_key = 'branch_menu_item.sold_out.write'\n        and permission.permission_scope = 'restaurant'\n    )\n  )\n  with check ("],
  ["the update policy loses its WITH CHECK clause",
    "  with check (\n    exists (", "  with check (\n    true or exists ("],
  ["broad table UPDATE is granted on the target",
    "grant update (sold_out)\n  on table public.branch_menu_items", "grant update\n  on table public.branch_menu_items"],
  ["price becomes writable", "grant update (sold_out)", "grant update (sold_out, price)"],
  ["availability becomes writable", "grant update (sold_out)", "grant update (sold_out, availability)"],
  ["the version column becomes caller-writable",
    "grant update (sold_out)", "grant update (sold_out, sold_out_version)"],
  ["the version stops advancing",
    "+ (case when new.sold_out is distinct from old.sold_out then 1 else 0 end);", "+ 0;"],
  ["the trigger trusts a caller-supplied version",
    "  new.sold_out_version := old.sold_out_version", "  new.sold_out_version := new.sold_out_version"],
  ["the trigger loses its pinned search_path",
    "returns trigger\nlanguage plpgsql\nset search_path = ''", "returns trigger\nlanguage plpgsql"],
  ["the expected-version check is removed",
    "  if v_target.sold_out <> p_expected_sold_out\n    or v_target.sold_out_version <> p_expected_version\n  then",
    "  if v_target.sold_out <> p_expected_sold_out\n  then"],
  ["the expected-state check is ignored",
    "  if v_target.sold_out <> p_expected_sold_out", "  if false and v_target.sold_out <> p_expected_sold_out"],
  ["a same-state request is accepted as a write",
    "  if p_next_sold_out = v_target.sold_out then", "  if false then"],
  ["the target row is no longer locked",
    "  where item.id = p_branch_menu_item_id\n  for update;", "  where item.id = p_branch_menu_item_id;"],
  ["authorisation is deferred until after target resolution",
    "    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');\n  end if;\n\n  -- Row level security",
    "    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'denied_late');\n  end if;\n\n  -- Row level security"],
  ["the audit insert is removed",
    "  insert into restaurant_internal.branch_menu_item_sold_out_audit_log", "  perform 1; -- insert removed --\n  insert into nowhere.branch_menu_item_sold_out_audit_log"],
  ["the audit row is written before the business update, so a failed update leaves false evidence",
    "  update public.branch_menu_items as item",
    "  insert into restaurant_internal.branch_menu_item_sold_out_audit_log\n    (actor_auth_user_id, membership_id, restaurant_id, branch_id, branch_menu_item_id,\n     previous_sold_out, next_sold_out, previous_sold_out_version, next_sold_out_version)\n  values (v_actor, v_membership_id, v_target.restaurant_id, v_target.branch_id, v_target.id,\n     v_target.sold_out, p_next_sold_out, v_target.sold_out_version, v_target.sold_out_version + 1)\n  returning id into v_audit_id;\n  update public.branch_menu_items as item"],
  ["the audit failure handler silently continues",
    "  returning id into v_audit_id;",
    "  returning id into v_audit_id;\n  exception when others then v_audit_id := null;\n  end;"],
  ["a raw JSON request payload is stored in the audit relation",
    "  actor_auth_user_id uuid not null,", "  request_payload jsonb,\n  actor_auth_user_id uuid not null,"],
  ["a free-text reason is stored in the audit relation",
    "  membership_id uuid not null,", "  reason text,\n  membership_id uuid not null,"],
  ["the version is returned as an unsafe JSON number",
    "'soldOutVersion', v_next_version::text", "'soldOutVersion', v_next_version"],
  ["PUBLIC receives EXECUTE on the RPC",
    "  to authenticated;", "  to authenticated;\ngrant execute on function public.restaurant_owner_set_branch_menu_item_sold_out_v1(text, boolean, boolean, bigint)\n  to public;"],
  ["anon receives EXECUTE on the RPC", "  to authenticated;", "  to authenticated, anon;"],
  ["service_role receives EXECUTE on the RPC", "  to authenticated;", "  to authenticated, service_role;"],
  ["the client EXECUTE revoke is dropped",
    "revoke all on function public.restaurant_owner_set_branch_menu_item_sold_out_v1(text, boolean, boolean, bigint)\n  from public, anon, authenticated, authenticator, service_role;",
    "-- revoke removed --"],
  ["ownership is transferred before the ACL is settled",
    "revoke all on function public.restaurant_owner_set_branch_menu_item_sold_out_v1(text, boolean, boolean, bigint)\n  from public, anon, authenticated, authenticator, service_role;",
    "alter function public.restaurant_owner_set_branch_menu_item_sold_out_v1(text, boolean, boolean, bigint)\n  owner to restaurant_owner_branch_menu_item_write_authority;\nrevoke all on function public.restaurant_owner_set_branch_menu_item_sold_out_v1(text, boolean, boolean, bigint)\n  from public, anon, authenticated, authenticator, service_role;"],
  ["the sealed writer may log in",
    "create role restaurant_owner_branch_menu_item_write_authority\n  nologin", "create role restaurant_owner_branch_menu_item_write_authority\n  login"],
  ["the sealed writer bypasses row level security",
    "  noinherit\n  nobypassrls;", "  noinherit\n  bypassrls;"],
  ["the sealed writer inherits privileges implicitly",
    "  nologin\n  noinherit\n  nobypassrls;", "  nologin\n  inherit\n  nobypassrls;"],
  ["a client role is granted membership of the sealed writer",
    "grant usage on schema restaurant_internal to restaurant_owner_branch_menu_item_write_authority;",
    "grant restaurant_owner_branch_menu_item_write_authority to authenticated;\ngrant usage on schema restaurant_internal to restaurant_owner_branch_menu_item_write_authority;"],
  ["the transient sealed-role membership is never released",
    "revoke restaurant_owner_branch_menu_item_write_authority from postgres granted by postgres;", "-- membership retained --"],
  ["the accepted control-plane creator row is attacked",
    "revoke create on schema public from restaurant_owner_branch_menu_item_write_authority;",
    "revoke admin option for restaurant_owner_branch_menu_item_write_authority from postgres;\nrevoke create on schema public from restaurant_owner_branch_menu_item_write_authority;"],
  ["the audit relation loses FORCE row level security",
    "alter table restaurant_internal.branch_menu_item_sold_out_audit_log force row level security;", "-- force removed --"],
  ["the audit relation gains an UPDATE policy",
    "create policy branch_menu_item_sold_out_audit_log_writer_insert",
    "create policy branch_menu_item_sold_out_audit_log_writer_update\n  on restaurant_internal.branch_menu_item_sold_out_audit_log\n  for update to restaurant_owner_branch_menu_item_write_authority using (true);\ncreate policy branch_menu_item_sold_out_audit_log_writer_insert"],
  ["a client role keeps privileges on the audit relation",
    "revoke all on table restaurant_internal.branch_menu_item_sold_out_audit_log\n  from public, anon, authenticated, authenticator, service_role;", "-- audit revoke removed --"],
  ["the seed's row level security suspension is never restored",
    "alter table public.role_permissions force row level security;\nalter table public.restaurant_roles force row level security;", "-- restore removed --"],
  ["a durable idempotency receipt key is introduced",
    "  membership_id uuid not null,", "  request_id uuid not null,\n  membership_id uuid not null,"],
  ["the migration stops failing closed on its own outcome",
    "    raise exception 'RA-2A-P1: expected exactly one sold-out permission row, found %', v_total;", "    null;"]
];

const ACCEPTANCE_MUTANTS = [
  ["a public Nanjing demo offering is used as the acceptance target",
    "p_branch_menu_item_id: RA2AP1_ACCEPTANCE_TARGET", "p_branch_menu_item_id: 'dev-bmi-chicken-nanjing'"],
  ["the Xinyi branch is named in the acceptance harness",
    "const host = ", "const forbidden = 'dev-branch-xinyi';\nconst host = "],
  ["the acceptance harness repairs the target with a direct UPDATE",
    "  section(\"4. canonical recovery\");",
    "  await sql(`update public.branch_menu_items set sold_out = false;`);\n  section(\"4. canonical recovery\");"],
  ["the acceptance harness provisions an auth user",
    "  section(\"1. live authorization refusals\");",
    "  await sql(`insert into auth.users(id) values ('00000000-0000-4000-8000-000000000000');`);\n  section(\"1. live authorization refusals\");"],
  ["the acceptance harness deletes audit evidence",
    "  section(\"5. isolation and final state\");",
    "  await sql(`delete from restaurant_internal.branch_menu_item_sold_out_audit_log;`);\n  section(\"5. isolation and final state\");"],
  ["the acceptance target is hard-coded instead of pinned by the manifest",
    "RA2AP1_ACCEPTANCE_TARGET, RA2AP1_AUDIT_RELATION", "RA2AP1_AUDIT_RELATION"]
];

const baseMigration = readMigrationSource();
const baseAcceptance = readNormalized(process.cwd(), ACCEPTANCE);
const results = [];
const baselineMigration = auditMigrationSource(baseMigration).filter((c) => !c.pass);
const baselineAcceptance = auditAcceptanceSource(baseAcceptance).filter((c) => !c.pass);
if (baselineMigration.length || baselineAcceptance.length) {
  console.log(JSON.stringify({ suite: SUITE, status: "failed",
    reason: "the unmutated baseline does not pass its own contract",
    failures: [...baselineMigration, ...baselineAcceptance].map((c) => c.name) }, null, 2));
  process.exit(1);
}

const run = (kind, base, audit, mutants) => {
  for (const [name, from, to] of mutants) {
    const mutated = base.replace(from, to);
    const stale = mutated === base;
    const failed = stale ? [] : audit(mutated).filter((c) => !c.pass);
    results.push({ name, kind, stale, killed: !stale && failed.length > 0,
      killedBy: failed[0]?.name ?? null });
  }
};
run("migration", baseMigration, auditMigrationSource, MIGRATION_MUTANTS);
run("acceptance", baseAcceptance, auditAcceptanceSource, ACCEPTANCE_MUTANTS);

for (const [index, r] of results.entries()) {
  const verdict = r.stale ? "STALE " : r.killed ? "KILLED" : "SURVIVED";
  console.log(`${verdict} ${String(index + 1).padStart(2, "0")} ${r.name}`);
  if (r.killed) console.log(`       killed by: ${r.killedBy}`);
}
const survivors = results.filter((r) => !r.killed && !r.stale);
const stale = results.filter((r) => r.stale);
console.log("\n" + JSON.stringify({
  suite: SUITE, status: survivors.length === 0 && stale.length === 0 ? "passed" : "failed",
  total: results.length, killed: results.filter((r) => r.killed).length,
  survivors: survivors.map((r) => r.name), stale: stale.map((r) => r.name),
  repositoryModified: false
}, null, 2));
process.exitCode = survivors.length === 0 && stale.length === 0 ? 0 : 1;
