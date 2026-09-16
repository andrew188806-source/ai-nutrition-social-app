#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";

const ROOT = process.cwd();
const MIGRATION = "supabase/migrations/20260916020000_staff_management_p3_p6_p3h_step_up_authority.sql";
const BASELINE = "042209feb9c0fac9992f6fcc09c1348ef8a6251d";
const sql = fs.readFileSync(path.join(ROOT, MIGRATION), "utf8");
const cookie = fs.readFileSync(path.join(ROOT, "apps/admin-web/auth/admin-step-up-cookie.ts"), "utf8");
const auth = fs.readFileSync(path.join(ROOT, "apps/admin-web/auth/admin-step-up-authorization.ts"), "utf8");
const broker = fs.readFileSync(path.join(ROOT, "apps/admin-web/server/adminStepUpBroker.ts"), "utf8");
const runtime = fs.readFileSync(path.join(ROOT, "apps/admin-web/server/adminStepUpRuntime.ts"), "utf8");
const mutation = fs.readFileSync(path.join(ROOT, "apps/admin-web/server/adminStepUpMutationRuntime.ts"), "utf8");
const logout = fs.readFileSync(path.join(ROOT, "apps/admin-web/app/admin/login/actions.ts"), "utf8");
const checks = [];
const failures = [];
function check(pass, name, detail) {
  const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}
