#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const baseline = "f542e12b82aa67b8f10ad78b9dcb20ec1cce3f43";
const protectedPath =
  "supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql";
const protectedSha =
  "4e08de96d28a5e6d9911b074fa73769ea5b3e21d9e14a089c7f420e16a4fbe72";
const implementationPaths = [
  "apps/mobile/app.json",
  "apps/mobile/app/analysis.tsx",
  "apps/mobile/app/meal-photo.tsx",
  "apps/mobile/features/analysis/analysisSessionStore.ts",
  "apps/mobile/features/analysis/mealOccurrenceTime.ts",
  "apps/mobile/features/analysis/mediaCapture.ts",
  "apps/mobile/features/analysis/types.ts",
  "apps/mobile/features/analysis/useAnalysisCorrectionState.ts",
  "apps/mobile/package.json",
  "package-lock.json",
  "lib/i18n/zh-TW.ts",
  "package.json",
  "scripts/meal-identification-mi-e-b4-guard.mjs",
  "scripts/meal-identification-mi-e-b4-contract-smoke.mjs"
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

const appJson = read("apps/mobile/app.json");
const screen = read("apps/mobile/app/analysis.tsx");
const mealPhoto = read("apps/mobile/app/meal-photo.tsx");
const sessionStore = read("apps/mobile/features/analysis/analysisSessionStore.ts");
const occurrenceTime = read("apps/mobile/features/analysis/mealOccurrenceTime.ts");
const mediaCapture = read("apps/mobile/features/analysis/mediaCapture.ts");
const analysisTypes = read("apps/mobile/features/analysis/types.ts");
const hook = read("apps/mobile/features/analysis/useAnalysisCorrectionState.ts");
const i18n = read("lib/i18n/zh-TW.ts");
const mobilePackageJson = JSON.parse(read("apps/mobile/package.json"));
const packageJson = JSON.parse(read("package.json"));

const migrationDiffPaths = git(["diff", "--name-only", baseline, "--", "supabase/migrations"]).stdout
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);

const productionDiff = git([
  "diff",
  baseline,
  "--",
  ...implementationPaths.filter((entry) => !entry.startsWith("scripts/") && !entry.endsWith("package.json") && entry !== "package-lock.json")
]).stdout;

// ---- Baseline / candidate scope ----
record("branch remains main", git(["branch", "--show-current"]).stdout.trim() === "main");
record("HEAD remains the authorized MI-E-B4 baseline", git(["rev-parse", "HEAD"]).stdout.trim() === baseline);
record("staged state is pre-freeze empty or the exact freeze inventory",
  stagedPaths.length === 0 ||
    (stagedPaths.length === implementationPaths.length && stagedPaths.every((entry) => implementationPaths.includes(entry))));
record("candidate contains only exact MI-E-B4 paths plus protected migration",
  paths.every((entry) => allowed.has(entry)) &&
    implementationPaths.every((entry) => paths.includes(entry)) &&
    paths.includes(protectedPath));
record("protected migration remains untracked and excluded",
  git(["ls-files", "--error-unmatch", protectedPath]).status !== 0 && !implementationPaths.includes(protectedPath));
record("protected migration SHA-256 is frozen",
  createHash("sha256").update(fs.readFileSync(path.join(root, protectedPath))).digest("hex") === protectedSha);
record("no migration file is added or modified (MI-E-B1 migration and all history untouched)",
  migrationDiffPaths.length === 0);

// ---- 1-4: demo timer removal, real native API entry points ----
record("demo timer literals are gone from the camera/gallery entry points",
  !/startFakeAnalysis\("camera"\)/.test(mealPhoto) && !/startFakeAnalysis\("gallery"\)/.test(mealPhoto));
record("camera entry calls the real native media wrapper",
  /const outcome = await captureMealPhotoFromCamera\(\);/.test(mealPhoto));
record("gallery entry calls the real native media wrapper",
  /const outcome = await pickMealPhotoFromLibrary\(\);/.test(mealPhoto));
record("mediaCapture.ts is the only module that imports expo-image-picker",
  (mediaCapture.match(/from "expo-image-picker"/g) ?? []).length === 1 &&
    !/expo-image-picker/.test(screen) &&
    (mealPhoto.match(/expo-image-picker/g) ?? []).length === 0);

