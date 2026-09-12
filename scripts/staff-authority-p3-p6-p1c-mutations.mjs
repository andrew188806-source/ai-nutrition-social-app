#!/usr/bin/env node
// P3-P6-P1C mutation gate. Mutants are in-memory only; no repository file is written.
import fs from "node:fs";

const migrationPath = "supabase/migrations/20260912030000_staff_authority_p3_p6_p1c_materializer_audit.sql";
const original = fs.readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");
function audit(sql) {
  const bare = sql.replace(/(^|\s)--[^\n]*/g, "$1");
  const materializer = bare.slice(bare.indexOf("create function admin_internal.materialize_staff_bundle_assignment_v1"), bare.indexOf("create function admin_internal.revoke_staff_bundle_assignment_v1"));
  const revoker = bare.slice(bare.indexOf("create function admin_internal.revoke_staff_bundle_assignment_v1"), bare.indexOf("-- PostgreSQL grants function EXECUTE"));
  return /create table admin_internal\.staff_authority_audit_log/.test(bare)
    && /create table admin_internal\.staff_authority_operation_receipts/.test(bare)
    && (bare.match(/force row level security;/g) ?? []).length === 2
    && /security definer[\s\S]*set search_path = ''[\s\S]*set row_security = 'on'/.test(materializer)
    && /security definer[\s\S]*set search_path = ''[\s\S]*set row_security = 'on'/.test(revoker)
    && /from admin_internal\.staff_bundle_template_permissions membership\s+where membership\.bundle_key = p_bundle_key\s+and membership\.bundle_revision = p_bundle_revision\s+and membership\.membership_kind = 'DEFAULT'\s+order by membership\.permission_key/.test(materializer)
    && /template\.bundle_key = p_bundle_key and template\.revision = p_bundle_revision/.test(materializer)
    && !/p_permission|p_entitlement|latest/i.test(materializer.slice(0, materializer.indexOf("returns jsonb")))
    && /permission\.console_admission_required/.test(materializer)
    && /v_staff_status <> 'active'/.test(materializer)
    && /p_effective_from < v_staff_effective_from/.test(materializer)
    && /or \(v_staff_effective_until is not null\s+and \(p_effective_until is null or p_effective_until > v_staff_effective_until\)\)/.test(materializer)
    && /if v_bundle_status <> 'active' then/.test(materializer)
    && /p_staff_account_id, membership\.permission_key, 'bundle_assignment', v_assignment_id/.test(materializer)
    && /'active', p_effective_from, p_effective_until/.test(materializer)
    && /staff_authority_operation_receipts/.test(materializer)
    && /if found then/.test(materializer) && /if found then/.test(revoker)
    && /request_conflict/.test(materializer) && /request_conflict/.test(revoker)
    && /pg_advisory_xact_lock/.test(materializer) && /pg_advisory_xact_lock/.test(revoker)
    && /source_type = 'bundle_assignment'/.test(revoker)
    && /source_bundle_assignment_id = p_assignment_id/.test(revoker)
    && !/source_type\s+in\s*\([^)]*direct_grant/.test(revoker)
    && !/delete\s+from\s+admin_internal\.staff_(?:bundle_assignments|permission_entitlements)/i.test(bare)
    && !/grant\s+[^;]*execute[^;]*to\s+(?:authenticated|service_role)/i.test(bare)
    && !/grant\s+(?:update|delete)[^;]*staff_authority_(?:audit_log|operation_receipts)/i.test(bare)
    && !/create function public\./i.test(bare)
    && !/staff_current_context_v1|staff_has_permission_v1/.test(bare)
    && /^begin;/m.test(bare) && /^commit;/m.test(bare) && (bare.match(/\bcommit\s*;/gi) ?? []).length === 1;
}
const mutations = [];
function mutate(name, anchor, replacement) { if (!original.includes(anchor)) throw new Error(`stale mutation anchor: ${name}`); mutations.push({ name, sql: original.replace(anchor, replacement) }); }
mutate("materialize CONDITIONAL permissions", "and membership.membership_kind = 'DEFAULT'\n    order by membership.permission_key", "and membership.membership_kind in ('DEFAULT', 'CONDITIONAL')\n    order by membership.permission_key");
mutate("accept caller permission list", "p_reason text\n)", "p_reason text,\n  p_permission_keys text[]\n)");
mutate("remove exact template membership filter", "where membership.bundle_key = p_bundle_key\n      and membership.bundle_revision = p_bundle_revision\n      and membership.membership_kind = 'DEFAULT'\n    order by membership.permission_key", "where membership.bundle_key = p_bundle_key\n      and membership.membership_kind = 'DEFAULT'\n    order by membership.permission_key");
mutate("use latest Bundle revision", "and template.revision = p_bundle_revision", "and template.revision = (select max(revision) from admin_internal.staff_bundle_templates)");
mutate("allow wrong staff derivation", "p_staff_account_id, membership.permission_key, 'bundle_assignment', v_assignment_id", "pg_catalog.gen_random_uuid(), membership.permission_key, 'bundle_assignment', v_assignment_id");
mutate("allow entitlement to outlive assignment", "'active', p_effective_from, p_effective_until, v_now, null", "'active', p_effective_from, null, v_now, null");
mutate("omit staff start containment", "if p_effective_from < v_staff_effective_from", "if false");
mutate("omit staff end containment", "or (v_staff_effective_until is not null", "or (false");
mutate("allow suspended target", "if v_staff_status <> 'active'", "if v_staff_status = 'revoked'");
mutate("allow retired Bundle", "if v_bundle_status <> 'active'", "if false");
mutate("allow console admission", "and permission.console_admission_required", "and false");
mutate("partial commit before entitlements", "with inserted_entitlements as (", "commit;\n  with inserted_entitlements as (");
mutate("audit outside transaction", "insert into admin_internal.staff_authority_audit_log (\n    request_id, event_type", "commit;\n  insert into admin_internal.staff_authority_audit_log (\n    request_id, event_type");
mutate("receipt outside transaction", "insert into admin_internal.staff_authority_operation_receipts (\n    request_id, operation_kind", "commit;\n  insert into admin_internal.staff_authority_operation_receipts (\n    request_id, operation_kind");
mutate("remove request conflict", "return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'request_conflict');", "return pg_catalog.jsonb_build_object('ok', true, 'outcome', 'replayed');");
mutate("remove idempotency serialization", "perform pg_catalog.pg_advisory_xact_lock(", "perform pg_catalog.abs(");
mutate("duplicate same-request audit", "if found then\n    if v_prior.operation_kind", "if false then\n    if v_prior.operation_kind");
mutate("Bundle revoke touches direct grants", "entitlement.source_type = 'bundle_assignment'", "entitlement.source_type in ('bundle_assignment', 'direct_grant')");
mutate("Bundle revoke touches other assignment", "entitlement.source_bundle_assignment_id = p_assignment_id", "entitlement.source_bundle_assignment_id is not null");
mutate("DELETE assignment", "update admin_internal.staff_bundle_assignments\n  set status = 'revoked'", "delete from admin_internal.staff_bundle_assignments;\n  update admin_internal.staff_bundle_assignments\n  set status = 'revoked'");
mutate("DELETE entitlement", "update admin_internal.staff_permission_entitlements entitlement", "delete from admin_internal.staff_permission_entitlements;\n    update admin_internal.staff_permission_entitlements entitlement");
mutate("grant function EXECUTE authenticated", "revoke all on function admin_internal.materialize_staff_bundle_assignment_v1(", "grant execute on function admin_internal.materialize_staff_bundle_assignment_v1(uuid,uuid,text,integer,timestamptz,timestamptz,text) to authenticated;\nrevoke all on function admin_internal.materialize_staff_bundle_assignment_v1(");
mutate("grant function EXECUTE service_role", "revoke all on function admin_internal.revoke_staff_bundle_assignment_v1(", "grant execute on function admin_internal.revoke_staff_bundle_assignment_v1(uuid,uuid,text) to service_role;\nrevoke all on function admin_internal.revoke_staff_bundle_assignment_v1(");
mutate("audit UPDATE privilege", "grant insert on table admin_internal.staff_authority_audit_log", "grant update on table admin_internal.staff_authority_audit_log to staff_authority_write_authority;\ngrant insert on table admin_internal.staff_authority_audit_log");
mutate("receipt UPDATE privilege", "grant select, insert on table admin_internal.staff_authority_operation_receipts", "grant update on table admin_internal.staff_authority_operation_receipts to staff_authority_write_authority;\ngrant select, insert on table admin_internal.staff_authority_operation_receipts");
mutate("create public direct grant RPC", "alter table admin_internal.staff_authority_audit_log enable row level security;", "create function public.grant_staff_permission() returns void language sql as $$ select $$;\nalter table admin_internal.staff_authority_audit_log enable row level security;");
mutate("create resolver prematurely", "alter table admin_internal.staff_authority_audit_log enable row level security;", "create function public.staff_current_context_v1() returns void language sql as $$ select $$;\nalter table admin_internal.staff_authority_audit_log enable row level security;");

const results = mutations.map(({ name, sql }) => ({ name, killed: !audit(sql) }));
const survivors = results.filter((item) => !item.killed).map((item) => item.name);
for (const item of results) console.log(`${item.killed ? "PASS" : "FAIL"} ${item.name}`);
console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p1c-mutations", mutations: results.length, killed: results.length - survivors.length, survivors: survivors.length, survivorNames: survivors, repositoryFilesWritten: 0, databaseUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = survivors.length ? 1 : 0;
