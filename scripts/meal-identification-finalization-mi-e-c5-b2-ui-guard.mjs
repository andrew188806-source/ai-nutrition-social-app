#!/usr/bin/env node
// MI-E-C5-B2 static UI/runtime guard. Behavioral assertions live in the companion smoke.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const checks = [];
const record = (name, pass) => checks.push({ name, pass: Boolean(pass) });
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const sha = (relative) => crypto.createHash("sha256").update(read(relative), "utf8").digest("hex");
const git = (args) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw result.error ?? new Error(result.stderr || `git ${args.join(" ")} failed`);
  return (result.stdout ?? "").trim();
};

const screenPath = "apps/mobile/app/analysis.tsx";
const hookPath = "apps/mobile/features/analysis/useMealPhotoFinalization.ts";
const draftPath = "apps/mobile/features/analysis/mealPhotoFinalizationDraft.ts";
const sessionPath = "apps/mobile/features/analysis/analysisSessionStore.ts";
const runtimePath = "apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationRuntime.ts";
const validationPath = "apps/mobile/features/meal-identification-finalization/validation.ts";
const mockPath = "apps/mobile/features/meal-identification-finalization/adapters/mockConsumerMealIdentificationFinalizationRepository.ts";
const i18nPath = "lib/i18n/zh-TW.ts";
const screen = read(screenPath);
const hook = read(hookPath);
const draft = read(draftPath);
const session = read(sessionPath);
const runtime = read(runtimePath);
const validation = read(validationPath);
const mock = read(mockPath);
const i18n = read(i18nPath);
const production = [screen, hook, draft, session, runtime, validation, mock, i18n].join("\n");
const changed = new Set(
  [
    ...git(["diff", "--name-only"]).split("\n"),
    ...git(["ls-files", "--others", "--exclude-standard"]).split("\n")
  ].filter(Boolean)
);

const frozen = [
  ["supabase/migrations/20260727010000_extend_meal_identification_finalization_for_existing_analysis.sql", "e01a2ae044503fdb69008e9b2fe228d6299400bf56b03441083d0f0402e91cf2"],
  ["supabase/migrations/20260728010000_correct_existing_analysis_finalization_v3.sql", "5efddeb83653ec6508dc69d4a6496ec42f6083ea895b6c53b953f9f1a90b439a"],
  ["supabase/migrations/20260729010000_persist_user_confirmed_for_accepted_analysis_finalization.sql", "0a7655a8dbd63d656720a7eea4734786dc13ac82ab5faa5a9a1861322d9b17b8"]
];

for (const [migration, expected] of frozen) {
  record(`${path.basename(migration)} frozen SHA is unchanged`, sha(migration) === expected);
}
const headMigrations = git(["ls-tree", "-r", "--name-only", "HEAD", "supabase/migrations"]).split("\n").filter(Boolean).sort();
const diskMigrations = git(["ls-files", "supabase/migrations"]).split("\n").filter(Boolean).sort();
record("no migration was added or removed", JSON.stringify(headMigrations) === JSON.stringify(diskMigrations));
record("no migration is modified in the B2 candidate", ![...changed].some((entry) => entry.startsWith("supabase/migrations/")));
record("no Edge Function is modified in the B2 candidate", ![...changed].some((entry) => entry.startsWith("supabase/functions/")));
record("no RPC/server SQL path is modified", ![...changed].some((entry) => entry.endsWith(".sql")));

