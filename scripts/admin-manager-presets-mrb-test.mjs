#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

// Load the actual TypeScript manifest and pure flow without an extra runtime dependency.
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, file) => {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  module._compile(output, file);
};
const { MANAGER_PRESETS, PRIMARY_READY_PERMISSION_KEYS, managerPresetManifestIsValid } =
  require("../apps/admin-web/auth/admin-manager-presets.ts");
const { CURRENT_ADMIN_PERMISSION_KEYS } = require("../apps/admin-web/auth/admin-current-permission-vocabulary.ts");
const { computeManagerPresetDiff, applyManagerPreset, managerPresetConfirmation } =
  require("../apps/admin-web/auth/admin-manager-preset-flow.ts");
const ids = ["highest_management_operational_v1", "platform_operations_manager_v1",
  "restaurant_operations_manager_v1", "nutrition_manager_v1", "social_safety_manager_v1",
  "audit_security_manager_v1"];
const expected = {
  highest_management_operational_v1: [
    "admin.dashboard.counts.read", "admin.nutrition.certification.pending.read",
    "admin.restaurants.about.read", "admin.restaurants.branches.read", "admin.restaurants.contact.read",
    "admin.restaurants.geo.read", "admin.restaurants.hours.read", "admin.restaurants.menu_item.read",
    "admin.restaurants.menu_items.read", "admin.restaurants.menu.read",
    "admin.restaurants.menu_management.data_quality.read", "admin.restaurants.menu_management.pending.read",
    "admin.restaurants.menu_management.read", "admin.restaurants.menus.read", "admin.restaurants.read",
    "admin.social.policies.read", "admin_audit.read", "admin_restaurant_branch.status.write"
  ],
  platform_operations_manager_v1: [
    "admin_context.read", "admin.dashboard.counts.read", "admin.nutrition.certification.pending.read",
    "admin.restaurants.about.read", "admin.restaurants.branches.read", "admin.restaurants.contact.read",
    "admin.restaurants.geo.read", "admin.restaurants.hours.read", "admin.restaurants.menu_item.read",
    "admin.restaurants.menu_items.read", "admin.restaurants.menu.read",
    "admin.restaurants.menu_management.data_quality.read", "admin.restaurants.menu_management.pending.read",
    "admin.restaurants.menu_management.read", "admin.restaurants.menus.read", "admin.restaurants.read",
    "admin.social.policies.read"
  ],
  restaurant_operations_manager_v1: [
    "admin_context.read", "admin.dashboard.counts.read", "admin.restaurants.about.read",
    "admin.restaurants.branches.read", "admin.restaurants.contact.read", "admin.restaurants.geo.read",
    "admin.restaurants.hours.read", "admin.restaurants.menu_item.read", "admin.restaurants.menu_items.read",
    "admin.restaurants.menu.read", "admin.restaurants.menu_management.data_quality.read",
    "admin.restaurants.menu_management.pending.read", "admin.restaurants.menu_management.read",
    "admin.restaurants.menus.read", "admin.restaurants.read", "admin_restaurant_branch.status.write"
  ],
  nutrition_manager_v1: [
    "admin_context.read", "admin.nutrition.certification.pending.read", "admin.restaurants.read",
    "admin.restaurants.branches.read", "admin.restaurants.menus.read", "admin.restaurants.menu.read",
    "admin.restaurants.menu_items.read", "admin.restaurants.menu_item.read"
  ],
  social_safety_manager_v1: ["admin_context.read", "admin.social.policies.read"],
  audit_security_manager_v1: [
    "admin_context.read", "admin_audit.read", "admin.management.read",
    "admin.management.staff.read", "admin.management.permissions.read"
  ]
};
assert.equal(managerPresetManifestIsValid(), true);
assert.deepEqual(MANAGER_PRESETS.map((item) => item.id), ids);
for (const item of MANAGER_PRESETS) {
  assert.equal(item.version, 1);
  assert.equal(item.reasonCode, item.id);
  assert.deepEqual(item.permissionKeys, expected[item.id]);
  assert.equal(new Set(item.permissionKeys).size, item.permissionKeys.length);
  assert.ok(item.permissionKeys.every((key) => CURRENT_ADMIN_PERMISSION_KEYS.includes(key)));
  assert.ok(item.permissionKeys.every((key) => !key.includes("*") && key !== "admin.management.staff.bundle.write"));
}
assert.deepEqual(PRIMARY_READY_PERMISSION_KEYS, [
  "admin.management.read", "admin.management.staff.read", "admin.management.permissions.read",
  "admin.management.staff.account.write", "admin.management.staff.delegation.write",
  "admin.management.staff.console_admission.write", "admin.management.staff.permission.write", "admin_context.read"
]);
console.log("PASS exact six immutable V1 preset IDs and ordered CURRENT membership");

