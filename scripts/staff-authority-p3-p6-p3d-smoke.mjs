#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync("supabase/migrations/20260914040000_staff_management_p3_p6_p3d_delegated_permission_operator.sql", "utf8");
const vocabulary = fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts", "utf8");
const tests = [], failures = [];
function test(name, fn) { try { fn(); tests.push({ name, pass: true }); console.log(`PASS ${String(tests.length).padStart(2, "0")} ${name}`); } catch (error) { tests.push({ name, pass: false }); failures.push(name); console.log(`FAIL ${String(tests.length).padStart(2, "0")} ${name}: ${error.message}`); } }

const catalog = new Map([
  ["admin_restaurant_branch.status.write", { current: true, individual: true, temporary: true, delegable: true, privileged: false, console: false }],
  ["admin_context.read", { current: true, individual: false, temporary: false, delegable: false, privileged: false, console: true }],
  ["admin.management.staff.permission.write", { current: false, individual: false, temporary: false, delegable: false, privileged: true, console: false }],
  ["admin_audit.read", { current: true, individual: true, temporary: true, delegable: false, privileged: true, console: false }]
]);
const accounts = new Map();
const delegations = new Map();
const entitlements = [];
const links = [];
const receipts = new Map();
const audits = [];
let sequence = 0;
const account = (id, status = "active", from = 0, until = null) => ({ id, auth: `auth-${id}`, status, from, until });
const supervisor = account("supervisor");
const target = account("target", "active", 0, 100);
[supervisor, target].forEach((x) => accounts.set(x.id, x));
function delegation(id, actor = supervisor.id, key = "admin_restaurant_branch.status.write", grant = true, revoke = true, temporary = true, status = "active", from = 0, until = 100) {
  const row = { id, actor, key, grant, revoke, temporary, status, from, until, scope: "global" }; delegations.set(id, row); return row;
}
const full = delegation("d-full");
delegation("d-grant", supervisor.id, full.key, true, false, false);
delegation("d-revoke", supervisor.id, full.key, false, true, false);

