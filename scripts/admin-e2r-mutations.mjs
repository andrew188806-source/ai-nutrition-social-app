#!/usr/bin/env node
// Focused in-memory documentation mutations; no product or remote state is edited.
import assert from "node:assert/strict";
import { readSources, validateAdminEFinal } from "./admin-e1-rules.mjs";

const source = readSources();
assert.deepEqual(validateAdminEFinal(source), []);
const replace = (field, oldText, newText) => (s) => {
  assert.ok(s[field].includes(oldText), `missing mutation anchor: ${oldText}`);
  s[field] = s[field].replace(oldText, newText);
};
const mutants = [
  ["A arbitrary Restaurant Demo URL", replace("matrix", "https://ai-nutrition-social-app-restaurant.vercel.app", "https://invented-restaurant.vercel.app")],
  ["B arbitrary Admin Demo URL", replace("matrix", "https://tastkind-admin-demo.vercel.app", "https://invented-admin.vercel.app")],
  ["C stale pre-E1 remote source", replace("matrix", "| Consumer | `https://haocu-demo.vercel.app` | `31b55d3101c08a48f868b7988ce8ad6332e2f3fd`", "| Consumer | `https://haocu-demo.vercel.app` | `d88d1000a26810dfca0f70586f11e594b3a2e44a`")],
  ["D Break-glass may self-grant Primary", replace("matrix", "Break-glass does **not** let an actor grant itself Primary authority", "Break-glass lets an actor grant itself Primary authority")],
  ["E drop self_target_denied invariant", replace("matrix", "P3B, P3C, P3D, P3E and P3F all keep `self_target_denied`, and that invariant is unchanged.", "P3F self-grants are now permitted.")],
  ["F only one Primary", replace("matrix", "exactly **two** usable PRIMARY READY accounts", "exactly **one** usable PRIMARY READY account")],
  ["G grant deferred permission", replace("matrix", "`deferred = false`", "`deferred = true`")],
  ["H broker treated as temporary", replace("matrix", "permanent, intended runtime infrastructure", "temporary test infrastructure")],
  ["I drop sin1 region", (s) => { s.matrix = s.matrix.replaceAll("`sin1`", "`iad1`"); }],
  ["J commit broker environment value", (s) => { s.matrix += "\nTASTKIND_P3H_BROKER_DATABASE_URL=example-committed-value"; }],
  ["K omit one operational grant", (s) => { s.matrix = s.matrix.replaceAll("`admin.social.policies.read`", "`admin.social.policies.other`"); }],
  ["L reintroduce partial state", (s) => { s.registers += "\nWAITING_FOR_DEPLOYMENT_ENABLEMENT_AND_PRIMARY_RECOVERY"; }],
  ["M credential in handoff", (s) => { s.handoff += "\npostgres://user:pw@host:6543/postgres"; }]
];
for (const [name, mutate] of mutants) {
  const candidate = structuredClone(source);
  mutate(candidate);
  const failures = validateAdminEFinal(candidate);
  assert.ok(failures.length > 0, `survived: ${name}`);
  console.log(`KILLED ${name}: ${failures[0]}`);
}
console.log(`ADMIN-E final mutations PASS: ${mutants.length}/${mutants.length} killed`);