const accountId = "11111111-1111-4111-8111-111111111111";
const branch = "admin_restaurant_branch.status.write";
const now = "2020-01-01T00:00:00.000Z";
const entitlement = (permissionKey) => ({ permissionKey, status: "active", effectiveFrom: now, effectiveUntil: null });
const catalog = CURRENT_ADMIN_PERMISSION_KEYS.map((permission_key) => ({
  permission_key, lifecycle_status: "active", readiness_status: "current",
  privileged_only: permission_key !== "admin_context.read" && permission_key !== branch,
  ordinary_supervisor_delegable: permission_key === branch,
  console_admission_required: permission_key === "admin_context.read"
}));
const get = (id) => MANAGER_PRESETS.find((item) => item.id === id);
const input = (preset, overrides = {}) => ({ preset, staffAccountId: accountId,
  confirmation: managerPresetConfirmation(preset, accountId), actorCanWrite: true,
  actorCanConsoleAdmission: true, selfTarget: false, ...overrides });
const harness = (held = []) => {
  const state = { entitlements: held.map(entitlement), catalog };
  const calls = [];
  const dependencies = {
    readSnapshot: async () => structuredClone(state),
    hasFreshStepUp: async () => { calls.push("step_up"); return true; },
    grantConsoleAdmission: async () => {
      calls.push("P3E:admin_context.read"); state.entitlements.push(entitlement("admin_context.read"));
      return { kind: "applied" };
    },
    grantPrivileged: async (key) => {
      calls.push(`P3F:${key}`); state.entitlements.push(entitlement(key));
      return { kind: "applied" };
    }
  };
  return { state, calls, dependencies };
};
const restaurant = get("restaurant_operations_manager_v1");
const blockedBranch = harness(["admin_context.read"]);
const branchDiff = computeManagerPresetDiff(restaurant, blockedBranch.state);
assert.deepEqual(branchDiff.unavailable, [{ key: branch, reason: "ordinary_grant_required" }]);
assert.ok(branchDiff.missing.length > 0);
const blockedResult = await applyManagerPreset(input(restaurant), blockedBranch.dependencies);
assert.equal(blockedResult.kind, "blocked");
assert.deepEqual(blockedBranch.calls, []);
const blockedP3EToo = harness();
assert.equal((await applyManagerPreset(input(restaurant), blockedP3EToo.dependencies)).kind, "blocked");
assert.deepEqual(blockedP3EToo.calls, []);
console.log("PASS missing ordinary-delegable branch status blocks whole preset before any P3F/P3E write");

// The external canonical grant is represented only as a later fresh target read.
blockedBranch.state.entitlements.push(entitlement(branch));
const resumed = await applyManagerPreset(input(restaurant), blockedBranch.dependencies);
assert.equal(resumed.kind, "complete");
assert.ok(blockedBranch.calls.includes("P3F:admin.dashboard.counts.read"));
assert.ok(!blockedBranch.calls.includes(`P3F:${branch}`));
assert.ok(!blockedBranch.calls.includes("P3E:admin_context.read"));
assert.equal(computeManagerPresetDiff(restaurant, blockedBranch.state).state, "complete");
console.log("PASS branch status already held permits P3F grants; retry after prerequisite completes without branch P3F call");

const highest = get("highest_management_operational_v1");
const highMissingBranch = harness([...PRIMARY_READY_PERMISSION_KEYS]);
assert.equal((await applyManagerPreset(input(highest), highMissingBranch.dependencies)).kind, "blocked");
assert.deepEqual(highMissingBranch.calls, []);
const high = harness([...PRIMARY_READY_PERMISSION_KEYS, branch]);
assert.equal((await applyManagerPreset(input(highest), high.dependencies)).kind, "complete");
assert.ok(!high.calls.includes(`P3F:${branch}`));
assert.ok(high.calls.every((call) => call === "step_up" || call.startsWith("P3F:")));
const nonPrimary = harness([branch]);
assert.equal(computeManagerPresetDiff(highest, nonPrimary.state).prerequisite, "primary_required");
assert.equal((await applyManagerPreset(input(highest), nonPrimary.dependencies)).kind, "blocked");
assert.deepEqual(nonPrimary.calls, []);
console.log("PASS highest operational preset is separate from Primary and never self-bootstraps");