function effectiveAccount(row, now) { return row && row.status === "active" && row.from <= now && (row.until === null || now < row.until); }
function policyEligible(key) { const p = catalog.get(key); return !!p && p.current && p.individual && p.delegable && !p.privileged && !p.console && key !== "admin_context.read" && !key.startsWith("admin.management.") && !/[\*%]/.test(key); }
function grant({ actor = supervisor, delegationId = "d-full", targetId = target.id, from = null, until = null, request = `g-${++sequence}`, now = 10 }) {
  if (!effectiveAccount(actor, now)) return { error: "permission_denied" };
  const d = delegations.get(delegationId);
  if (!d || d.actor !== actor.id || d.scope !== "global" || d.status !== "active" || d.from > now || (d.until !== null && now >= d.until) || !d.grant) return { error: "delegation_denied" };
  const payload = JSON.stringify({ op: "grant", delegationId, targetId, from, until }); const key = `${actor.auth}:${request}`;
  if (receipts.has(key)) return receipts.get(key).payload === payload ? receipts.get(key).result : { error: "request_conflict" };
  const t = accounts.get(targetId); const p = catalog.get(d.key); const custom = from !== null || until !== null;
  const actualFrom = custom ? (from ?? now) : now;
  const finite = [t?.until, d.until].filter((x) => x !== null && x !== undefined);
  const actualUntil = custom ? until : (finite.length ? Math.min(...finite) : null);
  let result;
  if (!t) result = { error: "target_not_found" };
  else if (targetId === actor.id) result = { error: "self_target_denied" };
  else if (t.status !== "active") result = { error: "target_ineligible" };
  else if (!policyEligible(d.key)) result = { error: "permission_ineligible" };
  else if (custom && !d.temporary) result = { error: "custom_window_denied" };
  else if (custom && !p.temporary) result = { error: "temporary_permission_ineligible" };
  else if ((actualUntil !== null && actualUntil <= actualFrom) || actualFrom < t.from || actualFrom < d.from || (t.until !== null && (actualUntil === null || actualUntil > t.until)) || (d.until !== null && (actualUntil === null || actualUntil > d.until))) result = { error: "window_outside_authority" };
  else if (links.some((x) => x.delegationId === d.id && x.targetId === targetId && x.permission === d.key && x.status === "active")) result = { error: "delegated_grant_exists" };
  else {
    const entitlement = { id: `e-${++sequence}`, targetId, permission: d.key, source: "direct_grant", bundle: null, status: "active", from: actualFrom, until: actualUntil };
    const link = { id: `l-${sequence}`, entitlementId: entitlement.id, delegationId: d.id, targetId, permission: d.key, status: "active", version: 0 };
    entitlements.push(entitlement); links.push(link); result = { ok: true, entitlement: { ...entitlement }, link: { ...link } };
  }
  receipts.set(key, { payload, result }); audits.push({ key, result }); return result;
}
function revoke({ actor = supervisor, delegationId = "d-full", linkId, version = 0, request = `r-${++sequence}`, now = 10 }) {
  if (!effectiveAccount(actor, now)) return { error: "permission_denied" };
  const d = delegations.get(delegationId); const pre = links.find((x) => x.id === linkId);
  if (!pre || pre.delegationId !== delegationId) return { error: "delegated_grant_not_found" };
  if (!d || d.actor !== actor.id || d.status !== "active" || d.from > now || (d.until !== null && now >= d.until) || !d.revoke) return { error: "delegation_denied" };
  const payload = JSON.stringify({ op: "revoke", delegationId, linkId, version }); const key = `${actor.auth}:${request}`;
  if (receipts.has(key)) return receipts.get(key).payload === payload ? receipts.get(key).result : { error: "request_conflict" };
  const t = accounts.get(pre.targetId); const entitlement = entitlements.find((x) => x.id === pre.entitlementId); let result;
  if (pre.targetId === actor.id) result = { error: "self_target_denied" };
  else if (!effectiveAccount(t, now)) result = { error: "target_ineligible" };
  else if (!policyEligible(pre.permission)) result = { error: "permission_ineligible" };
  else if (pre.version !== version) result = { error: "stale_state" };
  else if (pre.status !== "active") result = { error: "mutation_rejected" };
  else if (!entitlement || entitlement.source !== "direct_grant" || entitlement.bundle !== null || entitlement.targetId !== pre.targetId || entitlement.permission !== pre.permission || entitlement.status !== "active") result = { error: "source_mismatch" };
  else { entitlement.status = "revoked"; pre.status = "revoked"; pre.version++; result = { ok: true, entitlement: { ...entitlement }, link: { ...pre } }; }
  receipts.set(key, { payload, result }); audits.push({ key, result }); return result;
}
function hasPermission(targetId, permission, now) { return entitlements.some((e) => e.targetId === targetId && e.permission === permission && e.status === "active" && e.from <= now && (e.until === null || now < e.until)); }

