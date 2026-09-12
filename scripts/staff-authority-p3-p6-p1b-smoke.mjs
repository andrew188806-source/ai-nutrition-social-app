#!/usr/bin/env node
// Pure P3-P6-P1B model smoke. No database, network, credentials, or repository writes.
import fs from "node:fs";

const P1A = fs.readFileSync("supabase/migrations/20260912010000_staff_authority_p3_p6_p1a_foundation.sql", "utf8").replace(/\r\n/g, "\n");
const P1B = fs.readFileSync("supabase/migrations/20260912020000_staff_authority_p3_p6_p1b_entitlement_foundation.sql", "utf8").replace(/\r\n/g, "\n");
const validBundleKey = (value) => typeof value === "string" && value.length >= 3 && value.length <= 80
  && /^[a-z][a-z0-9_]{2,79}$/.test(value) && !value.includes("*") && !value.includes("%");
const validRevision = (value) => Number.isInteger(value) && value > 0;
const validLifecycle = (value) => ["active", "revoked"].includes(value);
const validWindow = (from, until) => until === null || until > from;
const validSource = (sourceType, assignmentId) => sourceType === "bundle_assignment"
  ? typeof assignmentId === "string" && assignmentId.length > 0
  : ["direct_grant", "migration_backfill"].includes(sourceType) && assignmentId === null;
const bundleIdentity = (row) => row.sourceType === "bundle_assignment"
  ? `${row.assignmentId}|${row.permissionKey}` : `${row.entitlementId}`;

const checks = [], failures = [];
function check(label, pass, detail) {
  const result = { label, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) };
  checks.push(result); if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${label}`);
}

check("A valid Bundle key accepted", validBundleKey("restaurant_operations"));
check("B invalid wildcard Bundle key rejected", !validBundleKey("restaurant_*"));
check("C revision valid positive integer", validRevision(1) && validRevision(42));
check("D invalid revision rejected", !validRevision(0) && !validRevision(-1) && !validRevision(1.5));
check("E assignment active accepted", validLifecycle("active"));
check("F assignment revoked accepted", validLifecycle("revoked"));
check("G stored expired rejected", !validLifecycle("expired"));
const from = Date.parse("2026-09-12T00:00:00Z");
check("H assignment time window valid", validWindow(from, from + 1) && validWindow(from, null));
check("I assignment equal or negative window rejected", !validWindow(from, from) && !validWindow(from, from - 1));
check("J bundle entitlement source requires assignment", validSource("bundle_assignment", "assignment-a") && !validSource("bundle_assignment", null));
check("K direct source forbids assignment ref", validSource("direct_grant", null) && !validSource("direct_grant", "assignment-a"));
check("L migration_backfill source uses no assignment", validSource("migration_backfill", null) && !validSource("migration_backfill", "assignment-a"));
const sources = [
  { entitlementId: "e1", sourceType: "bundle_assignment", assignmentId: "a1", permissionKey: "admin_audit.read" },
  { entitlementId: "e2", sourceType: "direct_grant", assignmentId: null, permissionKey: "admin_audit.read" },
  { entitlementId: "e3", sourceType: "bundle_assignment", assignmentId: "a2", permissionKey: "admin_audit.read" }
];
check("M same permission multiple source model allowed", new Set(sources.map(bundleIdentity)).size === 3);
check("N same bundle-source duplicate rejected", bundleIdentity(sources[0]) === bundleIdentity({ ...sources[0], entitlementId: "e4" }));
check("O no Bundle seeds", !/insert\s+into\s+admin_internal\.staff_bundle_/i.test(P1B));
check("P no entitlement seeds", !/insert\s+into\s+admin_internal\.staff_permission_entitlements/i.test(P1B));
const seedBlock = P1A.match(/insert into admin_internal\.staff_permission_catalog[\s\S]*?;\n/)?.[0] ?? "";
const seeds = [...seedBlock.matchAll(/\('([a-z0-9_.]+)',\s*'active',\s*'current'/g)].map((m) => m[1]).sort();
check("Q catalog remains exact three", JSON.stringify(seeds) === JSON.stringify(["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"].sort()), seeds);
check("R admin_context.read is not seeded into a Bundle", !/insert\s+into\s+admin_internal\.staff_bundle_template_permissions[\s\S]*admin_context\.read/i.test(P1B));

console.log("\n" + JSON.stringify({
  suite: "staff-authority-p3-p6-p1b-smoke", total: checks.length,
  passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((item) => item.label), databaseUsed: false, networkUsed: false,
  developmentAccessed: false, productionAccessed: false
}, null, 2));
process.exitCode = failures.length ? 1 : 0;
