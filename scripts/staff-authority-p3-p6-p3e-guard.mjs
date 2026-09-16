#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { isBoundedP3BSuccessor } from "./staff-authority-p3-p6-p3b-successor-awareness.mjs";

const migration = "supabase/migrations/20260915010000_staff_management_p3_p6_p3e_console_admission_operator.sql";
const p3dPath = "supabase/migrations/20260914040000_staff_management_p3_p6_p3d_delegated_permission_operator.sql";
const p3cPath = "supabase/migrations/20260914030000_staff_management_p3_p6_p3c_delegation_operator.sql";
const p2aPath = "supabase/migrations/20260912040000_staff_authority_p3_p6_p2a_effective_permission_resolver.sql";
const p1cPath = "supabase/migrations/20260912030000_staff_authority_p3_p6_p1c_materializer_audit.sql";
const vocabularyPath = "apps/admin-web/auth/admin-current-permission-vocabulary.ts";
const sql = fs.readFileSync(migration, "utf8");
const p3d = fs.readFileSync(p3dPath, "utf8");
const p3c = fs.readFileSync(p3cPath, "utf8");
const p1c = fs.readFileSync(p1cPath, "utf8");
const vocabulary = fs.readFileSync(vocabularyPath, "utf8");
const sha = (path) => crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const tests = [];
const failures = [];
function check(name, condition) {
  tests.push(name);
  try { assert.ok(condition); console.log(`PASS ${String(tests.length).padStart(2, "0")} ${name}`); }
  catch (error) { failures.push(name); console.log(`FAIL ${String(tests.length).padStart(2, "0")} ${name}: ${error.message}`); }
}

const baseline = "a384e9769556873105f06c15f88560ba4ab361d1";
const p3eHead = "7139b2b14b19cb7033301c19a8f6700f3e1b6d34";
const head = git("rev-parse", "HEAD");
const frozen = head === baseline || head === p3eHead || [baseline, p3eHead].includes(git("rev-parse", "HEAD^"));
const migrationCount = fs.readdirSync("supabase/migrations").filter((x) => x.endsWith(".sql")).length;
const p3fPhase = migrationCount === 122;
const p3gPhase = isBoundedP3BSuccessor(process.cwd()) && migrationCount === 123;
const r1Phase = isBoundedP3BSuccessor(process.cwd()) && migrationCount === 124;
const p3hPhase = isBoundedP3BSuccessor(process.cwd()) && migrationCount === 125;
check("exact P3D predecessor is current or bounded successor", frozen || p3gPhase || r1Phase || p3hPhase);
check("migration inventory is exact through P3H", migrationCount === (p3hPhase ? 125 : r1Phase ? 124 : p3gPhase ? 123 : p3fPhase ? 122 : 121));
check("exactly one P3E migration exists", fs.readdirSync("supabase/migrations").filter((x) => /p3e_console_admission_operator\.sql$/.test(x)).length === 1);
check("P3D hash is pinned", sha(p3dPath) === "350db01448691a93bdf215032d3cd325ea87d124742afcbecc0f7d61016d1c90");
check("P3C hash is pinned", sha(p3cPath) === "9140a6bac29b56c00bccdc3eee40f9023ef19fb474dfff46a6a8c0e90ff9d5f4");
check("P2A hash is pinned", sha(p2aPath) === "140c0bd790c428d2153671d373d4e5a362de962714f0630741820fc93ece699d");
check("console admission writer is promoted CURRENT", /permission_key = 'admin\.management\.staff\.console_admission\.write'[\s\S]*readiness_status = 'planned'[\s\S]*sensitivity_class = 'SECURITY_AUTH'[\s\S]*set readiness_status = 'current'|set readiness_status = 'current'[\s\S]*permission_key = 'admin\.management\.staff\.console_admission\.write'/.test(sql));
check("promotion pins inactive ordinary provisioning", /individually_provisionable = false[\s\S]*temporary_grantable = false[\s\S]*ordinary_supervisor_delegable = false[\s\S]*privileged_only = true[\s\S]*deferred = false[\s\S]*console_admission_required = false/.test(sql));
check("generic permission writer is not promoted", !/permission_key = 'admin\.management\.staff\.permission\.write'[\s\S]{0,500}set readiness_status = 'current'/.test(sql));
check("no other management permission is promoted", (sql.match(/set readiness_status = 'current'/g) ?? []).length === 1);

