#!/usr/bin/env node
// RA-2B-P1 mutations. Each mutant is a specific way this authority could have been built wrong.
// Copies stay in memory; the repository is never modified. A mutant that does not change the source
// is reported STALE and fails the run, so a rotted anchor cannot masquerade as a kill.
import crypto from "node:crypto";
import {
  auditAcceptanceSource, auditMigrationSource, readMigrationSource, readNormalized,
  B1_FROZEN_MIGRATIONS
} from "./restaurant-owner-availability-ra-2b-p1-contract.mjs";

const SUITE = "restaurant-owner-availability-ra-2b-p1-mutations";
const ACCEPTANCE = "scripts/restaurant-owner-availability-ra-2b-p1-development-acceptance.mjs";
const AV = "restaurant_owner_branch_menu_item_availability_write_authority";
const SO = "restaurant_owner_branch_menu_item_write_authority";
const SET_FN = "public.restaurant_owner_set_branch_menu_item_availability_v1(text, text, text, bigint)";

const MIGRATION_MUTANTS = [
  // -------- independence from the frozen RA-2A authority
  ["the frozen sold-out writer is widened to availability",
    `grant update (availability)\n  on table public.branch_menu_items\n  to ${AV};`,
    `grant update (availability)\n  on table public.branch_menu_items\n  to ${AV};\ngrant update (availability) on table public.branch_menu_items to ${SO};`],
  ["the frozen sold-out writer is widened to the availability version",
    `grant usage on schema restaurant_internal\n  to ${AV};`,
    `grant update (availability_version) on table public.branch_menu_items to ${SO};\ngrant usage on schema restaurant_internal\n  to ${AV};`],
  ["no new role is created and the frozen writer is reused instead",
    `create role ${AV}\n  nologin\n  noinherit\n  nobypassrls;`, "-- role reuse --"],
  ["the availability writer gains UPDATE on sold_out",
    "grant update (availability)\n  on table public.branch_menu_items",
    "grant update (availability, sold_out)\n  on table public.branch_menu_items"],
  ["the availability writer gains UPDATE on sold_out_version",
    "grant update (availability)\n  on table public.branch_menu_items",
    "grant update (availability, sold_out_version)\n  on table public.branch_menu_items"],
  ["the availability writer gains UPDATE on its own version column",
    "grant update (availability)\n  on table public.branch_menu_items",
    "grant update (availability, availability_version)\n  on table public.branch_menu_items"],
  ["price becomes writable",
    "grant update (availability)\n  on table public.branch_menu_items",
    "grant update (availability, price)\n  on table public.branch_menu_items"],
  ["broad table UPDATE is granted",
    "grant update (availability)\n  on table public.branch_menu_items",
    "grant update\n  on table public.branch_menu_items"],
  ["RA-2A's audit relation is written by this round",
    "  insert into restaurant_internal.branch_menu_item_availability_audit_log",
    "  insert into restaurant_internal.branch_menu_item_sold_out_audit_log"],

  // -------- permission
  ["manager is granted the availability permission",
    "where role.role_key = 'owner';", "where role.role_key in ('owner', 'manager');"],
  ["staff is granted the availability permission",
    "where role.role_key = 'owner';", "where role.role_key in ('owner', 'staff');"],
  ["the permission scope is widened",
    "'branch_menu_item.availability.write', 'restaurant'",
    "'branch_menu_item.availability.write', 'branch'"],
  ["a legacy permission key is dropped from the vocabulary",
    "    'branch_menu_item.sold_out.write',\n", ""],
  ["the FORCE-RLS seed restoration is omitted",
    "alter table public.role_permissions force row level security;\nalter table public.restaurant_roles force row level security;",
    "-- restoration removed --"],
  ["the seed verification is moved after the restore, where it can only read zero",
    "alter table public.role_permissions force row level security;\nalter table public.restaurant_roles force row level security;",
    "alter table public.role_permissions force row level security;\nalter table public.restaurant_roles force row level security;\ndo $ begin if 1 = 0 then raise exception 'RA-2B-P1: expected exactly one availability permission row'; end if; end $;"],

  // -------- RESTRICTIVE policy
  ["the tenant select policy is made permissive",
    "create policy branch_menu_items_owner_availability_tenant_select\n  on public.branch_menu_items\n  as restrictive",
    "create policy branch_menu_items_owner_availability_tenant_select\n  on public.branch_menu_items"],
  ["the tenant update policy is made permissive",
    "create policy branch_menu_items_owner_availability_tenant_update\n  on public.branch_menu_items\n  as restrictive",
    "create policy branch_menu_items_owner_availability_tenant_update\n  on public.branch_menu_items"],
  ["the restrictive tenant predicate is replaced by a constant",
    "        and membership.restaurant_id = branch_menu_items.restaurant_id\n        and role.status = 'active'\n        and role.role_key = 'owner'\n        and permission.permission_key = 'branch_menu_item.availability.write'\n        and permission.permission_scope = 'restaurant'\n    )\n  );\n\ncreate policy branch_menu_items_owner_availability_tenant_update",
    "        and role.status = 'active'\n        and role.role_key = 'owner'\n        and permission.permission_key = 'branch_menu_item.availability.write'\n        and permission.permission_scope = 'restaurant'\n    )\n  );\n\ncreate policy branch_menu_items_owner_availability_tenant_update"],
  ["the restrictive update policy loses its WITH CHECK clause",
    "  with check (\n    exists (\n      select 1\n      from public.restaurant_users as caller\n      join public.restaurant_memberships as membership\n        on membership.restaurant_user_id = caller.id\n      join public.restaurant_roles as role\n        on role.id = membership.role_id\n      join public.role_permissions as permission\n        on permission.role_id = role.id\n      where caller.auth_user_id = (\n          coalesce(\n            nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),",
    "  with check (\n    true or exists (\n      select 1\n      from public.restaurant_users as caller\n      join public.restaurant_memberships as membership\n        on membership.restaurant_user_id = caller.id\n      join public.restaurant_roles as role\n        on role.id = membership.role_id\n      join public.role_permissions as permission\n        on permission.role_id = role.id\n      where caller.auth_user_id = (\n          coalesce(\n            nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),"],
  ["the migration stops asserting that the tenant policies are restrictive",
    "    raise exception 'RA-2B-P1: the tenant policies are not RESTRICTIVE (found % of 2)', v_count;", "    null;"],
  ["a client-writable policy is added",
    "create policy branch_menu_items_owner_availability_select",
    "create policy branch_menu_items_client_write on public.branch_menu_items for update to authenticated using (true);\ncreate policy branch_menu_items_owner_availability_select"],

  // -------- version
  ["the version stops advancing",
    "+ (case when new.availability is distinct from old.availability then 1 else 0 end);", "+ 0;"],
  ["the version advances on every update, not only a real change",
    "+ (case when new.availability is distinct from old.availability then 1 else 0 end);", "+ 1;"],
  ["the trigger trusts a caller-supplied version",
    "  new.availability_version := old.availability_version",
    "  new.availability_version := new.availability_version"],
  ["the trigger loses its pinned search_path",
    "returns trigger\nlanguage plpgsql\nset search_path = ''", "returns trigger\nlanguage plpgsql"],
  ["sold_out_version is reused as this operation's token",
    "    or v_target.availability_version <> p_expected_version",
    "    or v_target.sold_out_version <> p_expected_version"],

  // -------- authority
  ["the mutation accepts an actor parameter",
    "  p_branch_menu_item_id text,\n  p_expected_availability text,",
    "  p_actor_auth_user_id uuid,\n  p_branch_menu_item_id text,\n  p_expected_availability text,"],
  ["the mutation accepts caller-supplied restaurant authority",
    "  p_expected_availability text,\n  p_next_availability text,",
    "  p_restaurant_id text,\n  p_expected_availability text,\n  p_next_availability text,"],
  ["the mutation's tenant join is removed and row level security is trusted alone",
    "  join public.restaurant_memberships as membership\n    on membership.restaurant_id = item.restaurant_id\n   and membership.status = 'active'\n  join public.restaurant_users as caller\n    on caller.id = membership.restaurant_user_id\n   and caller.auth_user_id = v_actor\n   and caller.login_status = 'enabled'\n  join public.restaurant_roles as role\n    on role.id = membership.role_id\n   and role.status = 'active'\n   and role.role_key = 'owner'\n  join public.role_permissions as permission\n    on permission.role_id = role.id\n   and permission.permission_key = 'branch_menu_item.availability.write'\n   and permission.permission_scope = 'restaurant'\n  where item.id = p_branch_menu_item_id\n  for update of item;",
    "  where item.id = p_branch_menu_item_id\n  for update of item;"],
  ["the preview's tenant join is removed",
    "  join public.restaurant_memberships as membership\n    on membership.restaurant_id = item.restaurant_id\n   and membership.status = 'active'\n  join public.restaurant_users as caller\n    on caller.id = membership.restaurant_user_id\n   and caller.auth_user_id = v_actor\n   and caller.login_status = 'enabled'\n  join public.restaurant_roles as role\n    on role.id = membership.role_id\n   and role.status = 'active'\n   and role.role_key = 'owner'\n  join public.role_permissions as permission\n    on permission.role_id = role.id\n   and permission.permission_key = 'branch_menu_item.availability.write'\n   and permission.permission_scope = 'restaurant'\n  where item.id = p_branch_menu_item_id\n    and item.restaurant_id = p_restaurant_id",
    "  where item.id = p_branch_menu_item_id\n    and item.restaurant_id = p_restaurant_id"],
  ["cross-tenant existence is leaked through a distinct code",
    "  if not found then\n    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');\n  end if;\n\n  return pg_catalog.jsonb_build_object(\n    'ok', true,\n    'state', 'ready',",
    "  if not found then\n    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'cross_tenant');\n  end if;\n\n  return pg_catalog.jsonb_build_object(\n    'ok', true,\n    'state', 'ready',"],
  ["authorisation is deferred until after target resolution",
    "    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');\n  end if;\n\n  -- The tenant predicate is joined",
    "    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'denied_late');\n  end if;\n\n  -- The tenant predicate is joined"],

  // -------- state machine
  ["the expected-state check is ignored",
    "  if v_target.availability <> p_expected_availability",
    "  if false and v_target.availability <> p_expected_availability"],
  ["the expected-version check is removed",
    "  if v_target.availability <> p_expected_availability\n    or v_target.availability_version <> p_expected_version\n  then",
    "  if v_target.availability <> p_expected_availability\n  then"],
  ["a same-state request is accepted as a write",
    "  if p_next_availability = v_target.availability then", "  if false then"],
  ["the closed vocabulary is not validated",
    "    or p_next_availability not in ('available', 'limited', 'unavailable')", ""],
  ["the target row is no longer locked",
    "  where item.id = p_branch_menu_item_id\n  for update of item;",
    "  where item.id = p_branch_menu_item_id;"],

  // -------- preview integrity
  ["the preview mutates the target",
    "  if not found then\n    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');\n  end if;\n\n  return pg_catalog.jsonb_build_object(\n    'ok', true,\n    'state', 'ready',",
    "  update public.branch_menu_items set availability = 'limited' where id = p_branch_menu_item_id;\n  if not found then\n    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');\n  end if;\n\n  return pg_catalog.jsonb_build_object(\n    'ok', true,\n    'state', 'ready',"],
  ["the preview drops STABLE",
    "returns jsonb\nlanguage plpgsql\nstable\nsecurity definer", "returns jsonb\nlanguage plpgsql\nvolatile\nsecurity definer"],
  ["the preview takes a row lock",
    "    and item.branch_id = p_branch_id;", "    and item.branch_id = p_branch_id\n  for update of item;"],
  ["the preview returns an unsafe JSON number",
    "'availabilityVersion', v_target.availability_version::text",
    "'availabilityVersion', v_target.availability_version"],
  ["the mutation returns an unsafe JSON number",
    "'availabilityVersion', v_next_version::text", "'availabilityVersion', v_next_version"],

  // -------- audit
  ["the audit insert is removed",
    "  insert into restaurant_internal.branch_menu_item_availability_audit_log\n    (actor_auth_user_id,",
    "  perform 1; -- removed --\n  insert into nowhere.branch_menu_item_availability_audit_log\n    (actor_auth_user_id,"],
  ["the audit row is written before the business update",
    "  update public.branch_menu_items as item\n  set availability = p_next_availability",
    "  insert into restaurant_internal.branch_menu_item_availability_audit_log\n    (actor_auth_user_id, membership_id, restaurant_id, branch_id, branch_menu_item_id,\n     previous_availability, next_availability, previous_availability_version,\n     next_availability_version)\n  values (v_actor, v_membership_id, v_target.restaurant_id, v_target.branch_id, v_target.id,\n     v_target.availability, p_next_availability, v_target.availability_version,\n     v_target.availability_version + 1)\n  returning id into v_audit_id;\n  update public.branch_menu_items as item\n  set availability = p_next_availability"],
  ["the audit failure is swallowed by a handler",
    "  returning id into v_audit_id;\n\n  return pg_catalog.jsonb_build_object(\n    'ok', true,\n    'branchMenuItemId',",
    "  returning id into v_audit_id;\n  exception when others then v_audit_id := null;\n  end;\n\n  return pg_catalog.jsonb_build_object(\n    'ok', true,\n    'branchMenuItemId',"],
  ["a raw JSON payload is stored in the audit relation",
    "  actor_auth_user_id uuid not null,\n  membership_id uuid not null,",
    "  request_payload jsonb,\n  actor_auth_user_id uuid not null,\n  membership_id uuid not null,"],
  ["a free-text reason is stored in the audit relation",
    "  membership_id uuid not null,\n  restaurant_id text not null,",
    "  reason text,\n  membership_id uuid not null,\n  restaurant_id text not null,"],
  ["the audit relation loses FORCE row level security",
    "alter table restaurant_internal.branch_menu_item_availability_audit_log\n  force row level security;",
    "-- force removed --"],
  ["the audit relation gains an UPDATE policy",
    "create policy branch_menu_item_availability_audit_log_writer_insert",
    "create policy branch_menu_item_availability_audit_log_writer_update\n  on restaurant_internal.branch_menu_item_availability_audit_log\n  for update to " + AV + " using (true);\ncreate policy branch_menu_item_availability_audit_log_writer_insert"],
  ["a client role keeps privileges on the audit relation",
    "revoke all on table restaurant_internal.branch_menu_item_availability_audit_log\n  from public, anon, authenticated, authenticator, service_role;",
    "-- audit revoke removed --"],
  ["a durable idempotency receipt key is introduced",
    "  membership_id uuid not null,\n  restaurant_id text not null,",
    "  request_id uuid not null,\n  membership_id uuid not null,\n  restaurant_id text not null,"],

  // -------- ACL and role
  ["PUBLIC receives EXECUTE on the mutation",
    `grant execute on function ${SET_FN}\n  to authenticated;`,
    `grant execute on function ${SET_FN}\n  to authenticated;\ngrant execute on function ${SET_FN}\n  to public;`],
  ["anon receives EXECUTE on the mutation",
    `grant execute on function ${SET_FN}\n  to authenticated;`,
    `grant execute on function ${SET_FN}\n  to authenticated, anon;`],
  ["service_role receives EXECUTE on the mutation",
    `grant execute on function ${SET_FN}\n  to authenticated;`,
    `grant execute on function ${SET_FN}\n  to authenticated, service_role;`],
  ["the client EXECUTE revoke is dropped",
    `revoke all on function ${SET_FN}\n  from public, anon, authenticated, authenticator, service_role;`,
    "-- revoke removed --"],
  ["ownership is transferred before the ACL is settled",
    `revoke all on function ${SET_FN}\n  from public, anon, authenticated, authenticator, service_role;`,
    `alter function ${SET_FN}\n  owner to ${AV};\nrevoke all on function ${SET_FN}\n  from public, anon, authenticated, authenticator, service_role;`],
  ["the sealed role may log in", `create role ${AV}\n  nologin`, `create role ${AV}\n  login`],
  ["the sealed role bypasses row level security",
    "  noinherit\n  nobypassrls;", "  noinherit\n  bypassrls;"],
  ["the sealed role inherits privileges implicitly",
    "  nologin\n  noinherit\n  nobypassrls;", "  nologin\n  inherit\n  nobypassrls;"],
  ["a client role is granted membership of the sealed role",
    `grant usage on schema restaurant_internal\n  to ${AV};`,
    `grant ${AV} to authenticated;\ngrant usage on schema restaurant_internal\n  to ${AV};`],
  ["the transient sealed-role membership is never released",
    `revoke ${AV}\n  from postgres granted by postgres;`, "-- membership retained --"],
  ["the accepted control-plane creator row is attacked",
    `revoke create on schema public\n  from ${AV};`,
    `revoke admin option for ${AV} from postgres;\nrevoke create on schema public\n  from ${AV};`]
];

