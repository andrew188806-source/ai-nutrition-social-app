#!/usr/bin/env node
import fs from "node:fs";

const sql = fs.readFileSync("supabase/migrations/20260916030000_staff_management_p3_p6_p3i_management_read_authority.sql", "utf8");
const vocabulary = fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts", "utf8");
const original = { sql, vocabulary };
function survives(s) {
  const promotionArrayMatch = s.sql.match(/where permission_key = any\(array\[([\s\S]*?)\]\)/);
  const promoted = promotionArrayMatch ? [...promotionArrayMatch[1].matchAll(/'([a-z0-9_.]+)'/g)].map((m) => m[1]) : [];
  return promoted.length !== 3
    || !promoted.includes("admin.management.read") || !promoted.includes("admin.management.permissions.read") || !promoted.includes("admin.management.staff.read")
    || promoted.includes("admin.management.staff.bundle.write")
    || !s.sql.includes("v_updated <> 3") || !s.sql.includes("management_read_promotion_mismatch")
    || !/create role staff_management_read_authority\s*\n\s*nologin\s*\n\s*noinherit\s*\n\s*nobypassrls/i.test(s.sql)
    || /grant staff_management_read_authority to (?:service_role|authenticated|anon)/i.test(s.sql)
    || (s.sql.match(/create function public\.staff_management_[a-z_]+_v1\(/g) ?? []).length !== 4
    || !s.sql.includes("staff_management_list_staff_v1") || !s.sql.includes("staff_management_staff_detail_v1")
    || !s.sql.includes("staff_management_staff_authority_v1") || !s.sql.includes("staff_management_permission_catalog_v1")
    || !s.sql.includes("staff_has_permission_v1('admin.management.staff.read')")
    || (s.sql.match(/staff_has_permission_v1\('admin\.management\.permissions\.read'\)/g) ?? []).length !== 2
    || /grant (?:insert|update|delete) on table/i.test(s.sql)
    || /grant select on table admin_internal\.staff_\w+ to (?:authenticated|anon|service_role|public)\b/i.test(s.sql)
    || /grant execute on function public\.staff_management_[a-z_]+_v1\([^)]*\) to (?:service_role|anon|public)\b/i.test(s.sql)
    || /(health|nutrition|member_private|restaurant_private|branch_menu_items)/i.test(s.sql)
    || s.sql.includes("job_title") || s.sql.includes("display_name")
    || !s.vocabulary.includes('"admin.management.read"') || !s.vocabulary.includes('"admin.management.permissions.read"') || !s.vocabulary.includes('"admin.management.staff.read"');
}
if (survives(original)) throw new Error("mutation oracle rejects the original implementation");
const mutants = [
  ["promote a fourth key", "sql", (v) => v.replace("'admin.management.staff.read'", "'admin.management.staff.read', 'admin.management.staff.bundle.write'")],
  ["promote bundle.write instead", "sql", (v) => v.replace("'admin.management.read'", "'admin.management.staff.bundle.write'")],
  ["remove promotion-count guard", "sql", (v) => v.replace("v_updated <> 3", "false")],
  ["rename mismatch errcode", "sql", (v) => v.replace("management_read_promotion_mismatch", "unused_label")],
  ["sealed role gains LOGIN", "sql", (v) => v.replace("create role staff_management_read_authority\n  nologin", "create role staff_management_read_authority\n  login")],
  ["sealed role granted to authenticated", "sql", (v) => v + "\ngrant staff_management_read_authority to authenticated;"],
  ["drop the detail RPC", "sql", (v) => v.replaceAll("staff_management_staff_detail_v1", "staff_management_removed_v1")],
  ["roster skips staff.read", "sql", (v) => v.replaceAll("and public.staff_has_permission_v1('admin.management.staff.read')", "")],
  ["catalog checks permissions.read once instead of twice", "sql", (v) => v.replace(/staff_has_permission_v1\('admin\.management\.permissions\.read'\)\s*\n\s*and catalog_row\.deferred = false/, "true and catalog_row.deferred = false")],
  ["grant table UPDATE to sealed role", "sql", (v) => v + "\ngrant update on table admin_internal.staff_accounts to staff_management_read_authority;"],
  ["grant table SELECT straight to authenticated", "sql", (v) => v + "\ngrant select on table admin_internal.staff_accounts to authenticated;"],
  ["grant RPC execute to service_role", "sql", (v) => v + "\ngrant execute on function public.staff_management_list_staff_v1() to service_role;"],
  ["expose nutrition data", "sql", (v) => v + "\n-- nutrition_profile_snapshot"],
  ["expose job_title", "sql", (v) => v + "\n-- job_title"],
  ["vocabulary omits a promoted key", "vocabulary", (v) => v.replace('"admin.management.staff.read"', "")],
];
let killed = 0; const survivors = [];
for (const [name, file, mutate] of mutants) {
  const candidate = { ...original, [file]: mutate(original[file]) };
  if (survives(candidate)) { killed += 1; console.log(`KILLED ${String(killed).padStart(2, "0")} ${name}`); }
  else survivors.push(name);
}
console.log(JSON.stringify({ suite: "staff-authority-p3-p6-p3i-mutations", total: mutants.length, killed, survivors: survivors.length, survivorNames: survivors }, null, 2));
process.exitCode = survivors.length ? 1 : 0;
