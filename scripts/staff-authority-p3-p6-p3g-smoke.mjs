#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const ROOT = [
  "admin_context.read",
  "admin.management.staff.account.write",
  "admin.management.staff.console_admission.write",
  "admin.management.staff.permission.write",
];
const CURRENT = [
  "admin_audit.read",
  "admin_context.read",
  "admin.management.staff.account.write",
  "admin.management.staff.delegation.write",
  "admin.management.staff.console_admission.write",
  "admin.management.staff.permission.write",
  "admin_restaurant_branch.status.write",
];
const migration = fs.readFileSync("supabase/migrations/20260915030000_staff_management_p3_p6_p3g_break_glass_control_plane.sql", "utf8");
const vocabulary = [...fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts", "utf8")
  .matchAll(/^\s+"([a-z0-9_.]+)"/gm)].map((match) => match[1]);
const tests = [];
const failures = [];
function check(name, condition) {
  tests.push(name);
  try { assert.ok(condition); console.log(`PASS ${String(tests.length).padStart(2, "0")} ${name}`); }
  catch { failures.push(name); console.log(`FAIL ${String(tests.length).padStart(2, "0")} ${name}`); }
}
function failure(code) { throw Object.assign(new Error(code), { code }); }

class Model {
  constructor() {
    this.now = 1_000;
    this.accounts = new Map();
    this.principals = [];
    this.activations = [];
    this.sources = [];
    this.receipts = new Map();
    this.audit = [];
    this.next = 1;
  }
  request(operation, requestId, payload, apply) {
    const prior = this.receipts.get(requestId);
    if (prior) {
      if (prior.operation !== operation || JSON.stringify(prior.payload) !== JSON.stringify(payload)) failure("request_conflict");
      return prior.result;
    }
    const result = apply();
    this.receipts.set(requestId, { operation, payload, result });
    this.audit.push({ operation, requestId });
    return result;
  }
  enroll(auth, reason, requestId) {
    return this.request("principal_enroll", requestId, { auth, reason }, () => {
      let account = this.accounts.get(auth);
      if (!account) {
        account = { id: `staff-${auth}`, auth, status: "active", from: this.now, until: null };
        this.accounts.set(auth, account);
      }
      if (account.status !== "active" || account.from > this.now || (account.until && this.now >= account.until)) failure("staff_account_not_effective");
      if (this.principals.some((item) => item.status === "active" && (item.auth === auth || item.staff === account.id))) failure("principal_exists");
      if (this.principals.filter((item) => item.status === "active").length >= 2) failure("principal_capacity_reached");
      const principal = { id: `principal-${this.next++}`, auth, staff: account.id, status: "active", version: 0 };
      this.principals.push(principal);
      return structuredClone(principal);
    });
  }
  activate(principalId, reason, requestId) {
    return this.request("activation_open", requestId, { principalId, reason }, () => {
      const principal = this.principals.find((item) => item.id === principalId);
      if (!principal || principal.status !== "active") failure("principal_not_active");
      const account = [...this.accounts.values()].find((item) => item.id === principal.staff);
      if (account.status !== "active" || account.from > this.now || (account.until && this.now >= account.until)) failure("staff_account_not_effective");
      const existing = this.activations.find((item) => item.principal === principalId && item.status === "active");
      if (existing && this.now < existing.until) failure("activation_exists");
      if (existing) this.closeInternal(existing);
      const activation = { id: `activation-${this.next++}`, principal: principalId, staff: principal.staff,
        status: "active", version: 0, from: this.now, until: Math.min(this.now + 30, account.until ?? Infinity) };
      this.activations.push(activation);
      for (const permission of ROOT) this.sources.push({ id: `source-${this.next++}`, activation: activation.id,
        staff: principal.staff, permission, status: "active", from: activation.from, until: activation.until, kind: "p3g" });
      return structuredClone(activation);
    });
  }
  extend(activationId, version, reason, requestId) {
    return this.request("activation_extend", requestId, { activationId, version, reason }, () => {
      const activation = this.activations.find((item) => item.id === activationId);
      if (!activation || activation.status !== "active") failure("activation_not_active");
      if (activation.version !== version) failure("stale_state");
      if (this.now >= activation.until) failure("activation_expired");
      const account = [...this.accounts.values()].find((item) => item.id === activation.staff);
      const cap = Math.min(activation.from + 120, account.until ?? Infinity);
      const next = Math.min(activation.until + 30, cap);
      if (next <= activation.until) failure("extension_limit_reached");
      activation.until = next;
      activation.version += 1;
      const linked = this.sources.filter((item) => item.activation === activationId && item.status === "active");
      if (linked.length !== 4) failure("source_set_mismatch");
      linked.forEach((item) => { item.until = next; });
      return structuredClone(activation);
    });
  }
  closeInternal(activation) {
    const linked = this.sources.filter((item) => item.activation === activation.id && item.status === "active");
    if (linked.length !== 4) failure("source_set_mismatch");
    linked.forEach((item) => { item.status = "revoked"; });
    activation.status = "closed";
    activation.version += 1;
  }
  close(activationId, version, reason, requestId) {
    return this.request("activation_close", requestId, { activationId, version, reason }, () => {
      const activation = this.activations.find((item) => item.id === activationId);
      if (!activation || activation.status !== "active") failure("activation_not_active");
      if (activation.version !== version) failure("stale_state");
      this.closeInternal(activation);
      return structuredClone(activation);
    });
  }
  revoke(principalId, version, reason, requestId) {
    return this.request("principal_revoke", requestId, { principalId, version, reason }, () => {
      const principal = this.principals.find((item) => item.id === principalId);
      if (!principal || principal.status !== "active") failure("principal_not_active");
      if (principal.version !== version) failure("stale_state");
      const activation = this.activations.find((item) => item.principal === principalId && item.status === "active");
      if (activation && this.now < activation.until) failure("active_activation_exists");
      if (activation) this.closeInternal(activation);
      principal.status = "revoked";
      principal.version += 1;
      return structuredClone(principal);
    });
  }
  effective(staff) {
    return [...new Set(this.sources.filter((item) => item.staff === staff && item.status === "active"
      && item.from <= this.now && this.now < item.until).map((item) => item.permission))].sort();
  }
}

