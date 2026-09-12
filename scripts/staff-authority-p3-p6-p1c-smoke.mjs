#!/usr/bin/env node
// Pure P3-P6-P1C operator-boundary smoke. No database, network, credentials, or repository writes.
import fs from "node:fs";

const SQL = fs.readFileSync("supabase/migrations/20260912030000_staff_authority_p3_p6_p1c_materializer_audit.sql", "utf8").replace(/\r\n/g, "\n");
const canonical = (request) => JSON.stringify({
  operation: "materialize_bundle_assignment",
  staffAccountId: request.staffAccountId,
  bundleKey: request.bundleKey,
  bundleRevision: request.bundleRevision,
  effectiveFrom: request.effectiveFrom,
  effectiveUntil: request.effectiveUntil,
  reason: request.reason
});
function materialize(request, state) {
  if (!request.requestId || !request.staffAccountId || !request.bundleKey
    || !Number.isInteger(request.bundleRevision) || request.bundleRevision <= 0
    || !request.effectiveFrom || !request.reason
    || (request.effectiveUntil !== null && request.effectiveUntil <= request.effectiveFrom)) return { ok: false, errorCode: "invalid_request" };
  const payload = canonical(request), prior = state.receipts.get(request.requestId);
  if (prior) return prior.payload === payload ? { ...prior.result, outcome: "replayed" } : { ok: false, errorCode: "request_conflict" };
  if (request.staff.status !== "active") return { ok: false, errorCode: "staff_not_active" };
  if (request.effectiveFrom < request.staff.effectiveFrom
    || (request.staff.effectiveUntil !== null && (request.effectiveUntil === null || request.effectiveUntil > request.staff.effectiveUntil))) return { ok: false, errorCode: "staff_validity_conflict" };
  if (request.bundle.status !== "active") return { ok: false, errorCode: "bundle_revision_retired" };
  if (request.bundle.permissions.some((permission) => permission.consoleAdmissionRequired)) return { ok: false, errorCode: "bundle_console_admission_forbidden" };
  const entitlements = request.bundle.permissions.filter((permission) => permission.membershipKind === "DEFAULT")
    .map((permission) => ({ assignmentId: "assignment-a", staffAccountId: request.staffAccountId, permissionKey: permission.key, effectiveFrom: request.effectiveFrom, effectiveUntil: request.effectiveUntil }));
  const result = { ok: true, outcome: "applied", assignmentId: "assignment-a", entitlements };
  state.receipts.set(request.requestId, { payload, result });
  return result;
}
const revokeForAssignment = (rows, assignmentId) => rows.map((row) => row.sourceType === "bundle_assignment" && row.assignmentId === assignmentId && row.status === "active" ? { ...row, status: "revoked" } : row);

const base = {
  requestId: "11111111-1111-4111-8111-111111111111", staffAccountId: "staff-a",
  bundleKey: "restaurant_operations", bundleRevision: 1,
  effectiveFrom: 10, effectiveUntil: 20, reason: "approved provisioning",
  staff: { status: "active", effectiveFrom: 0, effectiveUntil: 30 },
  bundle: { status: "active", permissions: [
    { key: "admin_restaurant_branch.status.write", membershipKind: "DEFAULT", consoleAdmissionRequired: false },
    { key: "admin_audit.read", membershipKind: "CONDITIONAL", consoleAdmissionRequired: false }
  ] }
};
const checks = [], failures = [];
function check(label, pass) { const item = { label, pass: Boolean(pass) }; checks.push(item); if (!item.pass) failures.push(item); console.log(`${item.pass ? "PASS" : "FAIL"} ${label}`); }
const state = { receipts: new Map() };
const applied = materialize(base, state);
check("valid assign request", applied.ok && applied.outcome === "applied");
check("exact revision required", !materialize({ ...base, requestId: "r2", bundleRevision: null }, { receipts: new Map() }).ok);
check("missing request ID rejected", !materialize({ ...base, requestId: null }, { receipts: new Map() }).ok);
check("invalid time window rejected", !materialize({ ...base, requestId: "r3", effectiveUntil: 10 }, { receipts: new Map() }).ok);
check("staff finite bound contained", materialize({ ...base, requestId: "r4", effectiveUntil: null }, { receipts: new Map() }).errorCode === "staff_validity_conflict");
check("suspended target rejected", materialize({ ...base, requestId: "r5", staff: { ...base.staff, status: "suspended" } }, { receipts: new Map() }).errorCode === "staff_not_active");
check("revoked target rejected", materialize({ ...base, requestId: "r6", staff: { ...base.staff, status: "revoked" } }, { receipts: new Map() }).errorCode === "staff_not_active");
check("retired Bundle rejected", materialize({ ...base, requestId: "r7", bundle: { ...base.bundle, status: "retired" } }, { receipts: new Map() }).errorCode === "bundle_revision_retired");
check("DEFAULT selected", applied.entitlements.some((row) => row.permissionKey === "admin_restaurant_branch.status.write"));
check("CONDITIONAL omitted", !applied.entitlements.some((row) => row.permissionKey === "admin_audit.read"));
check("console admission Bundle config rejected", materialize({ ...base, requestId: "r8", bundle: { ...base.bundle, permissions: [{ key: "admin_context.read", membershipKind: "DEFAULT", consoleAdmissionRequired: true }] } }, { receipts: new Map() }).errorCode === "bundle_console_admission_forbidden");
const replay = materialize(base, state);
check("same request replays", replay.ok && replay.outcome === "replayed" && replay.assignmentId === applied.assignmentId);
check("conflicting request reuse rejected", materialize({ ...base, reason: "changed" }, state).errorCode === "request_conflict");
const rows = [
  { id: "a", sourceType: "bundle_assignment", assignmentId: "A", status: "active" },
  { id: "direct", sourceType: "direct_grant", assignmentId: null, status: "active" },
  { id: "b", sourceType: "bundle_assignment", assignmentId: "B", status: "active" }
];
const revoked = revokeForAssignment(rows, "A");
check("revocation selects exact Bundle source", revoked.find((row) => row.id === "a").status === "revoked");
check("revocation leaves direct source active", revoked.find((row) => row.id === "direct").status === "active");
check("revocation leaves other Bundle source active", revoked.find((row) => row.id === "b").status === "active");
check("no DELETE lifecycle", !/delete\s+from\s+admin_internal\.staff_(?:bundle_assignments|permission_entitlements)/i.test(SQL));
check("audit is append-only", !/grant\s+(?:update|delete)[^;]*staff_authority_audit_log/i.test(SQL));
check("receipt is immutable", !/grant\s+(?:update|delete)[^;]*staff_authority_operation_receipts/i.test(SQL));

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p1c-smoke", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures: failures.map((item) => item.label), databaseUsed: false, networkUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
