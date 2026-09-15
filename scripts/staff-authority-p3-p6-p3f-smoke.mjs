#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const vocabulary = fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts", "utf8");
const tests = [];
const failures = [];
function test(name, fn) { tests.push(name); try { fn(); console.log(`PASS ${String(tests.length).padStart(2, "0")} ${name}`); } catch (error) { failures.push(name); console.log(`FAIL ${String(tests.length).padStart(2, "0")} ${name}: ${error.message}`); } }

const now = 10;
const catalog = new Map([
  ["admin_context.read", { current: true, privileged: false, console: true, ordinary: false, temporary: false }],
  ["admin_audit.read", { current: true, privileged: true, console: false, ordinary: false, temporary: true }],
  ["admin_restaurant_branch.status.write", { current: true, privileged: false, console: false, ordinary: true, temporary: true }],
  ["admin.management.staff.account.write", { current: true, privileged: true, console: false, ordinary: false, temporary: false }],
  ["admin.management.staff.delegation.write", { current: true, privileged: true, console: false, ordinary: false, temporary: false }],
  ["admin.management.staff.console_admission.write", { current: true, privileged: true, console: false, ordinary: false, temporary: false }],
  ["admin.management.staff.permission.write", { current: true, privileged: true, console: false, ordinary: false, temporary: false }],
  ["admin.management.staff.bundle.write", { current: false, privileged: true, console: false, ordinary: false, temporary: false }]
]);
const eligible = (key) => { const p = catalog.get(key); return Boolean(p?.current && p.privileged && !p.console && !p.ordinary && key !== "admin_context.read"); };
const accounts = new Map();
const entitlements = [];
const grants = [];
const receipts = new Map();
const audits = [];
let sequence = 0;
const account = (id, status = "active", from = 0, until = null, permissions = []) => ({ id, auth: `auth-${id}`, status, from, until, permissions: new Set(permissions) });
const manager = account("manager", "active", 0, null, ["admin_context.read", "admin.management.staff.permission.write"]);
const manager2 = account("manager2", "active", 0, null, ["admin_context.read", "admin.management.staff.permission.write"]);
const target = account("target", "active", 0, 100);
[manager, manager2, target].forEach((row) => accounts.set(row.id, row));
const effective = (row, at = now) => row && row.status === "active" && row.from <= at && (row.until === null || at < row.until);
const authorized = (actor) => effective(actor) && actor.permissions.has("admin_context.read") && actor.permissions.has("admin.management.staff.permission.write");
function grant({ actor = manager, targetId = target.id, permission = "admin.management.staff.account.write", from = null, until = null, reason = "approved", request = `g-${++sequence}` }) {
  if (!authorized(actor)) return { error: "permission_denied" };
  const payload = JSON.stringify({ op: "grant", lane: "privileged_direct", targetId, permission, from, until, reason });
  const receiptKey = `${actor.auth}:${request}`;
  if (receipts.has(receiptKey)) return receipts.get(receiptKey).payload === payload ? receipts.get(receiptKey).result : { error: "request_conflict" };
  const t = accounts.get(targetId); const p = catalog.get(permission); let result;
  if (!t) result = { error: "target_not_found" };
  else if (targetId === actor.id) result = { error: "self_target_denied" };
  else if (!effective(t)) result = { error: "target_ineligible" };
  else if (!eligible(permission) || permission.includes("*") || permission.includes("%")) result = { error: "permission_ineligible" };
  else if ((from !== null || until !== null) && !p.temporary) result = { error: "temporary_permission_ineligible" };
  else if ((from !== null || until !== null) && (from === null || until === null || from < now || until <= from || (t.until !== null && until > t.until))) result = { error: "window_outside_authority" };
  else if (grants.some((g) => g.targetId === targetId && g.permission === permission && g.status === "active")) result = { error: "privileged_permission_exists" };
  else {
    const entitlement = { id: `ent-${++sequence}`, targetId, permission, source: "direct_grant", bundle: null, status: "active", from: from ?? now, until: from === null && until === null ? t.until : until };
    const provenance = { id: `priv-${sequence}`, entitlementId: entitlement.id, targetId, permission, status: "active", version: 0, actor: actor.id };
    entitlements.push(entitlement); grants.push(provenance); result = { ok: true, entitlement: { ...entitlement }, grant: { ...provenance } };
  }
  receipts.set(receiptKey, { payload, result }); audits.push({ receiptKey, result }); return result;
}
function revoke({ actor = manager, grantId, version = 0, reason = "withdrawn", request = `r-${++sequence}` }) {
  if (!authorized(actor)) return { error: "permission_denied" };
  const source = grants.find((g) => g.id === grantId);
  if (!source) return { error: "privileged_permission_not_found" };
  const payload = JSON.stringify({ op: "revoke", lane: "privileged_direct", grantId, version, reason }); const receiptKey = `${actor.auth}:${request}`;
  if (receipts.has(receiptKey)) return receipts.get(receiptKey).payload === payload ? receipts.get(receiptKey).result : { error: "request_conflict" };
  let result;
  if (source.targetId === actor.id) result = { error: "self_target_denied" };
  else if (!eligible(source.permission)) result = { error: "permission_ineligible" };
  else if (source.version !== version) result = { error: "stale_state" };
  else if (source.status !== "active") result = { error: "mutation_rejected" };
  else {
    const entitlement = entitlements.find((e) => e.id === source.entitlementId);
    if (!entitlement || entitlement.targetId !== source.targetId || entitlement.permission !== source.permission || entitlement.source !== "direct_grant" || entitlement.bundle !== null || entitlement.status !== "active") result = { error: "source_mismatch" };
    else { entitlement.status = "revoked"; source.status = "revoked"; source.version += 1; result = { ok: true, entitlement: { ...entitlement }, grant: { ...source } }; }
  }
  receipts.set(receiptKey, { payload, result }); audits.push({ receiptKey, result }); return result;
}

