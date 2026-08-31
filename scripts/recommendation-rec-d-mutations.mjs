#!/usr/bin/env node
import child from "node:child_process";
import path from "node:path";

const root = process.cwd();
const smoke = path.join(root, "scripts", "recommendation-rec-d-smoke.mjs");
const TARGET_NOT_FOUND = 97;
const mutations = [
  "conflict_include",
  "unknown_include",
  "partial_include",
  "complete_exclude",
  "unresolved_as_empty",
  "unavailable_as_empty",
  "missing_fact_known_absent",
  "branch_to_restaurant",
  "settings_failure_fallback",
  "evidence_failure_fallback",
  "allergy_survivor_bypass",
  "eligibility_after_ranking",
  "lane_a_reintroduces_excluded",
  "lane_b_reintroduces_excluded",
  "entitlement_reorders",
  "raw_private_key_leak",
  "religious_claim",
  "legacy_fallback"
];
const results = mutations.map((mutation) => {
  const run = child.spawnSync(process.execPath, [smoke], {
    cwd: root, encoding: "utf8", env: { ...process.env, RECD_MUTATION: mutation },
    maxBuffer: 64 * 1024 * 1024
  });
  if (run.status === TARGET_NOT_FOUND) {
    return { mutation, killed: false, stale: true, detail: "mutation anchor not found" };
  }
  return { mutation, killed: run.status !== 0,
    ...(run.status === 0 ? { detail: "smoke unexpectedly passed" } : {}) };
});
const survivors = results.filter((result) => !result.killed);
const stale = results.filter((result) => result.stale);
console.log(JSON.stringify({
  suite: "recommendation-rec-d-mutations", status: survivors.length ? "failed" : "passed",
  total: results.length, killed: results.length - survivors.length,
  survived: survivors.length - stale.length, staleAnchors: stale.length, results,
  networkUsed: false, databaseUsed: false, developmentTouched: false,
  productionTouched: false
}, null, 2));
if (survivors.length) process.exit(1);
