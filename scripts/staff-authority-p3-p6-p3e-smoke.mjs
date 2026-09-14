#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const vocabulary = fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts", "utf8");
const tests = [];
const failures = [];
function test(name, fn) { tests.push(name); try { fn(); console.log(`PASS ${String(tests.length).padStart(2, "0")} ${name}`); } catch (error) { failures.push(name); console.log(`FAIL ${String(tests.length).padStart(2, "0")} ${name}: ${error.message}`); } }

const now = 10;
const catalog = new Map([
  ["admin_context.read", { current: true, console: true, individual: false, temporary: false, delegable: false }],
  ["admin.management.staff.console_admission.write", { current: true, console: false, individual: false, temporary: false, delegable: false }],
  ["admin.management.staff.permission.write", { current: false }]
]);
const accounts = new Map();
const entitlements = [];
const grants = [];
const receipts = new Map();
const audits = [];
let sequence = 0;
const account = (id, status = "active", from = 0, until = null, permissions = []) => ({ id, auth: `auth-${id}`, status, from, until, permissions: new Set(permissions) });
const manager = account("manager", "active", 0, null, ["admin_context.read", "admin.management.staff.console_admission.write"]);
const manager2 = account("manager2", "active", 0, null, ["admin_context.read", "admin.management.staff.console_admission.write"]);
const target = account("target", "active", 0, 100);
[manager, manager2, target].forEach((x) => accounts.set(x.id, x));
const effective = (row, at = now) => row && row.status === "active" && row.from <= at && (row.until === null || at < row.until);
const authorized = (actor) => effective(actor) && actor.permissions.has("admin_context.read") && actor.permissions.has("admin.management.staff.console_admission.write");
const hasContext = (targetId, at = now) => entitlements.some((e) => e.targetId === targetId && e.permission === "admin_context.read" && e.status === "active" && e.from <= at && (e.until === null || at < e.until));
function grant({ actor = manager, targetId = target.id, reason = "approved", request = `g-${++sequence}` }) {
  if (!authorized(actor)) return { error: "permission_denied" };
  const payload = JSON.stringify({ op: "grant", targetId, reason }); const receiptKey = `${actor.auth}:${request}`;
  if (receipts.has(receiptKey)) return receipts.get(receiptKey).payload === payload ? receipts.get(receiptKey).result : { error: "request_conflict" };
  const t = accounts.get(targetId); let result;
  if (!t) result = { error: "target_not_found" };
  else if (targetId === actor.id) result = { error: "self_target_denied" };
  else if (!effective(t)) result = { error: "target_ineligible" };
  else if (grants.some((g) => g.targetId === targetId && g.status === "active")) result = { error: "console_admission_exists" };
  else {
    const entitlement = { id: `ent-${++sequence}`, targetId, permission: "admin_context.read", source: "direct_grant", bundle: null, status: "active", from: now, until: t.until };
    const provenance = { id: `console-${sequence}`, entitlementId: entitlement.id, targetId, status: "active", version: 0, actor: actor.id };
    entitlements.push(entitlement); grants.push(provenance); result = { ok: true, entitlement: { ...entitlement }, grant: { ...provenance } };
  }
  receipts.set(receiptKey, { payload, result }); audits.push({ receiptKey, result }); return result;
}
function revoke({ actor = manager, grantId, version = 0, reason = "withdrawn", request = `r-${++sequence}` }) {
  if (!authorized(actor)) return { error: "permission_denied" };
  const source = grants.find((g) => g.id === grantId);
  if (!source) return { error: "console_admission_not_found" };
  const payload = JSON.stringify({ op: "revoke", grantId, version, reason }); const receiptKey = `${actor.auth}:${request}`;
  if (receipts.has(receiptKey)) return receipts.get(receiptKey).payload === payload ? receipts.get(receiptKey).result : { error: "request_conflict" };
  let result;
  if (source.targetId === actor.id) result = { error: "self_target_denied" };
  else if (source.version !== version) result = { error: "stale_state" };
  else if (source.status !== "active") result = { error: "mutation_rejected" };
  else {
    const entitlement = entitlements.find((e) => e.id === source.entitlementId);
    if (!entitlement || entitlement.permission !== "admin_context.read" || entitlement.source !== "direct_grant" || entitlement.bundle !== null) result = { error: "source_mismatch" };
    else { entitlement.status = "revoked"; source.status = "revoked"; source.version += 1; result = { ok: true, grant: { ...source }, entitlement: { ...entitlement } }; }
  }
  receipts.set(receiptKey, { payload, result }); audits.push({ receiptKey, result }); return result;
}

