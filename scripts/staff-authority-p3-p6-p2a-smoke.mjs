#!/usr/bin/env node
// Pure P3-P6-P2A resolver smoke. No database, network, credentials, or repository writes.
import fs from "node:fs";

const SQL = fs.readFileSync("supabase/migrations/20260912040000_staff_authority_p3_p6_p2a_effective_permission_resolver.sql", "utf8").replace(/\r\n/g, "\n");
const NOW = 100;
function effectivePermissions(subject, state, now = NOW) {
  if (!subject) return [];
  const account = state.staff.find((row) => row.authUserId === subject);
  if (!account || account.status !== "active" || account.from > now
    || (account.until !== null && now >= account.until)) return [];
  const keys = state.entitlements.filter((row) => {
    const permission = state.catalog.find((item) => item.key === row.key);
    if (!permission || permission.lifecycle !== "active" || permission.readiness !== "current"
      || row.staffId !== account.id || row.status !== "active" || row.from > now
      || (row.until !== null && now >= row.until)) return false;
    if (row.source === "direct_grant" || row.source === "migration_backfill") return row.assignmentId === null;
    if (row.source !== "bundle_assignment") return false;
    const assignment = state.assignments.find((item) => item.id === row.assignmentId);
    return Boolean(assignment && assignment.staffId === row.staffId && assignment.status === "active"
      && assignment.from <= now && (assignment.until === null || now < assignment.until));
  }).map((row) => row.key);
  return [...new Set(keys)].sort();
}
const has = (subject, key, state, now = NOW) => typeof key === "string" && key.length > 0
  && effectivePermissions(subject, state, now).includes(key);

const catalog = [
  { key: "admin_audit.read", lifecycle: "active", readiness: "current" },
  { key: "admin_context.read", lifecycle: "active", readiness: "current" },
  { key: "admin_restaurant_branch.status.write", lifecycle: "active", readiness: "current" }
];
const base = {
  catalog,
  staff: [
    { id: "staff-a", authUserId: "user-a", status: "active", from: 50, until: 150 },
    { id: "staff-b", authUserId: "user-b", status: "active", from: 50, until: 150 }
  ],
  assignments: [{ id: "assignment-a", staffId: "staff-a", status: "active", from: 60, until: 140 }],
  entitlements: [
    { id: "direct", staffId: "staff-a", key: "admin_audit.read", source: "direct_grant", assignmentId: null, status: "active", from: 60, until: 140 },
    { id: "migration", staffId: "staff-a", key: "admin_audit.read", source: "migration_backfill", assignmentId: null, status: "active", from: 60, until: 140 },
    { id: "bundle", staffId: "staff-a", key: "admin_audit.read", source: "bundle_assignment", assignmentId: "assignment-a", status: "active", from: 60, until: 140 },
    { id: "other", staffId: "staff-b", key: "admin_context.read", source: "direct_grant", assignmentId: null, status: "active", from: 60, until: 140 }
  ]
};
const clone = () => structuredClone(base);
const checks = [], failures = [];
function check(label, pass) { const item = { label, pass: Boolean(pass) }; checks.push(item); if (!item.pass) failures.push(item); console.log(`${item.pass ? "PASS" : "FAIL"} ${label}`); }

check("valid exact permission", has("user-a", "admin_audit.read", base));
check("unknown permission is false", !has("user-a", "admin_unknown.read", base));
check("null permission is false", !has("user-a", null, base));
check("empty permission is false", !has("user-a", "", base));
check("no subject returns none", effectivePermissions(null, base).length === 0);
check("no subject predicate is false", !has(null, "admin_audit.read", base));
check("active staff works", effectivePermissions("user-a", base).includes("admin_audit.read"));
for (const status of ["suspended", "revoked"]) { const state = clone(); state.staff[0].status = status; check(`${status} staff denied`, effectivePermissions("user-a", state).length === 0); }
{ const state = clone(); state.staff[0].from = 101; check("future staff denied", effectivePermissions("user-a", state).length === 0); }
{ const state = clone(); state.staff[0].until = 100; check("expired staff denied at exclusive end", effectivePermissions("user-a", state).length === 0); }
check("active entitlement works", effectivePermissions("user-a", base).includes("admin_audit.read"));
{ const state = clone(); state.entitlements.forEach((row) => { if (row.staffId === "staff-a") row.status = "revoked"; }); check("revoked entitlements denied", effectivePermissions("user-a", state).length === 0); }
{ const state = clone(); state.entitlements.forEach((row) => { if (row.staffId === "staff-a") row.from = 101; }); check("future entitlements denied", effectivePermissions("user-a", state).length === 0); }
{ const state = clone(); state.entitlements.forEach((row) => { if (row.staffId === "staff-a") row.until = 100; }); check("expired entitlements denied at exclusive end", effectivePermissions("user-a", state).length === 0); }
check("multi-source deduplicates", effectivePermissions("user-a", base).filter((key) => key === "admin_audit.read").length === 1);
{ const state = clone(); state.entitlements[0].status = "revoked"; check("one source revoke leaves permission", has("user-a", "admin_audit.read", state)); }
{ const state = clone(); state.entitlements.forEach((row) => { if (row.staffId === "staff-a") row.status = "revoked"; }); check("all sources revoked removes permission", !has("user-a", "admin_audit.read", state)); }
check("active Bundle assignment works", base.entitlements.some((row) => row.source === "bundle_assignment") && has("user-a", "admin_audit.read", base));
{ const state = clone(); state.assignments[0].status = "revoked"; state.entitlements[0].status = state.entitlements[1].status = "revoked"; check("revoked Bundle assignment suppresses Bundle source", !has("user-a", "admin_audit.read", state)); }
{ const state = clone(); state.assignments[0].status = "revoked"; state.entitlements[1].status = state.entitlements[2].status = "revoked"; check("direct source survives invalid Bundle source", has("user-a", "admin_audit.read", state)); }
{ const state = clone(); state.catalog[0].lifecycle = "inactive"; check("catalog inactive denied", !has("user-a", "admin_audit.read", state)); }
{ const state = clone(); state.catalog[0].readiness = "planned"; check("catalog planned denied", !has("user-a", "admin_audit.read", state)); }
check("A cannot read B authority", !effectivePermissions("user-a", base).includes("admin_context.read"));
check("B cannot read A authority", !effectivePermissions("user-b", base).includes("admin_audit.read"));
check("exact equality only", !has("user-a", "admin_audit", base) && !has("user-a", "admin_audit.%", base));
check("runtime query omits Bundle templates", !/from admin_internal\.staff_bundle_templates|join admin_internal\.staff_bundle_template_permissions/.test(SQL));

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p2a-smoke", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures: failures.map((item) => item.label), databaseUsed: false, networkUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
