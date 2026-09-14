#!/usr/bin/env node
// P3A mutation gate. Mutants are in memory only; repository files are never written.
import crypto from "node:crypto";
import fs from "node:fs";

const MIGRATION = "supabase/migrations/20260914010000_staff_management_p3_p6_p3a_authority_foundation.sql";
const original = fs.readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
const appOriginal = fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts", "utf8");
const p1cAuditOriginal = fs.readFileSync("supabase/migrations/20260912030000_staff_authority_p3_p6_p1c_materializer_audit.sql", "utf8");
const p2aOriginal = fs.readFileSync("supabase/migrations/20260912040000_staff_authority_p3_p6_p2a_effective_permission_resolver.sql", "utf8");
const admissionOriginal = fs.readFileSync("apps/admin-web/auth/admin-context.ts", "utf8");
const b0Original = fs.readFileSync("supabase/migrations/20260913020000_staff_authority_p3_p6_p2d_b0_b_branch_mutation_authority.sql", "utf8");
const digest = (x) => crypto.createHash("sha256").update(x).digest("hex");
const frozen = { app: digest(appOriginal), p1c: digest(p1cAuditOriginal), p2a: digest(p2aOriginal), admission: digest(admissionOriginal), b0: digest(b0Original) };
function audit(state) {
  const s = state.sql;
  const seed = s.match(/insert into admin_internal\.staff_permission_catalog[\s\S]*?;\n/)?.[0] ?? "";
  const roles = ["staff_management_reader", "staff_account_write_authority", "staff_bundle_assignment_authority", "staff_direct_grant_authority", "staff_delegation_write_authority", "staff_console_admission_authority"];
  return (seed.match(/'active', 'planned', 'SECURITY_AUTH'/g) ?? []).length === 8
    && !/'active', 'current', 'SECURITY_AUTH'/.test(seed)
    && (seed.match(/false, false, false, true, false, false/g) ?? []).length === 8
    && !/admin_context\.read/.test(s)
    && roles.every((role) => new RegExp(`create role ${role} nologin noinherit nobypassrls;`).test(s))
    && !new RegExp(`grant (?:${roles.join("|")}) to (?:public|anon|authenticated|authenticator|service_role)`, "i").test(s)
    && /constraint staff_permission_delegations_permission_fkey[\s\S]*staff_permission_catalog \(permission_key\)[\s\S]*on update restrict on delete restrict/.test(s)
    && /permission_key = pg_catalog\.btrim\(permission_key\)[\s\S]*strpos\(permission_key, '\*'\) = 0/.test(s)
    && /scope_kind = 'global'/.test(s) && !/scope_kind in \('global',/.test(s)
    && /status in \('active', 'revoked'\)/.test(s)
    && /staff_permission_delegation_revoked_terminal/.test(s)
    && /effective_until is null or effective_until > effective_from/.test(s)
    && /check \(can_grant or can_revoke\)/.test(s)
    && /unique \(actor_auth_user_id, request_id\)/.test(s)
    && !/grant[^;]*(?:update|delete|truncate)[^;]*on table admin_internal\.staff_management_operation_receipts/i.test(s)
    && !/grant[^;]*(?:update|delete|truncate)[^;]*on table admin_internal\.staff_management_audit_log/i.test(s)
    && (s.match(/force row level security;/g) ?? []).length === 3
    && (s.match(/from public, anon, authenticated, authenticator, service_role;/g) ?? []).length >= 5
    && !/grant[^;]*on (?:table )?admin_internal\.staff_(?:permission_delegations|management_operation_receipts|management_audit_log) to (?:public|anon|authenticated|authenticator|service_role)/i.test(s)
    && !/on delete cascade/i.test(s)
    && !/insert into admin_internal\.staff_(?:permission_delegations|management_operation_receipts|management_audit_log|platform_admin_compatibility_links)/.test(s)
    && !/grant\s+(?:[^;]*insert|[^;]*update)[^;]*staff_permission_entitlements[^;]*staff_direct_grant_authority/is.test(s)
    && digest(state.app) === frozen.app && digest(state.p1c) === frozen.p1c
    && digest(state.p2a) === frozen.p2a && digest(state.admission) === frozen.admission
    && digest(state.b0) === frozen.b0;
}
const base = { sql: original, app: appOriginal, p1c: p1cAuditOriginal, p2a: p2aOriginal, admission: admissionOriginal, b0: b0Original };
const mutants = [];
function mutate(name, field, find, replacement) { if (!base[field].includes(find)) throw new Error(`stale mutation anchor: ${name}`); mutants.push({ name, state: { ...base, [field]: base[field].replace(find, replacement) } }); }
mutate("management permission seeded CURRENT", "sql", "'admin.management.read', 'active', 'planned'", "'admin.management.read', 'active', 'current'");
mutate("management write ordinary delegable", "sql", "false, false, false, true, false, false),\n  ('admin.management.staff.bundle.write'", "false, false, true, true, false, false),\n  ('admin.management.staff.bundle.write'");
mutate("admin_context metadata changed", "sql", "insert into admin_internal.staff_permission_catalog (", "update admin_internal.staff_permission_catalog set console_admission_required=false where permission_key='admin_context.read';\ninsert into admin_internal.staff_permission_catalog (");
mutate("wildcard delegation accepted", "sql", "and pg_catalog.strpos(permission_key, '*') = 0", "and true");
mutate("arbitrary scope accepted", "sql", "check (scope_kind = 'global')", "check (scope_kind in ('global', 'restaurant'))");
mutate("delegation FK removed", "sql", "constraint staff_permission_delegations_permission_fkey", "constraint removed_staff_permission_delegations_permission_fkey");
mutate("revoked delegation reactivated", "sql", "message = 'staff_permission_delegation_revoked_terminal'", "message = 'reactivation_allowed'");
mutate("invalid window accepted", "sql", "check (effective_until is null or effective_until > effective_from)", "check (true)");
mutate("client SELECT delegation", "sql", "grant usage on schema admin_internal to staff_management_reader;", "grant select on admin_internal.staff_permission_delegations to authenticated;\ngrant usage on schema admin_internal to staff_management_reader;");
mutate("client INSERT delegation", "sql", "grant usage on schema admin_internal to staff_management_reader;", "grant insert on admin_internal.staff_permission_delegations to authenticated;\ngrant usage on schema admin_internal to staff_management_reader;");
mutate("service_role table access", "sql", "grant usage on schema admin_internal to staff_management_reader;", "grant select on admin_internal.staff_management_audit_log to service_role;\ngrant usage on schema admin_internal to staff_management_reader;");
mutate("receipt UPDATE allowed", "sql", "grant select, insert on table admin_internal.staff_management_operation_receipts", "grant select, insert, update on table admin_internal.staff_management_operation_receipts");
mutate("receipt DELETE allowed", "sql", "grant select, insert on table admin_internal.staff_management_operation_receipts", "grant select, insert, delete on table admin_internal.staff_management_operation_receipts");
mutate("audit UPDATE allowed", "sql", "grant insert on table admin_internal.staff_management_audit_log", "grant insert, update on table admin_internal.staff_management_audit_log");
mutate("audit DELETE allowed", "sql", "grant insert on table admin_internal.staff_management_audit_log", "grant insert, delete on table admin_internal.staff_management_audit_log");
mutate("cascade-delete history", "sql", "on update restrict on delete restrict", "on update restrict on delete cascade");
mutate("management role LOGIN", "sql", "create role staff_management_reader nologin", "create role staff_management_reader login");
mutate("management role INHERIT", "sql", "create role staff_account_write_authority nologin noinherit", "create role staff_account_write_authority nologin inherit");
mutate("management role BYPASSRLS", "sql", "create role staff_bundle_assignment_authority nologin noinherit nobypassrls", "create role staff_bundle_assignment_authority nologin noinherit bypassrls");
mutate("client SET ROLE path", "sql", "grant usage on schema admin_internal to staff_management_reader;", "grant staff_management_reader to authenticated;\ngrant usage on schema admin_internal to staff_management_reader;");
mutate("auto-grant to Platform Admin", "sql", "commit;", "insert into admin_internal.staff_permission_delegations select null;\ncommit;");
mutate("P1C audit modified", "p1c", "staff_authority_audit_log", "mutated_staff_authority_audit_log");
mutate("P1C receipt modified", "p1c", "staff_authority_operation_receipts", "mutated_staff_authority_operation_receipts");
mutate("P2A resolver modified", "p2a", "readiness_status = 'current'", "readiness_status in ('current','planned')");
mutate("application permission vocabulary expanded", "app", "admin_audit.read", "admin.management.read");
mutate("staff admission changed", "admission", "mode.mode === \"staff\"", "mode.mode === \"legacy\"");
mutate("B0 operation changed", "b0", "permission_denied", "authority_bypass");
mutate("direct role can write entitlements", "sql", "grant usage on schema admin_internal to staff_direct_grant_authority;", "grant insert on admin_internal.staff_permission_entitlements to staff_direct_grant_authority;\ngrant usage on schema admin_internal to staff_direct_grant_authority;");

const results = mutants.map(({ name, state }) => ({ name, killed: !audit(state) }));
const survivors = results.filter((x) => !x.killed);
for (const x of results) console.log(`${x.killed ? "PASS" : "FAIL"} ${x.name}`);
console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p3a-mutations", mutations: results.length, killed: results.length - survivors.length, survivors: survivors.length, survivorNames: survivors.map((x) => x.name), repositoryFilesWritten: 0, databaseUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = survivors.length ? 1 : 0;
