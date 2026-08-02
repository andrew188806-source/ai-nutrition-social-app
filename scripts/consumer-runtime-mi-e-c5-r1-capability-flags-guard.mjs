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
// MI-E-C5-R7-B1 successor-compatible locator. Still asserts that no shipped migration is EDITED,
// no Edge Function is touched, and no frozen finalization implementation file is modified. The one
// exclusion is the v3 command builder, which R7-B1 is explicitly authorised to extend; a new
// additive migration file is untracked and so was never reported by `git diff` here anyway.
const forbiddenTouched = forbiddenDiff.stdout
  .split("\n")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .filter((entry) => entry !== "apps/mobile/features/meal-identification-finalization/v3Contract.ts");
check(
  "repair does not modify migrations, Edge Functions, or frozen meal-finalization contracts",
  forbiddenDiff.status === 0 && forbiddenTouched.length === 0
);


// ==========================================================================================
// MI-E-C5-R7-B1-R1 §九: v3Contract.ts is NOT blanket-trusted just because R7-B1 is allowed to
// extend it. This projection compares the candidate against HEAD region by region: every part of
// the contract that this guard's era froze must be byte-identical, and only the authorized
// restaurant extension may be new. An unauthorized change to the version string, to any original
// command field, to mealWrite/nutrition shape, to the limits, or to the scalar validation lines
// fails here — path exclusion alone would have let all of those through.
// ==========================================================================================
const V3_CONTRACT_RELATIVE = "apps/mobile/features/meal-identification-finalization/v3Contract.ts";
function v3ContractOnlyGainedAuthorizedRestaurantExtension() {
  const headResult = spawnSync("git", ["show", `HEAD:${V3_CONTRACT_RELATIVE}`], { cwd: root, encoding: "utf8" });
  if (headResult.status !== 0) return false;
  const headText = headResult.stdout ?? "";
  const diskText = fs.readFileSync(path.join(root, V3_CONTRACT_RELATIVE), "utf8");
  if (!headText) return false;

  const slice = (text, from, to) => {
    const start = text.indexOf(from);
    if (start < 0) return null;
    if (to === null) return text.slice(start);
    const end = text.indexOf(to, start + from.length);
    return end < 0 ? null : text.slice(start, end);
  };
  // The scalar-field validation block ends at whichever declaration follows it — HEAD goes
  // straight to mealWrite, the candidate inserts the restaurant validator first.
  const scalarValidation = (text) => {
    const start = text.indexOf("if (!input.analysisRequestId");
    if (start < 0) return null;
    const ends = ["const mealWrite = validateMealWrite", "const restaurant = validateRestaurantContext"]
      .map((marker) => text.indexOf(marker, start))
      .filter((index) => index > 0);
    return ends.length ? text.slice(start, Math.min(...ends)) : null;
  };

  const FROZEN_REGIONS = [
    // version constant + nutrition + mealWrite input shape
    ["export const MEAL_IDENTIFICATION_FINALIZATION_V3_VERSION", "export type MealIdentificationFinalizationV3Input"],
    // error codes, result type, every limit and the source-context/nutrition vocabularies
    ["export type MealIdentificationFinalizationV3ErrorCode", "export function buildMealIdentificationFinalizationV3"],
    // the whole mealWrite/nutrition validator
    ["function validateMealWrite(", "function success<T>"],
    // result helpers
    ["function success<T>", null]
  ];
  for (const [from, to] of FROZEN_REGIONS) {
    const headRegion = slice(headText, from, to);
    const diskRegion = slice(diskText, from, to);
    if (headRegion === null || diskRegion === null || headRegion !== diskRegion) return false;
  }
  const headScalar = scalarValidation(headText);
  if (headScalar === null || headScalar !== scalarValidation(diskText)) return false;

  // No restaurant NAME or display snapshot may ever exist in the durable command layer.
  if (/restaurantName|restaurantDisplayName|branchName|displayName/.test(diskText)) return false;

  // The only new top-level declarations may be the authorized restaurant extension.
  const declarations = (text) => text.match(/^(?:export )?(?:function|type|const) \w+/gm) ?? [];
  const headDeclarations = new Set(declarations(headText));
  const AUTHORIZED_ADDITIONS = new Set([
    "export type MealIdentificationFinalizationV3RestaurantContext",
    "function validateRestaurantContext",
    "function blankToNull"
  ]);
  const added = declarations(diskText).filter((entry) => !headDeclarations.has(entry));
  if (!added.every((entry) => AUTHORIZED_ADDITIONS.has(entry))) return false;

  // And every original declaration must still exist.
  const diskDeclarations = new Set(declarations(diskText));
  return [...headDeclarations].every((entry) => diskDeclarations.has(entry));
}

check(
  "v3Contract.ts gained ONLY the authorized R7-B1 restaurant extension (frozen regions byte-identical to HEAD)",
  v3ContractOnlyGainedAuthorizedRestaurantExtension()
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
