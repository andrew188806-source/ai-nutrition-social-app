#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { isBoundedP3BSuccessor } from "./staff-authority-p3-p6-p3b-successor-awareness.mjs";

const ROOT = process.cwd();
const PREDECESSOR = "5590b3dd287247ea3b26983cb393339b0affa63c";
const MIGRATION = "supabase/migrations/20260914020000_staff_management_p3_p6_p3b_account_operator.sql";
const P3A = "supabase/migrations/20260914010000_staff_management_p3_p6_p3a_authority_foundation.sql";
const VOCABULARY = "apps/admin-web/auth/admin-current-permission-vocabulary.ts";
const P3C = "supabase/migrations/20260914030000_staff_management_p3_p6_p3c_delegation_operator.sql";
const P3D = "supabase/migrations/20260914040000_staff_management_p3_p6_p3d_delegated_permission_operator.sql";
const P3E = "supabase/migrations/20260915010000_staff_management_p3_p6_p3e_console_admission_operator.sql";
const P3F = "supabase/migrations/20260915020000_staff_management_p3_p6_p3f_privileged_permission_operator.sql";
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const sql = read(MIGRATION);
const p3a = read(P3A);
const vocabulary = await import(pathToFileURL(path.join(ROOT, VOCABULARY)).href + `?v=${Date.now()}`);
const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((x) => x.endsWith(".sql")).sort();
const p3cPhase = migrations.length === 119 && migrations.at(-1) === path.basename(P3C);
const p3dPhase = migrations.length === 120 && migrations.at(-1) === path.basename(P3D);
const p3ePhase = migrations.length === 121 && migrations.at(-1) === path.basename(P3E);
const p3fPhase = migrations.length === 122 && migrations.at(-1) === path.basename(P3F);
const p3gPhase = isBoundedP3BSuccessor(ROOT) && migrations.length === 123;
const changed = [...new Set([
  ...git("diff", "--name-only", PREDECESSOR).split("\n"),
  ...git("ls-files", "--others", "--exclude-standard").split("\n")
].filter(Boolean))].sort();
const checks = [], failures = [];
function check(name, pass, detail) {
  const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}
const exactCurrent = [
  "admin_audit.read", "admin_context.read", "admin.management.staff.account.write",
  "admin_restaurant_branch.status.write"
];
const otherManagement = [
  "admin.management.read", "admin.management.permissions.read", "admin.management.staff.read",
  "admin.management.staff.bundle.write", "admin.management.staff.permission.write",
  "admin.management.staff.delegation.write", "admin.management.staff.console_admission.write"
];
const frozen = new Map([
  ["supabase/migrations/20260912010000_staff_authority_p3_p6_p1a_foundation.sql", "68a938a04b898f8d25b2ee7c9176cd3e9c97b3f324e66cbc1b70b1ad61470ddf"],
  ["supabase/migrations/20260912020000_staff_authority_p3_p6_p1b_entitlement_foundation.sql", "c60becab5009051a01311e53dc7d8fa6c9072925aaa283cda3abff56b6e455c4"],
  ["supabase/migrations/20260912030000_staff_authority_p3_p6_p1c_materializer_audit.sql", "c4f3877f889582a3af14533f530135beced7ba68a7d11f82e23f2b4ea996e835"],
  ["supabase/migrations/20260912040000_staff_authority_p3_p6_p2a_effective_permission_resolver.sql", "140c0bd790c428d2153671d373d4e5a362de962714f0630741820fc93ece699d"],
  ["supabase/migrations/20260912050000_staff_authority_p3_p6_p2b_platform_admin_compatibility.sql", "12b70090b757d32df79fbb3bbeda206f16a4458f3b1d091bf9476c59b16a410e"],
  ["supabase/migrations/20260913010000_staff_authority_p3_p6_p2d_b0_a_protected_read_authority.sql", "cd9aabb50c82b1308542a178cbf436116e620573a2371dc16b7811d0f5431658"],
  ["supabase/migrations/20260913020000_staff_authority_p3_p6_p2d_b0_b_branch_mutation_authority.sql", "26e757ff7b26471179c5e626094795bc30aa436087fcaa8244f5870ac3bf0a76"],
  [P3A, "7f24c439f5c052d1912516e8b3328a9b24e3df5977ad20eaefdc9758303c2611"],
  ["apps/admin-web/auth/admin-route-registry.ts", "911bd111afbbb6709eac17268cb55d011d3ed0a0030d4bd12e931e4ee274b2f8"]
]);
const functions = [
  "staff_management_link_staff_account_v1", "staff_management_suspend_staff_account_v1",
  "staff_management_reactivate_staff_account_v1", "staff_management_revoke_staff_account_v1"
];