// ---- 5-8: permission handling ----
record("camera permission is requested before launch, both allow and deny paths handled",
  /requestCameraPermissionsAsync/.test(mediaCapture) && /permission\.granted/.test(mediaCapture));
record("gallery permission is requested before launch, both allow and deny paths handled",
  /requestMediaLibraryPermissionsAsync/.test(mediaCapture));
record("permission denial never throws — always a typed outcome",
  /status: "permission_denied"; canAskAgain: boolean/.test(mediaCapture) &&
    (mediaCapture.match(/try \{/g) ?? []).length === 2 &&
    (mediaCapture.match(/\} catch \{\s*return \{ status: "unavailable" \};\s*\}/g) ?? []).length === 2);
record("permission denial shows a clear zh-TW alert, never crashes or hangs",
  /showPermissionDeniedAlert/.test(mealPhoto) && /Alert\.alert\(title, body/.test(mealPhoto));

// ---- 7-8: cancel paths create no intent ----
record("camera/gallery cancellation never calls beginAnalysisCapture",
  /if \(outcome\.status === "canceled"\) \{[\s\S]{0,160}return;\s*\}/.test(mealPhoto) &&
    !/status === "canceled"[\s\S]{0,300}beginAnalysisCapture/.test(mealPhoto));

// ---- 9-13: capture provenance ----
record("MealPhotoCaptureMethod is exactly camera and photo_library (gallery renamed)",
  /export type MealPhotoCaptureMethod = "camera" \| "photo_library";/.test(analysisTypes) &&
    !/"gallery"/.test(analysisTypes) && !/"gallery"/.test(sessionStore));
record("beginAnalysisCapture requires a real image URI and stores it on the session",
  /export function beginAnalysisCapture\(\s*method: MealPhotoCaptureMethod,\s*imageUri: string,/.test(sessionStore) &&
    /session\.capturedImageUri = imageUri;/.test(sessionStore));
record("camera capture still forces recordTiming=current with an immediate confirmed occurredAt",
  /if \(method === "camera"\) \{\s*session\.recordTiming = "current";\s*session\.recordTimingConfirmed = true;\s*session\.occurredAt = capturedAt\.toISOString\(\);/.test(sessionStore));
record("camera flow never renders the current/post-hoc confirmation or toggle",
  /if \(analysis\.captureMethod === "camera"\) \{\s*return \(/.test(screen));
record("record timing helpers still refuse to run for captureMethod === camera",
  (hook.match(/if \(captureMethod === "camera"\) return/g) ?? []).length >= 2);

// ---- 14-20: full date-time picker replaces the preset chip ----
record("preset chip date/time options are fully removed",
  !/MEAL_OCCURRENCE_TIME_OPTIONS|buildRecentMealDateOptions|filterMealOccurrenceTimeOptions/.test(occurrenceTime) &&
    !/MEAL_OCCURRENCE_TIME_OPTIONS|buildRecentMealDateOptions|filterMealOccurrenceTimeOptions/.test(screen));
record("native date-time picker is imported and used for post-hoc entry",
  /from "@react-native-community\/datetimepicker"/.test(screen) && /DateTimePickerAndroid\.open/.test(screen));
record("post-hoc commit path always converts a real Date via toISOString (no hand-rolled timezone parser)",
  /function setPostHocMealTime\(occurredAtValue: Date\): boolean \{/.test(hook) &&
    /const iso = occurredAtValue\.toISOString\(\);/.test(hook));
record("future-time tolerance is centrally defined once, not scattered as a magic number",
  (occurrenceTime.match(/FUTURE_TOLERANCE_MS/g) ?? []).length >= 1 &&
    !/\b\d{3,}\s*\*\s*60\s*\*\s*1000\b/.test(screen) && !/\b\d{3,}\s*\*\s*60\s*\*\s*1000\b/.test(hook));
record("invalid or unconfirmed post-hoc date-time cannot finalize (canFinalize gate unchanged)",
  /const canFinalize = Boolean\(analysis\.mealSource\) && analysis\.recordTimingConfirmed && Boolean\(analysis\.occurredAt\)/.test(screen));
record("canceling the native picker never leaves a half-completed post_hoc intent",
  /function cancelRecordTimingPostHoc\(\) \{/.test(hook) &&
    /analysis\.cancelRecordTimingPostHoc\(\)/.test(screen));
record("android retry path exists so a rejected future time never strands the user on a dead card",
  /setAndroidStage\(confirm\(merged\) \? "done" : "date"\)/.test(screen));

// ---- 21-25: takeout/self_cooked/GPS/no fake identity/original analysis ----
record("candidate adds no GPS location search alias Food Memory benchmark or remote credential scope",
  !/expo-location|geolocation|\bgps\b|nearby|alias.?resolver|food.?memory|benchmark|service.?role|credential/i.test(productionDiff));
record("no new restaurant/branch candidate search or auto-assignment was introduced",
  !/autoAssignRestaurant|autoSelectBranch|nearestBranch/i.test(productionDiff));
record("original AI analysis snapshot construction (adapter) is untouched by this diff",
  git(["diff", "--quiet", baseline, "--", "apps/mobile/features/analysis/mealIdentificationFinalizationAdapter.ts"]).status === 0);

// ---- 37-38: canonical chain preserved ----
record("analysis.tsx still calls only the single frozen finalization entry point",
  (screen.match(/consumerRuntime\.finalizeMealIdentification\(/g) ?? []).length === 1 &&
    (screen.match(/buildAnalysisMealIdentificationFinalizationDraft\(/g) ?? []).length === 1);
record("no second Meal Write or finalization adapter file was introduced",
  !/createMealRecord\(/.test(screen) &&
    !fs.existsSync(path.join(root, "apps/mobile/features/analysis/mealIdentificationFinalizationAdapterV2.ts")));

// ---- 42-44: migration protection ----
record("MI-E-B1 migration file byte-identical to baseline",
  git(["diff", "--quiet", baseline, "--", "supabase/migrations/20260724030000_meal_source_record_timing_contract_correction.sql"]).status === 0);
record("all historical migrations remain byte-identical to baseline", migrationDiffPaths.length === 0);
record("protected migration path unchanged and content never read for parsing", allowed.has(protectedPath));

// ---- 45: i18n ----
record("new permission/media copy uses zh-TW i18n entries, not inline hardcoded English",
  /cameraPermissionDeniedTitle: "無法使用相機"/.test(i18n) &&
    /galleryPermissionDeniedTitle: "無法開啟相簿"/.test(i18n));
record("no internal technical field names are surfaced verbatim as user-facing copy",
  !/"post_hoc"|"occurredAt"|"mealSourceContext"|"recordTiming"|"photo_library"/.test(
    i18n.slice(i18n.indexOf("mediaCapture:"), i18n.indexOf("mealPhotoTitle:"))
  ));

// ---- 46-47: dependency and config consistency ----
record("expo-image-picker and datetimepicker are installed at Expo-SDK-resolved versions (not guessed)",
  mobilePackageJson.dependencies["expo-image-picker"] === "~17.0.11" &&
    mobilePackageJson.dependencies["@react-native-community/datetimepicker"] === "8.4.4");
record("no duplicate/overlapping camera or picker dependency was introduced",
  !("expo-camera" in mobilePackageJson.dependencies) &&
    !("react-native-image-picker" in mobilePackageJson.dependencies) &&
    !("react-native-modal-datetime-picker" in mobilePackageJson.dependencies));
record("app.json declares the expo-image-picker plugin with zh-TW permission copy",
  /"expo-image-picker"/.test(appJson) && /好廚需要使用相機/.test(appJson) && /好廚需要存取你的相簿/.test(appJson));
record("no unrelated workspace dependency was modified",
  git(["diff", "--name-only", baseline, "--", "apps/restaurant-web/package.json", "apps/admin-web/package.json", "packages"]).stdout.trim() === "");

// ---- guard hygiene / package wiring ----
record("package scripts wire only the MI-E-B4 guard and smoke",
  packageJson.scripts["test:meal-identification-mi-e-b4"] === "node scripts/meal-identification-mi-e-b4-guard.mjs" &&
    packageJson.scripts["test:meal-identification-mi-e-b4-smoke"] === "node scripts/meal-identification-mi-e-b4-contract-smoke.mjs");
record("guard itself is read-only",
  !/writeFile|appendFile|mkdir|rmSync|unlink|renameSync|copyFile|execFileSync|npm install/.test(
    read("scripts/meal-identification-mi-e-b4-guard.mjs").slice(
      0,
      read("scripts/meal-identification-mi-e-b4-guard.mjs").indexOf('record("guard itself is read-only"')
    )
  ));

const passed = checks.filter(Boolean).length;
console.log(`RESULT ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);