test("A permission.write is CURRENT", () => assert.equal(catalog.get("admin.management.staff.permission.write").current, true));
test("B remaining management states are exact", () => assert.equal(catalog.get("admin.management.staff.bundle.write").current, false));
test("C application vocabulary is exact seven", () => assert.equal((vocabulary.match(/^\s+"/gm) ?? []).length, 7));
test("D dual-authority manager is authorized", () => assert.ok(authorized(manager)));
test("E context-only actor is denied", () => assert.ok(!authorized(account("context", "active", 0, null, ["admin_context.read"]))));
test("F permission-write-only actor is denied", () => assert.ok(!authorized(account("writer", "active", 0, null, ["admin.management.staff.permission.write"]))));
test("G legacy-only actor is denied", () => assert.ok(!authorized(account("legacy"))));
test("H eligible set is catalogue-derived and exact", () => assert.deepEqual([...catalog.keys()].filter(eligible).sort(), ["admin.management.staff.account.write", "admin.management.staff.console_admission.write", "admin.management.staff.delegation.write", "admin.management.staff.permission.write", "admin_audit.read"]));
let accountGrant;
test("I account.write grant succeeds", () => { accountGrant = grant({ request: "account" }); assert.ok(accountGrant.ok); });
test("J delegation.write grant succeeds", () => { const t = account("delegation-target"); accounts.set(t.id, t); assert.ok(grant({ targetId: t.id, permission: "admin.management.staff.delegation.write", request: "delegation" }).ok); });
test("K console_admission.write grant succeeds", () => { const t = account("console-target"); accounts.set(t.id, t); assert.ok(grant({ targetId: t.id, permission: "admin.management.staff.console_admission.write", request: "console-write" }).ok); });
let permissionManagerGrant;
test("L permission.write grant to another succeeds", () => { const t = account("future-manager"); accounts.set(t.id, t); permissionManagerGrant = grant({ targetId: t.id, permission: "admin.management.staff.permission.write", request: "permission-write" }); assert.ok(permissionManagerGrant.ok); });
test("M admin_audit.read grant succeeds", () => { const t = account("audit-target"); accounts.set(t.id, t); assert.ok(grant({ targetId: t.id, permission: "admin_audit.read", request: "audit" }).ok); });
test("N admin_context is rejected", () => assert.equal(grant({ permission: "admin_context.read", request: "context-deny" }).error, "permission_ineligible"));
test("O ordinary branch status is rejected", () => assert.equal(grant({ permission: "admin_restaurant_branch.status.write", request: "ordinary-deny" }).error, "permission_ineligible"));
test("P planned management permission is rejected", () => assert.equal(grant({ permission: "admin.management.staff.bundle.write", request: "planned-deny" }).error, "permission_ineligible"));
test("Q unknown permission is rejected", () => assert.equal(grant({ permission: "admin.unknown.write", request: "unknown-deny" }).error, "permission_ineligible"));
test("R wildcard permission is rejected", () => assert.equal(grant({ permission: "admin.*", request: "wildcard-deny" }).error, "permission_ineligible"));
test("S future target is rejected", () => { const t = account("future", "active", 20); accounts.set(t.id, t); assert.equal(grant({ targetId: t.id, request: "future" }).error, "target_ineligible"); });
test("T suspended target is rejected", () => { const t = account("suspended", "suspended"); accounts.set(t.id, t); assert.equal(grant({ targetId: t.id, request: "suspended" }).error, "target_ineligible"); });
test("U revoked target is rejected", () => { const t = account("revoked", "revoked"); accounts.set(t.id, t); assert.equal(grant({ targetId: t.id, request: "revoked" }).error, "target_ineligible"); });
test("V self grant is denied", () => assert.equal(grant({ targetId: manager.id, request: "self-grant" }).error, "self_target_denied"));
test("W standard window uses database now and target end", () => assert.deepEqual([accountGrant.entitlement.from, accountGrant.entitlement.until], [now, 100]));
test("X temporary window is allowed only for temporary permission", () => { const t = account("temporary-target", "active", 0, 100); accounts.set(t.id, t); assert.ok(grant({ targetId: t.id, permission: "admin_audit.read", from: 20, until: 30, request: "temporary" }).ok); });
test("Y invalid custom window is rejected", () => { const t = account("invalid-window", "active", 0, 100); accounts.set(t.id, t); assert.equal(grant({ targetId: t.id, permission: "admin_audit.read", from: 20, until: 10, request: "invalid-window" }).error, "window_outside_authority"); });
test("Z entitlement source is exact direct_grant", () => assert.deepEqual([accountGrant.entitlement.source, accountGrant.entitlement.bundle], ["direct_grant", null]));
test("AA P3F provenance binds exact entitlement", () => assert.equal(accountGrant.grant.entitlementId, accountGrant.entitlement.id));
test("AB exact replay returns stored result", () => assert.deepEqual(grant({ request: "account" }), accountGrant));
test("AC changed replay conflicts", () => assert.equal(grant({ request: "account", reason: "changed" }).error, "request_conflict"));
test("AD duplicate active P3F source is bounded", () => assert.equal(grant({ request: "duplicate" }).error, "privileged_permission_exists"));
test("AE revoke succeeds", () => assert.ok(revoke({ grantId: accountGrant.grant.id, request: "revoke-account" }).ok));
test("AF different valid manager may revoke", () => { const t = account("manager2-target"); accounts.set(t.id, t); const g = grant({ targetId: t.id, request: "manager2-grant" }); assert.ok(revoke({ actor: manager2, grantId: g.grant.id, request: "manager2-revoke" }).ok); });
test("AG self revoke is denied", () => { const e = { id: "self-ent", targetId: manager.id, permission: "admin_audit.read", source: "direct_grant", bundle: null, status: "active", from: 0, until: null }; const g = { id: "self-priv", entitlementId: e.id, targetId: manager.id, permission: e.permission, status: "active", version: 0 }; entitlements.push(e); grants.push(g); assert.equal(revoke({ grantId: g.id, request: "self-revoke" }).error, "self_target_denied"); });
test("AH stale revoke is rejected", () => { const t = account("stale"); accounts.set(t.id, t); const g = grant({ targetId: t.id, request: "stale-grant" }); assert.equal(revoke({ grantId: g.grant.id, version: 1, request: "stale-revoke" }).error, "stale_state"); });
test("AI revoked source is terminal", () => assert.equal(revoke({ grantId: accountGrant.grant.id, version: 1, request: "terminal" }).error, "mutation_rejected"));
let restored;
test("AJ restoration creates a new source", () => { restored = grant({ request: "restore" }); assert.ok(restored.ok); assert.notEqual(restored.grant.id, accountGrant.grant.id); });
test("AK unrelated direct source survives", () => { entitlements.push({ id: "unrelated", targetId: target.id, permission: restored.grant.permission, source: "direct_grant", bundle: null, status: "active", from: 0, until: 100 }); revoke({ grantId: restored.grant.id, request: "isolate-direct" }); assert.equal(entitlements.find((e) => e.id === "unrelated").status, "active"); });
test("AL compatibility source survives", () => { const t = account("compat"); accounts.set(t.id, t); entitlements.push({ id: "compat-ent", targetId: t.id, permission: "admin_audit.read", source: "migration_backfill", bundle: null, status: "active", from: 0, until: null }); const g = grant({ targetId: t.id, permission: "admin_audit.read", request: "compat-grant" }); revoke({ grantId: g.grant.id, request: "compat-revoke" }); assert.equal(entitlements.find((e) => e.id === "compat-ent").status, "active"); });
test("AM P3D provenance remains untouched", () => assert.equal(grants.filter((g) => g.delegationId).length, 0));
test("AN P3E source remains untouched", () => assert.equal(entitlements.filter((e) => e.permission === "admin_context.read" && e.status === "revoked").length, 0));
test("AO permission.write alone does not create admin_context", () => assert.ok(!entitlements.some((e) => e.targetId === permissionManagerGrant.entitlement.targetId && e.permission === "admin_context.read")));
test("AP replay writes one receipt", () => assert.equal([...receipts.keys()].filter((key) => key === `${manager.auth}:account`).length, 1));
test("AQ replay writes one audit", () => assert.equal(audits.filter((entry) => entry.receiptKey === `${manager.auth}:account`).length, 1));
test("AR no route or navigation is promoted", () => assert.ok(!/route|sidebar/i.test(vocabulary)));

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p3f-smoke", total: tests.length, passed: tests.length - failures.length, failed: failures.length, failures, databaseUsed: false, networkUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