check("A migration seeds zero principal rows", !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(migration));
check("B CURRENT vocabulary remains exact seven", JSON.stringify(vocabulary) === JSON.stringify(CURRENT));

const model = new Model();
model.accounts.set("existing", { id: "staff-existing", auth: "existing", status: "active", from: 900, until: null });
const first = model.enroll("existing", "initial_primary_bootstrap", "req-1");
check("C enroll accepts existing active staff", first.staff === "staff-existing");
const second = model.enroll("missing", "primary_manager_recovery", "req-2");
check("D enroll creates missing active staff", model.accounts.get("missing")?.status === "active");
model.accounts.set("invalid", { id: "staff-invalid", auth: "invalid", status: "suspended", from: 900, until: null });
let invalidDenied = false; try { model.enroll("invalid", "primary_manager_recovery", "req-3"); } catch (error) { invalidDenied = error.code === "staff_account_not_effective"; }
check("E invalid existing staff fails closed", invalidDenied);
check("F maximum two active principals", model.principals.filter((item) => item.status === "active").length === 2);
let capacityDenied = false; try { model.enroll("third", "primary_manager_recovery", "req-4"); } catch (error) { capacityDenied = error.code === "principal_capacity_reached"; }
check("G third active principal is rejected", capacityDenied);
let duplicateDenied = false; try { model.enroll("existing", "primary_manager_recovery", "req-5"); } catch (error) { duplicateDenied = error.code === "principal_exists"; }
check("H duplicate active principal is rejected", duplicateDenied);
check("I enrollment alone grants zero authority", model.effective(first.staff).length === 0);

const opened = model.activate(first.id, "initial_primary_bootstrap", "req-6");
check("J activation creates exact four permissions", JSON.stringify(model.effective(first.staff)) === JSON.stringify([...ROOT].sort()));
check("K initial activation is 30 minutes", opened.until - opened.from === 30);
check("L activation end is finite", Number.isFinite(opened.until));
let secondActivationDenied = false; try { model.activate(first.id, "initial_primary_bootstrap", "req-7"); } catch (error) { secondActivationDenied = error.code === "activation_exists"; }
check("M second live activation is blocked", secondActivationDenied);

