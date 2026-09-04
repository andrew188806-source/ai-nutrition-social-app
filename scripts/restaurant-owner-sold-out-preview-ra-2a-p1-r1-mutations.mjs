#!/usr/bin/env node
// RA-2A-P1-R1 mutations. Each mutant is a specific way this preview could have been built wrong.
// Copies stay in memory; the repository is never modified. A mutant that does not change the source
// is reported STALE and fails the run, so a rotted anchor cannot masquerade as a kill.
import crypto from "node:crypto";
import {
  auditAcceptanceSource, auditMigrationSource, readMigrationSource, readNormalized,
  R1_FROZEN_P1_MIGRATION, R1_FROZEN_P1_SHA256
} from "./restaurant-owner-sold-out-preview-ra-2a-p1-r1-contract.mjs";

const SUITE = "restaurant-owner-sold-out-preview-ra-2a-p1-r1-mutations";
const ACCEPTANCE = "scripts/restaurant-owner-sold-out-preview-ra-2a-p1-r1-development-acceptance.mjs";

const MIGRATION_MUTANTS = [
  ["the preview mutates sold_out",
    "  if not found then",
    "  update public.branch_menu_items set sold_out = true where id = p_branch_menu_item_id;\n  if not found then"],
  ["the preview advances the version",
    "  if not found then",
    "  update public.branch_menu_items set sold_out = not sold_out where id = p_branch_menu_item_id;\n  if not found then"],
  ["the preview writes an audit row",
    "  if not found then",
    "  insert into restaurant_internal.branch_menu_item_sold_out_audit_log (actor_auth_user_id) values (v_actor);\n  if not found then"],
  ["the preview takes a row lock",
    "    and item.branch_id = p_branch_id;", "    and item.branch_id = p_branch_id\n  for update;"],
  ["STABLE is dropped, so the read-only guarantee is no longer enforced by the language",
    "language plpgsql\nstable\nsecurity definer", "language plpgsql\nvolatile\nsecurity definer"],
  ["an actor parameter is introduced",
    "  p_restaurant_id text,", "  p_actor_auth_user_id uuid,\n  p_restaurant_id text,"],
  ["a role parameter is introduced",
    "  p_branch_id text,", "  p_role_key text,\n  p_branch_id text,"],
  ["a permission parameter is introduced",
    "  p_branch_menu_item_id text", "  p_permission_key text,\n  p_branch_menu_item_id text"],
  ["the caller's restaurant_id is treated as authority instead of a selector",
    "  join public.restaurant_memberships as membership\n    on membership.restaurant_id = item.restaurant_id\n   and membership.status = 'active'",
    "  join public.restaurant_memberships as membership\n    on membership.restaurant_id = p_restaurant_id\n   and membership.status = 'active'"],
  ["the tenant join is dropped and row level security is trusted alone",
    "  join public.restaurant_memberships as membership\n    on membership.restaurant_id = item.restaurant_id\n   and membership.status = 'active'\n  join public.restaurant_users as caller\n    on caller.id = membership.restaurant_user_id\n   and caller.auth_user_id = v_actor\n   and caller.login_status = 'enabled'\n  join public.restaurant_roles as role\n    on role.id = membership.role_id\n   and role.status = 'active'\n   and role.role_key = 'owner'\n  join public.role_permissions as permission\n    on permission.role_id = role.id\n   and permission.permission_key = 'branch_menu_item.sold_out.write'\n   and permission.permission_scope = 'restaurant'\n",
    ""],
  ["the owner requirement is dropped from the target join",
    "   and role.role_key = 'owner'\n  join public.role_permissions as permission", "  join public.role_permissions as permission"],
  ["cross-tenant existence is leaked through a distinct error code",
    "  if not found then\n    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');",
    "  if not found then\n    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'cross_tenant');"],
  ["the version is returned as an unsafe JSON number",
    "'soldOutVersion', v_target.sold_out_version::text", "'soldOutVersion', v_target.sold_out_version"],
  ["the response projects the actor",
    "    'soldOut', v_target.sold_out,", "    'actorAuthUserId', v_actor,\n    'soldOut', v_target.sold_out,"],
  ["authorisation is deferred until after the target is resolved",
    "    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');\n  end if;",
    "    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'denied_late');\n  end if;"],
  ["SECURITY DEFINER is removed", "stable\nsecurity definer\n", "stable\n"],
  ["row_security is disabled", "set row_security = 'on'", "set row_security = 'off'"],
  ["search_path is widened", "set search_path = ''", "set search_path = 'public'"],
  ["PUBLIC receives EXECUTE",
    "  to authenticated;", "  to authenticated;\ngrant execute on function public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text, text, text)\n  to public;"],
  ["anon receives EXECUTE", "  to authenticated;", "  to authenticated, anon;"],
  ["service_role receives EXECUTE", "  to authenticated;", "  to authenticated, service_role;"],
  ["the client EXECUTE revoke is dropped",
    "revoke all on function public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text, text, text)\n  from public, anon, authenticated, authenticator, service_role;",
    "-- revoke removed --"],
  ["ownership is transferred before the ACL is settled",
    "revoke all on function public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text, text, text)\n  from public, anon, authenticated, authenticator, service_role;",
    "alter function public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text, text, text)\n  owner to restaurant_owner_branch_menu_item_write_authority;\nrevoke all on function public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text, text, text)\n  from public, anon, authenticated, authenticator, service_role;"],
  ["a direct client table read is granted",
    "grant execute on function public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text, text, text)",
    "grant select on table public.branch_menu_items to authenticated;\ngrant execute on function public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text, text, text)"],
  ["a second sealed role is created",
    "begin;\n", "begin;\ncreate role restaurant_owner_preview_authority nologin noinherit nobypassrls;\n"],
  ["a new policy is added instead of reusing existing read authority",
    "begin;\n", "begin;\ncreate policy branch_menu_items_preview_read on public.branch_menu_items for select to authenticated using (true);\n"],
  ["the transient sealed-role membership is never released",
    "revoke restaurant_owner_branch_menu_item_write_authority from postgres granted by postgres;", "-- membership retained --"],
  ["the accepted control-plane creator row is attacked",
    "revoke create on schema public from restaurant_owner_branch_menu_item_write_authority;",
    "revoke admin option for restaurant_owner_branch_menu_item_write_authority from postgres;\nrevoke create on schema public from restaurant_owner_branch_menu_item_write_authority;"],
  ["the migration stops failing closed on its own outcome",
    "    raise exception 'RA-2A-P1-R1: expected exactly one preview function, found %', v_count;", "    null;"]
];