check("migration is one complete transaction", /^--[\s\S]*\nbegin;[\s\S]*\ncommit;\s*$/.test(sql));
check("migration count is exact through bounded P3G", migrations.length === (p3gPhase ? 123 : p3fPhase ? 122 : p3ePhase ? 121 : p3dPhase ? 120 : p3cPhase ? 119 : 118), migrations.length);
check("P3B migration has only exact P3C-P3G successors", p3gPhase || migrations.at(-1) === path.basename(p3fPhase ? P3F : p3ePhase ? P3E : p3dPhase ? P3D : p3cPhase ? P3C : MIGRATION), migrations.at(-1));
check("all frozen predecessor hashes match", [...frozen].every(([f, digest]) => sha(f) === digest));
check("P3A hash matches exact baseline", sha(P3A) === frozen.get(P3A));
check("account writer role is reused", !/create role staff_account_write_authority/i.test(sql));
check("no generic management super-role is created", !/create role .*management.*(?:super|admin)/i.test(sql));
check("exact account permission is promoted", /permission_key = 'admin\.management\.staff\.account\.write'[\s\S]*readiness_status = 'planned'/.test(sql));
check("promotion changes readiness to current", /set readiness_status = 'current'/.test(sql));
check("promotion preserves SECURITY_AUTH", /sensitivity_class = 'SECURITY_AUTH'/.test(sql));
check("promotion preserves six security booleans", /individually_provisionable = false[\s\S]*temporary_grantable = false[\s\S]*ordinary_supervisor_delegable = false[\s\S]*privileged_only = true[\s\S]*deferred = false[\s\S]*console_admission_required = false/.test(sql));
check("promotion requires exactly one row", /v_updated <> 1[\s\S]*staff_account_write_promotion_mismatch/.test(sql));
check("other seven management permissions remain P3A planned", otherManagement.every((key) => new RegExp(`'${key.replaceAll(".", "\\.")}', 'active', 'planned', 'SECURITY_AUTH'`).test(p3a)));
const expectedCurrent = (p3fPhase || p3gPhase)
  ? [...exactCurrent.slice(0, 3), "admin.management.staff.delegation.write", "admin.management.staff.console_admission.write", "admin.management.staff.permission.write", exactCurrent[3]]
  : p3ePhase
  ? [...exactCurrent.slice(0, 3), "admin.management.staff.delegation.write", "admin.management.staff.console_admission.write", exactCurrent[3]]
  : (p3cPhase || p3dPhase) ? [...exactCurrent.slice(0, 3), "admin.management.staff.delegation.write", exactCurrent[3]] : exactCurrent;
