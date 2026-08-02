#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const checks = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const check = (name, condition) => checks.push({ name, pass: Boolean(condition) });
const git = (args) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw result.error ?? new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
};

const screen = read("apps/mobile/app/analysis.tsx");
const theme = read("apps/mobile/theme/components.tsx");
const readiness = read("apps/mobile/features/analysis/mealPhotoFinalizationReadiness.ts");
const draft = read("apps/mobile/features/analysis/mealPhotoFinalizationDraft.ts");
const hook = read("apps/mobile/features/analysis/useMealPhotoFinalization.ts");
const i18n = read("lib/i18n/zh-TW.ts");
const sharedTypes = read("packages/shared/src/domain/meal-photo-analysis/types.ts");
const requestValidation = read("packages/shared/src/domain/meal-photo-analysis/requestValidation.ts");
const v3Contract = read("apps/mobile/features/meal-identification-finalization/v3Contract.ts");
const frozenRpc = read("supabase/migrations/20260729010000_persist_user_confirmed_for_accepted_analysis_finalization.sql");

const resultCardStart = screen.indexOf("function MealPhotoAnalysisResultCard");
const editorStart = screen.indexOf("function MealPhotoFinalizationEditor", resultCardStart);
const resultCard = resultCardStart >= 0 && editorStart > resultCardStart
  ? screen.slice(resultCardStart, editorStart)
  : "";
const rowStart = screen.indexOf("function MealPhotoAnalysisCandidateRow", editorStart);
const rowEnd = screen.indexOf("function MacroChipsRow", rowStart);
const candidateRow = rowStart >= 0 && rowEnd > rowStart ? screen.slice(rowStart, rowEnd) : "";
const candidateTypeStart = sharedTypes.indexOf("export type MealPhotoAnalysisCandidate = {");
const candidateTypeEnd = sharedTypes.indexOf("};", candidateTypeStart);
const candidateType = candidateTypeStart >= 0 && candidateTypeEnd > candidateTypeStart
  ? sharedTypes.slice(candidateTypeStart, candidateTypeEnd)
  : "";
const renderStart = screen.indexOf("return (", screen.indexOf("export default function AnalysisScreen"));
const resultIndex = screen.indexOf("<MealPhotoAnalysisResultCard", renderStart);
// MI-E-C5-R5-R1 successor-compatible locator. The R2 invariant being protected is that WHEN the
// shared panel renders it is ONE ordered card (period → source → timing → editor → submit), not
// that it renders unconditionally. R5-R1 gates that same panel behind an explicit correction or
// manual choice, so the guard follows the gating expression rather than the old condition. Both
// spellings are accepted so this check keeps working against the frozen R2 layout too.
const panelStart = [
  "{showFinalizationEditor && mealPhotoFinalization.draft ? (",
  "{hasAiFinalizationFlow && mealPhotoFinalization.draft ? ("
]
  .map((marker) => screen.indexOf(marker, resultIndex))
  .find((index) => index >= 0) ?? -1;
const panelEnd = [") : !hasAiFinalizationFlow ? (", ") : ("]
  .map((marker) => screen.indexOf(marker, panelStart))
  .filter((index) => index > panelStart)
  .sort((a, b) => a - b)[0] ?? -1;
const sharedPanel = panelStart >= 0 && panelEnd > panelStart
  ? screen.slice(panelStart, panelEnd)
  : "";
const periodIndex = sharedPanel.indexOf("<MealPeriodSection");
const sourceIndex = sharedPanel.indexOf("<MealSourceSection", periodIndex);
const timingIndex = sharedPanel.indexOf("<RecordTimingSection", sourceIndex);
const editorIndex = sharedPanel.indexOf("<MealPhotoFinalizationEditor", timingIndex);

