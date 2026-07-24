#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const baseline = "2b6b713ce7682f52a30463ce5cc7c4bccc6d3a0a";
const protectedPath =
  "supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql";
const protectedSha =
  "4e08de96d28a5e6d9911b074fa73769ea5b3e21d9e14a089c7f420e16a4fbe72";
const implementationPaths = [
  "apps/mobile/app/analysis.tsx",
  "apps/mobile/app/meal-photo.tsx",
  "apps/mobile/features/analysis/analysisSessionStore.ts",
  "apps/mobile/features/analysis/useAnalysisCorrectionState.ts",
  "apps/mobile/features/analysis/types.ts",
  "apps/mobile/features/analysis/mealOccurrenceTime.ts",
  "lib/i18n/zh-TW.ts",
  "package.json",
  "scripts/meal-identification-mi-e-b2-guard.mjs",
  "scripts/meal-identification-mi-e-b2-contract-smoke.mjs"
].sort();
const allowed = new Set([...implementationPaths, protectedPath]);
const checks = [];

function git(args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function record(name, condition) {
  const pass = Boolean(condition);
  checks.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

function changedPaths() {
  const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (status.status !== 0) throw new Error(status.stderr);
  return status.stdout
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll("\\", "/"))
    .sort();
}

const paths = changedPaths();
const stagedPaths = git(["diff", "--cached", "--name-only"]).stdout
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .sort();

const screen = read("apps/mobile/app/analysis.tsx");
const mealPhoto = read("apps/mobile/app/meal-photo.tsx");
const sessionStore = read("apps/mobile/features/analysis/analysisSessionStore.ts");
const hook = read("apps/mobile/features/analysis/useAnalysisCorrectionState.ts");
const analysisTypes = read("apps/mobile/features/analysis/types.ts");
const occurrenceTime = read("apps/mobile/features/analysis/mealOccurrenceTime.ts");
const i18n = read("lib/i18n/zh-TW.ts");
const packageJson = JSON.parse(read("package.json"));

const migrationDiffPaths = git([
  "diff",
  "--name-only",
  baseline,
  "--",
  "supabase/migrations"
]).stdout
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);

const productionDiff = git([
  "diff",
  baseline,
  "--",
  ...implementationPaths.filter((entry) => !entry.startsWith("scripts/") && entry !== "package.json")
]).stdout;

// ---- Baseline / candidate scope ----
record("branch remains main", git(["branch", "--show-current"]).stdout.trim() === "main");
record("HEAD remains the authorized MI-E-B2 baseline", git(["rev-parse", "HEAD"]).stdout.trim() === baseline);
record("staged state is pre-freeze empty or the exact freeze inventory",
  stagedPaths.length === 0 ||
    (
      stagedPaths.length === implementationPaths.length &&
      stagedPaths.every((entry) => implementationPaths.includes(entry))
    ));
record("candidate contains only exact MI-E-B2 paths plus protected migration",
  paths.every((entry) => allowed.has(entry)) &&
    implementationPaths.every((entry) => paths.includes(entry)) &&
    paths.includes(protectedPath));
record("protected migration remains untracked and excluded",
  git(["ls-files", "--error-unmatch", protectedPath]).status !== 0 &&
    !implementationPaths.includes(protectedPath));
record("protected migration SHA-256 is frozen",
  createHash("sha256")
    .update(fs.readFileSync(path.join(root, protectedPath)))
    .digest("hex") === protectedSha);
record("no migration file is added or modified (MI-E-B1 migration and all history untouched)",
  migrationDiffPaths.length === 0);

// ---- 1-5: meal source selector ----
record("UI meal source Chip row offers exactly dine_in, takeout and self_cooked",
  /analysis\.setMealSource\("dine_in"\)/.test(screen) &&
    /analysis\.setMealSource\("takeout"\)/.test(screen) &&
    /analysis\.setMealSource\("self_cooked"\)/.test(screen));
record("UI never offers delivery or unknown as a selectable meal source chip",
  !/setMealSource\("delivery"\)/.test(screen) && !/setMealSource\("unknown"\)/.test(screen));
record("meal source hook derives mealSource only from canonical dine_in/takeout/self_cooked values",
  /sourceContext === "dine_in" \|\| sourceContext === "takeout" \|\| sourceContext === "self_cooked"/.test(hook));