function git(...args) { return child.execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); }
const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
const head = git("rev-parse", "HEAD");
const parent = git("rev-parse", "HEAD^");
check(head === BASELINE || parent === BASELINE, "exact P3G-R1 baseline anchors P3H", { head, parent });
check(migrations.length === 125 && migrations.at(-1) === path.basename(MIGRATION), "migration count is exact 124 to 125", { count: migrations.length, latest: migrations.at(-1) });
check(fs.existsSync(path.join(ROOT, MIGRATION)), "exact P3H migration exists");
const authoritySources = migrations.map((name) => fs.readFileSync(path.join(ROOT, "supabase/migrations", name), "utf8")).join("\n");
const keys = [...new Set([...authoritySources.matchAll(/'((?:admin|admin_context)[a-z0-9_.]+)'/g)].map((m) => m[1]).filter((k) => [
  "admin.management.staff.account.write","admin.management.staff.console_admission.write","admin.management.staff.delegation.write","admin.management.staff.permission.write","admin_audit.read","admin_context.read","admin_restaurant_branch.status.write"
].includes(k)))].sort();
check(keys.length === 7, "all exact seven CURRENT permission tokens remain present", keys);
const changed = new Set([
  ...git("diff", "--name-only", BASELINE).split(/\r?\n/),
  ...git("ls-files", "--others", "--exclude-standard").split(/\r?\n/),
].filter(Boolean));
const frozenP3GPaths = [
  "supabase/migrations/20260915030000_staff_management_p3_p6_p3g_break_glass_control_plane.sql",
  "supabase/migrations/20260916010000_staff_management_p3_p6_p3g_r1_extend_collation_repair.sql",
  "scripts/break-glass-control.mjs",
  "scripts/staff-authority-p3-p6-p3g-smoke.mjs",
  "scripts/staff-authority-p3-p6-p3g-mutations.mjs",
  "scripts/staff-authority-p3-p6-p3g-postgres.mjs",
  "scripts/staff-authority-p3-p6-p3g-r1-mutations.mjs",
];
check(frozenP3GPaths.every((p) => !changed.has(p)), "P3G implementation files are unchanged", frozenP3GPaths.filter((p) => changed.has(p)));
check(/create role staff_step_up_receipt_issuer_authority\s+\n?\s*nologin noinherit nobypassrls/i.test(sql), "issuer is NOLOGIN NOINHERIT NOBYPASSRLS");
check(!/grant staff_step_up_receipt_issuer_authority to (?:service_role|authenticated|postgres)/i.test(sql), "issuer role has no client or postgres membership");
check(/expires_at = issued_at \+ interval '15 minutes'/.test(sql) && /v_now \+ interval '15 minutes'/.test(sql), "receipt window is fixed at 15 minutes");
check(!/extend.*step_up_receipt|refresh.*step_up_receipt/i.test(sql), "receipt has no sliding extension operator");
check(/unique index staff_step_up_receipts_one_active_scope_key[\s\S]*actor_auth_user_id, session_id, operation_class[\s\S]*where status = 'active'/.test(sql), "one active actor/session/class receipt");
check(/actor_auth_user_id <> v_subject/.test(sql) && /session_id <> v_session/.test(sql), "validator binds actor and session");
check(/staff_step_up_session_exists_v1\(v_session, v_subject\)/.test(sql), "validator checks current auth.sessions existence through narrow helper");
check(/v_aal is distinct from 'aal2'/.test(sql), "AAL2 is mandatory");
check(/secret_hash text not null/.test(sql) && /secret_hash ~ '\^\[0-9a-f\]\{64\}\$'/.test(sql), "only SHA-256 receipt proof is stored");
check(!/\b(secret|totp_code|totp_secret)\s+(?:text|bytea)\b/i.test(sql.replaceAll("secret_hash text", "proof_hash text")), "no clear receipt/TOTP secret column");
check(/session_user = 'postgres'[\s\S]*pg_has_role\([\s\S]*staff_step_up_receipt_issuer_authority/.test(sql), "private issuer rejects postgres and requires bounded role membership");
check(/staff_step_up_validate_receipt_v1/.test(sql), "private validator exists");
const v2 = [...sql.matchAll(/create function public\.(staff_management_[a-z_]+_v2)\(/g)].map((m) => m[1]);
check(v2.length === 10 && new Set(v2).size === 10, "all ten guarded v2 wrappers exist", v2);
check(/revoke execute on function[\s\S]*staff_management_link_staff_account_v1[\s\S]*from public, anon, authenticated, authenticator, service_role/.test(sql), "protected v1 authenticated EXECUTE is revoked");
check(!sql.includes("staff_management_grant_delegated_permission_v1") && !sql.includes("staff_management_revoke_delegated_permission_v1"), "P3D ordinary delegated RPCs are untouched");
check(/from public, anon, authenticated, authenticator, service_role, postgres/.test(sql), "private issuer helpers deny service_role authenticated and postgres ACL");
check((sql.match(/enable row level security/g) ?? []).length === 3 && (sql.match(/force row level security/g) ?? []).length === 3, "all three internal tables enable and force RLS");
check(!/grant delete on table/i.test(sql), "P3H grants no DELETE");
check(/staff_step_up_receipt_uses/.test(sql) && /staff_security_notification_outbox/.test(sql), "receipt-use evidence and notification outbox exist");
check(/new_permission_manager/.test(sql) && /v_priority := 'critical'/.test(sql), "permission.write grant emits critical sensitive event");
check(!/(health|nutrition|member_private|restaurant_private)/i.test(sql), "migration adds no domain-data authority");
check(!/grant staff_(?:step_up[^\n]*) to staff_break_glass|grant staff_break_glass[^\n]* to staff_step_up/i.test(sql), "no P3G role crossover");
check(/httpOnly: true/.test(cookie), "step-up cookie is HttpOnly");
check(/sameSite: "strict"/.test(cookie), "step-up cookie is SameSite Strict");
check(/ADMIN_STEP_UP_MAX_AGE_SECONDS = 15 \* 60/.test(cookie) && /maxAge: ADMIN_STEP_UP_MAX_AGE_SECONDS/.test(cookie), "step-up cookie max age is at most 900 seconds");
check(/path: "\/api\/admin"/.test(cookie), "step-up cookie path is restricted to Admin API");
check(broker.includes("TASTKIND_P3H_BROKER_DATABASE_URL") && broker.startsWith('import "server-only"'), "server-only broker uses exact environment name");
check(!/(service_role|SUPABASE_SERVICE)/i.test(broker), "broker has no service_role fallback");
check(/headers\.has\("authorization"\)/.test(auth), "P3H routes reject explicit Authorization");
check(/origin !== expected/.test(auth) && /site === null \|\| site === "same-origin"/.test(auth), "same-origin and Sec-Fetch-Site are enforced");
check(/clearAdminStepUpCookie\(config\.isProduction\)/.test(logout), "Admin logout clears step-up cookie");
check(/challengeAndVerify/.test(runtime) && /claims\.aal !== "aal2"/.test(runtime), "fresh TOTP verification is followed by fresh AAL2 resolution");
check(/randomBytes\(32\)/.test(runtime) && /hashAdminStepUpSecret/.test(runtime), "server generates 256-bit secret and hashes it");
check(/hasPermissionWriteStrongConfirmation/.test(mutation) && /expectedPhrase/.test(mutation), "permission.write uses target-and-permission-bound confirmation");
check(![...changed].some((p) => /^apps\/(mobile|restaurant-web)\//.test(p)), "no mobile or restaurant app path changed", [...changed]);
check(![...changed].some((p) => /apps\/admin-web\/app\/admin\/management/.test(p)), "no broad Platform Management page enabled", [...changed]);
const candidateText = [...changed].filter((p) => fs.existsSync(path.join(ROOT, p)) && fs.statSync(path.join(ROOT, p)).isFile()).map((p) => fs.readFileSync(path.join(ROOT, p), "utf8")).join("\n");
check(!/(?:postgres(?:ql)?:\/\/[^\s'\"]+:[^\s'\"]+@|sb_secret_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{20,}\.)/.test(candidateText), "candidate contains no committed credential-shaped value");
console.log(JSON.stringify({ suite: "staff-authority-p3-p6-p3h-guard", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
