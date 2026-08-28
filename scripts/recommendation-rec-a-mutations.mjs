#!/usr/bin/env node
import child from "node:child_process";
import path from "node:path";

const root = process.cwd();
const smoke = path.join(root, "scripts", "recommendation-rec-a-smoke.mjs");
// Exit code the smoke reserves for "this mutation's anchor is no longer in the source". It must be
// counted as an ERROR, not a kill: a drifted anchor tests nothing while looking like a pass.
const TARGET_NOT_FOUND = 97;

const mutations = [
  "reward_overage",
  "allow_zero_goal",
  "reverse_tie_break",
  "sum_dimensions",
  "ignore_policy_weights",
  "ignore_policy_dimensions",
  "drop_applied_policy_identity",
  "trust_invalid_policy",
  "skip_goal_read",
  "remove_pre_rank_order",
  "preferred_hint_overrides_exposure"
];
const results = mutations.map((mutation) => {
  const run = child.spawnSync(process.execPath, [smoke], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, RECA_MUTATION: mutation },
    maxBuffer: 64 * 1024 * 1024
  });
  if (run.status === TARGET_NOT_FOUND) {
    return { mutation, killed: false, stale: true, detail: "mutation anchor not found in source" };
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
  status: survivors.length ? "failed" : "passed",
  suite: "recommendation-rec-a-mutations",
  total: results.length,
  killed: results.length - survivors.length,
  survived: survivors.length - stale.length,
  staleAnchors: stale.length,
  results,
  productionTouched: false
}, null, 2));
if (survivors.length) process.exit(1);
