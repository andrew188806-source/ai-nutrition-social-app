#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import { isBoundedP3BSuccessor, P3K_MANAGEMENT_PAGES } from "./staff-authority-p3-p6-p3b-successor-awareness.mjs";
import { isAcceptedGqa2RuntimePath, isExactGqa2Successor } from "./gqa-2-successor-manifest.mjs";

const ROOT = process.cwd();
const MIGRATION = "supabase/migrations/20260916040000_staff_management_p3_p6_p3j_security_audit_read_authority.sql";
const P3I_MIGRATION = "supabase/migrations/20260916030000_staff_management_p3_p6_p3i_management_read_authority.sql";
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
check(fs.existsSync(path.join(ROOT, MIGRATION)) && fs.existsSync(path.join(ROOT, P3I_MIGRATION)), "exact P3J migration exists alongside P3I");
check(acceptedSuccessor, "HEAD sits on the accepted P3H-successor stack (P3J or later)", { head, acceptedSuccessor });

check(!/create role|create policy .*for (?:insert|update|delete)/i.test(sql.replace(/create policy staff_management_read_authority_\w+_select/g, "")), "P3J creates no new role and no non-select policy");
check(!/grant (?:insert|update|delete) on table/i.test(sql), "P3J grants no write privilege on any table");
check(!/'admin\.[a-z0-9_.]+\.write'/.test(sql) && !sql.includes("admin.management."), "P3J introduces zero new permission keys and reuses none of the P3I management keys");
check(sql.includes("admin_context.read") && sql.includes("admin_audit.read"), "P3J reuses only the existing admin_context.read and admin_audit.read keys");
check(!/staff_permission_catalog|readiness_status/.test(sql), "P3J touches no permission catalogue row");

check(/grant staff_step_up_receipt_data_authority to postgres/.test(sql) && /set role staff_step_up_receipt_data_authority/.test(sql) && /reset role/.test(sql), "table SELECT is lent via bounded escalation over the P3H data-authority owner, not granted directly by postgres");
check(/revoke staff_step_up_receipt_data_authority from postgres granted by postgres/.test(sql), "the borrowed P3H data-authority membership is released");
check(sql.includes("staff_step_up_receipt_uses") && sql.includes("staff_security_notification_outbox"), "P3J reads exactly the two P3H evidence tables");
check(!/staff_step_up_receipts\b/.test(sql), "P3J does not touch the live receipt table itself, only the use-log and outbox");
check(!/secret_hash|proof_hash/i.test(sql), "P3J exposes no receipt secret or proof hash column");

const rpcs = [...sql.matchAll(/create function public\.(staff_management_[a-z_]+_v1)\(/g)].map((m) => m[1]);
check(rpcs.length === 2 && new Set(rpcs).size === 2, "exactly two P3J read RPCs exist", rpcs);
const expectedRpcs = ["staff_management_receipt_use_log_v1", "staff_management_security_outbox_v1"];
check(expectedRpcs.every((f) => rpcs.includes(f)), "the exact two expected RPC names are present", rpcs);
check((sql.match(/staff_has_permission_v1\('admin_context\.read'\)/g) ?? []).length === 2 && (sql.match(/staff_has_permission_v1\('admin_audit\.read'\)/g) ?? []).length === 2, "both RPCs require admin_context.read and admin_audit.read");
check((sql.match(/limit least\(greatest\(coalesce\(requested_limit, 100\), 1\), 500\)/g) ?? []).length === 2, "both RPCs bound the requested evidence window between 1 and 500 rows");
check(expectedRpcs.every((f) => new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to authenticated;`).test(sql)), "every RPC grants EXECUTE only to authenticated");
check(!expectedRpcs.some((f) => new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to (?:service_role|anon|public)\\b`).test(sql)), "no RPC grants EXECUTE to service_role, anon, or public");
check(expectedRpcs.every((f) => new RegExp(`revoke all on function public\\.${f}\\([^)]*\\)\\s*\\n\\s*from public, anon, authenticated, authenticator, service_role;`).test(sql)), "every RPC's ACL is fully revoked before re-grant");
check(expectedRpcs.every((f) => new RegExp(`alter function public\\.${f}\\([^)]*\\)\\s*\\n\\s*owner to staff_management_read_authority;`).test(sql)), "every RPC is owned by the sealed P3I read role, not postgres");

check(!/(health|nutrition|member_private|restaurant_private|branch_menu_items)/i.test(sql), "migration exposes no product-domain data");
check(!/totp|passkey/i.test(sql), "migration exposes no authenticator-factor material");

check(exactVocabHasNoNewKeys(vocabulary), "the current permission vocabulary gains no new key from P3J");
function exactVocabHasNoNewKeys(v) {
  return v.includes('"admin_context.read"') && v.includes('"admin_audit.read"') && !v.includes("bundle.write");
}

const candidatePaths = [...new Set([...git("diff", "--name-only", P3H_BASELINE).split(/\r?\n/), ...git("ls-files", "--others", "--exclude-standard").split(/\r?\n/)])].filter(Boolean);
// The exact GQA-2 successor (075a6f7, byte-pinned) is the only later change recognized here.
const exactGqa2 = isExactGqa2Successor();
check(!candidatePaths.filter((p) => !isAcceptedGqa2RuntimePath(p, exactGqa2)).some((p) => /^apps\/(mobile|restaurant-web)\//.test(p)), "no mobile or restaurant app path changed since P3H");
const managementPathsChanged = candidatePaths.filter((p) => /apps\/admin-web\/app\/admin\/management/.test(p))
  .filter((p) => P3K_MANAGEMENT_PAGES.includes(p) || !isAcceptedGqa2RuntimePath(p, exactGqa2));
check(managementPathsChanged.every((p) => P3K_MANAGEMENT_PAGES.includes(p)), "any changed Platform Management page is within the accepted P3K route surface", managementPathsChanged);
const candidateText = candidatePaths.filter((p) => fs.existsSync(path.join(ROOT, p)) && fs.statSync(path.join(ROOT, p)).isFile()).map((p) => fs.readFileSync(path.join(ROOT, p), "utf8")).join("\n");
check(!/(?:postgres(?:ql)?:\/\/[^\s'\"]+:[^\s'\"]+@|sb_secret_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{20,}\.)/.test(candidateText), "candidate contains no committed credential-shaped value");

console.log(JSON.stringify({ suite: "staff-authority-p3-p6-p3j-guard", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
