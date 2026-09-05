#!/usr/bin/env node
// RA-2B-P1 smoke. Executes every contract claim against the frozen migration text and the
// Development acceptance harness. Behaviour against a real cluster is the separate postgres gate.
import {
  auditAcceptanceSource, auditMigrationSource, readMigrationSource, readNormalized
} from "./restaurant-owner-availability-ra-2b-p1-contract.mjs";

const SUITE = "restaurant-owner-availability-ra-2b-p1-smoke";
const ACCEPTANCE = "scripts/restaurant-owner-availability-ra-2b-p1-development-acceptance.mjs";

const checks = [
  ...auditMigrationSource(readMigrationSource()),
  ...auditAcceptanceSource(readNormalized(process.cwd(), ACCEPTANCE))
];
for (const [index, item] of checks.entries()) {
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(index + 1).padStart(2, "0")} ${item.name}`);
}
const failures = checks.filter((item) => !item.pass);
console.log("\n" + JSON.stringify({
  suite: SUITE, status: failures.length === 0 ? "passed" : "failed",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((item) => item.name), databaseUsed: false
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