const ACCEPTANCE_MUTANTS = [
  ["a public Nanjing demo offering is used as the acceptance target",
    "const host = ", "const forbidden = 'dev-bmi-chicken-nanjing';\nconst host = "],
  ["the Xinyi branch is named in the acceptance harness",
    "const host = ", "const forbidden = 'dev-branch-xinyi';\nconst host = "],
  ["the acceptance harness repairs the target with a direct write",
    "  section(\"4. canonical recovery\");",
    "  await sql(`update public.branch_menu_items set availability = 'available';`);\n  section(\"4. canonical recovery\");"],
  ["the acceptance harness mutates sold_out",
    "  section(\"3. stale, no-change and ABA\");",
    "  await rpc(\"restaurant_owner_set_branch_menu_item_sold_out_v1\", JWT, {});\n  section(\"3. stale, no-change and ABA\");"],
  ["the acceptance harness deletes evidence",
    "  section(\"5. final state\");",
    "  await sql(`delete from restaurant_internal.branch_menu_item_availability_audit_log;`);\n  section(\"5. final state\");"],
  ["the acceptance harness stops asserting the frozen sold-out state",
    "B1_FROZEN_SOLD_OUT_VERSION, B1_MUTATION_ERRORS", "B1_MUTATION_ERRORS"]
];