check("application current vocabulary is exact through bounded P3F", JSON.stringify(vocabulary.CURRENT_ADMIN_PERMISSION_KEYS) === JSON.stringify(expectedCurrent), vocabulary.CURRENT_ADMIN_PERMISSION_KEYS);
check("only bounded management keys are current", otherManagement.every((key) => ((p3cPhase || p3dPhase || p3ePhase || p3fPhase || p3gPhase) && key === "admin.management.staff.delegation.write") || ((p3ePhase || p3fPhase || p3gPhase) && key === "admin.management.staff.console_admission.write") || ((p3fPhase || p3gPhase) && key === "admin.management.staff.permission.write") || !vocabulary.CURRENT_ADMIN_PERMISSION_KEYS.includes(key)));
check("Admin route registry is frozen", sha("apps/admin-web/auth/admin-route-registry.ts") === frozen.get("apps/admin-web/auth/admin-route-registry.ts"));
check("no route or navigation source changed", !changed.some((f) => !f.startsWith("scripts/") && /admin-route-registry|Sidebar|navigation|\/app\/admin\/management/.test(f)));
check("four exact public RPC definitions exist", functions.every((fn) => new RegExp(`create function public\\.${fn}\\(`).test(sql)));
check("no fifth public management RPC exists", (sql.match(/create function public\.staff_management_[a-z_]+_v1\(/g) ?? []).length === 4);
check("all public RPCs are SECURITY DEFINER", functions.every((fn) => new RegExp(`create function public\\.${fn}\\([\\s\\S]*?security definer`).test(sql)));
check("all public RPCs are VOLATILE", functions.every((fn) => new RegExp(`create function public\\.${fn}\\([\\s\\S]*?volatile`).test(sql)));
check("all public RPCs have empty search_path", functions.every((fn) => new RegExp(`create function public\\.${fn}\\([\\s\\S]*?set search_path = ''`).test(sql)));
check("all public RPCs force row_security on", functions.every((fn) => new RegExp(`create function public\\.${fn}\\([\\s\\S]*?set row_security = 'on'`).test(sql)));
check("all public RPCs are owned by account writer", functions.every((fn) => new RegExp(`alter function public\\.${fn}\\([\\s\\S]*?owner to staff_account_write_authority`).test(sql)));
check("all public RPCs grant authenticated execute", functions.every((fn) => new RegExp(`grant execute on function public\\.${fn}\\([\\s\\S]*?to authenticated`).test(sql)));
check("all public RPCs revoke service role", functions.every((fn) => new RegExp(`revoke all on function public\\.${fn}\\([\\s\\S]*?service_role`).test(sql)));
check("public RPCs accept no actor identity", !/create function public\.[\s\S]*p_actor/i.test(sql));
check("locked actor derives request subject", /lock_current_staff_management_actor_v1[\s\S]*staff_request_subject_v1\(\)/.test(sql));
check("locked actor accepts only account.write", /p_required_management_permission_key is distinct from[\s\S]*admin\.management\.staff\.account\.write/.test(sql));
check("locked actor requires exact admin context", /permission_key in \([\s\S]*'admin_context\.read'[\s\S]*'admin\.management\.staff\.account\.write'/.test(sql));
check("actor staff account is locked first", sql.indexOf("where account.auth_user_id = v_actor\n  for update") < sql.indexOf("order by permission.permission_key\n    for update"));
check("catalog keys lock in sorted order", /order by permission\.permission_key\n    for update/.test(sql));
check("Bundle authority sources lock after catalog", sql.indexOf("for update of assignment") > sql.indexOf("order by permission.permission_key\n    for update"));
check("entitlements lock after Bundle sources", sql.indexOf("order by entitlement.entitlement_id\n    for update") > sql.indexOf("for update of assignment"));
check("actor authority uses frozen resolver", /staff_effective_permissions_for_subject_v1\(\s*v_actor, v_database_now/.test(sql));
check("actor authority is source independent", /source_type in \('direct_grant', 'migration_backfill'\)[\s\S]*source_type = 'bundle_assignment'/.test(sql));
check("actor requires both effective keys", /v_effective_count <> 2 or v_locked_effective_count <> 2/.test(sql));
check("actor authorization precedes request lock", sql.indexOf("lock_current_staff_management_actor_v1(") < sql.indexOf("v_actor_auth_user_id::text || ':' || p_request_id::text"));
check("global actor-request advisory key is exact", /v_actor_auth_user_id::text \|\| ':' \|\| p_request_id::text/.test(sql));
check("shared P3A receipt table is used", /insert into admin_internal\.staff_management_operation_receipts/.test(sql));
check("no second receipt table is created", !/create table .*receipt/i.test(sql));
check("shared P3A audit table is used", /insert into admin_internal\.staff_management_audit_log/.test(sql));
check("no second audit table is created", !/create table .*audit/i.test(sql));
check("receipt replay returns stored result", /return v_prior\.result_payload/.test(sql));
check("changed payload returns request conflict", /request_payload is distinct from v_request_payload[\s\S]*request_conflict/.test(sql));
check("target Auth link takes an advisory lock", /staff-account-link:/.test(sql));
check("link initial state is active version zero", /p_target_auth_user_id, 'active', v_actual_effective_from,[\s\S]*p_effective_until, 0/.test(sql));
check("link rejects expired or inverted windows", /p_effective_until <= v_actual_effective_from[\s\S]*p_effective_until <= v_database_now/.test(sql));
check("all operations protect self target", /p_target_auth_user_id = v_actor_auth_user_id/.test(sql) && /p_target_staff_account_id = v_actor_staff_account_id/.test(sql));
check("suspend is active to suspended only", /staff_account_suspend'[\s\S]*v_before_status <> 'active'[\s\S]*status = 'suspended'/.test(sql));
check("reactivate is suspended to active only", /staff_account_reactivate'[\s\S]*v_before_status <> 'suspended'[\s\S]*status = 'active'/.test(sql));
check("expired accounts cannot reactivate", /v_database_now >= v_before_effective_until/.test(sql));
check("revoke accepts active or suspended", /staff_account_revoke'[\s\S]*v_before_status not in \('active', 'suspended'\)/.test(sql));
check("revoked account is trigger-enforced terminal", /staff_account_revoked_terminal[\s\S]*create trigger staff_accounts_revoked_terminal_v1/.test(sql));
check("lifecycle operations require exact version", /v_before_version <> p_expected_status_version[\s\S]*stale_state/.test(sql));
check("successful lifecycle increments version once", (sql.match(/status_version = status_version \+ 1/g) ?? []).length === 3);
check("account rows are never deleted", !/delete from admin_internal\.staff_accounts/i.test(sql));
check("account writer cannot update identity or window", /grant update \(status, status_version, updated_at\)/.test(sql) && !/grant update \([^)]*(?:auth_user_id|effective_from|effective_until)/.test(sql));
check("account writer has no DELETE or TRUNCATE", !/grant[^;]*(?:delete|truncate)[^;]*staff_accounts/i.test(sql));
check("account table retains FORCE RLS via predecessor", /alter table admin_internal\.staff_accounts force row level security/.test(read("supabase/migrations/20260912010000_staff_authority_p3_p6_p1a_foundation.sql")));
check("account writer receives exact RLS policies", (sql.match(/create policy staff_accounts_account_writer_(?:select|insert|update)/g) ?? []).length === 3);
check("no direct client table grant is added", !/grant[^;]*on (?:table )?admin_internal\.staff_accounts to (?:public|anon|authenticated|authenticator|service_role)/i.test(sql));
check("no Auth Admin or service credential runtime", !/inviteUserByEmail|auth\.admin|SUPABASE_SERVICE_ROLE_KEY/.test(sql));
check("link creates no entitlement", !/(?:insert into|update|delete from) admin_internal\.staff_permission_entitlements/i.test(sql));
check("link creates no Bundle", !/(?:insert into|update|delete from) admin_internal\.staff_bundle_/i.test(sql));
check("link creates no legacy membership", !/(?:insert into|update|delete from) admin_internal\.(?:platform_admins|staff_platform_admin_compatibility_links)/i.test(sql));
check("reason codes are bounded", /length\(p_reason_code\) not between 1 and 80[\s\S]*\^\[a-z\]\[a-z0-9_\]\*\$/.test(sql));
check("UUIDv4 request IDs are required", /get_byte\(pg_catalog\.uuid_send\(p_request_id\), 6\) >> 4\) <> 4/.test(sql));
check("one database time snapshot drives mutation evidence", /v_database_now timestamptz := pg_catalog\.statement_timestamp\(\)/.test(sql) && /created_at\n  \) values[\s\S]*v_database_now/.test(sql));
check("secret scan is clean", ![/github_pat_[A-Za-z0-9_]{20,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /sb_secret_[A-Za-z0-9_-]{20,}/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/].some((pattern) => pattern.test(changed.filter((f) => fs.existsSync(path.join(ROOT, f))).map(read).join("\n"))));

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p3b-guard", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures: failures.map((x) => x.name), changedPaths: changed, migrationCount: migrations.length, developmentAccessed: false, productionAccessed: false, pushed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