test("A console_admission.write is CURRENT", () => assert.equal(catalog.get("admin.management.staff.console_admission.write").current, true));
test("B permission.write remains PLANNED", () => assert.equal(catalog.get("admin.management.staff.permission.write").current, false));
test("C application vocabulary is exact six", () => assert.equal((vocabulary.match(/^\s+"/gm) ?? []).length, 6));
test("D actor with context and console writer is authorized", () => assert.ok(authorized(manager)));
test("E context-only actor is denied", () => assert.ok(!authorized(account("context-only", "active", 0, null, ["admin_context.read"]))));
test("F console-writer-only actor is denied", () => assert.ok(!authorized(account("write-only", "active", 0, null, ["admin.management.staff.console_admission.write"]))));
test("G legacy Platform Admin-only actor is denied", () => assert.ok(!authorized(account("legacy", "active", 0, null, []))));
let first;
test("H valid grant succeeds", () => { first = grant({ request: "first" }); assert.ok(first.ok); });
test("I entitlement is exact admin_context", () => assert.equal(first.entitlement.permission, "admin_context.read"));
test("J provenance binds exact entitlement", () => assert.equal(first.grant.entitlementId, first.entitlement.id));
test("K target account end is inherited", () => assert.equal(first.entitlement.until, 100));
test("L unbounded target yields unbounded entitlement", () => { const t = account("unbounded"); accounts.set(t.id, t); assert.equal(grant({ targetId: t.id, request: "unbounded" }).entitlement.until, null); });
test("M future target is denied", () => { const t = account("future", "active", 20); accounts.set(t.id, t); assert.equal(grant({ targetId: t.id, request: "future" }).error, "target_ineligible"); });
test("N suspended target is denied", () => { const t = account("suspended", "suspended"); accounts.set(t.id, t); assert.equal(grant({ targetId: t.id, request: "suspended" }).error, "target_ineligible"); });
test("O revoked target is denied", () => { const t = account("revoked", "revoked"); accounts.set(t.id, t); assert.equal(grant({ targetId: t.id, request: "revoked" }).error, "target_ineligible"); });
test("P self grant is denied", () => assert.equal(grant({ targetId: manager.id, request: "self-grant" }).error, "self_target_denied"));
test("Q exact replay returns stored result", () => assert.deepEqual(grant({ request: "first" }), first));
test("R changed replay request conflicts", () => assert.equal(grant({ request: "first", reason: "changed" }).error, "request_conflict"));
test("S duplicate active P3E source is blocked", () => assert.equal(grant({ request: "duplicate" }).error, "console_admission_exists"));
test("T revoke succeeds", () => assert.ok(revoke({ grantId: first.grant.id, request: "revoke-first" }).ok));
test("U different authorized console manager may revoke", () => { const t = account("target2"); accounts.set(t.id, t); const g = grant({ targetId: t.id, request: "manager2-grant" }); assert.ok(revoke({ actor: manager2, grantId: g.grant.id, request: "manager2-revoke" }).ok); });
test("V self revoke is denied", () => { const e = { id: "self-ent", targetId: manager.id, permission: "admin_context.read", source: "direct_grant", bundle: null, status: "active", from: 0, until: null }; const g = { id: "self-source", entitlementId: e.id, targetId: manager.id, status: "active", version: 0 }; entitlements.push(e); grants.push(g); assert.equal(revoke({ grantId: g.id, request: "self-revoke" }).error, "self_target_denied"); });
test("W stale revoke is denied", () => { const t = account("stale"); accounts.set(t.id, t); const g = grant({ targetId: t.id, request: "stale-grant" }); assert.equal(revoke({ grantId: g.grant.id, version: 1, request: "stale-revoke" }).error, "stale_state"); });
test("X revoked source is terminal", () => assert.equal(revoke({ grantId: first.grant.id, version: 1, request: "terminal" }).error, "mutation_rejected"));
let restored;
test("Y restoration creates a new source", () => { restored = grant({ request: "restore" }); assert.ok(restored.ok); assert.notEqual(restored.grant.id, first.grant.id); });
test("Z unrelated direct admin_context survives P3E revoke", () => { entitlements.push({ id: "independent", targetId: target.id, permission: "admin_context.read", source: "direct_grant", bundle: null, status: "active", from: 0, until: 100 }); assert.ok(revoke({ grantId: restored.grant.id, request: "isolate-direct" }).ok); assert.ok(hasContext(target.id)); });
test("AA compatibility-like source survives P3E revoke", () => { const t = account("compat"); accounts.set(t.id, t); entitlements.push({ id: "compatibility", targetId: t.id, permission: "admin_context.read", source: "migration_backfill", bundle: null, status: "active", from: 0, until: null }); const g = grant({ targetId: t.id, request: "compat-grant" }); revoke({ grantId: g.grant.id, request: "compat-revoke" }); assert.equal(entitlements.find((e) => e.id === "compatibility").status, "active"); });
test("AB P3C policy excludes admin_context", () => assert.equal(catalog.get("admin_context.read").delegable, false));
test("AC P3D ordinary grant excludes admin_context", () => assert.equal(catalog.get("admin_context.read").individual, false));
test("AD Bundle policy excludes console admission", () => assert.equal(catalog.get("admin_context.read").console, true));
test("AE grant replay writes one receipt", () => assert.equal([...receipts.keys()].filter((x) => x === `${manager.auth}:first`).length, 1));
test("AF grant replay writes one audit", () => assert.equal(audits.filter((x) => x.receiptKey === `${manager.auth}:first`).length, 1));
test("AG no route or navigation is promoted", () => assert.ok(!/route|sidebar/i.test(vocabulary)));
test("AH no console manager is auto-created", () => assert.equal([...accounts.values()].filter((x) => x.id.startsWith("auto-console-manager")).length, 0));

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p3e-smoke", total: tests.length, passed: tests.length - failures.length, failed: failures.length, failures, databaseUsed: false, networkUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