const root = process.cwd();
const baseMigration = readMigrationSource(root);
const baseAcceptance = readNormalized(root, ACCEPTANCE);
const results = [];

const baselineFailures = [
  ...auditMigrationSource(baseMigration).filter((c) => !c.pass),
  ...auditAcceptanceSource(baseAcceptance).filter((c) => !c.pass)
];
if (baselineFailures.length) {
  console.log(JSON.stringify({ suite: SUITE, status: "failed",
    reason: "the unmutated baseline does not pass its own contract",
    failures: baselineFailures.map((c) => c.name) }, null, 2));
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

// RA-2A's migrations are frozen evidence: any edit at all must be caught by their pinned hashes.
for (const frozen of B1_FROZEN_MIGRATIONS) {
  const text = readNormalized(root, frozen.path);
  const live = crypto.createHash("sha256").update(text, "utf8").digest("hex");
  const tampered = crypto.createHash("sha256")
    .update(text + "\n-- tampered\n", "utf8")
    .digest("hex");
  results.push({
    name: `the frozen RA-2A migration ${frozen.path.split("/").pop()} is edited`,
    kind: "frozen", stale: tampered === live,
    killed: live === frozen.sha256 && tampered !== frozen.sha256,
    killedBy: "the frozen RA-2A migration matches its pinned SHA-256"
  });
}

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
