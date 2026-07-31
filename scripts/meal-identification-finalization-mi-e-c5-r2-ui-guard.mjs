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
const panelStart = screen.indexOf("{hasAiFinalizationFlow && mealPhotoFinalization.draft ? (", resultIndex);
const panelEnd = screen.indexOf(") : (", panelStart);
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
    /getCompactMealPhotoFinalizationCandidates\(candidates\)/.test(resultCard)
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
  "manual fallback is rendered after the compact candidate rows",
  resultCard.indexOf("visibleCandidates.map") >= 0 &&
    resultCard.indexOf("noneOfAboveCta") > resultCard.indexOf("visibleCandidates.map")
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

const changed = [
  ...git(["diff", "--name-only"]).split("\n"),
  ...git(["ls-files", "--others", "--exclude-standard"]).split("\n")
].filter(Boolean);
check(
  "R2 has no migration, RPC, Edge Function, Storage, or unrelated screen change",
  !changed.some((entry) =>
    entry.startsWith("supabase/") ||
    entry.startsWith("apps/mobile/features/meal-photo-upload/") ||
    (entry.startsWith("apps/mobile/app/") && entry !== "apps/mobile/app/analysis.tsx")
  )
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
