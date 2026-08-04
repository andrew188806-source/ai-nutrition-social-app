#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
}

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function git(args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" });
}

const secureUuidProvider = read("apps/mobile/features/consumer-runtime/secureUuidProvider.ts");
const finalizationRuntime = read("apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationRuntime.ts");
const mealWriteRuntime = read("apps/mobile/features/consumer-runtime/consumerMealWriteRuntime.ts");
const plannedMealRuntime = read("apps/mobile/features/consumer-runtime/consumerPlannedMealRuntime.ts");
const useMealPhotoFinalization = read("apps/mobile/features/analysis/useMealPhotoFinalization.ts");
const finalizationAdapter = read("apps/mobile/features/analysis/mealIdentificationFinalizationAdapter.ts");
const analysisTsx = read("apps/mobile/app/analysis.tsx");
const zhTW = read("lib/i18n/zh-TW.ts");
const mobilePackageJson = read("apps/mobile/package.json");

// --- A1/A2: single canonical secure UUID authority, no per-runtime drift ---
check(
  "canonical provider tries native Web Crypto before any Expo/native fallback",
  /const webCrypto = globalThis\.crypto;/.test(secureUuidProvider) &&
    secureUuidProvider.indexOf("globalThis.crypto") < secureUuidProvider.indexOf("expo-crypto")
);
check(
  "canonical provider defers the expo-crypto require (never a static top-level import)",
  !/^import .*expo-crypto/m.test(secureUuidProvider) &&
    /function loadExpoCrypto[\s\S]*require\(\s*"expo-crypto"\s*\)/.test(secureUuidProvider) &&
    /catch\s*\{\s*return null;\s*\}/.test(secureUuidProvider)
);
check(
  "canonical provider fails closed with the exact original error when no provider is available",
  /throw new Error\("Secure UUID generation unavailable\."\);/.test(secureUuidProvider)
);
check(
  "canonical provider never falls back to Math.random or Date.now",
  !/Math\.random\(/.test(secureUuidProvider) && !/Date\.now\(\)\.toString/.test(secureUuidProvider)
);
check(
  "all three former per-runtime generators now delegate to the single canonical provider",
  /import \{ generateSecureUuidV4 \} from "\.\/secureUuidProvider";/.test(finalizationRuntime) &&
    /return generateSecureUuidV4\(\);/.test(finalizationRuntime) &&
    /import \{ generateSecureUuidV4 \} from "\.\/secureUuidProvider";/.test(mealWriteRuntime) &&
    /return generateSecureUuidV4\(\);/.test(mealWriteRuntime) &&
    /import \{ generateSecureUuidV4 \} from "\.\/secureUuidProvider";/.test(plannedMealRuntime) &&
    /return generateSecureUuidV4\(\);/.test(plannedMealRuntime)
);
check(
  "no runtime file still carries its own duplicated getRandomValues/randomUUID v4-construction logic",
  !/bytes\[6\] = \(bytes\[6\] & 0x0f\) \| 0x40;/.test(finalizationRuntime) &&
    !/bytes\[6\] = \(bytes\[6\] & 0x0f\) \| 0x40;/.test(mealWriteRuntime) &&
    !/bytes\[6\] = \(bytes\[6\] & 0x0f\) \| 0x40;/.test(plannedMealRuntime)
);
check(
  "expo-crypto is declared as a real dependency with a pinned SDK-compatible version",
  /"expo-crypto":\s*"[\d.^~]+"/.test(mobilePackageJson)
);
check(
  "react-native-get-random-values was not also introduced (no two competing crypto authorities)",
  !/react-native-get-random-values/.test(mobilePackageJson)
);

// --- A3: submit error boundary ---
check(
  "submit wraps prepareMealPhotoFinalization in try/catch rather than letting it throw uncaught",
  /let prepared: ReturnType<typeof prepareMealPhotoFinalization> \| null;\s*\n\s*try \{\s*\n\s*prepared = prepareMealPhotoFinalization\(/.test(useMealPhotoFinalization) &&
    /\} catch \{\s*\n\s*prepared = null;\s*\n\s*\}/.test(useMealPhotoFinalization)
);
check(
  "prepare-time failure produces a distinct, non-network-labeled safe error code",
  /lastSafeError: "finalization_client_error"/.test(useMealPhotoFinalization) &&
    !/lastSafeError: "finalization_transport_failed"[\s\S]{0,80}catch/.test(useMealPhotoFinalization)
);
check(
  "prepare-time failure releases the single-flight gate on the same path",
  /if \(!prepared\) \{[\s\S]{0,220}gateRef\.current\.finish\(\);\s*\n\s*return;\s*\n\s*\}/.test(useMealPhotoFinalization)
);
check(
  "prepare-time failure never touches frozenSubmissionRef (no pending operation is ever created)",
  !/if \(!prepared\) \{[\s\S]{0,400}frozenSubmissionRef\.current = /.test(useMealPhotoFinalization)
);
check(
  "finalization_client_error maps to its own dedicated UI kind, not folded into an existing network/transport kind",
  /if \(errorCode === "finalization_client_error"\) return "client";/.test(finalizationAdapter) &&
    /"client"/.test(finalizationAdapter.match(/export type MealIdentificationFinalizationUiErrorKind =[\s\S]*?;/)?.[0] ?? "")
);
check(
  "dedicated client-error copy exists and is distinct from the generic/network copy",
  /client:\s*\{\s*\n\s*title:\s*"[^"]+",\s*\n\s*body:\s*"[^"]+"\s*\n\s*\}/.test(zhTW)
);

// --- C: restaurant display fallback ---
check(
  "restaurant display row is rendered above the mealName field inside the shared finalization panel",
  (() => {
    const restaurantIdx = analysisTsx.indexOf("copy.restaurantNameLabel");
    const mealNameFieldIdx = analysisTsx.indexOf('{ key: "mealName", label: copy.mealNameLabel }');
    return restaurantIdx !== -1 && mealNameFieldIdx !== -1 && restaurantIdx < analysisTsx.indexOf("{fields.map((field) => {");
  })()
);
// MI-E-C5-R7-C2b SUCCESSOR AUTHORITY.
//
// The original assertion required the editor to render `{copy.restaurantNameUnknown}` literally,
// which encoded a fact that was true only while no authoritative restaurant source existed: R3 was
// written before there was any way for the app to KNOW a restaurant. R7-C1 gave the analysis session
// a durable restaurantId/branchId, and R7-C2a taught the frozen resolver to name the exact branch.
// The requirement therefore becomes conditional rather than absolute — 未知 stays the fallback for an
// absent or unnameable context, and never becomes a permanent placeholder over a known venue.
//
// Executable source only, so the explanatory prose above a display site cannot satisfy or break a
// code assertion.
const stripComments = (source) =>
  source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return (
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("*") &&
        !trimmed.startsWith("/*") &&
        !trimmed.startsWith("{/*")
      );
    })
    .join("\n");
const analysisCode = stripComments(analysisTsx);
const editorBody = (() => {
  const start = analysisCode.indexOf("function MealPhotoFinalizationEditor");
  const end = analysisCode.indexOf("function MealPhotoAnalysisCandidateRow");
  return start === -1 || end === -1 || end <= start ? null : analysisCode.slice(start, end);
})();

check(
  "restaurant display still has no authority of its own: 未知 remains the fallback and the legacy mock name is still never read",
  editorBody !== null &&
    // The fallback is still reachable, now composed once at screen level rather than hardcoded here.
    /restaurantNameUnknown/.test(analysisCode) &&
    // The legacy demo/mock restaurant name remains banned everywhere in the screen.
    !/analysis\.restaurantName/.test(editorBody)
);
check(
  "the display value is resolved by the frozen production resolver, never by screen-local guessing",
  /resolveRestaurantContextPresentation\(/.test(analysisCode) &&
    /restaurantId: analysis\.restaurantId,/.test(analysisCode) &&
    /branchId: analysis\.branchId,/.test(analysisCode)
);
check(
  "a resolved restaurant may display its real name, and a valid branch its real branch name",
  /restaurantContextPresentation\.restaurantName/.test(analysisCode) &&
    /restaurantContextPresentation\.branchName/.test(analysisCode) &&
    // 未知 is now the null branch of a conditional, not an unconditional literal.
    /restaurantDisplayName === null[\s\S]{0,200}restaurantNameUnknown/.test(analysisCode)
);
check(
  "the screen never substitutes a district / location / address for a branch name",
  editorBody !== null &&
    !/\.district/.test(analysisCode) &&
    !/match\.location/.test(analysisCode) &&
    !/branches\[0\]/.test(analysisCode)
);
check(
  "display resolution never blocks finalization: no disabled submit, no blocking spinner keyed off the catalog",
  !/catalogStatus[\s\S]{0,120}(disabled|submitDisabled)\s*=/.test(analysisCode) &&
    !/restaurantContextPresentation[\s\S]{0,160}submitDisabled/.test(analysisCode) &&
    !/restaurantContextPresentation[\s\S]{0,160}canFinalize/.test(analysisCode)
);
check(
  "no restaurant SELECTOR is introduced into the analysis screen by the display wiring",
  !/選擇餐廳/.test(analysisCode) &&
    !/setAnalysisRestaurantContext/.test(analysisCode) &&
    !/analysisRestaurantHandoff/.test(analysisCode)
);
check(
  "exactly one catalog hook call exists in the screen (the display reuses it, never mounts a second)",
  (analysisCode.match(/useRestaurantCatalog\(\)/g) ?? []).length === 1
);
check(
  "restaurant field is presentation-only: not added to MealPhotoFinalizationDraftState or the fingerprint",
  !/restaurantName/i.test(read("apps/mobile/features/analysis/mealPhotoFinalizationDraft.ts"))
);
check(
  "restaurant field is not part of the v3 finalization payload contract",
  !/restaurantName/i.test(read("apps/mobile/features/meal-identification-finalization/v3Contract.ts"))
);
check(
  "restaurant label/fallback i18n keys exist",
  /restaurantNameLabel: "餐廳名稱"/.test(zhTW) && /restaurantNameUnknown: "未知"/.test(zhTW)
);

// --- B: successor-compatible transcode authority ---
check(
  "the R4 successor uses only the reviewed SDK-compatible Expo image transcode authority",
  /"expo-image-manipulator":\s*"~14\.0\.8"/.test(mobilePackageJson) &&
    !/"react-native-image-resizer"/.test(mobilePackageJson) &&
    !/"react-native-image-crop-picker"/.test(mobilePackageJson)
);

// --- Scope guard: forbidden paths untouched ---
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
  "repair does not modify migrations, Edge Functions, or the frozen B1/B2 finalization contract",
  forbiddenDiff.status === 0 && forbiddenTouched.length === 0
);

const stagedDiff = git(["diff", "--cached", "--name-only"]);
check("nothing is staged", stagedDiff.status === 0 && stagedDiff.stdout.trim() === "");


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
  phase: "MI-E-C5-R3 UUID Safety / Restaurant Fallback / Gallery Blocker Guard",
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