let first;
test("A valid delegation grant succeeds", () => { first = grant({ request: "first", until: 90 }); assert.ok(first.ok); });
test("B grant-only delegation works", () => { accounts.set("grant-target", account("grant-target", "active", 0, 100)); assert.ok(grant({ delegationId: "d-grant", targetId: "grant-target", request: "b" }).ok); });
test("C revoke-only cannot grant", () => assert.equal(grant({ delegationId: "d-revoke", request: "c" }).error, "delegation_denied"));
test("D missing delegation denied", () => assert.equal(grant({ delegationId: "missing", request: "d" }).error, "delegation_denied"));
test("E other actor delegation denied", () => { delegation("other", "someone-else"); assert.equal(grant({ delegationId: "other", request: "e" }).error, "delegation_denied"); });
test("F inactive delegation denied", () => { delegation("inactive", supervisor.id, full.key, true, true, true, "revoked"); assert.equal(grant({ delegationId: "inactive", request: "f" }).error, "delegation_denied"); });
test("G future delegation denied", () => { delegation("future", supervisor.id, full.key, true, true, true, "active", 20, 100); assert.equal(grant({ delegationId: "future", request: "g", now: 10 }).error, "delegation_denied"); });
test("H expired delegation denied", () => { delegation("expired", supervisor.id, full.key, true, true, true, "active", 0, 10); assert.equal(grant({ delegationId: "expired", request: "h", now: 10 }).error, "delegation_denied"); });
test("I self target denied", () => { accounts.set(supervisor.id, supervisor); assert.equal(grant({ targetId: supervisor.id, request: "i" }).error, "self_target_denied"); });
test("J suspended target denied", () => { accounts.set("suspended", account("suspended", "suspended")); assert.equal(grant({ targetId: "suspended", request: "j" }).error, "target_ineligible"); });
test("K revoked target denied", () => { accounts.set("revoked", account("revoked", "revoked")); assert.equal(grant({ targetId: "revoked", request: "k" }).error, "target_ineligible"); });
test("L admin_context rejected", () => { delegation("context", supervisor.id, "admin_context.read"); assert.equal(grant({ delegationId: "context", request: "l" }).error, "permission_ineligible"); });
test("M management permission rejected", () => { delegation("management", supervisor.id, "admin.management.staff.permission.write"); assert.equal(grant({ delegationId: "management", request: "m" }).error, "permission_ineligible"); });
test("N planned permission rejected", () => assert.ok(!policyEligible("admin.management.staff.permission.write")));
test("O unknown permission rejected", () => { delegation("unknown", supervisor.id, "unknown.permission"); assert.equal(grant({ delegationId: "unknown", request: "o" }).error, "permission_ineligible"); });
test("P wildcard rejected", () => assert.ok(!policyEligible("admin_restaurant_branch.*")));
test("Q standard window uses operation time and earliest end", () => { accounts.set("standard", account("standard", "active", 0, 80)); const r = grant({ delegationId: "d-grant", targetId: "standard", request: "q", now: 11 }); assert.equal(r.entitlement.from, 11); assert.equal(r.entitlement.until, 80); });
test("R custom temporary window allowed", () => { accounts.set("temporary", account("temporary", "active", 0, 100)); const r = grant({ targetId: "temporary", request: "r", from: 20, until: 30 }); assert.ok(r.ok); });
test("S custom window denied without capability", () => { accounts.set("no-temp", account("no-temp", "active", 0, 100)); assert.equal(grant({ delegationId: "d-grant", targetId: "no-temp", request: "s", until: 30 }).error, "custom_window_denied"); });
test("T target window containment", () => { accounts.set("target-window", account("target-window", "active", 20, 30)); assert.equal(grant({ targetId: "target-window", request: "t", from: 19, until: 25 }).error, "window_outside_authority"); });
test("U delegation window containment", () => { delegation("short", supervisor.id, full.key, true, true, true, "active", 0, 30); accounts.set("short-target", account("short-target", "active", 0, 100)); assert.equal(grant({ delegationId: "short", targetId: "short-target", request: "u", until: 31 }).error, "window_outside_authority"); });
test("V entitlement is exact direct grant", () => { assert.equal(first.entitlement.source, "direct_grant"); assert.equal(first.entitlement.bundle, null); });
test("W provenance binding is exact", () => { assert.equal(first.link.entitlementId, first.entitlement.id); assert.equal(first.link.delegationId, "d-full"); assert.equal(first.link.targetId, target.id); });
test("X runtime permission appears from entitlement", () => assert.ok(hasPermission(target.id, full.key, 20)));
test("Y delegation alone is not runtime permission", () => assert.ok(!hasPermission(supervisor.id, full.key, 20)));
test("Z exact replay returns stored result", () => assert.deepEqual(grant({ request: "first", until: 90 }), first));
test("AA changed request conflicts", () => assert.equal(grant({ request: "first", from: 20, until: 90 }).error, "request_conflict"));
test("AB duplicate same-source grant rejected", () => assert.equal(grant({ request: "duplicate", until: 90 }).error, "delegated_grant_exists"));
test("AC revoke succeeds", () => assert.ok(revoke({ linkId: first.link.id, request: "revoke-first" }).ok));
test("AD revoke without capability denied", () => { accounts.set("grant-only-revoke", account("grant-only-revoke", "active", 0, 100)); const g = grant({ delegationId: "d-grant", targetId: "grant-only-revoke", request: "ad-grant" }); assert.ok(g.ok); assert.equal(revoke({ delegationId: "d-grant", linkId: g.link.id, request: "ad" }).error, "delegation_denied"); });
test("AE revoke wrong delegation denied", () => assert.equal(revoke({ delegationId: "d-revoke", linkId: first.link.id, request: "ae" }).error, "delegated_grant_not_found"));
test("AF stale revoke uses CAS", () => { accounts.set("cas", account("cas", "active", 0, 100)); const g = grant({ targetId: "cas", request: "af-g" }); assert.equal(revoke({ linkId: g.link.id, version: 1, request: "af" }).error, "stale_state"); });
test("AG revoked source is terminal", () => assert.equal(revoke({ linkId: first.link.id, version: 1, request: "ag" }).error, "mutation_rejected"));
test("AH restoration creates a new source", () => { const restored = grant({ request: "restore", until: 90 }); assert.ok(restored.ok); assert.notEqual(restored.link.id, first.link.id); });
test("AI Bundle source survives delegated revoke", () => { accounts.set("bundle", account("bundle", "active", 0, 100)); entitlements.push({ id: "bundle-source", targetId: "bundle", permission: full.key, source: "bundle_assignment", bundle: "assignment", status: "active", from: 0, until: 100 }); const g = grant({ targetId: "bundle", request: "ai-g" }); assert.ok(revoke({ linkId: g.link.id, request: "ai-r" }).ok); assert.ok(hasPermission("bundle", full.key, 20)); });
test("AJ unrelated direct source survives delegated revoke", () => { accounts.set("direct", account("direct", "active", 0, 100)); entitlements.push({ id: "other-direct", targetId: "direct", permission: full.key, source: "direct_grant", bundle: null, status: "active", from: 0, until: 100 }); const g = grant({ targetId: "direct", request: "aj-g" }); assert.ok(revoke({ linkId: g.link.id, request: "aj-r" }).ok); assert.equal(entitlements.find((e) => e.id === "other-direct").status, "active"); });
test("AK delegation loss does not retroactively remove grant", () => { accounts.set("loss", account("loss", "active", 0, 100)); const g = grant({ targetId: "loss", request: "ak" }); delegations.get("d-full").status = "revoked"; assert.ok(hasPermission("loss", full.key, 20)); delegations.get("d-full").status = "active"; assert.ok(g.ok); });
test("AL temporal permission absent before start", () => { accounts.set("temporal", account("temporal", "active", 0, 100)); const g = grant({ targetId: "temporal", request: "al", from: 30, until: 40 }); assert.ok(!hasPermission("temporal", full.key, 29)); assert.ok(g.ok); });
test("AM temporal permission present inside window", () => assert.ok(hasPermission("temporal", full.key, 35)));
test("AN temporal permission absent at exclusive end", () => assert.ok(!hasPermission("temporal", full.key, 40)));
test("AO receipt exactly once on replay", () => assert.equal([...receipts.keys()].filter((key) => key === `${supervisor.auth}:first`).length, 1));
test("AP audit exactly once on replay", () => assert.equal(audits.filter((event) => event.key === `${supervisor.auth}:first`).length, 1));
test("AQ P3E adds only the sixth vocabulary key without route/nav", () => { assert.equal((vocabulary.match(/^  "/gm) ?? []).length, 6); assert.ok(vocabulary.includes('"admin.management.staff.console_admission.write"')); assert.ok(!/admin-route-registry|Sidebar/.test(sql)); });

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p3d-smoke", total: tests.length, passed: tests.length - failures.length, failed: failures.length, failures, databaseUsed: false, networkUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
