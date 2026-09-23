#!/usr/bin/env node
// Source-only successor-awareness mutations. No product file is edited.
import assert from "node:assert/strict";
import { FILES, ROUTES, baselineFile, readSources, validateAdminE1 } from "./admin-e1-rules.mjs";
import {
  E1_SOURCE_PATHS, isExactAdminE1Successor, matchesE1Source, unexpectedSuccessorPaths
} from "./admin-e1-historical-successor.mjs";

assert.equal(isExactAdminE1Successor(), true, "exact frozen E1 source snapshot required");
assert.equal(E1_SOURCE_PATHS.length, 36);
const baseline = Object.fromEntries(["registry", "shell", "receipt", "cors", "index"].map((key) => [key, baselineFile(FILES[key])]));
const source = readSources();
assert.deepEqual(validateAdminE1(source, baseline), []);
const pagePath = (route) => `apps/admin-web/app/${route}/page.tsx`;
const mutations = [
  ["restore a legacy mock queue", (s) => { s.pages["ad-review"] += '\nimport { mockAdReviews } from "@haocu/shared";'; }],
  ["change a live redirect target", (s) => { s.pages["audit-trail"] = s.pages["audit-trail"].replace("/admin/audit/platform-memberships", "/admin/audit"); }],
  ["activate a deferred route", (s) => { s.registry = s.registry.replace(/(id: "operations-ads"[^\n]+availability: ")DEMO/, "$1LIVE"); }],
  ["remove a canonical successor", (s) => { s.registry = s.registry.replace('id: "audit-platform-memberships"', 'id: "removed-audit"'); }],
  ["weaken canonical authority", (s) => { s.registry += "\nif (isHighestPrivilege) return true;"; }],
  ["remove the AAL2 database clock", (s) => { s.runtime = s.runtime.replace("const verifiedAt = verificationTime.value", "const verifiedAt = new Date().toISOString()"); }]
];
for (const [name, mutate] of mutations) {
  const candidate = structuredClone(source);
  mutate(candidate);
  assert.ok(validateAdminE1(candidate, baseline).length > 0, `survived: ${name}`);
  console.log(`KILLED ${name}`);
}
assert.equal(matchesE1Source(pagePath("audit-trail"), source.pages["audit-trail"]), true);
assert.equal(matchesE1Source(pagePath("audit-trail"), source.pages["audit-trail"] + "\n"), false);
console.log("KILLED arbitrary legacy page rewrite via exact SHA-256 source pin");
assert.deepEqual(unexpectedSuccessorPaths(["apps/admin-web/app/admin/secret/page.tsx"], []), ["apps/admin-web/app/admin/secret/page.tsx"]);
console.log("KILLED arbitrary future path outside exact E1 and closure guard lists");
assert.deepEqual(unexpectedSuccessorPaths(["supabase/migrations/20990101000000_unbounded.sql"], []), ["supabase/migrations/20990101000000_unbounded.sql"]);
console.log("KILLED arbitrary future migration");
assert.equal(Object.keys(ROUTES).length, 22);
console.log("ADMIN-E1 historical closure mutations PASS: 9/9 killed");
