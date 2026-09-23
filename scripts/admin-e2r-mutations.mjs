#!/usr/bin/env node
// Focused in-memory documentation mutations; no product or remote state is edited.
import assert from "node:assert/strict";
import { readSources, validateAdminE2R } from "./admin-e1-rules.mjs";

const source = readSources();
assert.deepEqual(validateAdminE2R(source), []);
const replace = (field, oldText, newText) => (s) => {
  assert.ok(s[field].includes(oldText), `missing mutation anchor: ${oldText}`);
  s[field] = s[field].replace(oldText, newText);
};
const mutants = [
  ["A arbitrary Restaurant Demo URL", replace("matrix", "https://ai-nutrition-social-app-restaurant.vercel.app", "https://invented-restaurant.vercel.app")],
  ["B arbitrary Admin Demo URL", replace("matrix", "https://tastkind-admin-demo.vercel.app", "https://invented-admin.vercel.app")],
  ["C claim E1 remotely deployed", replace("matrix", "PUSH_REQUIRED_FOR_FIXED_DEMO", "E1 already remotely deployed")],
  ["D claim Admin configuration passes", replace("matrix", "/admin/login?error=configuration", "/admin/login?config=PASS")],
  ["E falsely mark founder Primary Ready", replace("matrix", "Current founder status: NOT PRIMARY READY", "Current founder status: PRIMARY READY")],
  ["F omit permission.write confirmation", replace("matrix", "explicit high-privilege confirmation phrase required", "no confirmation needed")],
  ["G grant PLANNED permission", replace("matrix", "`readiness_status = current`", "`readiness_status = planned`")],
  ["H grant deferred permission", replace("matrix", "`deferred = false`", "`deferred = true`")],
  ["I persist Break-glass authority", replace("matrix", "Break-glass must then be fully closed", "Break-glass may persist as normal authority")],
  ["J commit environment value", (s) => { s.matrix += "\nTASTKIND_SUPABASE_PUBLISHABLE_KEY=example-committed-value"; }]
];
for (const [name, mutate] of mutants) {
  const candidate = structuredClone(source);
  mutate(candidate);
  const failures = validateAdminE2R(candidate);
  assert.ok(failures.length > 0, `survived: ${name}`);
  console.log(`KILLED ${name}: ${failures[0]}`);
}
console.log(`ADMIN-E2R mutations PASS: ${mutants.length}/${mutants.length} killed`);