record("analysis screen uses the existing consumer finalization runtime", /useMealPhotoFinalization[\s\S]*mealPhotoFinalization\.submit/.test(screen));
record("B2 hook calls existing finalizeMealIdentification boundary", /runtime\.finalizeMealIdentification\(prepared\.draft\)/.test(hook));
record("B2 hook uses existing retryPendingMealIdentificationFinalization boundary", /runtime\.retryPendingMealIdentificationFinalization\(\)/.test(hook));
record(
  "one shared status authority locks submitting, uncertain, and succeeded while leaving definitive error editable",
  /status === "submitting" \|\| status === "uncertain" \|\| status === "succeeded"/.test(draft) &&
    /isMealPhotoFinalizationPayloadLocked\(\s*runtime\.mealIdentificationFinalizationState\.status\s*\)/.test(hook)
);
record(
  "external context synchronization uses the same payload-mutation gate and cannot rotate an uncertain request",
  /useEffect\(\(\) => \{[\s\S]*applyMealPhotoFinalizationPayloadMutation\([\s\S]*updateMealPhotoFinalizationContext/.test(hook)
);
record(
  "candidate-list replacement cannot clear a locked pending draft",
  /isMealPhotoFinalizationPayloadLocked\([\s\S]*return;[\s\S]*current\?\.mode === "candidate"/.test(hook)
);
const retryPendingStart = hook.indexOf("const retryPending = useCallback");
const submitStart = hook.indexOf("const submit = useCallback", retryPendingStart);
const retryPendingBody =
  retryPendingStart !== -1 && submitStart !== -1
    ? hook.slice(retryPendingStart, submitStart)
    : "";
const selectCandidateStart = hook.indexOf("const selectCandidate = useCallback");
const chooseManualStart = hook.indexOf("const chooseManual = useCallback", selectCandidateStart);
const updateFieldStart = hook.indexOf("const updateField = useCallback", chooseManualStart);
const selectCandidateBody =
  selectCandidateStart !== -1 && chooseManualStart !== -1
    ? hook.slice(selectCandidateStart, chooseManualStart)
    : "";
const chooseManualBody =
  chooseManualStart !== -1 && updateFieldStart !== -1
    ? hook.slice(chooseManualStart, updateFieldStart)
    : "";
const applyResultStart = hook.indexOf("const applyResultIfCurrent = useCallback", updateFieldStart);
const updateFieldBody =
  updateFieldStart !== -1 && applyResultStart !== -1
    ? hook.slice(updateFieldStart, applyResultStart)
    : "";
const mealPeriodStart = screen.indexOf("function MealPeriodSection");
const mealSourceStart = screen.indexOf("function MealSourceSection", mealPeriodStart);
const editorStart = screen.indexOf("function MealPhotoFinalizationEditor", mealSourceStart);
const candidateRowStart = screen.indexOf("function MealPhotoAnalysisCandidateRow", editorStart);
const recordTimingStart = screen.indexOf("function RecordTimingSection", candidateRowStart);
const postHocStart = screen.indexOf("function PostHocPicker", recordTimingStart);
const mealPeriodBody = screen.slice(mealPeriodStart, mealSourceStart);
const mealSourceBody = screen.slice(mealSourceStart, editorStart);
const editorBody = screen.slice(editorStart, candidateRowStart);
const recordTimingBody = screen.slice(recordTimingStart, postHocStart);
record(
  "candidate selection, manual switch, and field editing each use the programmatic payload-mutation gate",
  /applyMealPhotoFinalizationPayloadMutation\(/.test(selectCandidateBody) &&
    /applyMealPhotoFinalizationPayloadMutation\(/.test(chooseManualBody) &&
    /applyMealPhotoFinalizationPayloadMutation\(/.test(updateFieldBody)
);
record(
  "uncertain retry replays only the runtime pending operation and never rebuilds or submits a current UI payload",
  /runtime\.retryPendingMealIdentificationFinalization\(\)/.test(retryPendingBody) &&
    !/prepareMealPhotoFinalization|finalizeMealIdentification\(/.test(retryPendingBody)
);
record(
  "retry acceptance requires the same frozen submission object and payload fingerprint",
  /frozenSubmissionRef\.current !== frozen/.test(hook) &&
    /getMealPhotoFinalizationPayloadFingerprint\(current\) !== frozen\.fingerprint/.test(hook) &&
    /applyMealPhotoFinalizationResult\(frozen\.state, result\)/.test(hook)
);
record(
  "actor and analysis identity checks remain mandatory before a frozen retry result is applied",
  /expectedIdentity !== identityRef\.current/.test(hook) &&
    /getAnalysisSession\(\)\.analysisRequestId !== frozen\.state\.analysisRequestId/.test(hook)
);
record(
  "UI candidate, manual, editor, meal-period, source, timing, and retake controls share hook payloadLocked",
  (screen.match(/payloadLocked=\{mealPhotoFinalization\.payloadLocked\}/g) ?? []).length >= 4 &&
    /payloadLocked \? undefined : onChooseManual/.test(screen) &&
    /editable=\{!submitting && !succeeded && !payloadLocked\}/.test(editorBody) &&
    /onPress=\{payloadLocked \? undefined : \(\) => onSelect\(period\)\}/.test(mealPeriodBody) &&
    (mealSourceBody.match(/onPress=\{payloadLocked \? undefined : \(\) => analysis\.setMealSource/g) ?? []).length === 4 &&
    /if \(payloadLocked && frozenContext\)/.test(recordTimingBody) &&
    /onPress=\{mealPhotoFinalization\.payloadLocked \? undefined : \(\) => retakeMealPhoto\(\)\}/.test(screen)
);
record(
  "locked timing UI projects the frozen occurredAt/recordTiming context with no mutation controls",
  /if \(payloadLocked && frozenContext\)[\s\S]*frozenContext\.recordTiming[\s\S]*frozenContext\.occurredAt/.test(screen)
);
record(
  "the B2 uncertain action routes to the hook exact-retry path, not the legacy projection",
  /hasAiFinalizationFlow[\s\S]*mealPhotoFinalization\.retryPending\(\)[\s\S]*retryPendingMealIdentificationFinalization/.test(screen)
);
record("Mobile B2 production files contain no direct Supabase table write", !/\.from\([^)]*\)\s*\.(?:insert|update|upsert|delete)\s*\(/.test([screen, hook, draft].join("\n")));
record("v3 request builder is used by the production draft mapper", /buildMealIdentificationFinalizationV3\(\{/.test(draft));
record("service revalidation dispatches to the v3 builder", /MEAL_IDENTIFICATION_FINALIZATION_V3_VERSION[\s\S]*buildMealIdentificationFinalizationV3/.test(validation));
record("analysisRequestId is carried from session into the draft", /getAnalysisSession\(\)\.analysisRequestId[\s\S]*createCandidateMealPhotoFinalizationDraft\(analysisRequestId/.test(hook));
record("selectedCandidateId is carried into the v3 command", /selectedCandidateId: state\.selectedCandidateId/.test(draft));
record("manual mode uses a null selectedCandidateId", /selectedCandidateId: null,[\s\S]*mode: "manual"/.test(draft));
record("manual UI entry exists", /noneOfAboveCta[\s\S]*onChooseManual/.test(screen));
// MI-E-C5-R5-R1 successor-compatible: the B2 invariant is that the candidate UI hands exactly ONE
// candidate to the shared draft, which then records exactly that one id. R5-R1 renamed the callback
// from onSelectCandidate to onAcceptFallback because the gesture now finalizes rather than only
// selecting; the single-select property is unchanged, so both spellings are accepted.
record("candidate UI remains single-select", /(onSelectCandidate|onAcceptFallback)\(candidate\)/.test(screen) && /setSelectedMealPhotoAnalysisCandidateId\(candidate\.candidateId\)/.test(hook));
record("candidate switching rebuilds from a fresh candidate snapshot", /createCandidateMealPhotoFinalizationDraft\(analysisRequestId, candidate, input\.context\)/.test(hook));
record("original candidate snapshot is retained", /originalCandidate: cloneCandidate\(candidate\)/.test(draft));
record("editable meal name is wired", /key: "mealName"/.test(screen));
record("editable components are wired", /key: "components"/.test(screen));
record("editable portion is wired", /key: "portion"/.test(screen));
record("all four editable nutrition fields are wired", ["calories", "proteinGrams", "carbsGrams", "fatGrams"].every((key) => screen.includes(`key: "${key}"`)));
record("name/components/portion/nutrition validation is present", /validateEditable/.test(draft) && /Number\.isFinite/.test(draft) && /parsed < 0/.test(draft));
record("empty component entries are removed", /\.filter\(Boolean\)/.test(draft));
record("unchanged candidate can prepare without dirty edits", /dirty: false/.test(draft) && /candidateEditableValues\(candidate\)/.test(draft));
record("corrected candidate retains selected candidate identity", /selectedCandidateId: state\.selectedCandidateId/.test(draft));
record("actual occurredAt is passed without submit-time replacement", /occurredAt: state\.context\.occurredAt/.test(draft) && !/occurredAt:\s*new Date/.test(draft));
record("recordTiming/post-hoc is passed", /recordTiming: state\.context\.recordTiming/.test(draft));
record("source context is passed", /sourceContext: state\.context\.sourceContext/.test(draft));
record("capture method is passed", /captureMethod: state\.context\.captureMethod/.test(draft));
record("timezone stays in existing runtime actor context", /timezone: profileTimezone/.test(read("apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx")));
record("takeout and delivery UI choices are distinct", /setMealSource\("takeout"\)/.test(screen) && /setMealSource\("delivery"\)/.test(screen));
record("all five v3 source values remain represented", ["dine_in", "takeout", "delivery", "self_cooked", "unknown"].every((value) => production.includes(value)));
record("first submit uses repository runtime UUID authority", /generateConsumerMealIdentificationFinalizationClientRequestId/.test(hook) && /clientRequestId \?\?/.test(runtime));
record("prepared draft carries its stable clientRequestId", /draft: Object\.freeze\(\{ clientRequestId, mealType/.test(draft));
record("payload edits after attempt rotate request ID", /clientRequestId: state\.attempted \? uuidFactory\(\) : state\.clientRequestId/.test(draft));
record("submitting and succeeded drafts reject edits", /submissionStatus === "submitting" \|\| state\.submissionStatus === "succeeded"/.test(draft));
record("programmatic single-flight guard is used", /MealPhotoFinalizationSubmissionGate/.test(hook) && /tryStart\(\)/.test(hook));
record(
  "submit button is disabled while submitting/succeeded",
  /const submitDisabled =[\s\S]*submitting[\s\S]*succeeded[\s\S]*<PrimaryButton[\s\S]*disabled=\{submitDisabled\}[\s\S]*onPress=\{submitDisabled \? undefined : onSubmit\}/.test(screen)
);
record("success navigation is gated once", /tryNavigate\(\)/.test(hook) && /router\.push\("\/today-intake"\)/.test(screen));
record("actor generation participates in stale identity", /actorGeneration/.test(hook));
record("analysisRequestId and captureGeneration participate in stale identity", /analysisRequestId[\s\S]*captureGeneration/.test(hook));
record("component unmount blocks late response application", /mountedRef\.current/.test(hook));
record("candidate-list replacement clears stale draft", /candidateId === current\.selectedCandidateId[\s\S]*setDraft\(null\)/.test(hook));
record("session reset owns and clears the single finalization draft", /mealPhotoFinalizationDraft: null/.test(session));
record("typed v3 errors map to safe UI categories", /finalization_analysis_not_found/.test(read("apps/mobile/features/analysis/mealIdentificationFinalizationAdapter.ts")) && /finalization_invalid_candidate/.test(read("apps/mobile/features/analysis/mealIdentificationFinalizationAdapter.ts")));
record("UI renders only i18n safe copy for finalization errors", /zhTW\.mobile\.mealIdentificationFinalization\.errors\[kind\]/.test(screen));
record("B2 UI contains no SQL/constraint/stack rendering", !/error\.(?:message|stack)|constraint_name|sqlstate/i.test(screen));
record("Mobile v3 construction sends none of the forbidden server-authority fields", !/(confirmationMode|verificationStatus|nutritionSource|userConfirmed|userCorrected)\s*:/.test([screen, hook, draft].join("\n")));
record("Mobile B2 sends no training/licensing authority", !/(trainingEligible|trainingConsent|restaurantCommercialPermission|allowTraining|canTrain)\s*:/.test([screen, hook, draft].join("\n")));
record("Mobile B2 makes no verified nutrition claim", !/(verifiedNutrition|nutritionistReviewed|catalogAuthoritative)\s*:/.test([screen, hook, draft].join("\n")));
record("mock supports accepted/corrected/manual through the same production input shape", /FinalizeCurrentUserMealIdentificationInput/.test(mock) && /input\.finalization/.test(mock));
record("mock supports replay/idempotency conflict", /existing\.fingerprint !== fingerprint/.test(mock) && /replayed: true/.test(mock));
record("mock supports typed failure and delayed-response scenarios", /analysis_already_finalized/.test(mock) && /network_failure/.test(mock) && /beforeResponse/.test(mock));
record("B1 RPC constant remains the sole repository function name", read("apps/mobile/features/meal-identification-finalization/supabaseMealIdentificationFinalizationContracts.ts").match(/finalize_current_user_meal_identification_v1/g)?.length === 1);

const failed = checks.filter((check) => !check.pass);
console.log(JSON.stringify({
  status: failed.length ? "failed" : "passed",
  phase: "MI-E-C5-B2 mobile confirmation/finalization UI guard",
  totalChecks: checks.length,
  passedChecks: checks.length - failed.length,
  failedChecks: failed,
  checks
}, null, 2));
if (failed.length) process.exitCode = 1;