const ACCEPTANCE_MUTANTS = [
  ["the acceptance harness performs a business mutation",
    "  section(\"3. the preview changes nothing\");",
    "  await callPreview(JWT, selectors(R1_ACCEPTANCE_RESTAURANT, R1_ACCEPTANCE_BRANCH, R1_ACCEPTANCE_TARGET));\n  await sql(`update public.branch_menu_items set sold_out = true;`);\n  section(\"3. the preview changes nothing\");"],
  ["the acceptance harness calls the state-changing mutation RPC",
    "  section(\"2. privacy and bounded refusals\");",
    "  await fetch(`${host}/rest/v1/rpc/restaurant_owner_set_branch_menu_item_sold_out_v1`);\n  section(\"2. privacy and bounded refusals\");"],
  ["a public demo offering is named in the acceptance harness",
    "const host = ", "const forbidden = 'dev-bmi-chicken-nanjing';\nconst host = "],
  ["the Xinyi branch is named in the acceptance harness",
    "const host = ", "const forbidden = 'dev-branch-xinyi';\nconst host = "],
  ["the acceptance harness stops asserting the business state is unchanged",
    "R1_EXPECTED_SOLD_OUT, R1_EXPECTED_VERSION, R1_PROJECT_NAME", "R1_EXPECTED_SOLD_OUT, R1_PROJECT_NAME"],
  ["the acceptance harness deletes evidence",
    "  section(\"3. the preview changes nothing\");",
    "  await sql(`delete from restaurant_internal.branch_menu_item_sold_out_audit_log;`);\n  section(\"3. the preview changes nothing\");"]
];

const root = process.cwd();
const baseMigration = readMigrationSource(root);
const baseAcceptance = readNormalized(root, ACCEPTANCE);
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

// The frozen P1 migration is evidence, not source: any edit at all must be caught by its hash pin.
{
  const frozen = readNormalized(root, R1_FROZEN_P1_MIGRATION);
  const live = crypto.createHash("sha256").update(frozen, "utf8").digest("hex");
  const tampered = crypto.createHash("sha256")
    .update(frozen.replace("grant update (sold_out)", "grant update (sold_out, price)"), "utf8")
    .digest("hex");
  results.push({ name: "the frozen RA-2A-P1 migration is edited", kind: "frozen",
    stale: tampered === live, killed: live === R1_FROZEN_P1_SHA256 && tampered !== R1_FROZEN_P1_SHA256,
    killedBy: "the frozen P1 migration matches its pinned SHA-256" });
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
