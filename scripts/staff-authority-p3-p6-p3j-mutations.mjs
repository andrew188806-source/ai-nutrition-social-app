#!/usr/bin/env node
import fs from "node:fs";

const sql = fs.readFileSync("supabase/migrations/20260916040000_staff_management_p3_p6_p3j_security_audit_read_authority.sql", "utf8");
const vocabulary = fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts", "utf8");
const original = { sql, vocabulary };
function survives(s) {
  return /grant (?:insert|update|delete) on table/i.test(s.sql)
    || s.sql.includes("admin.management.")
    || !s.sql.includes("admin_context.read") || !s.sql.includes("admin_audit.read")
    || !s.sql.includes("staff_step_up_receipt_data_authority to postgres") || !s.sql.includes("revoke staff_step_up_receipt_data_authority from postgres granted by postgres")
    || !s.sql.includes("staff_step_up_receipt_uses") || !s.sql.includes("staff_security_notification_outbox")
    || /secret_hash|proof_hash/i.test(s.sql)
    || (s.sql.match(/create function public\.staff_management_[a-z_]+_v1\(/g) ?? []).length !== 2
    || !s.sql.includes("staff_management_receipt_use_log_v1") || !s.sql.includes("staff_management_security_outbox_v1")
    || (s.sql.match(/staff_has_permission_v1\('admin_context\.read'\)/g) ?? []).length !== 2
    || (s.sql.match(/staff_has_permission_v1\('admin_audit\.read'\)/g) ?? []).length !== 2
    || (s.sql.match(/limit least\(greatest\(coalesce\(requested_limit, 100\), 1\), 500\)/g) ?? []).length !== 2
    || /grant execute on function public\.staff_management_(?:receipt_use_log|security_outbox)_v1\([^)]*\) to (?:service_role|anon|public)\b/i.test(s.sql)
    || /(health|nutrition|member_private|restaurant_private)/i.test(s.sql)
    || !s.vocabulary.includes('"admin_context.read"') || !s.vocabulary.includes('"admin_audit.read"');
}
if (survives(original)) throw new Error("mutation oracle rejects the original implementation");
const mutants = [
  ["introduce a new permission key", "sql", (v) => v + "\n-- 'admin.management.audit.export'"],
  ["require only admin_context.read for the use-log", "sql", (v) => v.replace("and public.staff_has_permission_v1('admin_audit.read')\n  order by entry.used_at desc", "order by entry.used_at desc")],
  ["grant table UPDATE on evidence table", "sql", (v) => v + "\ngrant update on table admin_internal.staff_step_up_receipt_uses to staff_management_read_authority;"],
  ["skip releasing borrowed membership", "sql", (v) => v.replace("revoke staff_step_up_receipt_data_authority from postgres granted by postgres;\n", "")],
  ["expose secret_hash column", "sql", (v) => v.replace("entry.use_id, entry.actor_auth_user_id", "entry.use_id, entry.secret_hash, entry.actor_auth_user_id")],
  ["drop the outbox RPC", "sql", (v) => v.replaceAll("staff_management_security_outbox_v1", "staff_management_removed_outbox_v1")],
  ["remove one admin_audit.read gate", "sql", (v) => v.replace("and public.staff_has_permission_v1('admin_audit.read')\n  order by entry.created_at desc", "\n  order by entry.created_at desc")],
  ["remove result limit clamp", "sql", (v) => v.replaceAll("limit least(greatest(coalesce(requested_limit, 100), 1), 500);", "limit requested_limit;")],
  ["grant outbox EXECUTE to service_role", "sql", (v) => v + "\ngrant execute on function public.staff_management_security_outbox_v1(integer) to service_role;"],
  ["expose nutrition data", "sql", (v) => v + "\n-- nutrition_profile_snapshot"],
  ["vocabulary drops admin_audit.read", "vocabulary", (v) => v.replace('"admin_audit.read"', "")],
];
let killed = 0; const survivors = [];
for (const [name, file, mutate] of mutants) {
  const candidate = { ...original, [file]: mutate(original[file]) };
  if (survives(candidate)) { killed += 1; console.log(`KILLED ${String(killed).padStart(2, "0")} ${name}`); }
  else survivors.push(name);
}
console.log(JSON.stringify({ suite: "staff-authority-p3-p6-p3j-mutations", total: mutants.length, killed, survivors: survivors.length, survivorNames: survivors }, null, 2));
process.exitCode = survivors.length ? 1 : 0;
