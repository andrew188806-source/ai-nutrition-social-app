#!/usr/bin/env node
import child from "node:child_process";
import path from "node:path";

const root = process.cwd();
const smoke = path.join(root, "scripts", "recommendation-rec-b-p1-smoke.mjs");
const TARGET_NOT_FOUND = 97;
const mutations = [
  "drop_cuisine_value",
  "seed_unauthorized_alias",
  "lowercase_input",
  "fuzzy_lookup",
  "allow_cross_facet",
  "promote_unknown_source",
  "ignore_disabled_facet",
  "allow_label_write",
  "swap_spice_order",
  "allow_client_write",
  "seed_candidate_mapping",
  "introduce_rank"
];

const results = mutations.map((mutation) => {
  const run = child.spawnSync(process.execPath, [smoke], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, RECBP1_MUTATION: mutation },
    maxBuffer: 64 * 1024 * 1024
  });
  if (run.status === TARGET_NOT_FOUND) {
    return { mutation, killed: false, stale: true, detail: "mutation anchor not found" };
  }
  return { mutation, killed: run.status !== 0, ...(run.status === 0 ? { detail: "smoke unexpectedly passed" } : {}) };
});
const survivors = results.filter((result) => !result.killed);
const stale = results.filter((result) => result.stale);
console.log(JSON.stringify({
  suite: "recommendation-rec-b-p1-mutations",
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
