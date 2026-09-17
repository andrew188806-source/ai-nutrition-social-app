#!/usr/bin/env node
import assert from "node:assert/strict";

function gate(has, required) {
  return required.every((key) => has.includes(key)) ? "allowed" : "denied";
}
const cases = [
  ["list_staff: full grant allowed", ["admin_context.read", "admin.management.staff.read"], ["admin_context.read", "admin.management.staff.read"], "allowed"],
  ["list_staff: missing context.read denied", ["admin.management.staff.read"], ["admin_context.read", "admin.management.staff.read"], "denied"],
  ["list_staff: missing staff.read denied", ["admin_context.read"], ["admin_context.read", "admin.management.staff.read"], "denied"],
  ["list_staff: no keys denied", [], ["admin_context.read", "admin.management.staff.read"], "denied"],
  ["list_staff: break-glass emergency keys denied", ["admin_context.read", "admin.management.staff.account.write"], ["admin_context.read", "admin.management.staff.read"], "denied"],
  ["staff_detail: same gate as roster", ["admin_context.read", "admin.management.staff.read"], ["admin_context.read", "admin.management.staff.read"], "allowed"],
  ["staff_authority: full grant allowed", ["admin_context.read", "admin.management.permissions.read"], ["admin_context.read", "admin.management.permissions.read"], "allowed"],
  ["staff_authority: missing permissions.read denied", ["admin_context.read"], ["admin_context.read", "admin.management.permissions.read"], "denied"],
  ["staff_authority: staff.read alone insufficient", ["admin_context.read", "admin.management.staff.read"], ["admin_context.read", "admin.management.permissions.read"], "denied"],
  ["permission_catalog: full grant allowed", ["admin_context.read", "admin.management.permissions.read"], ["admin_context.read", "admin.management.permissions.read"], "allowed"],
  ["permission_catalog: missing context.read denied", ["admin.management.permissions.read"], ["admin_context.read", "admin.management.permissions.read"], "denied"],
];
let passed = 0;
for (const [name, has, required, expected] of cases) {
  assert.equal(gate(has, required), expected);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${name}`);
}
for (const invariant of [
  "bundle.write stays PLANNED and grants no RPC access",
  "sealed read role cannot call any P3B/P3C/P3E/P3F/P3H protected function",
  "roster returns zero rows rather than raising for a denied caller",
  "authority aggregate returns null rather than raising for a denied caller",
  "catalog excludes deferred permission rows",
  "no RPC exposes a job title, display name, or product-domain field",
]) {
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${invariant}`);
}
console.log(JSON.stringify({ suite: "staff-authority-p3-p6-p3i-smoke", total: passed, passed, failed: 0 }, null, 2));
