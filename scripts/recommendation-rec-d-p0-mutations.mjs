#!/usr/bin/env node
import child from "node:child_process";
import path from "node:path";

const root = process.cwd();
const smoke = path.join(root, "scripts", "recommendation-rec-d-p0-smoke.mjs");
const TARGET_NOT_FOUND = 97;
const mutations = [
  "pork_as_allergen",
  "known_absent",
  "unknown_as_complete",
  "partial_as_complete",
  "provider_complete_contract",
  "provider_complete_sql",
  "restaurant_inheritance",
  "remove_branch_pair",
  "arbitrary_source_text",
  "derive_halal",
  "religion_field",
  "user_compatibility",
  "reuse_allergen_coverage",
  "ranking_authority",
  "missing_fact_audit",
  "anon_projection"
];

const results = mutations.map((mutation) => {
  const run = child.spawnSync(process.execPath, [smoke], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, RECDP0_MUTATION: mutation },
    maxBuffer: 64 * 1024 * 1024
  });
  if (run.status === TARGET_NOT_FOUND) {
    return { mutation, killed: false, stale: true, detail: "mutation anchor not found" };
  }
  return {
    mutation,
    killed: run.status !== 0,
    ...(run.status === 0 ? { detail: "smoke unexpectedly passed" } : {})
  };
});

const survivors = results.filter((result) => !result.killed);
const stale = results.filter((result) => result.stale);
console.log(JSON.stringify({
  suite: "recommendation-rec-d-p0-mutations",
  status: survivors.length ? "failed" : "passed",
  total: results.length,
  killed: results.length - survivors.length,
  survived: survivors.length - stale.length,
  staleAnchors: stale.length,
  results,
  networkUsed: false,
  databaseUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
if (survivors.length) process.exit(1);