const platform = get("platform_operations_manager_v1");
const withP3E = harness();
const p3eResult = await applyManagerPreset(input(platform), withP3E.dependencies);
assert.equal(p3eResult.kind, "complete");
assert.equal(withP3E.calls[0], "step_up");
assert.equal(withP3E.calls[1], "P3E:admin_context.read");
assert.ok(withP3E.calls.slice(2).every((call) => call.startsWith("P3F:")));
assert.ok(!withP3E.calls.includes("P3F:admin_context.read"));
const noP3E = harness();
assert.equal((await applyManagerPreset(input(platform, { actorCanConsoleAdmission: false }), noP3E.dependencies)).reason,
  "console_admission_write_required");
assert.deepEqual(noP3E.calls, []);
console.log("PASS missing admin_context.read uses only canonical P3E, with actor authority gate");

const social = get("social_safety_manager_v1");
const complete = harness(expected.social_safety_manager_v1);
assert.equal((await applyManagerPreset(input(social), complete.dependencies)).kind, "complete");
assert.deepEqual(complete.calls, []);
for (const overrides of [
  { actorCanWrite: false }, { selfTarget: true }, { confirmation: "wrong" }
]) {
  const h = harness(["admin_context.read"]);
  assert.equal((await applyManagerPreset(input(social, overrides), h.dependencies)).kind, "blocked");
  assert.deepEqual(h.calls, []);
}
const noStepUp = harness(["admin_context.read"]);
noStepUp.dependencies.hasFreshStepUp = async () => false;
assert.equal((await applyManagerPreset(input(social), noStepUp.dependencies)).kind, "step_up_required");
assert.deepEqual(noStepUp.calls, []);
console.log("PASS complete is a no-op; read-only/self/invalid-phrase/no-Step-Up cannot grant");

const partial = harness(["admin_context.read"]);
let count = 0;
partial.dependencies.grantPrivileged = async (key) => {
  partial.calls.push(`P3F:${key}`);
  count += 1;
  if (count === 2) return { kind: "rejected", errorCode: "permission_denied" };
  partial.state.entitlements.push(entitlement(key));
  return { kind: "applied" };
};
const failed = await applyManagerPreset(input(platform), partial.dependencies);
assert.equal(failed.kind, "failed");
assert.equal(failed.reason, "permission_denied");
assert.deepEqual(failed.applied, ["admin.dashboard.counts.read"]);
assert.equal(partial.calls.filter((call) => call.startsWith("P3F:")).length, 2);
const firstCount = partial.calls.filter((call) => call === "P3F:admin.dashboard.counts.read").length;
partial.dependencies.grantPrivileged = async (key) => {
  partial.calls.push(`P3F:${key}`);
  partial.state.entitlements.push(entitlement(key));
  return { kind: "applied" };
};
assert.equal((await applyManagerPreset(input(platform), partial.dependencies)).kind, "complete");
assert.equal(partial.calls.filter((call) => call === "P3F:admin.dashboard.counts.read").length, firstCount);
console.log("PASS failure stops, reports successful prefix, and request-fresh retry skips already held key");

const staleCatalog = harness(["admin_context.read"]);
staleCatalog.state.catalog = catalog.map((row) => row.permission_key === "admin.social.policies.read"
  ? { ...row, readiness_status: "planned" } : row);
assert.equal(computeManagerPresetDiff(social, staleCatalog.state).unavailable[0].reason, "catalog_unavailable");
assert.equal((await applyManagerPreset(input(social), staleCatalog.dependencies)).kind, "blocked");
assert.deepEqual(staleCatalog.calls, []);
console.log("PASS live catalogue drift fails closed before writes");

assert.ok(!CURRENT_ADMIN_PERMISSION_KEYS.includes("admin.management.staff.bundle.write"));
const newSources = [
  "apps/admin-web/auth/admin-manager-presets.ts",
  "apps/admin-web/auth/admin-manager-preset-flow.ts",
  "apps/admin-web/components/admin-shell/ManagerPresetPanel.tsx",
  "apps/admin-web/server/adminManagerPresetReadRuntime.ts",
  "apps/admin-web/app/api/admin/management/staff/preset-preview/route.ts"
].map((file) => fs.readFileSync(file, "utf8")).join("\n");
assert.ok(!/service_role|\.from\s*\(|\b(insert|update|delete)\s+into\b/i.test(newSources),
  "new sources do not gain direct table or service-role authority");
assert.ok(newSources.includes('submitMutation("grant_privileged_permission"'));
assert.ok(newSources.includes('submitMutation("grant_console_admission"'));
console.log("PASS bundle.write is not CURRENT and new sources use existing mutation lanes only");

console.log("ADMIN-MRB focused manifest and application-flow tests PASS");
