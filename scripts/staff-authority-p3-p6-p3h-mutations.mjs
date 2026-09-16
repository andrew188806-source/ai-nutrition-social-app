#!/usr/bin/env node
import fs from "node:fs";

const sql = fs.readFileSync("supabase/migrations/20260916020000_staff_management_p3_p6_p3h_step_up_authority.sql", "utf8");
const cookie = fs.readFileSync("apps/admin-web/auth/admin-step-up-cookie.ts", "utf8");
const auth = fs.readFileSync("apps/admin-web/auth/admin-step-up-authorization.ts", "utf8");
const broker = fs.readFileSync("apps/admin-web/server/adminStepUpBroker.ts", "utf8");
const runtime = fs.readFileSync("apps/admin-web/server/adminStepUpRuntime.ts", "utf8");
const mutation = fs.readFileSync("apps/admin-web/server/adminStepUpMutationRuntime.ts", "utf8");
const logout = fs.readFileSync("apps/admin-web/app/admin/login/actions.ts", "utf8");
const original = { sql, cookie, auth, broker, runtime, mutation, logout };
function survives(s) {
  return /staff_management_link_staff_account_v1\([^;]+\) to authenticated;/i.test(s.sql)
    || (s.sql.match(/create function public\.staff_management_[a-z_]+_v2\(/g) ?? []).length !== 10
    || !s.sql.includes("actor_auth_user_id <> v_subject") || !s.sql.includes("session_id <> v_session")
    || !s.sql.includes("v_aal is distinct from 'aal2'") || !s.sql.includes("staff_step_up_session_exists_v1(v_session, v_subject)")
    || !s.sql.includes("expires_at = issued_at + interval '15 minutes'") || !s.sql.includes("v_now >= v_receipt.expires_at")
    || !s.sql.includes("status <> 'active'") || !s.sql.includes("operation_class <> p_operation_class")
    || /\b(secret|totp_code|totp_secret)\s+(?:text|bytea)\b/i.test(s.sql.replaceAll("secret_hash text", "proof_hash text"))
    || /grant staff_step_up_receipt_issuer_authority to (?:service_role|authenticated|postgres)/i.test(s.sql)
    || !s.sql.includes("session_user = 'postgres'") || /staff_management_link_staff_account_v1\([^;]+\) to staff_step_up_receipt_issuer_authority;/i.test(s.sql)
    || !s.auth.includes('headers.has("authorization")') || !s.auth.includes("origin !== expected")
    || !s.cookie.includes("httpOnly: true") || !s.cookie.includes('sameSite: "strict"')
    || !s.cookie.includes("15 * 60") || !s.logout.includes("clearAdminStepUpCookie")
    || s.sql.includes("staff_management_grant_delegated_permission_v1")
    || /grant staff_(?:step_up[^\n]*) to staff_break_glass/i.test(s.sql)
    || !s.sql.includes("new_permission_manager") || !s.sql.includes("idempotency_key")
    || !s.mutation.includes("expectedPhrase") || !s.broker.includes("TASTKIND_P3H_BROKER_DATABASE_URL")
    || !s.runtime.includes("randomBytes(32)");
}
if (survives(original)) throw new Error("mutation oracle rejects the original implementation");
const mutants = [
  ["restore authenticated v1 EXECUTE", "sql", (v) => v + "\ngrant execute on function public.staff_management_link_staff_account_v1(uuid,timestamptz,timestamptz,text,uuid) to authenticated;"],
  ["remove one v2", "sql", (v) => v.replace("create function public.staff_management_link_staff_account_v2", "create function public.removed_link_v2")],
  ["remove actor binding", "sql", (v) => v.replace("actor_auth_user_id <> v_subject", "false")],
  ["remove session binding", "sql", (v) => v.replace("session_id <> v_session", "false")],
  ["remove aal2", "sql", (v) => v.replace("v_aal is distinct from 'aal2'", "false")],
  ["remove auth.sessions", "sql", (v) => v.replace("staff_step_up_session_exists_v1(v_session, v_subject)", "true")],
  ["make expiry sliding", "sql", (v) => v.replace("expires_at = issued_at + interval '15 minutes'", "expires_at > issued_at")],
  ["accept expired", "sql", (v) => v.replaceAll("v_now >= v_receipt.expires_at", "false")],
  ["accept superseded", "sql", (v) => v.replaceAll("status <> 'active'", "status = 'impossible'")],
  ["wrong class accepted", "sql", (v) => v.replace("operation_class <> p_operation_class", "false")],
  ["store clear receipt", "sql", (v) => v.replace("secret_hash text", "secret text")],
  ["store TOTP code", "sql", (v) => v.replace("secret_hash text", "totp_code text")],
  ["issuer to service_role", "sql", (v) => v + "\ngrant staff_step_up_receipt_issuer_authority to service_role;"],
  ["issuer to authenticated", "sql", (v) => v + "\ngrant staff_step_up_receipt_issuer_authority to authenticated;"],
  ["allow postgres", "sql", (v) => v.replaceAll("session_user = 'postgres'", "session_user = 'never'")],
  ["issuer mutates staff", "sql", (v) => v + "\ngrant execute on function public.staff_management_link_staff_account_v1(uuid,timestamptz,timestamptz,text,uuid) to staff_step_up_receipt_issuer_authority;"],
  ["Authorization accepted", "auth", (v) => v.replace('headers.has("authorization")', 'headers.has("x-never")')],
  ["same-origin removed", "auth", (v) => v.replace("origin !== expected", "false")],
  ["cookie not HttpOnly", "cookie", (v) => v.replaceAll("httpOnly: true", "httpOnly: false")],
  ["cookie lax", "cookie", (v) => v.replaceAll('sameSite: "strict"', 'sameSite: "lax"')],
  ["cookie too long", "cookie", (v) => v.replace("15 * 60", "30 * 60")],
  ["logout retains receipt", "logout", (v) => v.replaceAll("clearAdminStepUpCookie", "retainAdminStepUpCookie")],
  ["P3D gated", "sql", (v) => v + "\n-- staff_management_grant_delegated_permission_v1"],
  ["P3G crossover", "sql", (v) => v + "\ngrant staff_step_up_gate_authority to staff_break_glass_control_authority;"],
  ["notification omitted", "sql", (v) => v.replaceAll("new_permission_manager", "ordinary_permission")],
  ["duplicate outbox", "sql", (v) => v.replaceAll("idempotency_key", "duplicate_allowed")],
  ["strong confirmation removed", "mutation", (v) => v.replaceAll("expectedPhrase", "unusedPhrase")],
  ["broker env fallback", "broker", (v) => v.replaceAll("TASTKIND_P3H_BROKER_DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")],
  ["weak receipt entropy", "runtime", (v) => v.replace("randomBytes(32)", "randomBytes(8)")]
];
let killed = 0; const survivors = [];
for (const [name, file, mutate] of mutants) { const candidate = { ...original, [file]: mutate(original[file]) }; if (survives(candidate)) { killed += 1; console.log(`KILLED ${String(killed).padStart(2,"0")} ${name}`); } else survivors.push(name); }
console.log(JSON.stringify({ suite: "staff-authority-p3-p6-p3h-mutations", total: mutants.length, killed, survivors: survivors.length, survivorNames: survivors }, null, 2));
process.exitCode = survivors.length ? 1 : 0;