const currentKeys = [...vocabulary.matchAll(/^\s+"([a-z0-9_.]+)"/gm)].map((m) => m[1]);
const expectedKeys = ["admin_audit.read", "admin_context.read", "admin.management.staff.account.write", "admin.management.staff.delegation.write", "admin.management.staff.console_admission.write", ...((p3fPhase || p3gPhase || r1Phase || p3hPhase) ? ["admin.management.staff.permission.write"] : []), "admin_restaurant_branch.status.write"];
check("application vocabulary is exact through P3F", currentKeys.length === expectedKeys.length && expectedKeys.every((key) => currentKeys.includes(key)));
check("application vocabulary has no unexpected key", currentKeys.length === ((p3fPhase || p3gPhase || r1Phase || p3hPhase) ? 7 : 6));
check("permission.write follows bounded P3F-P3H state", currentKeys.includes("admin.management.staff.permission.write") === (p3fPhase || p3gPhase || r1Phase || p3hPhase));
check("admin_context metadata receives zero update", !/update admin_internal\.staff_permission_catalog[\s\S]{0,300}permission_key = 'admin_context\.read'/.test(sql));
check("dedicated provenance table exists", /create table admin_internal\.staff_console_admission_grants/.test(sql));
check("provenance has exact entitlement uniqueness", /entitlement_id uuid not null[\s\S]*unique \(entitlement_id\)/.test(sql));
check("provenance targets exact staff account", /staff_console_admission_grants_target_fkey[\s\S]*references admin_internal\.staff_accounts \(id\)/.test(sql));
check("history foreign keys are restrictive", (sql.match(/on update restrict on delete restrict/g) ?? []).length >= 6 && !/on delete cascade/i.test(sql));
check("one active P3E source per target", /unique index staff_console_admission_grants_active_target_key[\s\S]*\(target_staff_account_id\)[\s\S]*where status = 'active'/.test(sql));
check("provenance FORCEs RLS", /alter table admin_internal\.staff_console_admission_grants force row level security/.test(sql));
check("client and service roles are revoked from provenance", /revoke all on table admin_internal\.staff_console_admission_grants[\s\S]*from public, anon, authenticated, authenticator, service_role/.test(sql));
check("sealed console role alone owns provenance ACL", /grant select, insert on table admin_internal\.staff_console_admission_grants[\s\S]*to staff_console_admission_authority/.test(sql));
check("provenance has no DELETE grant", !/grant delete[^;]*staff_console_admission_grants/i.test(sql));
check("entitlement INSERT is exact admin_context direct source", /staff_permission_entitlements_console_writer_insert[\s\S]*permission_key = 'admin_context\.read'[\s\S]*source_type = 'direct_grant'[\s\S]*source_bundle_assignment_id is null/.test(sql));
check("entitlement UPDATE is provenance scoped", /staff_permission_entitlements_console_writer_update[\s\S]*staff_console_admission_grants[\s\S]*admission\.entitlement_id = staff_permission_entitlements\.entitlement_id/.test(sql));
check("ordinary direct authority receives no P3E privilege", !/to staff_direct_grant_authority/.test(sql));
check("sealed role separation is preserved", !/grant staff_(?:direct_grant|delegation_write|account_write)_authority to staff_console_admission_authority/.test(sql));

check("actor lock accepts exact console writer", /lock_current_staff_management_actor_v1[\s\S]*'admin\.management\.staff\.console_admission\.write'/.test(sql));
check("actor lock includes admin_context", /effective\.permission_key in \('admin_context\.read', p_required_management_permission_key\)/.test(sql));
check("actor derives from verified request subject", /v_actor := admin_internal\.staff_request_subject_v1\(\)/.test(sql));
check("actor has no caller-controlled ID", !/create function public\.[\s\S]{0,300}p_actor/i.test(sql));
check("actor helper has no legacy fallback", !/platform_admin|legacy.*(?:fallback|bypass)/i.test(sql));
check("actor authority sources are locked", /for update[\s\S]*staff_permission_entitlements[\s\S]*for update/.test(sql));
check("target then catalogue lock is dedicated", /lock_staff_console_admission_target_policy_v1[\s\S]*staff_accounts[\s\S]*for update[\s\S]*staff_permission_catalog[\s\S]*'admin_context\.read'[\s\S]*for update/.test(sql));
check("target active state is required", /v_target\.target_status <> 'active'/.test(sql));
check("future target is denied", /v_target\.target_effective_from > v_database_now/.test(sql));
check("expired target is denied", /v_database_now >= v_target\.target_effective_until/.test(sql));
check("self grant is denied", (sql.match(/self_target_denied/g) ?? []).length >= 2);
check("self revoke is denied", /v_pre_grant\.target_staff_account_id = v_actor_staff_account_id/.test(sql));
check("admin_context catalogue must be active CURRENT", /permission_lifecycle_status <> 'active'[\s\S]*permission_readiness_status <> 'current'/.test(sql));
check("admin_context SECURITY_AUTH is revalidated", /permission_sensitivity_class <> 'SECURITY_AUTH'/.test(sql));
check("admin_context ordinary restrictions are revalidated", /permission_individually_provisionable[\s\S]*permission_temporary_grantable[\s\S]*permission_ordinary_supervisor_delegable/.test(sql));
check("admin_context console flag is required", /not v_target\.permission_console_admission_required/.test(sql));
check("target envelope supplies exact entitlement end", /'active', v_database_now, v_target\.target_effective_until/.test(sql));

