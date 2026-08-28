#!/usr/bin/env node
import child from "node:child_process";
import path from "node:path";

const root = process.cwd();
const smoke = path.join(root, "scripts", "recommendation-rec-b-smoke.mjs");
const TARGET_NOT_FOUND = 97;
const mutations = [
  "cuisine_weight", "meal_type_weight", "flavor_weight", "spice_weight",
  "minimum_comparable", "cuisine_match", "flavor_overlap", "spice_distance_one",
  "lane_a_tolerance", "taste_weight", "nutrition_weight", "chained_bands",
  "move_unknown_slots", "admit_invalid_lane_b", "single_rank_zero", "reverse_interleave",
  "dedupe_menu_item", "lane_a_taste_ascending", "lane_b_raw_scores",
  "card_taste_before_nutrition", "fabricate_avoidance"
];
const results = mutations.map((mutation) => {
  const run = child.spawnSync(process.execPath, [smoke], {
    cwd: root, encoding: "utf8", env: { ...process.env, RECB_MUTATION: mutation },
    maxBuffer: 64 * 1024 * 1024
  });
  if (run.status === TARGET_NOT_FOUND) return { mutation, killed: false, stale: true, detail: "mutation anchor not found" };
  return { mutation, killed: run.status !== 0, ...(run.status === 0 ? { detail: "smoke unexpectedly passed" } : {}) };
});
const survivors = results.filter((result) => !result.killed);
const stale = results.filter((result) => result.stale);
console.log(JSON.stringify({
  suite: "recommendation-rec-b-mutations", status: survivors.length ? "failed" : "passed",
  total: results.length, killed: results.length - survivors.length,
  survived: survivors.length - stale.length, staleAnchors: stale.length, results,
  networkUsed: false, databaseUsed: false, developmentTouched: false, productionTouched: false
}, null, 2));
if (survivors.length) process.exit(1);
