#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import { isBoundedP3BSuccessor, P3K_MANAGEMENT_PAGES } from "./staff-authority-p3-p6-p3b-successor-awareness.mjs";

const ROOT = process.cwd();
const MIGRATION = "supabase/migrations/20260916030000_staff_management_p3_p6_p3i_management_read_authority.sql";
const P3H_BASELINE = "5746ea7a712a86f7adbd0bfb9a36c460df9efb0d";
const sql = fs.readFileSync(path.join(ROOT, MIGRATION), "utf8");
const vocabulary = fs.readFileSync(path.join(ROOT, "apps/admin-web/auth/admin-current-permission-vocabulary.ts"), "utf8");
const checks = [];
const failures = [];
function check(pass, name, detail) {
  const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}
function git(...args) { return child.execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); }

const head = git("rev-parse", "HEAD");
const acceptedSuccessor = isBoundedP3BSuccessor(ROOT);
check(fs.existsSync(path.join(ROOT, MIGRATION)), "exact P3I migration exists");
check(acceptedSuccessor, "HEAD sits on the accepted P3H-successor stack (P3I or later)", { head, acceptedSuccessor });

const promotionArrayMatch = sql.match(/update admin_internal\.staff_permission_catalog[\s\S]*?where permission_key = any\(array\[([\s\S]*?)\]\)/);
const promoted = promotionArrayMatch ? [...promotionArrayMatch[1].matchAll(/'([a-z0-9_.]+)'/g)].map((m) => m[1]) : [];
const exactThree = ["admin.management.read", "admin.management.permissions.read", "admin.management.staff.read"];
check(promotionArrayMatch !== null && promoted.length === 3 && exactThree.every((k) => promoted.includes(k)), "exactly the three read keys are targeted for promotion", promoted);
check(/v_updated <> 3/.test(sql) && /management_read_promotion_mismatch/.test(sql), "promotion count is guarded by an exact get-diagnostics check");
check(/readiness_status = 'current'/.test(sql) && /readiness_status = 'planned'/.test(sql), "promotion moves planned to current");
check(!promoted.includes("admin.management.staff.bundle.write"), "bundle.write is not among the promoted keys");
check(/create role staff_management_read_authority\s*\n\s*nologin\s*\n\s*noinherit\s*\n\s*nobypassrls/i.test(sql), "sealed read role is NOLOGIN NOINHERIT NOBYPASSRLS");
check(!/grant staff_management_read_authority to (?:service_role|authenticated|anon)/i.test(sql), "sealed read role has no client membership");

const rpcs = [...sql.matchAll(/create function public\.(staff_management_[a-z_]+_v1)\(/g)].map((m) => m[1]);
check(rpcs.length === 4 && new Set(rpcs).size === 4, "exactly four P3I read RPCs exist", rpcs);
const expectedRpcs = ["staff_management_list_staff_v1", "staff_management_staff_detail_v1", "staff_management_staff_authority_v1", "staff_management_permission_catalog_v1"];
check(expectedRpcs.every((f) => rpcs.includes(f)), "the exact four expected RPC names are present", rpcs);

check((sql.match(/staff_has_permission_v1\('admin_context\.read'\)/g) ?? []).length >= 3, "every roster/detail/catalog RPC re-checks admin_context.read inline");
check(sql.includes("staff_has_permission_v1('admin.management.staff.read')"), "roster and detail RPCs require admin.management.staff.read");
check((sql.match(/staff_has_permission_v1\('admin\.management\.permissions\.read'\)/g) ?? []).length === 2, "authority aggregate and catalog RPCs require admin.management.permissions.read");
check(!/select \*/i.test(sql), "no RPC performs a generic select star");
check(!/grant select on table admin_internal\.staff_\w+ to (?:authenticated|anon|service_role|public)\b/i.test(sql), "no table SELECT is granted to any client-facing role");
check(!/grant (?:insert|update|delete) on table/i.test(sql), "P3I grants no write privilege on any table");

check((sql.match(/create policy staff_management_read_authority_\w+_select[\s\S]*?using \(true\)/g) ?? []).length === 6, "all six sealed-role read policies exist with using(true)", (sql.match(/create policy staff_management_read_authority_\w+_select/g) ?? []).length);
check(/revoke all on function public\.staff_management_list_staff_v1\(\)[\s\S]*?from public, anon, authenticated, authenticator, service_role;/.test(sql), "list_staff ACL is fully revoked before re-grant");
check(expectedRpcs.every((f) => new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to authenticated;`).test(sql)), "every RPC grants EXECUTE only to authenticated");
check(!expectedRpcs.some((f) => new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to (?:service_role|anon|public)\\b`).test(sql)), "no RPC grants EXECUTE to service_role, anon, or public");
check(expectedRpcs.every((f) => new RegExp(`alter function public\\.${f}\\([^)]*\\)\\s*\\n\\s*owner to staff_management_read_authority;`).test(sql)), "every RPC is owned by the sealed read role, not postgres");

check(!/(health|nutrition|member_private|restaurant_private|branch_menu_items|taste)/i.test(sql), "migration exposes no product-domain data");
check(!sql.includes("job_title") && !sql.includes("display_name") && !sql.includes("full_name"), "roster and detail expose no name or job-title field");
check(!/staff_step_up|staff_break_glass/i.test(sql), "P3I touches no P3G or P3H protected object");

check(exactThree.every((k) => vocabulary.includes(`"${k}"`)), "the three promoted keys are recognized by the current permission vocabulary");
check(!vocabulary.includes('"admin.management.staff.bundle.write"'), "bundle.write is not present in the current permission vocabulary");

const p3iFiles = git("show", "--name-only", "--format=", "2fc11983b913125e933cafcf94808181ba5547e3").split(/\r?\n/).filter(Boolean);
check(p3iFiles.length === 1 && p3iFiles[0] === MIGRATION, "P3I's own commit touches exactly one file (the migration)", p3iFiles);

check(![...git("diff", "--name-only", P3H_BASELINE).split(/\r?\n/)].filter(Boolean).some((p) => /^apps\/(mobile|restaurant-web)\//.test(p)), "no mobile or restaurant app path changed since P3H");
const candidatePaths = [...new Set([...git("diff", "--name-only", P3H_BASELINE).split(/\r?\n/), ...git("ls-files", "--others", "--exclude-standard").split(/\r?\n/)])].filter(Boolean);
const managementPathsChanged = candidatePaths.filter((p) => /apps\/admin-web\/app\/admin\/management/.test(p));
check(managementPathsChanged.every((p) => P3K_MANAGEMENT_PAGES.includes(p)), "any changed Platform Management page is within the accepted P3K route surface", managementPathsChanged);
const candidateText = candidatePaths.filter((p) => fs.existsSync(path.join(ROOT, p)) && fs.statSync(path.join(ROOT, p)).isFile()).map((p) => fs.readFileSync(path.join(ROOT, p), "utf8")).join("\n");
check(!/(?:postgres(?:ql)?:\/\/[^\s'\"]+:[^\s'\"]+@|sb_secret_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{20,}\.)/.test(candidateText), "candidate contains no committed credential-shaped value");

console.log(JSON.stringify({ suite: "staff-authority-p3-p6-p3i-guard", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
