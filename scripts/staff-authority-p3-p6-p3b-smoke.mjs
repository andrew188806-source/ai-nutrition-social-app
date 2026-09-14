#!/usr/bin/env node
// Pure P3B contract smoke. PostgreSQL execution and races are separate required gates.
import fs from "node:fs";
import assert from "node:assert/strict";

const sql = fs.readFileSync("supabase/migrations/20260914020000_staff_management_p3_p6_p3b_account_operator.sql", "utf8");
const vocabularySource = fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts", "utf8");
const current = ["admin_audit.read", "admin_context.read", "admin.management.staff.account.write", "admin_restaurant_branch.status.write"];
const otherManagement = ["admin.management.read", "admin.management.permissions.read", "admin.management.staff.read", "admin.management.staff.bundle.write", "admin.management.staff.permission.write", "admin.management.staff.delegation.write", "admin.management.staff.console_admission.write"];
const checks = [], failures = [];
function test(name, fn) { try { fn(); checks.push({ name, pass: true }); console.log(`PASS ${String(checks.length).padStart(2, "0")} ${name}`); } catch (error) { checks.push({ name, pass: false }); failures.push({ name, error: error.message }); console.log(`FAIL ${String(checks.length).padStart(2, "0")} ${name}: ${error.message}`); } }

class Model {
  constructor() { this.accounts = new Map(); this.auth = new Set(); this.receipts = new Map(); this.audit = []; this.entitlements = []; this.bundles = []; this.legacy = []; }
  addActor(id, auth, permissions) { this.auth.add(auth); this.accounts.set(id, { id, auth, status: "active", version: 0, from: 1, until: null }); this.actor = { id, auth, permissions: new Set(permissions) }; }
  authorized() { return this.actor.permissions.has("admin_context.read") && this.actor.permissions.has("admin.management.staff.account.write"); }
  apply(op, target, expected, request, payload = {}) {
    if (!this.authorized()) return { ok: false, errorCode: "permission_denied" };
    const key = `${this.actor.auth}:${request}`;
    const canonical = JSON.stringify({ op, target, expected, ...payload });
    if (this.receipts.has(key)) return this.receipts.get(key).canonical === canonical ? this.receipts.get(key).result : { ok: false, errorCode: "request_conflict" };
    let result;
    const account = this.accounts.get(target);
    if (target === this.actor.id || target === this.actor.auth) result = { ok: false, outcome: "rejected", errorCode: "self_target_denied" };
    else if (op === "link") {
      const existing = [...this.accounts.values()].find((x) => x.auth === target);
      if (!this.auth.has(target)) result = { ok: false, outcome: "rejected", errorCode: "target_not_found" };
      else if (existing) result = { ok: false, outcome: "rejected", errorCode: "target_exists" };
      else { const id = `staff-${target}`; this.accounts.set(id, { id, auth: target, status: "active", version: 0, from: payload.from ?? 10, until: payload.until ?? null }); result = { ok: true, outcome: "applied", id, status: "active", version: 0 }; }
    } else if (!account) result = { ok: false, outcome: "rejected", errorCode: "target_not_found" };
    else if (account.version !== expected) result = { ok: false, outcome: "rejected", errorCode: "stale_state" };
    else if (op === "suspend" && account.status === "active") { account.status = "suspended"; account.version++; result = { ok: true, outcome: "applied", status: account.status, version: account.version }; }
    else if (op === "reactivate" && account.status === "suspended" && (account.until === null || account.until > 10)) { account.status = "active"; account.version++; result = { ok: true, outcome: "applied", status: account.status, version: account.version }; }
    else if (op === "revoke" && ["active", "suspended"].includes(account.status)) { account.status = "revoked"; account.version++; result = { ok: true, outcome: "applied", status: account.status, version: account.version }; }
    else result = { ok: false, outcome: "rejected", errorCode: "mutation_rejected" };
    this.receipts.set(key, { canonical, result }); this.audit.push({ op, target, result }); return result;
  }
}

test("A account.write is promoted CURRENT", () => assert.match(sql, /set readiness_status = 'current'/));
test("B only bounded P3C delegation.write may follow account.write", () => assert.ok(otherManagement.every((x) => x === "admin.management.staff.delegation.write" || !vocabularySource.includes(`\"${x}\"`))));
test("C application vocabulary retains exact P3B four", () => assert.ok(current.every((x) => vocabularySource.includes(`\"${x}\"`))));
test("D no management route is promoted", () => assert.doesNotMatch(sql, /admin-route-registry|Sidebar/));