check(
  "unknown is a frozen legal source in shared type, request validation, v3 builder, and RPC",
  /\|\s*"unknown";/.test(sharedTypes) &&
    /"self_cooked", "unknown"/.test(requestValidation) &&
    /"self_cooked", "unknown"/.test(v3Contract) &&
    /'self_cooked', 'unknown'/.test(frozenRpc)
);
check(
  "readiness treats unknown as supported rather than an incomplete selection",
  /supportedSourceContexts[\s\S]*"unknown"/.test(readiness) &&
    !/sourceContext\s*!==\s*"unknown"/.test(screen)
);
check(
  "production remains 1-3 while the compact renderer is forward-compatible up to five rows",
  /MEAL_PHOTO_ANALYSIS_MIN_CANDIDATES = 1/.test(sharedTypes) &&
    /MEAL_PHOTO_ANALYSIS_MAX_CANDIDATES = 3/.test(sharedTypes) &&
  /MEAL_PHOTO_FINALIZATION_MAX_VISIBLE_CANDIDATES = 5/.test(readiness) &&
    /candidates\.slice\(0, MEAL_PHOTO_FINALIZATION_MAX_VISIBLE_CANDIDATES\)/.test(readiness) &&
    /Production meal-photo-analysis v1 is still validated end-to-end as 1-3 candidates/.test(readiness) &&
    // MI-E-C5-R5 successor: the compact ceiling is still applied to the real analysis response,
    // but the call moved from inside the result card to the screen, where the response is now also
    // split into one primary best match plus the fallbacks that actually exist. The R2 semantic —
    // the whole response is bounded by the compact ceiling before anything is rendered — is
    // unchanged; only the call site moved.
    /getCompactMealPhotoFinalizationCandidates\(mealPhotoAnalysis\.analysisCandidates\)/.test(screen)
);
check(
  "candidate rows contain only the meal name and a short selection indicator",
  /candidate\.observedName/.test(candidateRow) &&
    /selectedBadge/.test(candidateRow) &&
    !/candidate\.(?:components|estimatedNutrition|confidence|uncertaintyReasonCodes)/.test(candidateRow)
);
check(
  "candidate rows do not manufacture restaurant display authority absent from the AI contract",
  candidateType.length > 0 &&
    !/(?:restaurantId|restaurantName|branchId|resolvedRestaurant)/.test(candidateType) &&
    !/(?:restaurantId|restaurantName|branchId|resolvedRestaurant)/.test(candidateRow)
);
check(
  "candidate rows expose single-selection accessibility semantics",
  /accessibilityRole="radio"/.test(candidateRow) &&
    /accessibilityState=\{\{ disabled, selected \}\}/.test(candidateRow)
);
check(
  // MI-E-C5-R5 successor: the alternative candidate rows are now the explicitly-revealed fallback
  // list rather than a flat "all candidates" list. The R2 semantic — 都不是／手動輸入 is offered
  // after the candidate rows, never before or instead of them — is unchanged.
  "manual fallback is rendered after the alternative candidate rows",
  resultCard.indexOf("fallbacks.map") >= 0 &&
    resultCard.indexOf("noneOfAboveCta") > resultCard.indexOf("fallbacks.map")
);
check(
  "manual fallback still routes to the existing shared draft hook",
  /mealPhotoFinalization\.chooseManual\(\)/.test(screen) &&
    /createManualMealPhotoFinalizationDraft\(analysisRequestId, input\.context\)/.test(hook)
);
check(
  "exactly one shared finalization editor definition and one render path exist",
  (screen.match(/function MealPhotoFinalizationEditor\(/g) ?? []).length === 1 &&
    (screen.match(/<MealPhotoFinalizationEditor/g) ?? []).length === 1
);
check(
  "candidate/manual modes share all seven frozen editable fields",
  ["mealName", "components", "portion", "calories", "proteinGrams", "carbsGrams", "fatGrams"]
    .every((field) => screen.includes(`key: "${field}"`))
);
check(
  "required context, editor, and submit are one ordered shared finalization panel",
  resultIndex >= 0 &&
    resultIndex < panelStart &&
    /<SnowCard tone="ai">/.test(sharedPanel) &&
    (sharedPanel.match(/\bembedded\b/g) ?? []).length >= 4 &&
    /<MealPeriodSection[\s\S]*<MealSourceSection[\s\S]*<RecordTimingSection[\s\S]*<MealPhotoFinalizationEditor/.test(sharedPanel) &&
    periodIndex >= 0 &&
    periodIndex < sourceIndex &&
    sourceIndex < timingIndex &&
    timingIndex < editorIndex
);
check(
  "submit readiness is derived from explicit context reasons",
  /getMealPhotoFinalizationContextBlockReason\(\{/.test(screen) &&
    /missing_meal_source/.test(readiness) &&
    /missing_occurred_at/.test(readiness) &&
    /missing_record_timing/.test(readiness) &&
    /missing_meal_period/.test(readiness)
);
check(
  "submit is disabled for lock, flight, success, hard failure, context, or validation",
  /const submitDisabled =[\s\S]*payloadLocked[\s\S]*submitting[\s\S]*succeeded[\s\S]*hardFailure[\s\S]*contextBlockReason !== null[\s\S]*hasValidation/.test(screen)
);
check(
  "submit uses the explicit disabled contract and never relies on undefined onPress alone",
  /<PrimaryButton[\s\S]*disabled=\{submitDisabled\}[\s\S]*onPress=\{submitDisabled \? undefined : onSubmit\}/.test(screen)
);
check(
  "PrimaryButton disables native presses and exposes accessibility state",
  /disabled\?: boolean/.test(theme) &&
    /accessibilityState=\{\{ disabled \}\}/.test(theme) &&
    /disabled=\{disabled\}/.test(theme)
);
check(
  "PrimaryButton has an opt-in dimmed visual without changing enabled call sites",
  /disabled = false/.test(theme) &&
    /disabled && styles\.primaryButtonDisabled/.test(theme) &&
    /primaryButtonDisabled:\s*\{[\s\S]*opacity: 0\.45/.test(theme)
);
check(
  "every disabled submit cause has a specific safe Traditional Chinese hint",
  [
    "missingMealSource",
    "missingOccurredAt",
    "missingRecordTiming",
    "missingMealPeriod",
    "resolveValidation",
    "hardFailure",
    "payloadLocked",
    "succeeded"
  ].every((key) => i18n.includes(`${key}:`)) &&
    /請先選擇用餐方式/.test(i18n)
);
check(
  "unknown source copy is unambiguous that submission remains allowed",
  /將以「未知」來源保存/.test(i18n) &&
    !/sourceContext !== "unknown"/.test(screen)
);
check(
  "candidate switching still rebuilds a fresh draft from the selected candidate",
  /createCandidateMealPhotoFinalizationDraft\(analysisRequestId, candidate, input\.context\)/.test(hook) &&
    /originalCandidate: cloneCandidate\(candidate\)/.test(draft)
);
check(
  "manual mode keeps null candidate identity and no fabricated snapshot",
  /selectedCandidateId: null,[\s\S]*mode: "manual"[\s\S]*originalCandidate: null/.test(draft)
);
check(
  "stable request identity and frozen payload lock remain in the existing hook",
  /frozenSubmissionRef/.test(hook) &&
    /getMealPhotoFinalizationPayloadFingerprint/.test(hook) &&
    /retryPendingMealIdentificationFinalization/.test(hook)
);
check(
  "R2 production changes contain no client-owned server authority",
  !/(confirmationMode|verificationStatus|nutritionSource|userConfirmed|userCorrected)\s*:/.test(
    [screen, readiness, draft, hook].join("\n")
  )
);

// Successor scope-fence predicate. A screen allowlist replaces the R2-only "analysis.tsx alone"
// rule: R4 legitimately needs apps/mobile/app/meal-photo.tsx too (gallery error alerts + cache
// release call sites), but any OTHER apps/mobile/app/* path stays forbidden, exactly like the
// original R2-era rule did for every screen but analysis.tsx. This is the same predicate used
// both by the fixture proof below and by the real live-diff enforcement further down — the
// fixture is not a parallel/duplicated rule that could drift from what actually gets enforced.
const FORBIDDEN_SUCCESSOR_PREFIXES = Object.freeze([
  "supabase",
  "apps/mobile/features/meal-photo-upload",
  "apps/mobile/features/meal-identification-finalization",
  "packages/shared/src/domain/meal-identification-finalization"
]);
const ALLOWED_APP_SCREENS = new Set([
  "apps/mobile/app/analysis.tsx",
  "apps/mobile/app/meal-photo.tsx"
]);
// MI-E-C5-R7-B1 successor exceptions. The R2-era rule existed so a UI-readiness round could not
// quietly reach into the durable finalization contract or the server. R7-B1 is the round whose
// whole authorised purpose IS to extend that contract, so exactly two narrow exceptions are named
// here — the v3 command builder, and a NEW additive migration file. Every other file under
// features/meal-identification-finalization, every shared-domain file, every Edge Function and any
// EDIT to an existing migration all remain forbidden, so the fence still catches the class of
// change it was written to catch.
const ALLOWED_SUCCESSOR_CONTRACT_PATHS = new Set([
  "apps/mobile/features/meal-identification-finalization/v3Contract.ts"
]);
// EXACT allowlist, never a pattern. A generic "any 14-digit timestamp" rule would have admitted
// any arbitrary or destructive new migration, which is precisely the class of change this fence
// exists to stop. Only the one migration this round authorises may appear, and only as a new file.
const AUTHORIZED_SUCCESSOR_MIGRATIONS = new Set([
  "supabase/migrations/20260802010000_finalize_meal_identification_v3_restaurant_context.sql",
  // MI-E-C5-R7-B1-R2: the ledger-projection corrective successor. Added as a second EXACT entry,
  // never as a pattern — a third migration, a different timestamp or a different filename all
  // still fail.
  "supabase/migrations/20260803010000_finalize_meal_identification_v3_ledger_restaurant_identity.sql"
]);
function isForbiddenSuccessorPath(entry, options = {}) {
  const isNewFile = Boolean(options.isNewFile);
  if (ALLOWED_SUCCESSOR_CONTRACT_PATHS.has(entry)) return false;
  // A brand-new authorised migration is additive history; editing one that already shipped, or
  // adding an unauthorised one, never is.
  if (isNewFile && AUTHORIZED_SUCCESSOR_MIGRATIONS.has(entry)) return false;
  if (FORBIDDEN_SUCCESSOR_PREFIXES.some((prefix) => entry.startsWith(prefix))) return true;
  if (entry.startsWith("apps/mobile/app/") && !ALLOWED_APP_SCREENS.has(entry)) return true;
  return false;
}

// Behavioral fixture proof of the predicate itself (not a static string match on this guard's own
// source) — every case below exercises isForbiddenSuccessorPath with a concrete path and asserts
// its actual return value, using the identical function the real enforcement check calls.
check("scope predicate: analysis.tsx is allowed", !isForbiddenSuccessorPath("apps/mobile/app/analysis.tsx"));
check("scope predicate: meal-photo.tsx is allowed", !isForbiddenSuccessorPath("apps/mobile/app/meal-photo.tsx"));
check(
  "scope predicate: an unrelated third app screen is rejected",
  isForbiddenSuccessorPath("apps/mobile/app/example-unrelated-screen.tsx")
);
check(
  "scope predicate: a Supabase path is rejected",
  isForbiddenSuccessorPath("supabase/migrations/20260101000000_example.sql")
);
check(
  "scope predicate: the v3 command builder is the ONLY allowed finalization-contract path",
  !isForbiddenSuccessorPath("apps/mobile/features/meal-identification-finalization/v3Contract.ts") &&
    isForbiddenSuccessorPath("apps/mobile/features/meal-identification-finalization/mealIdentificationFinalizationMappers.ts") &&
    isForbiddenSuccessorPath("apps/mobile/features/meal-identification-finalization/validation.ts")
);
// MI-E-C5-R7-B1-R1 negative fixtures. Each case runs the real predicate, so a future widening of
// the allowlist back to a pattern fails here immediately.
const AUTHORIZED_MIGRATION = "supabase/migrations/20260802010000_finalize_meal_identification_v3_restaurant_context.sql";
check(
  "migration allowlist: the ONE authorized successor migration is allowed as a new file",
  !isForbiddenSuccessorPath(AUTHORIZED_MIGRATION, { isNewFile: true })
);
check(
  "migration allowlist: even the authorized path is rejected when it is a MODIFICATION",
  isForbiddenSuccessorPath(AUTHORIZED_MIGRATION, { isNewFile: false })
);
check(
  "migration allowlist: an arbitrary-timestamp migration is rejected",
  isForbiddenSuccessorPath("supabase/migrations/99999999999999_arbitrary_unauthorized_change.sql", { isNewFile: true })
);
check(
  "migration allowlist: a destructive-looking migration is rejected",
  isForbiddenSuccessorPath("supabase/migrations/20261231010000_drop_everything.sql", { isNewFile: true })
);
check(
  "migration allowlist: the same name under a different timestamp is rejected",
  isForbiddenSuccessorPath("supabase/migrations/20260803010000_finalize_meal_identification_v3_restaurant_context.sql", { isNewFile: true })
);
check(
  "migration allowlist: the same timestamp under a different name is rejected",
  isForbiddenSuccessorPath("supabase/migrations/20260802010000_something_else.sql", { isNewFile: true })
);
check(
  "migration allowlist: a second new migration alongside the authorized one is rejected",
  [AUTHORIZED_MIGRATION, "supabase/migrations/20260802020000_second_migration.sql"].filter((entry) =>
    isForbiddenSuccessorPath(entry, { isNewFile: true })
  ).length === 1
);
// MI-E-C5-R7-B1-R2 fixtures for the second authorized successor.
const AUTHORIZED_LEDGER_MIGRATION =
  "supabase/migrations/20260803010000_finalize_meal_identification_v3_ledger_restaurant_identity.sql";
check(
  "migration allowlist: the ledger-projection successor is allowed as a new file",
  !isForbiddenSuccessorPath(AUTHORIZED_LEDGER_MIGRATION, { isNewFile: true })
);
check(
  "migration allowlist: the ledger-projection successor is rejected as a MODIFICATION",
  isForbiddenSuccessorPath(AUTHORIZED_LEDGER_MIGRATION, { isNewFile: false })
);
check(
  "migration allowlist: the ledger successor's name under a different timestamp is rejected",
  isForbiddenSuccessorPath(
    "supabase/migrations/20260804010000_finalize_meal_identification_v3_ledger_restaurant_identity.sql",
    { isNewFile: true }
  )
);
check(
  "migration allowlist: the ledger successor's timestamp under a different name is rejected",
  isForbiddenSuccessorPath("supabase/migrations/20260803010000_something_else.sql", { isNewFile: true })
);
check(
  "migration allowlist: exactly TWO successors are authorized — a third is rejected",
  AUTHORIZED_SUCCESSOR_MIGRATIONS.size === 2 &&
    isForbiddenSuccessorPath("supabase/migrations/20260804010000_third_successor.sql", { isNewFile: true })
);
check(
  "migration allowlist: an Edge Function is rejected even as a new file",
  isForbiddenSuccessorPath("supabase/functions/meal-photo-analysis/index.ts", { isNewFile: true })
);
check(
  "scope predicate: a meal-photo-upload contract path is rejected",
  isForbiddenSuccessorPath("apps/mobile/features/meal-photo-upload/factories.ts")
);
check(
  // MI-E-C5-R7-B1: the sample path moved off v3Contract.ts, which is now the one named exception
  // (asserted explicitly by its own fixture below). The fence itself is unchanged — every other
  // file in this tree is still rejected, which is what this fixture proves.
  "scope predicate: a meal-identification-finalization contract path is rejected",
  isForbiddenSuccessorPath("apps/mobile/features/meal-identification-finalization/mealIdentificationFinalizationMappers.ts")
);
check(
  "scope predicate: the shared finalization domain path is rejected",
  isForbiddenSuccessorPath("packages/shared/src/domain/meal-identification-finalization/types.ts")
);
check(
  "scope predicate: an unrelated in-scope feature path stays allowed",
  !isForbiddenSuccessorPath("apps/mobile/features/analysis/mediaCapture.ts")
);

const r2FreezeIsAncestor = (() => {
  try {
    git(["merge-base", "--is-ancestor", "3319c45ecd64f4bcdd2f953f85faf0e22faf7dfb", "HEAD"]);
    return true;
  } catch {
    return false;
  }
})();
check("R2 frozen commit (3319c45) remains ancestor authority of HEAD", r2FreezeIsAncestor);

const modifiedEntries = git(["diff", "--name-only"]).split("\n").filter(Boolean);
const newEntries = git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
const forbiddenLiveEntries = [
  ...modifiedEntries.filter((entry) => isForbiddenSuccessorPath(entry, { isNewFile: false })),
  ...newEntries.filter((entry) => isForbiddenSuccessorPath(entry, { isNewFile: true }))
];
check(
  "successor work touches no forbidden backend/upload/finalization path and no app screen outside the allowed set",
  forbiddenLiveEntries.length === 0
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
  phase: "MI-E-C5-R2 Mobile Finalization Readiness UI Guard",
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