check("exactly two P3E public RPCs exist", (sql.match(/create function public\.staff_management_(?:grant|revoke)_console_admission_v1/g) ?? []).length === 2);
check("grant RPC signature has target reason request only", /staff_management_grant_console_admission_v1\(\s*p_target_staff_account_id uuid,\s*p_reason_code text,\s*p_request_id uuid\s*\)/m.test(sql));
check("revoke RPC signature has source CAS reason request", /staff_management_revoke_console_admission_v1\(\s*p_console_admission_grant_id uuid,\s*p_expected_status_version bigint,\s*p_reason_code text,\s*p_request_id uuid\s*\)/m.test(sql));
check("public RPCs expose no permission parameter", !/create function public\.staff_management_(?:grant|revoke)_console_admission_v1\([\s\S]{0,240}p_permission/i.test(sql));
check("public RPCs expose no custom window", !/create function public\.staff_management_(?:grant|revoke)_console_admission_v1\([\s\S]{0,240}p_effective/i.test(sql));
check("permission is server-hard-coded", (sql.match(/'admin_context\.read'/g) ?? []).length >= 12);
check("grant creates exact direct entitlement", /insert into admin_internal\.staff_permission_entitlements[\s\S]*'admin_context\.read', 'direct_grant', null/.test(sql));
check("grant creates exact provenance", /insert into admin_internal\.staff_console_admission_grants/.test(sql));
check("duplicate active source is bounded", /unique_violation[\s\S]*console_admission_exists/.test(sql));
check("revoke targets exact provenance ID", /console_admission_grant_id = p_console_admission_grant_id[\s\S]*for update/.test(sql));
check("revoke requires exact CAS", /status_version <> p_expected_status_version[\s\S]*stale_state/.test(sql));
check("revoke binds exact entitlement ID", /entitlement_id = v_grant\.entitlement_id[\s\S]*for update/.test(sql));
check("revoke checks hard-coded admin_context", /v_entitlement\.permission_key <> 'admin_context\.read'/.test(sql));
check("revoked provenance is terminal", /old\.status = 'revoked' and new is distinct from old/.test(sql));
check("revoked entitlement remains terminal through P3D trigger", /staff_permission_entitlements_revoked_terminal_v1/.test(p3d));
check("no physical entitlement or provenance DELETE", !/delete from admin_internal\.(?:staff_permission_entitlements|staff_console_admission_grants)/i.test(sql));
check("restoration has no reactivation path", !/set status = 'active'/.test(sql));
check("shared receipts are reused", /insert into admin_internal\.staff_management_operation_receipts/.test(sql) && !/create table .*receipt/i.test(sql));
check("shared audit is reused", /insert into admin_internal\.staff_management_audit_log/.test(sql) && !/create table .*audit/i.test(sql));
check("receipt replay returns without duplicate evidence", /return v_prior\.result_payload/.test(sql));
check("request conflicts are bounded", /request_conflict/.test(sql));
check("request advisory lock is present", /pg_advisory_xact_lock/.test(sql));
check("audit captures actor target entitlement reason request", /staff_management_audit_log \([\s\S]*actor_auth_user_id[\s\S]*target_staff_account_id[\s\S]*entitlement_id[\s\S]*reason_code[\s\S]*request_id/.test(sql));

check("P3C still rejects admin_context", /p_permission_key = 'admin_context\.read'|permission_console_admission_required/.test(p3c));
check("P3D still rejects admin_context", /permission_key = 'admin_context\.read'[\s\S]*permission_console_admission_required/.test(p3d));
check("P1C still rejects console admission Bundle materialization", /permission\.console_admission_required[\s\S]*bundle_console_admission_forbidden/.test(p1c));
check("P2A resolver file remains frozen", sha(p2aPath) === "140c0bd790c428d2153671d373d4e5a362de962714f0630741820fc93ece699d");
check("no legacy Platform Admin role permission mutation", !/platform_admin_role_permissions|platform_admin_memberships/.test(sql));
check("no service_role runtime grant", !/grant execute[^;]*to service_role/i.test(sql));
check("no anon runtime grant", !/grant execute[^;]*to anon/i.test(sql));
check("authenticated receives only public RPC EXECUTE", (sql.match(/\) to authenticated;/g) ?? []).length === 2);
check("RPCs are volatile SECURITY DEFINER with empty search path and RLS", (sql.match(/language sql\s+volatile\s+security definer\s+set search_path = ''\s+set row_security = 'on'/g) ?? []).length === 2);
check("no route or navigation promotion", !/admin-route-registry|Sidebar|route registry/i.test(sql));
check("no Auth Admin runtime", !/auth\.admin|createUser|inviteUser/i.test(sql));
check("migration seeds no staff account", !/insert into admin_internal\.staff_accounts/i.test(sql));
check("migration seeds no console provenance", (sql.match(/insert into admin_internal\.staff_console_admission_grants/g) ?? []).length === 1);
check("migration seeds no console manager entitlement", !/insert into admin_internal\.staff_permission_entitlements[\s\S]{0,300}'admin\.management\.staff\.console_admission\.write'/.test(sql));
check("migration contains no credential-shaped value", !/(?:service_role_key|access_token|refresh_token|password\s*=|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@)/i.test(sql));

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p3e-guard", total: tests.length, passed: tests.length - failures.length, failed: failures.length, failures, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
