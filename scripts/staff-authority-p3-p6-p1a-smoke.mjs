#!/usr/bin/env node
// Pure P3-P6-P1A contract smoke. No database, network, credentials, or repository writes.
import fs from "node:fs";

const MIGRATION = "supabase/migrations/20260912010000_staff_authority_p3_p6_p1a_foundation.sql";
const sql = fs.readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
const keyPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const validKey = (value) => typeof value === "string" && value.length >= 3 && value.length <= 160
  && keyPattern.test(value) && !value.includes("*") && !value.includes("%");
const validStatus = (value) => ["active", "suspended", "revoked"].includes(value);
const validWindow = (from, until) => until === null || until > from;

const checks = [];
const failures = [];
function check(label, pass, detail) {
  const item = { label, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) };
  checks.push(item);
  if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${label}`);
}

check("A valid current permission keys pass format", [
  "admin_context.read", "admin_audit.read", "admin_restaurant_branch.status.write"
].every(validKey));
check("B future dotted key format passes", validKey("admin.restaurants.menu.write"));
check("C wildcard is rejected", !validKey("admin.restaurants.*"));
check("D uppercase is rejected", !validKey("admin.Restaurants.menu.read"));
check("E whitespace is rejected", !validKey("admin.restaurants.menu read"));
check("F empty segment is rejected", !validKey("admin.restaurants..read"));
check("G overlength is rejected", !validKey(`admin.${"a".repeat(155)}.read`));
check("H status accepts active", validStatus("active"));
check("I status accepts suspended", validStatus("suspended"));
check("J status accepts revoked", validStatus("revoked"));
check("K other status is rejected", !validStatus("expired") && !validStatus("disabled"));
const from = Date.parse("2026-09-12T00:00:00Z");
check("L effective_until later than effective_from is valid", validWindow(from, from + 1));
check("M equal validity boundary is invalid", !validWindow(from, from));
check("N earlier effective_until is invalid", !validWindow(from, from - 1));
const seedBlock = sql.match(/insert into admin_internal\.staff_permission_catalog[\s\S]*?;\n/)?.[0] ?? "";
const seeded = [...seedBlock.matchAll(/\('([a-z0-9_.]+)',\s*'active',\s*'current'/g)].map((m) => m[1]).sort();
const expected = ["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"].sort();
check("O three seed permissions are exact", JSON.stringify(seeded) === JSON.stringify(expected), seeded);
check("P no fourth permission is seeded", seeded.length === 3, seeded);
check("Q no staff row or compatibility backfill exists", !/insert\s+into\s+admin_internal\.staff_accounts/i.test(sql));
check("R no Bundle, entitlement, delegation, audit, or receipt table exists",
  !/create\s+table\s+admin_internal\.staff_(bundle|permission_entitlements|delegation|authority_audit|authority_operation)/i.test(sql));

console.log("\n" + JSON.stringify({
  suite: "staff-authority-p3-p6-p1a-smoke",
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((item) => item.label),
  databaseUsed: false,
  networkUsed: false,
  developmentAccessed: false,
  productionAccessed: false
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
