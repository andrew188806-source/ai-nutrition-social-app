#!/usr/bin/env node
// GQA-2 focused guard: Restaurant deferred pages, Admin roster denial state, Primary Wizard
// self-target pre-warning, and the no-scope-expansion boundary against the GQA-1 baseline.
import assert from "node:assert/strict";
import cp from "node:child_process";
import { GQA2_BASELINE, ROOT, readGqa2Sources, validateGqa2, behaviourGqa2 } from "./gqa-2-closure-rules.mjs";
import { GQA2_IMPLEMENTATION, isExactGqa2Successor } from "./gqa-2-successor-manifest.mjs";

const staticFailures = validateGqa2(readGqa2Sources());
assert.deepEqual(staticFailures, [], staticFailures.join("; "));
console.log("PASS static contract: Restaurant deferred /vip and /verification, Admin roster states, Primary self-target pre-warning");

const behaviourFailures = behaviourGqa2();
assert.deepEqual(behaviourFailures, [], behaviourFailures.join("; "));
console.log("PASS behaviour: denied != authorized empty != unavailable; denied leaks nothing; self blocked, other allowed, unknown deferred to backend");

const git = (...args) => {
  const result = cp.spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  assert.equal(result.status, 0, `git ${args.join(" ")}`);
  return result.stdout.trim();
};
const changed = new Set(git("diff", "--name-only", GQA2_BASELINE).split("\n").filter(Boolean));
for (const file of git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean)) changed.add(file);
export const GQA2_ALLOWED_PATHS = Object.freeze([
  "apps/restaurant-web/app/vip/page.tsx",
  "apps/restaurant-web/app/verification/page.tsx",
  "apps/restaurant-web/components/runtime/DeferredCapabilityNotice.tsx",
  "apps/admin-web/app/admin/management/staff/page.tsx",
  "apps/admin-web/app/admin/management/staff/loading.tsx",
  "apps/admin-web/app/admin/management/staff/[staffAccountId]/page.tsx",
  "apps/admin-web/auth/admin-staff-roster-state.ts",
  "apps/admin-web/auth/admin-primary-wizard-target.ts",
  "apps/admin-web/components/admin-shell/PrimaryWizard.tsx",
  "scripts/gqa-2-closure-rules.mjs",
  "scripts/gqa-2-closure-guard.mjs",
  "scripts/gqa-2-closure-mutations.mjs"
]);
// Once the exact GQA-2 successor is proven (byte-pinned runtime, no later product change, and every later
// commit touching a GQA-2 guard file is a recorded successor), GQA-2's own scope is its committed delta.
// Before that, the working-tree delta itself must stay inside the GQA-2 scope.
const exactSuccessor = isExactGqa2Successor(ROOT);
const scoped = exactSuccessor
  ? new Set(git("diff", "--name-only", GQA2_BASELINE, GQA2_IMPLEMENTATION).split("\n").filter(Boolean))
  : changed;
const unexpected = [...scoped].filter((file) => !GQA2_ALLOWED_PATHS.includes(file));
assert.deepEqual(unexpected, [], `GQA-2 changed paths outside its exact scope: ${unexpected.join(", ")}`);
const frozen = [
  "supabase", "apps/mobile", "lib", "packages", "package.json", "package-lock.json",
  "apps/admin-web/package.json", "apps/restaurant-web/package.json",
  "apps/admin-web/auth/admin-current-permission-vocabulary.ts", "apps/admin-web/auth/admin-route-registry.ts",
  "apps/admin-web/auth/admin-manager-presets.ts", "apps/admin-web/auth/admin-manager-preset-flow.ts",
  "apps/admin-web/server", "apps/admin-web/app/api", "apps/admin-web/middleware.ts",
  "apps/admin-web/components/admin-shell/StaffAuthorityPanel.tsx", "apps/admin-web/components/admin-shell/StepUpCard.tsx",
  "apps/admin-web/components/admin-shell/ManagerPresetPanel.tsx", "apps/admin-web/components/admin-shell/adminMutationClient.ts",
  "apps/restaurant-web/middleware.ts", "apps/restaurant-web/data", "apps/restaurant-web/runtime", "apps/restaurant-web/server",
  "scripts/break-glass-control.mjs"
];
assert.equal(git("diff", "--name-only", GQA2_BASELINE, "--", ...frozen), "",
  "no migration, RPC, permission, route registry, Step-Up, Break-glass, dependency, Consumer or shared-copy change");
console.log(`PASS boundary: ${scoped.size} GQA-2 path(s)${exactSuccessor ? " (exact successor recognized)" : ""}, all inside the exact GQA-2 scope; frozen authority, Consumer, database and dependency paths unchanged`);
console.log("GQA-2 closure guard PASS");