const model = new Model();
model.addActor("manager", "auth-manager", ["admin_context.read", "admin.management.staff.account.write"]);
model.auth.add("auth-target"); model.auth.add("auth-other");
test("E manager with context and account.write is authorized", () => assert.equal(model.authorized(), true));
test("F account.write without context is denied", () => { const old = model.actor.permissions; model.actor.permissions = new Set(["admin.management.staff.account.write"]); assert.equal(model.apply("link", "auth-other", null, "r-no-context").errorCode, "permission_denied"); model.actor.permissions = old; });
test("G context without account.write is denied", () => { const old = model.actor.permissions; model.actor.permissions = new Set(["admin_context.read"]); assert.equal(model.apply("link", "auth-other", null, "r-no-write").errorCode, "permission_denied"); model.actor.permissions = old; });
test("H direct and migration sources are recognized", () => assert.match(sql, /source_type in \('direct_grant', 'migration_backfill'\)/));
test("I Bundle source is recognized", () => assert.match(sql, /source_type = 'bundle_assignment'/));
test("J self link is denied", () => assert.equal(model.apply("link", "auth-manager", null, "r-self-link").errorCode, "self_target_denied"));
const linked = model.apply("link", "auth-target", null, "r-link", { from: null, until: null });
test("K link succeeds", () => assert.equal(linked.outcome, "applied"));
test("L link creates active version zero", () => assert.deepEqual([linked.status, linked.version], ["active", 0]));
test("M duplicate target link is rejected", () => assert.equal(model.apply("link", "auth-target", null, "r-duplicate").errorCode, "target_exists"));
test("N missing Auth identity is rejected", () => assert.equal(model.apply("link", "auth-missing", null, "r-missing").errorCode, "target_not_found"));
const replayBefore = model.audit.length; const replay = model.apply("link", "auth-target", null, "r-link", { from: null, until: null });
test("O exact link replay returns stored result", () => assert.deepEqual(replay, linked));
test("P replay appends no audit", () => assert.equal(model.audit.length, replayBefore));
test("Q changed request payload conflicts", () => assert.equal(model.apply("link", "auth-target", null, "r-link", { from: 3, until: null }).errorCode, "request_conflict"));
test("R link creates no entitlements", () => assert.equal(model.entitlements.length, 0));
test("S link creates no Bundles", () => assert.equal(model.bundles.length, 0));
test("T link creates no legacy membership", () => assert.equal(model.legacy.length, 0));
const target = linked.id;
const suspended = model.apply("suspend", target, 0, "r-suspend");
test("U suspend active account", () => assert.deepEqual([suspended.status, suspended.version], ["suspended", 1]));
test("V stale lifecycle version is rejected", () => assert.equal(model.apply("reactivate", target, 0, "r-stale").errorCode, "stale_state"));
test("W suspending suspended account is rejected", () => assert.equal(model.apply("suspend", target, 1, "r-double-suspend").errorCode, "mutation_rejected"));
const reactivated = model.apply("reactivate", target, 1, "r-reactivate");
test("X reactivate suspended account", () => assert.deepEqual([reactivated.status, reactivated.version], ["active", 2]));
const revoked = model.apply("revoke", target, 2, "r-revoke");
test("Y revoke active account", () => assert.deepEqual([revoked.status, revoked.version], ["revoked", 3]));
test("Z revoked account cannot reactivate", () => assert.equal(model.apply("reactivate", target, 3, "r-terminal").errorCode, "mutation_rejected"));
test("Z1 revoked account cannot be re-revoked", () => assert.equal(model.apply("revoke", target, 3, "r-re-revoke").errorCode, "mutation_rejected"));
model.auth.add("auth-suspended-target");
const linkedForSuspendedRevoke = model.apply("link", "auth-suspended-target", null, "r-link-suspended-revoke", { from: null, until: null });
const suspendedForRevoke = model.apply("suspend", linkedForSuspendedRevoke.id, 0, "r-suspend-before-revoke");
const revokedFromSuspended = model.apply("revoke", linkedForSuspendedRevoke.id, 1, "r-revoke-suspended");
test("Z2 revoke suspended account", () => assert.deepEqual([suspendedForRevoke.status, revokedFromSuspended.status, revokedFromSuspended.version], ["suspended", "revoked", 2]));
model.accounts.set("expired", { id: "expired", auth: "auth-other", status: "suspended", version: 4, from: 1, until: 9 });
test("AA expired account cannot reactivate", () => assert.equal(model.apply("reactivate", "expired", 4, "r-expired").errorCode, "mutation_rejected"));
test("AB self lifecycle mutation is denied", () => assert.equal(model.apply("suspend", "manager", 0, "r-self-suspend").errorCode, "self_target_denied"));
test("AC receipts use global actor-request namespace", () => assert.match(fs.readFileSync("supabase/migrations/20260914010000_staff_management_p3_p6_p3a_authority_foundation.sql", "utf8"), /unique \(actor_auth_user_id, request_id\)/));
test("AD authenticated is sole public executor", () => assert.ok(["link", "suspend", "reactivate", "revoke"].every((op) => new RegExp(`grant execute on function public\\.staff_management_${op}_staff_account_v1\\([\\s\\S]*?\\)\\s+to authenticated;`).test(sql))));
test("AE service_role has no RPC execute", () => assert.doesNotMatch(sql, /grant execute[\s\S]*to service_role/));

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p3b-smoke", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, databaseUsed: false, networkUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
