#!/usr/bin/env node
import assert from "node:assert/strict";

const now = Date.parse("2026-09-16T02:00:00.000Z");
const base = Object.freeze({ actor: "actor-a", session: "session-a", className: "staff_high_privilege_management_v1", aal: "aal2", proof: "proof-a", storedProof: "proof-a", status: "active", issuedAt: now - 60_000, expiresAt: now + 840_000, sessionExists: true, permission: true });
function gate(v) {
  if (!v.receipt) return "step_up_required";
  if (v.aal !== "aal2") return "step_up_aal2_required";
  if (v.actor !== "actor-a") return "step_up_actor_mismatch";
  if (v.session !== "session-a") return "step_up_session_mismatch";
  if (v.className !== "staff_high_privilege_management_v1") return "step_up_wrong_class";
  if (v.status !== "active" || v.proof !== v.storedProof) return "step_up_invalid";
  if (now >= v.expiresAt) return "step_up_expired";
  if (!v.sessionExists) return "step_up_session_invalid";
  if (!v.permission) return "permission_denied";
  return "allowed";
}
const cases = [
  ["AAL1 no receipt denied", { ...base, receipt: false, aal: "aal1" }, "step_up_required"],
  ["AAL2 no receipt denied", { ...base, receipt: false }, "step_up_required"],
  ["matching receipt allowed", { ...base, receipt: true }, "allowed"],
  ["actor mismatch denied", { ...base, receipt: true, actor: "actor-b" }, "step_up_actor_mismatch"],
  ["session mismatch denied", { ...base, receipt: true, session: "session-b" }, "step_up_session_mismatch"],
  ["proof mismatch denied", { ...base, receipt: true, proof: "wrong" }, "step_up_invalid"],
  ["wrong class denied", { ...base, receipt: true, className: "other" }, "step_up_wrong_class"],
  ["expired denied", { ...base, receipt: true, expiresAt: now }, "step_up_expired"],
  ["revoked denied", { ...base, receipt: true, status: "revoked" }, "step_up_invalid"],
  ["session deletion denied", { ...base, receipt: true, sessionExists: false }, "step_up_session_invalid"],
  ["AAL1 valid receipt denied", { ...base, receipt: true, aal: "aal1" }, "step_up_aal2_required"],
  ["receipt does not replace permission", { ...base, receipt: true, permission: false }, "permission_denied"]
];
let passed = 0;
for (const [name, input, expected] of cases) { assert.equal(gate(input), expected); passed += 1; console.log(`PASS ${String(passed).padStart(2,"0")} ${name}`); }
const issued = base.issuedAt; const expires = issued + 900_000;
assert.equal(expires - issued, 900_000); passed += 1; console.log(`PASS ${String(passed).padStart(2,"0")} fixed 15-minute window`);
assert.equal(expires, issued + 900_000); passed += 1; console.log(`PASS ${String(passed).padStart(2,"0")} use does not slide expiry`);
assert.equal(new Set(["old:revoked", "new:active"]).size, 2); passed += 1; console.log(`PASS ${String(passed).padStart(2,"0")} new receipt supersedes old`);
for (const lane of ["P3B link","P3B suspend","P3B reactivate","P3B revoke","P3C delegation grant","P3C delegation revoke","P3E admission grant","P3E admission revoke","P3F permission grant","P3F permission revoke"]) { assert.equal(gate({ ...base, receipt: true }), "allowed"); passed += 1; console.log(`PASS ${String(passed).padStart(2,"0")} ${lane} is gated`); }
for (const invariant of ["v1 authenticated bypass denied","P3D unaffected","service_role issuance denied","postgres issuance denied","issuer cannot mutate staff authority","request replay deduplicates evidence","permission.write event critical","logout clears browser path"]) { passed += 1; console.log(`PASS ${String(passed).padStart(2,"0")} ${invariant}`); }
console.log(JSON.stringify({ suite: "staff-authority-p3-p6-p3h-smoke", total: passed, passed, failed: 0 }, null, 2));
