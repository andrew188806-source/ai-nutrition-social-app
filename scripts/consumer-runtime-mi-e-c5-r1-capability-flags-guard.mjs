#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const compositionPath = "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts";
const smokePath = "scripts/consumer-runtime-mi-e-c5-r1-capability-flags-smoke.mjs";
const composition = fs.readFileSync(path.join(root, compositionPath), "utf8");
const smoke = fs.readFileSync(path.join(root, smokePath), "utf8");
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
}

function git(args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" });
}

check(
  "composition preserves an immutable canonical flag reference and derives capability/auth views separately",
  /const canonicalFlags = options\.flags \?\? getConsumerRuntimeFlags\(\);/.test(composition) &&
    /const capabilityFlags = normalizeConsumerCapabilityFlags\(canonicalFlags\);/.test(composition) &&
    /const authFlags = deriveAuthCompositionFlags\(capabilityFlags\);/.test(composition)
);
check(
  "approved Phase 1D auth issue removal preserves canonical supabaseWritesEnabled",
  /function normalizeConsumerCapabilityFlags[\s\S]*issues: flags\.issues\.filter/.test(composition) &&
    !/function normalizeConsumerCapabilityFlags[\s\S]{0,300}supabaseWritesEnabled:\s*false/.test(composition)
);
check(
  "auth-only derivation disables writes without mutating the canonical object",
  /function deriveAuthCompositionFlags[\s\S]*return \{ \.\.\.flags, supabaseWritesEnabled: false \};/.test(composition)
);
check(
  "Supabase Auth client and profile scaffold receive only auth-derived flags",
  /new SupabaseConsumerClientFactory\(\{[\s\S]*?flags: authFlags,/.test(composition) &&
    /createConsumerAuthScaffold\(\{[\s\S]*?flags: authFlags,[\s\S]*?profileClient:/.test(composition)
);
check(
  "all runtime capability branches receive capability flags rather than auth-normalized flags",
  (composition.match(/authFlags: capabilityFlags/g) ?? []).length === 3 &&
    !/createMealRuntimeParts\(\{[\s\S]*?authFlags: authFlags/.test(composition)
);
check(
  "public composition reports capability flags and keeps global writes authority observable",
  (composition.match(/flags: capabilityFlags/g) ?? []).length === 3
);
check(
  "upload and analysis derive gates from the capability flags supplied to runtime parts",
  /getMealPhotoUploadRuntimeFlags\(input\.authFlags\.authSource, input\.authFlags\.supabaseAuthEnabled, input\.authFlags\.supabaseWritesEnabled\)/.test(composition) &&
    /getMealPhotoAnalysisRuntimeFlags\([\s\S]*?input\.authFlags\.supabaseWritesEnabled,[\s\S]*?mealPhotoUploadFlags\.uploadSource/.test(composition)
);
check(
  "regression smoke directly constructs Consumer Runtime composition for live and disabled capability scenarios",
  /createConsumerRuntimeComposition/.test(smoke) &&
    /Scenario A/.test(smoke) &&
    /Scenario B/.test(smoke) &&
    /Scenario C/.test(smoke) &&
    /Scenario D/.test(smoke) &&
    /Scenario E/.test(smoke)
);
check(
  "regression smoke checks real service sources and an actual Storage upload call",
  /mealPhotoUploadService\.source === "supabase-live"/.test(smoke) &&
    /mealPhotoAnalysisService\.source === "supabase-live"/.test(smoke) &&
    /storageUploadCalls === 1/.test(smoke)
);

const forbiddenDiff = git([
  "diff",
  "--name-only",
  "--",
  "supabase/migrations",
  "supabase/functions",
  "apps/mobile/features/meal-identification-finalization"
]);
check(
  "repair does not modify migrations, Edge Functions, or frozen meal-finalization contracts",
  forbiddenDiff.status === 0 && forbiddenDiff.stdout.trim() === ""
);

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  phase: "MI-E-C5-R1 Consumer Runtime Capability Flag Isolation Guard",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false
}, null, 2));

if (failed.length) process.exitCode = 1;
