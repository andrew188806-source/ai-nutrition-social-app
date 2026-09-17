#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { isBoundedP3BSuccessor, P3K_MANAGEMENT_PAGES } from "./staff-authority-p3-p6-p3b-successor-awareness.mjs";

const ROOT = process.cwd();
const checks = [];
const failures = [];
function check(pass, name, detail) {
  const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}

check(isBoundedP3BSuccessor(ROOT), "HEAD sits on the exact accepted P3G through P3J successor stack");

const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
check(migrations.length === 127, "exactly 127 migrations exist; P3K adds no runtime migration", migrations.length);
const expectedTail = [
  "20260915030000_staff_management_p3_p6_p3g_break_glass_control_plane.sql",
  "20260916010000_staff_management_p3_p6_p3g_r1_extend_collation_repair.sql",
  "20260916020000_staff_management_p3_p6_p3h_step_up_authority.sql",
  "20260916030000_staff_management_p3_p6_p3i_management_read_authority.sql",
  "20260916040000_staff_management_p3_p6_p3j_security_audit_read_authority.sql",
];
check(JSON.stringify(migrations.slice(-5)) === JSON.stringify(expectedTail), "the final five migrations are exactly P3G, P3G-R1, P3H, P3I, P3J in order", migrations.slice(-5));

const registry = fs.readFileSync(path.join(ROOT, "apps/admin-web/auth/admin-route-registry.ts"), "utf8");
const liveManagementRoutes = [
  ['management', 'admin_context.read'],
  ['management-staff', 'admin_context.read'],
  ['management-staff-detail', 'admin_context.read'],
  ['management-permissions', 'admin.management.permissions.read'],
  ['management-settings', 'admin_context.read'],
  ['management-security-log', 'admin_audit.read'],
];
const registryLines = registry.split(/\r?\n/);
for (const [id, permission] of liveManagementRoutes) {
  const line = registryLines.find((l) => l.includes(`id: "${id}",`));
  check(line !== undefined && line.includes('availability: "LIVE"'), `route ${id} is exactly LIVE`, line);
  check(line !== undefined && line.includes(`requiredPermissions: ["${permission}"]`), `route ${id} requires exactly ["${permission}"]`, line);
}
check(/id: "management-roles"[^}]*availability: "NOT_ENABLED"/.test(registry), "management-roles (future role catalogue) remains NOT_ENABLED, not part of this closure");
check(!/'admin\.management\.staff\.bundle\.write'.*status: "CURRENT"/.test(registry), "admin.management.staff.bundle.write is not promoted to CURRENT anywhere in the registry");

for (const relPath of P3K_MANAGEMENT_PAGES) {
  check(fs.existsSync(path.join(ROOT, relPath)), `accepted route surface page exists on disk: ${relPath}`);
}

const roundGuards = [
  "scripts/staff-authority-p3-p6-p3g-guard.mjs",
  "scripts/staff-authority-p3-p6-p3g-r1-guard.mjs",
  "scripts/staff-authority-p3-p6-p3h-guard.mjs",
  "scripts/staff-authority-p3-p6-p3i-guard.mjs",
  "scripts/staff-authority-p3-p6-p3j-guard.mjs",
];
check(roundGuards.every((p) => fs.existsSync(path.join(ROOT, p))), "every pinned round has its own dedicated guard script", roundGuards);

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const expectedScripts = [
  "test:staff-authority-p3-p6-p3i", "test:staff-authority-p3-p6-p3i-smoke", "test:staff-authority-p3-p6-p3i-mutations",
  "test:staff-authority-p3-p6-p3j", "test:staff-authority-p3-p6-p3j-smoke", "test:staff-authority-p3-p6-p3j-mutations",
];
check(expectedScripts.every((s) => typeof pkg.scripts[s] === "string"), "P3I and P3J guard/smoke/mutations are all registered as npm scripts", expectedScripts.filter((s) => !pkg.scripts[s]));

console.log(JSON.stringify({ suite: "staff-authority-p3-p6-p3k-guard", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