const extendedOnce = model.extend(opened.id, 0, "security_incident_recovery", "req-8");
check("N extension adds exactly 30 minutes", extendedOnce.until - opened.from === 60);
const extendedTwice = model.extend(opened.id, 1, "security_incident_recovery", "req-9");
check("O two sequential extends reach 90 minutes", extendedTwice.until - opened.from === 90);
model.extend(opened.id, 2, "security_incident_recovery", "req-10");
check("P three extends reach exact two-hour cap", model.activations[0].until - opened.from === 120);
let capDenied = false; try { model.extend(opened.id, 3, "security_incident_recovery", "req-11"); } catch (error) { capDenied = error.code === "extension_limit_reached"; }
check("Q extension beyond two hours is denied", capDenied);
let staleDenied = false; try { model.extend(opened.id, 2, "security_incident_recovery", "req-12"); } catch (error) { staleDenied = error.code === "stale_state"; }
check("R stale extension CAS is denied", staleDenied);

const clippedModel = new Model();
clippedModel.accounts.set("clip", { id: "staff-clip", auth: "clip", status: "active", from: 900, until: 1_020 });
const clippedPrincipal = clippedModel.enroll("clip", "initial_primary_bootstrap", "clip-1");
const clipped = clippedModel.activate(clippedPrincipal.id, "initial_primary_bootstrap", "clip-2");
check("S staff end clips initial activation", clipped.until === 1_020);
let clippedExtendDenied = false; try { clippedModel.extend(clipped.id, 0, "security_incident_recovery", "clip-3"); } catch (error) { clippedExtendDenied = error.code === "extension_limit_reached"; }
check("T staff end prevents escape extension", clippedExtendDenied);

const expiredModel = new Model();
const expiredPrincipal = expiredModel.enroll("expired", "initial_primary_bootstrap", "expired-1");
const expiredActivation = expiredModel.activate(expiredPrincipal.id, "initial_primary_bootstrap", "expired-2");
expiredModel.now = expiredActivation.until;
check("U natural expiry removes effective authority", expiredModel.effective(expiredPrincipal.staff).length === 0);
let expiredExtendDenied = false; try { expiredModel.extend(expiredActivation.id, 0, "security_incident_recovery", "expired-3"); } catch (error) { expiredExtendDenied = error.code === "activation_expired"; }
check("V expired activation cannot extend", expiredExtendDenied);
const replacement = expiredModel.activate(expiredPrincipal.id, "security_incident_recovery", "expired-4");
check("W expired activation is reaped into a new ID", replacement.id !== expiredActivation.id
  && expiredModel.activations.find((item) => item.id === expiredActivation.id)?.status === "closed");

model.sources.push({ id: "p3e", staff: first.staff, permission: "admin_context.read", status: "active", from: 0, until: Infinity, kind: "p3e" });
model.sources.push({ id: "p3f", staff: first.staff, permission: "admin.management.staff.permission.write", status: "active", from: 0, until: Infinity, kind: "p3f" });
const closed = model.close(opened.id, 3, "lost_admin_access", "req-13");
check("X close changes activation to terminal closed", closed.status === "closed");
check("Y close revokes exactly four P3G sources", model.sources.filter((item) => item.activation === opened.id && item.status === "revoked").length === 4);
check("Z P3E and P3F sources survive close", model.sources.filter((item) => ["p3e", "p3f"].includes(item.kind) && item.status === "active").length === 2);
let closedExtendDenied = false; try { model.extend(opened.id, 4, "security_incident_recovery", "req-14"); } catch (error) { closedExtendDenied = error.code === "activation_not_active"; }
check("AA closed activation cannot reactivate by extension", closedExtendDenied);
const revoked = model.revoke(first.id, 0, "primary_manager_recovery", "req-15");
check("AB principal revoke is terminal", revoked.status === "revoked" && revoked.version === 1);
const reenrolled = model.enroll("existing", "primary_manager_recovery", "req-16");
check("AC re-enrollment creates new principal history", reenrolled.id !== first.id);
const replay = model.enroll("existing", "primary_manager_recovery", "req-16");
check("AD exact replay returns stored result", JSON.stringify(replay) === JSON.stringify(reenrolled));
let conflict = false; try { model.enroll("different", "primary_manager_recovery", "req-16"); } catch (error) { conflict = error.code === "request_conflict"; }
check("AE changed replay payload conflicts", conflict);
check("AF replay writes one receipt and audit", model.audit.filter((item) => item.requestId === "req-16").length === 1);