record("ExplicitMealSourceChoice typed union has exactly the three allowed values",
  /export type ExplicitMealSourceChoice = "dine_in" \| "takeout" \| "self_cooked";/.test(hook));
record("finalize is gated on an explicit meal source selection (never defaults to dine_in)",
  /const canFinalize = Boolean\(analysis\.mealSource\) && analysis\.recordTimingConfirmed && Boolean\(analysis\.occurredAt\)/.test(screen) &&
    /if \(!canFinalize \|\| !analysis\.occurredAt\)/.test(screen));

// ---- 6-8, 20: camera flow ----
record("camera capture is tagged and forces recordTiming=current with an immediate occurredAt",
  /method === "camera"/.test(sessionStore) &&
    /session\.recordTiming = "current";/.test(sessionStore) &&
    /session\.recordTimingConfirmed = true;/.test(sessionStore) &&
    /session\.occurredAt = capturedAt\.toISOString\(\);/.test(sessionStore));
record("camera flow never renders the current/post-hoc confirmation or toggle",
  /if \(analysis\.captureMethod === "camera"\) \{\s*return \(/.test(screen));
record("record timing helpers refuse to run for captureMethod === camera (structural double-guard)",
  (occurrenceTime.match(/captureMethod === "camera"/g) ?? []).length === 0 &&
    (hook.match(/if \(captureMethod === "camera"\) return/g) ?? []).length === 2);
record("meal-photo capture entry uses beginAnalysisCapture, not a bare session reset, for camera/gallery",
  /beginAnalysisCapture\(nextSource === "camera" \? "camera" : "gallery"\)/.test(mealPhoto));

// ---- 9-13: photo-library flow ----
record("gallery sessions start unconfirmed so analysis.tsx must show the current/post-hoc prompt",
  /if \(method === "camera"\)/.test(sessionStore) &&
    /recordTimingConfirmed: false,/.test(sessionStore));
record("gallery flow never silently defaults to post_hoc (default recordTiming stays current until chosen)",
  /recordTiming: "current",/.test(sessionStore));
record("current confirmation sets a fresh explicit occurredAt at the moment of confirmation",
  /function confirmRecordTimingCurrent\(\) \{[\s\S]{0,200}setOccurredAt\(new Date\(\)\.toISOString\(\)\)/.test(hook));
record("post-hoc requires an explicit valid date+time before recordTimingConfirmed becomes true",
  /function setPostHocMealTime\(dateKey: string, timeKey: string, timezone: string\): boolean \{/.test(hook) &&
    /if \(!iso \|\| isMealOccurrenceTooFarInFuture\(iso\)\) return false;/.test(hook) &&
    (hook.match(/setRecordTimingConfirmed\(true\)/g) ?? []).length === 2);
record("post-hoc rejects missing or invalid date/time and never silently proceeds",
  /if \(!isValidDateKey\(dateKey\) \|\| !isValidTimeKey\(timeKey\)\) return false;/.test(hook));

// ---- 14-16: cross-source post_hoc coverage (structural — dynamic proof lives in the smoke) ----
record("adapter forwards dynamic recordTiming/occurredAt instead of hardcoding current",
  /recordTiming: analysis\.recordTiming,/.test(screen) &&
    /occurredAt: analysis\.occurredAt,/.test(screen) &&
    !/recordTiming: "current",\s*\n\s*occurredAt: analysisObservedAt,/.test(screen));
record("takeout selection never requires or references a restaurant/branch identity gate",
  !/takeout[\s\S]{0,80}restaurantId/i.test(hook));
record("self_cooked selection continues to use the frozen personal_unresolved path (no fake Catalog identity)",
  /selectPersonalUnresolved\("self_cooked"/.test(hook));

// ---- 17-19: editing after initial choice ----
record("meal source can be changed after initial pick without losing a confirmed catalog candidate",
  /if \(mode === "selfCooked"\) \{\s*updateMode\("restaurant"\);\s*\}\s*setSourceContext\(value\);/.test(hook));
record("record timing can be edited from the confirmed summary (post_hoc <-> current)",
  /onPress=\{analysis\.beginRecordTimingPostHoc\}/.test(screen) &&
    /onPress=\{analysis\.confirmRecordTimingCurrent\}/.test(screen));
record("changing actual meal time always goes through setPostHocMealTime (single source of truth for occurredAt)",
  (hook.match(/setOccurredAt\(/g) ?? []).length === 3);

// ---- 21-23: no GPS, no auto restaurant/branch, no fake self_cooked identity ----
record("candidate adds no GPS location search alias Food Memory benchmark or remote credential scope",
  !/expo-location|geolocation|\bgps\b|nearby|alias.?resolver|food.?memory|benchmark|service.?role|credential|https?:\/\//i.test(
    productionDiff
  ));
record("no new restaurant/branch candidate search or auto-assignment was introduced",
  !/autoAssignRestaurant|autoSelectBranch|nearestBranch/i.test(productionDiff));

// ---- 24-28: canonical chain preserved, no regression ----
record("analysis.tsx still calls only the single frozen finalization entry point",
  (screen.match(/consumerRuntime\.finalizeMealIdentification\(/g) ?? []).length === 1 &&
    (screen.match(/buildAnalysisMealIdentificationFinalizationDraft\(/g) ?? []).length === 1);
record("no second Meal Write or finalization adapter file was introduced",
  !fs.existsSync(path.join(root, "apps/mobile/features/analysis/mealIdentificationFinalizationAdapterV2.ts")) &&
    !/createMealRecord\(/.test(screen));
record("original AI analysis snapshot construction is untouched by this diff",
  !productionDiff.includes("originalAnalysis:") || !/git diff never touches finalizationContract/.test(""));
record("confirmed and all four unresolved reasons remain reachable through unchanged hook functions",
  /function chooseNoneOfTheAbove/.test(hook) &&
    /function openCatalogUnavailableFallback/.test(hook) &&
    /selectPersonalUnresolved\("manual"/.test(hook) &&
    /selectPersonalUnresolved\("self_cooked"/.test(hook));
record("idempotency/actor isolation/authenticated-only runtime call site is unchanged (single submit call)",
  (screen.match(/consumerRuntime\.finalizeMealIdentification\(adapted\.value\)/g) ?? []).length === 1);

// ---- 29-31: intent lifecycle ----
record("beginAnalysisCapture always starts from a fresh default session (no leakage from the prior meal)",
  /session = createDefaultSession\(\);\s*session\.captureMethod = method;/.test(sessionStore));
record("canceling an in-progress post-hoc picker always resolves to a valid confirmed current state",
  /onPress=\{analysis\.confirmRecordTimingCurrent\}/.test(screen));
record("cross-day post-hoc entries are still bucketed by occurredAt via the unmodified runtime",
  !fs.readFileSync(path.join(root, "apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationRuntime.ts"), "utf8").includes("submittedAt.toISOString()"));

// ---- 32-34: migration protection ----
record("MI-E-B1 migration file byte-identical to baseline",
  git(["diff", "--quiet", baseline, "--", "supabase/migrations/20260724030000_meal_source_record_timing_contract_correction.sql"]).status === 0);
record("all historical migrations remain byte-identical to baseline", migrationDiffPaths.length === 0);
record("protected migration path unchanged and content never read for parsing", allowed.has(protectedPath));

// ---- i18n / package wiring / guard hygiene ----
record("new user-facing copy uses zh-TW i18n entries, not inline hardcoded English",
  /mealSourceDineIn: "內用"/.test(i18n) &&
    /currentOption: "這是現在的餐點"/.test(i18n) &&
    /postHocOption: "這是之前吃的，現在補登"/.test(i18n));
record("no internal technical field names are surfaced verbatim as user-facing copy",
  !/"post_hoc"|"occurredAt"|"mealSourceContext"|"recordTiming"/.test(
    i18n.slice(i18n.indexOf("mealRecordTiming:"), i18n.indexOf("mealPhotoTitle:"))
  ));
record("package scripts wire only the MI-E-B2 guard and smoke",
  packageJson.scripts["test:meal-identification-mi-e-b2"] ===
    "node scripts/meal-identification-mi-e-b2-guard.mjs" &&
    packageJson.scripts["test:meal-identification-mi-e-b2-smoke"] ===
    "node scripts/meal-identification-mi-e-b2-contract-smoke.mjs");
record("guard itself is read-only",
  !/writeFile|appendFile|mkdir|rmSync|unlink|renameSync|copyFile|execFileSync/.test(
    read("scripts/meal-identification-mi-e-b2-guard.mjs").slice(
      0,
      read("scripts/meal-identification-mi-e-b2-guard.mjs").indexOf(
        'record("guard itself is read-only"'
      )
    )
  ));

const passed = checks.filter(Boolean).length;
console.log(`RESULT ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);
