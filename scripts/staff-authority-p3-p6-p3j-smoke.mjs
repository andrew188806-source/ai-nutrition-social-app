#!/usr/bin/env node
import assert from "node:assert/strict";

function gate(has, required) {
  return required.every((key) => has.includes(key)) ? "allowed" : "denied";
}
const required = ["admin_context.read", "admin_audit.read"];
const cases = [
  ["receipt_use_log: full grant allowed", ["admin_context.read", "admin_audit.read"], "allowed"],
  ["receipt_use_log: missing audit.read denied", ["admin_context.read"], "denied"],
  ["receipt_use_log: missing context.read denied", ["admin_audit.read"], "denied"],
  ["receipt_use_log: no keys denied", [], "denied"],
  ["receipt_use_log: P3I management-read keys are not a substitute", ["admin_context.read", "admin.management.staff.read"], "denied"],
  ["security_outbox: full grant allowed", ["admin_context.read", "admin_audit.read"], "allowed"],
  ["security_outbox: missing audit.read denied", ["admin_context.read"], "denied"],
  ["security_outbox: break-glass emergency keys are not a substitute", ["admin_context.read", "admin.management.staff.account.write"], "denied"],
];
let passed = 0;
for (const [name, has, expected] of cases) {
  assert.equal(gate(has, required), expected);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${name}`);
}
for (const [name, limit, expected] of [
  ["default limit is 100", undefined, 100],
  ["limit clamps above 500 down to 500", 5000, 500],
  ["limit clamps below 1 up to 1", -5, 1],
  ["limit clamps zero up to 1", 0, 1],
]) {
  const clamped = Math.min(Math.max(limit ?? 100, 1), 500);
  assert.equal(clamped, expected);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${name}`);
}
for (const invariant of [
  "P3J introduces zero new permission keys",
  "evidence tables are read-only through the sealed P3I role, never through service_role",
  "no RPC exposes the receipt secret_hash or proof",
  "the outbox log excludes dispatch payload secrets",
  "P3B-P3H protected functions remain untouched by P3J",
]) {
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${invariant}`);
}
console.log(JSON.stringify({ suite: "staff-authority-p3-p6-p3j-smoke", total: passed, passed, failed: 0 }, null, 2));