check("AG mandatory reason is structurally enforced", /invalid_reason_code/.test(migration));
check("AH service_role receives no control execute", !/grant execute[^;]*service_role/i.test(migration));
check("AI authenticated receives no control execute", !/grant execute[^;]*authenticated/i.test(migration));
check("AJ Platform Admin receives no P3G authority", !/platform_admin/i.test(migration));

const help = spawnSync(process.execPath, ["scripts/break-glass-control.mjs", "--help"], { encoding: "utf8" });
check("AK CLI help succeeds", help.status === 0 && help.stdout.includes("TastKind Break-glass Control"));
check("AL CLI help explains timing and environment", help.stdout.includes("30 minutes") && help.stdout.includes("2 hours")
  && help.stdout.includes("TASTKIND_BREAK_GLASS_DEVELOPMENT_DATABASE_URL"));
const noTarget = spawnSync(process.execPath, ["scripts/break-glass-control.mjs", "--command", "status"], {
  encoding: "utf8", env: { ...process.env,
    TASTKIND_BREAK_GLASS_DEVELOPMENT_DATABASE_URL: "",
    TASTKIND_BREAK_GLASS_PRODUCTION_DATABASE_URL: "" },
});
check("AM CLI requires explicit target", noTarget.status === 1 && noTarget.stderr.includes("target_environment_required"));
const noUrl = spawnSync(process.execPath, ["scripts/break-glass-control.mjs", "--env", "development", "--command", "status"], {
  encoding: "utf8", env: { ...process.env, TASTKIND_BREAK_GLASS_DEVELOPMENT_DATABASE_URL: "" },
});
check("AN CLI refuses missing DB-owner configuration", noUrl.status === 1 && noUrl.stderr.includes("database_configuration_missing"));

const durable = new Model();
const principalA = durable.enroll("A", "initial_primary_bootstrap", "durable-1");
const activationA = durable.activate(principalA.id, "initial_primary_bootstrap", "durable-2");
durable.accounts.set("B", { id: "staff-B", auth: "B", status: "active", from: durable.now, until: null });
for (const permission of ["admin.management.staff.permission.write", "admin.management.staff.account.write", "admin.management.staff.console_admission.write"])
  durable.sources.push({ id: `p3f-${permission}`, staff: "staff-B", permission, status: "active", from: 0, until: Infinity, kind: "p3f" });
durable.sources.push({ id: "p3e-B", staff: "staff-B", permission: "admin_context.read", status: "active", from: 0, until: Infinity, kind: "p3e" });
check("AO synthetic A constructs durable B exact manager authority", durable.effective("staff-B").length === 4);
durable.extend(activationA.id, 0, "primary_manager_recovery", "durable-3");
check("AP synthetic A extends from 30 to 60 minutes", durable.activations[0].until - durable.activations[0].from === 60);
durable.close(activationA.id, 1, "primary_manager_recovery", "durable-4");
check("AQ closing A removes all P3G authority", durable.effective(principalA.staff).length === 0);
check("AR durable B survives A close", durable.effective("staff-B").length === 4);

console.log("\n" + JSON.stringify({
  suite: "staff-authority-p3-p6-p3g-smoke",
  total: tests.length,
  passed: tests.length - failures.length,
  failed: failures.length,
  failures,
  databaseUsed: false,
  networkUsed: false,
  developmentAccessed: false,
  productionAccessed: false,
}, null, 2));
process.exitCode = failures.length ? 1 : 0;
