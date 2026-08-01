#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const checks = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const check = (name, condition) => checks.push({ name, pass: Boolean(condition) });
const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });

const screen = read("apps/mobile/app/analysis.tsx");
const flowState = read("apps/mobile/features/analysis/mealPhotoAnalysisFlowState.ts");
const finalizationHook = read("apps/mobile/features/analysis/useMealPhotoFinalization.ts");
const sessionStore = read("apps/mobile/features/analysis/analysisSessionStore.ts");
const readiness = read("apps/mobile/features/analysis/mealPhotoFinalizationReadiness.ts");
const sharedTypes = read("packages/shared/src/domain/meal-photo-analysis/types.ts");
const i18n = read("lib/i18n/zh-TW.ts");
const mobilePackage = JSON.parse(read("apps/mobile/package.json"));
const correctionStateHook = read("apps/mobile/features/analysis/useAnalysisCorrectionState.ts");
const uploadHook = read("apps/mobile/features/analysis/useMealPhotoUpload.ts");
const analysisHook = read("apps/mobile/features/analysis/useMealPhotoAnalysis.ts");
const galleryNormalization = read("apps/mobile/features/analysis/galleryMealPhotoAssetNormalization.ts");
// MI-E-C5-R5-R4 slices: the exact hook regions where actor-owned masking and clearing live.
const analysisHookLayoutClear = (src) => {
  const i = src.indexOf("useLayoutEffect(() => {");
  if (i < 0) return "";
  const end = src.indexOf("}, [", i);
  return end > i ? src.slice(i, end) : src.slice(i);
};
// MI-E-C5-R5-R2: pinned so an added runtime dependency fails the guard. R5/R5-R2 add none.
const MI_E_C5_R5_EXPECTED_MOBILE_DEPENDENCY_COUNT = 30;

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) return "";
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : -1;
  return end > start ? source.slice(start, end) : source.slice(start);
}

const resultCard = sliceBetween(screen, "function MealPhotoAnalysisResultCard", "function MealPhotoFinalizationSubsection");
const completedHero = sliceBetween(screen, "function CompletedAnalysisHero", "function MealIdentificationFinalizationErrorCard");
const completeCallback = sliceBetween(screen, "const completeMealPhotoFinalization", "const mealPhotoFinalization = useMealPhotoFinalization");
const rankFn = sliceBetween(flowState, "export function rankMealPhotoAnalysisCandidates", "// Splits the ranked response");
const acceptCandidateFn = sliceBetween(finalizationHook, "const acceptCandidate = useCallback(", "return useMemo(");
const actorIsolationEffect = sliceBetween(screen, "const actorIdentity = buildMealPhotoAnalysisActorIdentity", "const finalizationContext = useMemo(");
const oneStepAccept = sliceBetween(screen, "function acceptAnalysisCandidateInOneStep(", "function requestPrimaryCorrection()");
const submitFn = sliceBetween(finalizationHook, "const submit = useCallback(async () => {", "// MI-E-C5-R5-R1 one-step acceptance");
const retryPendingFn = sliceBetween(finalizationHook, "const retryPending = useCallback(async () => {", "const submit = useCallback(");

const mealPhotoScreen = read("apps/mobile/app/meal-photo.tsx");
const reconcileFn = sliceBetween(
  sessionStore,
  "export function commitAnalysisSessionActorOwnerReconciliation",
  "// Explicit \"start a brand-new analysis\" gesture"
);
// MI-E-C5-R5-R3: the pure render-time authority, sliced separately so purity can be asserted on
// exactly the code a render body is allowed to call.
const pureDeriveFn = sliceBetween(
  sessionStore,
  "export function deriveAnalysisSessionViewForActor",
  "// PURE render-time entry point"
);
const pureGetterFn = sliceBetween(
  sessionStore,
  "export function getAnalysisSessionViewForActor",
  "// ============================================================================================"
);
// The RENDER BODY proper: from the component opening to the first commit-phase hook. Everything
// after this point is effects/handlers, which are allowed to mutate.
const analysisRenderBody = sliceBetween(screen, "export default function AnalysisScreen() {", "  const [reconciledActorIdentity, setReconciledActorIdentity] = useState<string | null>(null);");
const analysisLayoutEffect = sliceBetween(screen, "  useLayoutEffect(() => {", "  }, [actorIdentity, currentAnalysisActor.actorGeneration");
const mealPhotoRenderBody0 = sliceBetween(mealPhotoScreen, "export default function MealPhotoScreen() {", "  useLayoutEffect(() => {");
const mealPhotoLayoutEffect = sliceBetween(mealPhotoScreen, "  useLayoutEffect(() => {", "  }, [captureActor.actorGeneration, captureActor.actorKey]);");
const pristineFn = sliceBetween(sessionStore, "export function isAnalysisSessionPristine", "export function isAnalysisSessionOwnedBy");
const beginCaptureFn = sliceBetween(sessionStore, "export function beginAnalysisCapture", "// Called only by the upload coordinator");

// --- Primary-first candidate presentation ---
check(
  // MI-E-C5-R5-R1 successor: the primary is the RANKED best match, never candidates[0]. The
  // fallback slice still starts at index 1 of the ranked list so the primary can never repeat.
  "1. the analysis response is split into exactly one primary best match plus fallbacks",
  /export function splitPrimaryAndFallbackCandidates/.test(flowState) &&
    /const ranked = rankMealPhotoAnalysisCandidates\(candidates\);/.test(flowState) &&
    /primary: ranked\[0\]/.test(flowState) &&
    /fallbacks: ranked\.slice\(1, 1 \+ MEAL_PHOTO_ANALYSIS_MAX_VISIBLE_FALLBACKS\)/.test(flowState)
);
check(
  "2. the result card renders the primary alone and only maps fallbacks behind the reveal branch",
  /\{primary \?/.test(resultCard) &&
    /!fallbackRevealed \?/.test(resultCard) &&
    resultCard.indexOf("fallbacks.map") > resultCard.indexOf("!fallbackRevealed ?")
);
check(
  // MI-E-C5-R5-R1 successor: adoption alone is no longer the behaviour. Accepting the primary must
  // route into the single one-step accept helper, which adopts AND finalizes in one gesture.
  "3. accepting the primary adopts the primary candidate and finalizes in one action",
  /function acceptPrimaryCandidate\(\)[\s\S]{0,240}acceptAnalysisCandidateInOneStep\(primaryCandidate\)/.test(screen) &&
    !/function acceptPrimaryCandidate\(\)[\s\S]{0,240}mealPhotoFinalization\.selectCandidate\(/.test(screen)
);
check(
  "4. rejecting the primary only reveals fallbacks and never submits",
  /function revealFallbackCandidates\(\)[\s\S]{0,240}setFallbackRevealed\(true\)/.test(screen) &&
    !/function revealFallbackCandidates\(\)[\s\S]{0,240}(submit\(\)|finalizeMealIdentification)/.test(screen)
);
check(
  "5. the fallback renderer is forward-compatible with up to three fallbacks",
  /MEAL_PHOTO_ANALYSIS_MAX_VISIBLE_FALLBACKS = 3/.test(flowState)
);
check(
  // The slice must start at index 1, so the primary can never also appear as a fallback, and no
  // array padding/filling construct may manufacture a fallback the response did not contain.
  "6. fallbacks are never padded or duplicated from the primary",
  /Never pads, never duplicates the primary/.test(flowState) &&
    /fallbacks: ranked\.slice\(1,/.test(flowState) &&
    !/(new Array\(|\.fill\(|padEnd\(|push\(primary)/.test(flowState)
);
check(
  "7. the current production ceiling is documented as 1-3 total, not 3 fallbacks",
  /MEAL_PHOTO_ANALYSIS_PRODUCTION_MAX_TOTAL_CANDIDATES = 3/.test(flowState) &&
    /at most 2 fallback candidates/i.test(flowState) &&
    /MEAL_PHOTO_ANALYSIS_MAX_CANDIDATES = 3/.test(sharedTypes) &&
    !/1 primary \+ 3 fallbacks?\b(?![\s\S]{0,200}forward)/i.test(flowState)
);
check(
  "8. manual entry is only offered inside the revealed-fallback branch",
  resultCard.indexOf("noneOfAboveCta") > resultCard.indexOf("fallbacks.map")
);
check(
  "9. candidate and manual still share exactly one finalization editor",
  (screen.match(/function MealPhotoFinalizationEditor/g) ?? []).length === 1 &&
    (screen.match(/<MealPhotoFinalizationEditor/g) ?? []).length === 1
);

// --- Restaurant display fallback (R3-A authority preserved) ---
check(
  // Compared against the RENDER position ({fields.map}), not the fields-array declaration, which
  // is hoisted to the top of the component. This mirrors the R3-A guard's own check.
  "10. restaurant name is displayed above meal name in the shared editor",
  screen.indexOf("copy.restaurantNameLabel") > 0 &&
    screen.indexOf("copy.restaurantNameLabel") < screen.indexOf("{fields.map((field) => {")
);
check(
  "11. restaurant display has no authority and shows the 未知 fallback",
  /restaurantNameUnknown: "未知"/.test(i18n) && /\{copy\.restaurantNameUnknown\}/.test(screen)
);

// --- Same-page completion ---
check(
  "12. CompletedAnalysisHero is reachable from a real C5 durable completion",
  /isDurableCompleted && completionSnapshot \?/.test(screen) &&
    /<CompletedAnalysisHero\s+completion=\{completionSnapshot\}/.test(screen)
);
check(
  "13. the completed hero is no longer permanently blocked by !hasAiFinalizationFlow",
  !/!hasAiFinalizationFlow && isAnalysisConfirmed \?\s*\(\s*<CompletedAnalysisHero[\s\S]{0,80}completion=\{completionSnapshot\}/.test(screen) &&
    /completion=\{completionSnapshot\}/.test(screen)
);
check(
  "14. C5 durable success does not navigate to Today Intake",
  !/router\.push\("\/today-intake"\)/.test(completeCallback) &&
    /setCompletionSnapshot\(snapshot\)/.test(completeCallback)
);
check(
  "15. legacy demo blocks are suppressed for the whole real C5 flow",
  /const showLegacyAnalysisBlocks = !hasAiFinalizationFlow && !isDurableCompleted;/.test(screen) &&
    (screen.match(/showLegacyAnalysisBlocks && !isAnalysisConfirmed \?/g) ?? []).length === 4
);
check(
  "16. completed nutrition comes from the confirmed draft snapshot, never legacy demo state",
  /nutritionSummary=\{completionSnapshot\.nutrition\}/.test(screen) &&
    /export function buildCompletedMealPhotoAnalysisSnapshot/.test(flowState) &&
    /draft\.submissionStatus !== "succeeded"/.test(flowState) &&
    /if \(!ids\) return null;/.test(flowState)
);
check(
  "17. the next-meal recommendation carousel renders inside the completed hero",
  /<NextMealRecommendationCarousel/.test(completedHero)
);
check(
  "18. completed actions perform no second finalization write",
  /completion \?[\s\S]{0,900}completedCopy\.viewTodayIntake/.test(completedHero) &&
    !/completion \?[\s\S]{0,900}analysisFlow\.saveMealRecord/.test(completedHero)
);

// --- Photo / editor integrity ---
check(
  // MI-E-C5-R5-R2: the photo still renders in both places, but only ever through the ownership
  // gate — the raw hook value must not reach any render site, because that hook snapshots the
  // session at mount and would keep showing a previous actor's photo across an in-place actor change.
  "19. the real captured photo still renders in the result area and in the completed state",
  (screen.match(/source=\{\{ uri: ownedCapturedImageUri \}\}/g) ?? []).length === 2 &&
    /const ownedCapturedImageUri = analysisSessionOwned \? analysis\.capturedImageUri : null;/.test(screen) &&
    (screen.match(/analysis\.capturedImageUri/g) ?? []).length === 1
);
check(
  "20. exactly one finalization editor definition remains",
  (screen.match(/function MealPhotoFinalizationEditor/g) ?? []).length === 1
);
check(
  "21. no duplicate analysis result card or duplicate preview component was introduced",
  (screen.match(/function MealPhotoAnalysisResultCard/g) ?? []).length === 1 &&
    (screen.match(/<MealPhotoAnalysisResultCard/g) ?? []).length === 1
);

// --- Frozen authority preserved ---
check(
  "22. R3-A canonical secure UUID authority is untouched",
  ["consumerMealIdentificationFinalizationRuntime.ts", "consumerMealWriteRuntime.ts", "consumerPlannedMealRuntime.ts"].every((file) =>
    /generateSecureUuidV4\(\)/.test(read(`apps/mobile/features/consumer-runtime/${file}`))
  ) && git(["diff", "--name-only", "--", "apps/mobile/features/consumer-runtime/secureUuidProvider.ts"]).stdout.trim() === ""
);
check(
  "23. R4 gallery cleanup authority is preserved and still fires on durable success",
  /void releaseOwnedGalleryMealPhotoAsset\(\)/.test(completeCallback) &&
    git(["diff", "--name-only", "--", "apps/mobile/features/analysis/galleryMealPhotoAssetNormalization.ts"]).stdout.trim() === ""
);
check(
  "24. R2 compact ceiling authority is unchanged",
  /MEAL_PHOTO_FINALIZATION_MAX_VISIBLE_CANDIDATES = 5/.test(readiness) &&
    git(["diff", "--name-only", "--", "apps/mobile/features/analysis/mealPhotoFinalizationReadiness.ts"]).stdout.trim() === ""
);

// --- Scope ---
const backendDiff = git(["diff", "--name-only", "--", "supabase", "packages/shared"]);
check("25. backend, migrations, Edge Functions and shared contracts are zero diff", backendDiff.status === 0 && backendDiff.stdout.trim() === "");
const routeFiles = git(["ls-files", "--others", "--exclude-standard", "--", "apps/mobile/app"]);
check("26. no new route was added", routeFiles.status === 0 && routeFiles.stdout.trim() === "");
check(
  "27. no new dependency was added",
  git(["diff", "--name-only", "--", "apps/mobile/package.json", "package-lock.json"]).stdout.trim() === "" &&
    !mobilePackage.dependencies?.["react-native-image-resizer"]
);
check(
  "28. the completion snapshot is persisted through the existing analysis session store",
  /mealPhotoCompletion: CompletedMealPhotoAnalysisSnapshot \| null;/.test(sessionStore) &&
    /export function setMealPhotoCompletion/.test(sessionStore) &&
    /mealPhotoFallbackRevealed: boolean;/.test(sessionStore)
);
const staged = git(["diff", "--cached", "--name-only"]);
check("29. nothing is staged", staged.status === 0 && staged.stdout.trim() === "");
check(
  "30. no physical-device PASS claim is made in the R5 candidate source",
  !/physical[^\n]{0,40}PASS/i.test(screen) && !/physical[^\n]{0,40}PASS/i.test(flowState)
);

// =====================================================================================
// MI-E-C5-R5-R1 — primary ranking, actor isolation, one-step confirmation
// =====================================================================================

// --- Confidence-ranked primary selection ---
check(
  "31. the primary is chosen by confidence ranking, not by array position",
  /export function rankMealPhotoAnalysisCandidates/.test(flowState) &&
    /right\.candidate\.confidence - left\.candidate\.confidence/.test(rankFn) &&
    /left\.originalIndex - right\.originalIndex/.test(rankFn)
);
check(
  // The transport guarantees no ordering: the provider prompt, the Edge Function schema and all
  // three validators are silent on it. That reasoning must stay recorded next to the ranking.
  "32. the absence of any transport ordering guarantee is documented at the ranking site",
  /does NOT guarantee candidate ordering/.test(flowState) &&
    /array position is not a best-match authority/.test(flowState) &&
    /contract-backed ranking signal/.test(flowState)
);
check(
  "33. no R5 module treats candidates[0] or an unranked first entry as the best match",
  !/candidates\[0\]/.test(flowState) &&
    !/analysisCandidates\[0\]/.test(screen) &&
    !/\.analysisCandidates\.at\(0\)/.test(screen)
);
check(
  // Decorate-sort-undecorate on a fresh array. The parameter is `readonly T[]` and `.map()` runs
  // before `.sort()`, so the caller's array is never reordered in place.
  "34. ranking never mutates the provider array and returns the original candidate objects",
  /candidates\s*\r?\n?\s*\.map\(\(candidate, originalIndex\) => \(\{ candidate, originalIndex \}\)\)/.test(rankFn) &&
    /\.map\(\(entry\) => entry\.candidate\)/.test(rankFn) &&
    /candidates: readonly T\[\]/.test(rankFn) &&
    /input array is never mutated/.test(flowState)
);
check(
  "35. ranking never regenerates or reassigns a server-assigned candidateId",
  !/candidateId\s*:/.test(rankFn) &&
    !/candidateId\s*=/.test(rankFn) &&
    /server-assigned candidateIds\) are returned/.test(flowState)
);
check(
  "36. the screen consumes primary/fallbacks only from the ranked split",
  /const \{ primary: primaryCandidate, fallbacks: fallbackCandidates \} = useMemo\(/.test(screen) &&
    /splitPrimaryAndFallbackCandidates\(getCompactMealPhotoFinalizationCandidates\(/.test(screen)
);

// --- Actor identity isolation (reuses the established actorKey/actorGeneration pattern) ---
check(
  // MI-E-C5-R5-R2: the screen now reads the frozen runtime pair exactly once, into
  // currentAnalysisActor, and BOTH the session-ownership authority and the R5-R1 identity string
  // derive from that single value — so they can never disagree.
  "37. the screen derives actor identity from the established actorKey/actorGeneration pair",
  /export function buildMealPhotoAnalysisActorIdentity/.test(flowState) &&
    /\$\{input\.actorKey \?\? ""\}:\$\{input\.actorGeneration\}/.test(flowState) &&
    /const currentAnalysisActor = \{\s*\r?\n?\s*actorKey: consumerRuntime\.state\.actorKey,\s*\r?\n?\s*actorGeneration: consumerRuntime\.state\.actorGeneration\s*\r?\n?\s*\};/.test(screen) &&
    /const actorIdentity = buildMealPhotoAnalysisActorIdentity\(currentAnalysisActor\);/.test(screen) &&
    /const sessionOwnership = getAnalysisSessionViewForActor\(currentAnalysisActor\);/.test(screen)
);
check(
  "38. an actor identity change clears both the local and the stored R5 completion state",
  /CLEARED_MEAL_PHOTO_ANALYSIS_ACTOR_STATE/.test(actorIsolationEffect) &&
    /setCompletionSnapshot\(cleared\.completion\);/.test(actorIsolationEffect) &&
    /setMealPhotoCompletion\(cleared\.completion\);/.test(actorIsolationEffect) &&
    /setFallbackRevealed\(cleared\.fallbackRevealed\);/.test(actorIsolationEffect) &&
    /setMealPhotoFallbackRevealed\(cleared\.fallbackRevealed\);/.test(actorIsolationEffect) &&
    /setCorrectionRequested\(cleared\.correctionRequested\);/.test(actorIsolationEffect) &&
    /completion: null,\s*\r?\n?\s*fallbackRevealed: false,\s*\r?\n?\s*correctionRequested: false/.test(flowState)
);
check(
  // Same-actor rerender, HMR, background → foreground and silent token refresh all leave both
  // fields untouched, so the early return is the entire no-op path.
  // MI-E-C5-R5-R3: the reset moved into the commit-phase layout effect. The predicate is unchanged
  // and still the thing that keeps a same-actor rerender/HMR/token-refresh from clearing anything.
  "39. the isolation effect no-ops unless the identity actually changed",
  /export function shouldResetMealPhotoAnalysisStateForActor/.test(flowState) &&
    /return previousIdentity !== nextIdentity;/.test(flowState) &&
    /shouldResetMealPhotoAnalysisStateForActor\(previousActorIdentityRef\.current, actorIdentity\) \|\| decision\.exposesSanitizedView/.test(analysisLayoutEffect) &&
    /\}, \[actorIdentity, currentAnalysisActor\.actorGeneration, currentAnalysisActor\.actorKey\]\);/.test(screen)
);
check(
  "40. the first mount cannot erase a valid same-actor session",
  /const previousActorIdentityRef = useRef\(actorIdentity\);/.test(screen)
);
check(
  // Exactly one runtime read of each field exists in the screen (the isolation identity), and the
  // frozen hook-level guard still reads the same pair. No parallel identity source was added.
  "41. no second identity system was introduced alongside the frozen one",
  /shared READER of the actorKey\/actorGeneration pair/.test(flowState) &&
    /not a second identity\r?\n?\/\/ system/.test(flowState) &&
    /const identity = `\$\{runtime\.state\.actorKey \?\? ""\}:\$\{runtime\.state\.actorGeneration\}/.test(finalizationHook) &&
    (screen.match(/consumerRuntime\.state\.actorGeneration/g) ?? []).length === 1 &&
    (screen.match(/consumerRuntime\.state\.actorKey/g) ?? []).length === 1
);

// --- One-step atomic acceptance ---
check(
  "42. the finalization hook exposes a single-call accept that both adopts and submits",
  /const acceptCandidate = useCallback\(/.test(finalizationHook) &&
    /acceptCandidate,/.test(finalizationHook) &&
    /prepareMealPhotoFinalization\(\s*base,/.test(acceptCandidateFn) &&
    /await runtime\.finalizeMealIdentification\(prepared\.draft\)/.test(acceptCandidateFn)
);
check(
  // The submitted payload is derived from `base`, a local value, never re-read from React state
  // between adoption and submission — so acceptance cannot depend on a state flush.
  "43. one-step acceptance never re-reads the draft from state between adopt and submit",
  /const base =/.test(acceptCandidateFn) &&
    !/draftRef\.current/.test(acceptCandidateFn.slice(acceptCandidateFn.indexOf("const base ="))) &&
    /built and submitted from the SAME local value/.test(finalizationHook)
);
check(
  "44. one-step acceptance is protected by the frozen single-flight gate",
  /if \(!gateRef\.current\.tryStart\(\)\) return;/.test(acceptCandidateFn) &&
    /gateRef\.current\.finish\(\);/.test(acceptCandidateFn) &&
    /finally \{\s*\r?\n?\s*gateRef\.current\.finish\(\);/.test(acceptCandidateFn)
);
check(
  "45. one-step acceptance keeps the R3-A secure-UUID exception boundary",
  /try \{\s*\r?\n?\s*prepared = prepareMealPhotoFinalization\(/.test(acceptCandidateFn) &&
    /lastSafeError: "finalization_client_error"/.test(acceptCandidateFn)
);
check(
  "46. one-step acceptance reuses the same clientRequestId when re-accepting the same candidate",
  /existing\.selectedCandidateId === candidate\.candidateId/.test(acceptCandidateFn) &&
    /updateMealPhotoFinalizationContext\(/.test(acceptCandidateFn)
);
check(
  "47. both the primary CTA and every fallback row route through the one-step accept",
  /onAcceptPrimary=\{acceptPrimaryCandidate\}/.test(screen) &&
    /onAcceptFallback=\{acceptAnalysisCandidateInOneStep\}/.test(screen) &&
    /onSelect=\{acceptBlocked \? undefined : \(\) => onAcceptFallback\(candidate\)\}/.test(resultCard) &&
    /void mealPhotoFinalization\.acceptCandidate\(candidate\)/.test(oneStepAccept)
);
check(
  "48. one-step acceptance does not navigate away from /analysis",
  !/router\.push/.test(oneStepAccept) && !/router\.push/.test(acceptCandidateFn)
);
check(
  // The only remaining 加入今日飲食 submit CTA lives inside the editor, which the accept path
  // never opens — so accepting a result is never followed by a second standalone save press.
  "49. no second standalone save step exists on the acceptance path",
  (screen.match(/copy\.submitCta/g) ?? []).length === 1 &&
    sliceBetween(screen, "function MealPhotoFinalizationEditor", "function MealPhotoAnalysisCandidateRow").includes("copy.submitCta") &&
    !resultCard.includes("submitCta")
);

// --- Editor gating and missing-context behaviour ---
check(
  "50. the shared editor renders only on explicit correction, manual input, or failure recovery",
  /const showFinalizationEditor =[\s\S]{0,400}correctionRequested \|\|[\s\S]{0,200}mode === "manual" \|\|[\s\S]{0,200}submissionStatus === "failed"/.test(screen) &&
    /\{showFinalizationEditor && mealPhotoFinalization\.draft \?/.test(screen)
);
check(
  "51. only explicit correction and manual choices open the editor",
  /function requestPrimaryCorrection\(\)[\s\S]{0,320}setCorrectionRequested\(true\);/.test(screen) &&
    /function chooseManualMealInput\(\)[\s\S]{0,320}setCorrectionRequested\(true\);/.test(screen) &&
    !/function acceptAnalysisCandidateInOneStep\([\s\S]{0,400}setCorrectionRequested\(true\)/.test(screen)
);
check(
  // Every session-reset path (new capture, new analysis request, actor change) clears the draft via
  // the frozen identity guard; tying the correction request to that clears it on all of them at once.
  "56. a correction request never outlives the draft it belongs to",
  /if \(mealPhotoFinalization\.draft === null\) setCorrectionRequested\(false\);/.test(screen) &&
    /\}, \[mealPhotoFinalization\.draft\]\);/.test(screen)
);
check(
  "52. missing context blocks acceptance and offers compact inline controls in the result card",
  /const finalizationContextBlockReason = getMealPhotoFinalizationContextBlockReason\(\{/.test(screen) &&
    /if \(finalizationContextBlockReason !== null\) return;/.test(oneStepAccept) &&
    /const acceptBlocked = payloadLocked \|\| contextBlockReason !== null;/.test(resultCard) &&
    /\{contextBlockLabel \?/.test(resultCard) &&
    /\{contextControls\}/.test(resultCard)
);
check(
  // The compact controls exist so the long standalone cards are not the only way to unblock; those
  // standalone cards are now scoped to the legacy non-C5 path only.
  "53. the long standalone context cards no longer render in the real C5 flow",
  /\) : !hasAiFinalizationFlow \? \(/.test(screen) &&
    /standalone cards belong to the legacy non-C5 path only/.test(screen) &&
    /showFinalizationEditor \? null : \(/.test(screen)
);
check(
  '54. "unknown" remains an accepted meal source and is never treated as missing context',
  /"unknown"\s*\r?\n?\s*\]\);/.test(readiness) &&
    /"unknown" is an accepted meal source/.test(screen)
);
check(
  "55. the acceptance copy honestly states that the gesture saves the meal immediately",
  /acceptPrimaryNote: "按「分析正確」會直接確認並保存這一餐。"/.test(i18n) &&
    /fallbackActionNote: "點選其中一個結果就會直接確認並保存這一餐。"/.test(i18n) &&
    /\{primaryCopy\.acceptPrimaryNote\}/.test(resultCard) &&
    /\{primaryCopy\.fallbackActionNote\}/.test(resultCard)
);

// ===========================================================================================
// MI-E-C5-R5-R2 — actor-owned analysis session, remount isolation and asset cleanup
//
// Every check below reads PRODUCTION source. Comment text is only ever ANDed with a real code
// assertion, so no check can pass on documentation alone.
// ===========================================================================================

check(
  "57. the analysis session state carries canonical owner metadata",
  /export type AnalysisSessionActorOwner = Readonly<\{\s*\r?\n?\s*actorKey: string;\s*\r?\n?\s*actorGeneration: number;\s*\r?\n?\s*\}>;/.test(sessionStore) &&
    /actorOwner: AnalysisSessionActorOwner \| null;/.test(sessionStore) &&
    /function createDefaultSession\(\): AnalysisSessionState \{\s*\r?\n?\s*return \{\s*\r?\n?\s*actorOwner: null,/.test(sessionStore)
);
check(
  // Not a second user-ID system: the owner is literally the frozen consumer-runtime pair.
  "58. session ownership is the frozen actorKey/actorGeneration pair, not a new identity system",
  /export function isAnalysisSessionOwnedBy/.test(sessionStore) &&
    /owner\.actorKey === actor\.actorKey && owner\.actorGeneration === actor\.actorGeneration/.test(sessionStore) &&
    /if \(!actor\.actorKey\) return false;/.test(sessionStore) &&
    !/getCurrentUserId|localStorage|AsyncStorage/.test(sessionStore)
);
check(
  // "No owner" is never evidence the data belongs to whoever mounts next.
  "59. an ownerless but non-pristine session fails closed: reset first, then bind",
  /if \(!owner\) \{\s*\r?\n?\s*releaseThenReset\(dependencies\);\s*\r?\n?\s*session = \{ \.\.\.session, actorOwner: nextOwner \};/.test(reconcileFn) &&
    /"reset_untrusted_and_bound"/.test(reconcileFn) &&
    /if \(!owner && isAnalysisSessionPristine\(session\)\)/.test(reconcileFn)
);
check(
  "60. a different owner triggers a full session reset and rebind",
  /releaseThenReset\(dependencies\);\s*\r?\n?\s*session = \{ \.\.\.session, actorOwner: nextOwner \};\s*\r?\n?\s*actorOwnerEpochCounter \+= 1;\s*\r?\n?\s*return \{ status: "reset_different_actor_and_bound"/.test(reconcileFn)
);
check(
  "61. a signed-out or failed-restore runtime clears the session and leaves it ownerless",
  /if \(!actor\.actorKey\) \{/.test(reconcileFn) &&
    /releaseThenReset\(dependencies\);[\s\S]{0,160}return \{ status: "cleared_signed_out", owner: null/.test(reconcileFn)
);
check(
  "62. the same owner preserves the in-progress session and mutates nothing",
  /if \(owner && owner\.actorKey === nextOwner\.actorKey && owner\.actorGeneration === nextOwner\.actorGeneration\) \{\s*\r?\n?\s*return \{ status: "preserved", owner, epoch: actorOwnerEpochCounter, releasedOwnedGalleryAsset: false \};/.test(reconcileFn)
);
check(
  // Same actorKey at a new actorGeneration (re-auth / sign-out-sign-in) is an identity change: it
  // falls through the same-owner branch above and lands in the different-actor reset.
  "63. a generation change with an unchanged actorKey is treated as an identity change",
  /owner\.actorGeneration === nextOwner\.actorGeneration/.test(reconcileFn) &&
    reconcileFn.indexOf('status: "reset_different_actor_and_bound"') > reconcileFn.indexOf("owner.actorGeneration === nextOwner.actorGeneration")
);
check(
  // MI-E-C5-R5-R3 REPLACES the R5-R2 form of this check. The old spelling demanded that the
  // MUTATING reconcile run during render before the hooks — i.e. it encoded the render-phase side
  // effect as a requirement. The invariant that actually matters is preserved and now correct: the
  // PURE safe-view derivation happens before every session read, and the hooks consume that view.
  "64. the pure ownership derivation precedes every session read and feeds all of them",
  /const sessionOwnership = getAnalysisSessionViewForActor\(currentAnalysisActor\);/.test(screen) &&
    /const ownershipSafeSession = sessionOwnership\.session;/.test(screen) &&
    screen.indexOf("const sessionOwnership = getAnalysisSessionViewForActor(") < screen.indexOf("const analysis = useAnalysisCorrectionState(ownershipSafeSession);") &&
    screen.indexOf("const sessionOwnership = getAnalysisSessionViewForActor(") < screen.indexOf("const mealPhotoUpload = useMealPhotoUpload(ownershipSafeSession);") &&
    screen.indexOf("const sessionOwnership = getAnalysisSessionViewForActor(") < screen.indexOf("const session = ownershipSafeSession;") &&
    screen.indexOf("const sessionOwnership = getAnalysisSessionViewForActor(") < screen.indexOf("useMealPhotoFinalization({")
);
check(
  // MI-E-C5-R5-R3: the render-phase setState is GONE. The gate is now a pure derivation from the
  // ownership status, so an actor change is fail-closed on the first committed render with no
  // side effect of any kind.
  "65. an owner change absorbed while mounted cannot render the previous owner's completion",
  /const analysisSessionOwned = sessionOwnership\.status === "owned";/.test(screen) &&
    /const completionSnapshot = analysisSessionOwned \? completionSnapshotState : null;/.test(screen) &&
    /const fallbackRevealed = analysisSessionOwned \? fallbackRevealedState : false;/.test(screen) &&
    /const correctionRequested = analysisSessionOwned \? correctionRequestedState : false;/.test(screen) &&
    !/setRenderedOwnerEpoch/.test(screen)
);
check(
  "66. the captured photo is rendered only through the ownership gate",
  /const analysisSessionOwned = sessionOwnership\.status === "owned";/.test(screen) &&
    /const ownedCapturedImageUri = analysisSessionOwned \? analysis\.capturedImageUri : null;/.test(screen) &&
    (screen.match(/analysis\.capturedImageUri/g) ?? []).length === 1
);
check(
  "67. the finalization draft is restored only when the session is owned by exactly this actor",
  /const restorableDraft = isAnalysisSessionOwnedBy\(initialSession, \{\s*\r?\n?\s*actorKey: runtime\.state\.actorKey,\s*\r?\n?\s*actorGeneration: runtime\.state\.actorGeneration\s*\r?\n?\s*\}\)\s*\r?\n?\s*\? initialSession\.mealPhotoFinalizationDraft\s*\r?\n?\s*: null;/.test(finalizationHook) &&
    /useState<MealPhotoFinalizationDraftState \| null>\(restorableDraft\)/.test(finalizationHook) &&
    !/useState<MealPhotoFinalizationDraftState \| null>\(\s*\r?\n?\s*initialSession\.mealPhotoFinalizationDraft/.test(finalizationHook)
);
check(
  // The frozen submission (clientRequestId + payload fingerprint) is seeded from the SAME
  // ownership-gated value, so a previous actor's request identity can never be adopted.
  "68. a previous owner's clientRequestId and frozen submission cannot be adopted",
  /const initialFrozenState =\s*\r?\n?\s*restorableDraft\?\.attempted && restorableDraft\.clientRequestId \? restorableDraft : null;/.test(finalizationHook) &&
    !/initialSession\.mealPhotoFinalizationDraft\?\.attempted/.test(finalizationHook)
);
check(
  "69. a new capture is stamped with the actor that captured it",
  /owner: AnalysisSessionActorOwner \| null = null/.test(beginCaptureFn) &&
    /session\.actorOwner = owner;/.test(beginCaptureFn) &&
    /beginAnalysisCapture\(method, imageUri, capturedAt, mimeType, fileName, captureSessionOwnership\.owner\);/.test(mealPhotoScreen) &&
    /const captureSessionOwnership = getAnalysisSessionViewForActor\(captureActor\);/.test(mealPhotoScreen) &&
    /resetAnalysisSessionForActor\(captureActor, ANALYSIS_SESSION_OWNER_DEPENDENCIES\)/.test(mealPhotoScreen)
);
check(
  // Release BEFORE the reset and before any new owner can register a replacement asset, and a
  // throwing release must still leave the session cleared — hence the finally.
  "70. an actor change releases the owned gallery cache before clearing and rebinding",
  /function releaseThenReset\(dependencies: AnalysisSessionActorOwnerDependencies\) \{[\s\S]{0,400}?try \{\s*\r?\n?\s*dependencies\.releaseOwnedGalleryAsset\(\);\s*\r?\n?\s*\} catch \{[\s\S]{0,300}?\} finally \{\s*\r?\n?\s*session = createDefaultSession\(\);\s*\r?\n?\s*\}/.test(sessionStore) &&
    (sessionStore.match(/releaseThenReset\(dependencies\);/g) ?? []).length === 4 &&
    /releaseOwnedGalleryAsset: \(\) => \{\s*\r?\n?\s*void releaseOwnedGalleryMealPhotoAsset\(\);/.test(screen)
);
check(
  // Not just the three R5 fields the R5-R1 audit found leaking through: the photo, the object ref,
  // the upload state, the request id, the candidates and the draft are all part of "sensitive".
  "71. the pristine check covers the full sensitive session, not only the R5 completion",
  [
    "state.capturedImageUri === null",
    "state.imageObjectRef === null",
    'state.uploadStatus === "not_started"',
    "state.analysisRequestId === null",
    'state.analysisInvocationStatus === "not_started"',
    "state.analysisCandidates.length === 0",
    "state.selectedCandidateId === null",
    "state.mealPhotoFinalizationDraft === null",
    "state.mealPhotoFallbackRevealed === false",
    "state.mealPhotoCompletion === null"
  ].every((fragment) => pristineFn.includes(fragment)) &&
    // A full reset means a brand-new default session, never a hand-picked subset of fields.
    /session = createDefaultSession\(\);/.test(sessionStore)
);
check(
  "72. the frozen in-flight stale-response guard is preserved intact",
  /!mountedRef\.current \|\|\s*\r?\n?\s*expectedIdentity !== identityRef\.current \|\|\s*\r?\n?\s*getAnalysisSession\(\)\.analysisRequestId !== frozen\.state\.analysisRequestId \|\|\s*\r?\n?\s*frozenSubmissionRef\.current !== frozen \|\|\s*\r?\n?\s*!current \|\|\s*\r?\n?\s*getMealPhotoFinalizationPayloadFingerprint\(current\) !== frozen\.fingerprint/.test(finalizationHook) &&
    /const expectedIdentity = identityRef\.current;/.test(finalizationHook)
);
check(
  // The R5-R1 audit flagged this comment as restating the exact belief that caused the defect.
  "73. the stale \"first entry is the primary best match\" claim is gone",
  !/first entry is the primary best match/i.test(flowState) &&
    /guarantees NO ordering/.test(flowState) &&
    /export function rankMealPhotoAnalysisCandidates/.test(flowState)
);
check(
  "74. the session store stays free of platform imports so ownership stays testable",
  !/from "expo-|from "react-native"|from "react"/.test(sessionStore) &&
    /export type AnalysisSessionActorOwnerDependencies = Readonly<\{\s*\r?\n?\s*releaseOwnedGalleryAsset: \(\) => void;\s*\r?\n?\s*\}>;/.test(sessionStore)
);
check(
  "75. no route, dependency or backend surface was added for ownership",
  !/router\.push\("\/[a-z-]*owner/.test(screen) &&
    Object.keys(mobilePackage.dependencies ?? {}).length === MI_E_C5_R5_EXPECTED_MOBILE_DEPENDENCY_COUNT &&
    git(["diff", "--name-only", "--", "supabase", "packages/shared"]).stdout.trim() === ""
);


// ===========================================================================================
// MI-E-C5-R5-R3 — render-safe two-layer ownership. Every check reads production source.
// ===========================================================================================
const MUTATING_STORE_CALLS = [
  "commitAnalysisSessionActorOwnerReconciliation(",
  "resetAnalysisSessionForActor(",
  "resetAnalysisSession(",
  "beginAnalysisCapture(",
  "setMealPhotoCompletion(",
  "setMealPhotoFallbackRevealed(",
  "setMealPhotoFinalizationDraft(",
  "releaseOwnedGalleryMealPhotoAsset("
];

check(
  "76. a pure render-time safe-session authority exists and is the documented render entry point",
  /export function deriveAnalysisSessionViewForActor\(/.test(sessionStore) &&
    /export function getAnalysisSessionViewForActor\(/.test(sessionStore) &&
    /export function createSanitizedAnalysisSessionView\(\): AnalysisSessionState/.test(sessionStore) &&
    /export type AnalysisSessionOwnershipDecision = Readonly<\{/.test(sessionStore) &&
    Boolean(pureDeriveFn) && Boolean(pureGetterFn)
);
check(
  "77. the pure authority never assigns to the module session or the epoch counter",
  !/\bsession = /.test(pureDeriveFn) &&
    !/\bsession = /.test(pureGetterFn) &&
    !/actorOwnerEpochCounter/.test(pureDeriveFn) &&
    !/actorOwnerEpochCounter/.test(pureGetterFn)
);
check(
  "78. the pure authority never invokes the gallery cleanup dependency",
  !/releaseOwnedGalleryAsset/.test(pureDeriveFn) &&
    !/releaseThenReset/.test(pureDeriveFn) &&
    !/releaseOwnedGalleryAsset/.test(pureGetterFn) &&
    !/releaseThenReset/.test(pureGetterFn) &&
    // it does not even accept a dependencies argument, so it cannot be handed one
    !/dependencies/.test(pureDeriveFn)
);
check(
  "79. the pure authority creates no Promise and performs no async work or I/O",
  !/await |async |Promise|then\(|\.catch\(|setTimeout|fetch\(/.test(pureDeriveFn) &&
    !/await |async |Promise|then\(|\.catch\(|setTimeout|fetch\(/.test(pureGetterFn)
);
check(
  "80. AnalysisScreen's render body calls ONLY the pure authority",
  /const sessionOwnership = getAnalysisSessionViewForActor\(currentAnalysisActor\);/.test(analysisRenderBody) &&
    MUTATING_STORE_CALLS.every((call) => !analysisRenderBody.includes(call))
);
check(
  "81. MealPhotoScreen's render body calls ONLY the pure authority",
  /const captureSessionOwnership = getAnalysisSessionViewForActor\(captureActor\);/.test(mealPhotoRenderBody0) &&
    MUTATING_STORE_CALLS.every((call) => !mealPhotoRenderBody0.includes(call))
);
check(
  "82. the mutating reconciliation only ever runs in a commit-phase layout effect",
  /commitAnalysisSessionActorOwnerReconciliation\(currentAnalysisActor, ANALYSIS_SESSION_OWNER_DEPENDENCIES\);/.test(analysisLayoutEffect) &&
    /commitAnalysisSessionActorOwnerReconciliation\(captureActor, ANALYSIS_SESSION_OWNER_DEPENDENCIES\);/.test(mealPhotoLayoutEffect) &&
    // exactly one call site per screen, and both inside useLayoutEffect
    (screen.match(/commitAnalysisSessionActorOwnerReconciliation\(/g) ?? []).length === 1 &&
    (mealPhotoScreen.match(/commitAnalysisSessionActorOwnerReconciliation\(/g) ?? []).length === 1 &&
    /useLayoutEffect\(\(\) => \{/.test(screen) &&
    /useLayoutEffect\(\(\) => \{/.test(mealPhotoScreen)
);
check(
  "83. no gallery cleanup can be reached from either render body",
  !analysisRenderBody.includes("releaseOwnedGalleryMealPhotoAsset(") &&
    !mealPhotoRenderBody0.includes("releaseOwnedGalleryMealPhotoAsset(") &&
    !analysisRenderBody.includes("ANALYSIS_SESSION_OWNER_DEPENDENCIES") &&
    !mealPhotoRenderBody0.includes("ANALYSIS_SESSION_OWNER_DEPENDENCIES")
);
check(
  "84. the mutating store API is namespaced so a render caller cannot reach it by habit",
  /export function commitAnalysisSessionActorOwnerReconciliation/.test(sessionStore) &&
    !/export function reconcileAnalysisSessionActorOwner\b/.test(sessionStore) &&
    /LAYER 2 — COMMIT-PHASE RECONCILIATION \(MUTATING\)/.test(sessionStore) &&
    /LAYER 1 — PURE RENDER-TIME OWNERSHIP AUTHORITY/.test(sessionStore)
);
check(
  "85. a different owner is handed a sanitized empty view, never the raw session",
  /status: "different_actor",\s*\r?\n?\s*session: createSanitizedAnalysisSessionView\(\),/.test(pureDeriveFn)
);
check(
  "86. a signed-out or failed-restore runtime is handed a sanitized empty view",
  /if \(!actor\.actorKey\) \{[\s\S]{0,400}?session: alreadyClean \? state : createSanitizedAnalysisSessionView\(\),/.test(pureDeriveFn) &&
    /status: "signed_out"/.test(pureDeriveFn)
);
check(
  "87. an ownerless non-pristine session is handed a sanitized empty view",
  /status: "untrusted",\s*\r?\n?\s*session: createSanitizedAnalysisSessionView\(\),/.test(pureDeriveFn) &&
    /if \(!owner && isAnalysisSessionPristine\(state\)\)/.test(pureDeriveFn)
);
check(
  "88. only the true owner is handed the real session",
  /status: "owned",\s*\r?\n?\s*session: state,\s*\r?\n?\s*reconciliationRequired: false,/.test(pureDeriveFn)
);
check(
  "89. all four session-reading hooks take the ownership-safe view for their FIRST read",
  /export function useAnalysisCorrectionState\(initialSession: AnalysisSessionState = getAnalysisSession\(\)\)/.test(correctionStateHook) &&
    /export function useMealPhotoUpload\(ownershipSafeSession: AnalysisSessionState = getAnalysisSession\(\)\)/.test(uploadHook) &&
    /ownershipSafeSession: AnalysisSessionState = getAnalysisSession\(\)\): MealPhotoAnalysisUiState/.test(analysisHook) &&
    /const initialSession = input\.ownershipSafeSession \?\? getAnalysisSession\(\);/.test(finalizationHook)
);
check(
  "90. the screen passes the safe view to every one of those hooks",
  /useAnalysisCorrectionState\(ownershipSafeSession\)/.test(screen) &&
    /useMealPhotoUpload\(ownershipSafeSession\)/.test(screen) &&
    /useMealPhotoAnalysis\(mealPhotoUpload\.uploadStatus, mealPhotoUpload\.imageObjectRef, ownershipSafeSession\)/.test(screen) &&
    /ownershipSafeSession\s*\r?\n?\s*\}\);/.test(screen)
);
check(
  "91. the screen's own local initializers read the safe view, never the raw store",
  /const session = ownershipSafeSession;/.test(screen) &&
    (screen.match(/getAnalysisSession\(\)/g) ?? []).length === 0
);
check(
  "92. completion, fallback and photo initial reads all come from the safe view",
  /useState\(session\.mealPhotoFallbackRevealed\)/.test(screen) &&
    /useState<CompletedMealPhotoAnalysisSnapshot \| null>\(\s*\r?\n?\s*session\.mealPhotoCompletion\s*\r?\n?\s*\)/.test(screen) &&
    /const ownedCapturedImageUri = analysisSessionOwned \? analysis\.capturedImageUri : null;/.test(screen)
);
check(
  "93. the finalization draft initial read stays ownership-gated",
  /const restorableDraft = isAnalysisSessionOwnedBy\(initialSession, \{/.test(finalizationHook) &&
    /useState<MealPhotoFinalizationDraftState \| null>\(restorableDraft\)/.test(finalizationHook)
);
check(
  "94. interactions are blocked until commit-phase reconciliation has bound this actor",
  /const sessionReconciled = reconciledActorIdentity === actorIdentity && analysisSessionOwned;/.test(screen) &&
    /function acceptAnalysisCandidateInOneStep\([\s\S]{0,400}?if \(!sessionReconciled\) return;/.test(screen) &&
    /const captureSessionReconciled = captureReconciledActor === /.test(mealPhotoScreen) &&
    /function startAiAnalysis\(\) \{\s*\r?\n?\s*if \(!captureSessionReconciled\) return;/.test(mealPhotoScreen) &&
    /async function openCamera\(\) \{\s*\r?\n?\s*if \(!captureSessionReconciled \|\| isRequestingMedia\) return;/.test(mealPhotoScreen) &&
    /async function uploadFromGallery\(\) \{\s*\r?\n?\s*if \(!captureSessionReconciled \|\| isRequestingMedia\) return;/.test(mealPhotoScreen)
);
check(
  "95. mealId and preMealPhotoIds are clearable actor-scoped local state",
  /const \[mealId, setMealId\] = useState\(/.test(screen) &&
    /const \[preMealPhotoIds, setPreMealPhotoIds\] = useState\(/.test(screen)
);
check(
  "96. an actor change replaces the local residue with fresh actor-scoped values",
  /setMealId\(generateMealId\(\)\);/.test(analysisLayoutEffect) &&
    /setPreMealPhotoIds\(\[generatePhotoId\("pre"\)\]\);/.test(analysisLayoutEffect)
);
check(
  "97. the guilt-share handler carries its own ownership authority, not just hidden UI",
  /function handleGuiltSharingConfirm\(result: \{ peopleCount: number; sharedCaloriesPerPerson: number \}\) \{[\s\S]{0,500}?if \(!sessionReconciled\) return;/.test(screen) &&
    screen.indexOf("if (!sessionReconciled) return;", screen.indexOf("function handleGuiltSharingConfirm")) <
      screen.indexOf("updateMealRecordByMealId(mealId", screen.indexOf("function handleGuiltSharingConfirm"))
);
check(
  "98. the legacy explicit finalization handler carries its own ownership authority",
  /async function finalizeMealIdentificationFromExplicitGesture\(\) \{[\s\S]{0,400}?if \(!sessionReconciled\) return;/.test(screen) &&
    screen.indexOf("if (!sessionReconciled) return;", screen.indexOf("async function finalizeMealIdentificationFromExplicitGesture")) <
      screen.indexOf("preMealPhotoIds,", screen.indexOf("async function finalizeMealIdentificationFromExplicitGesture"))
);
check(
  "99. the session write-back still only runs for a reconciled, owned session",
  /if \(!analysisSessionOwned \|\| !sessionReconciled\) return;\s*\r?\n?\s*session\.mealSaved = mealSaved;/.test(screen)
);
check(
  // R4's authority is unchanged: cleanup is best effort, never blocks navigation, take-and-null.
  "100. the R4 owned-cache cleanup authority is preserved and now commit-phase only",
  /function releaseThenReset\(dependencies: AnalysisSessionActorOwnerDependencies\)/.test(sessionStore) &&
    /\} finally \{\s*\r?\n?\s*session = createDefaultSession\(\);/.test(sessionStore) &&
    /export async function releaseOwnedGalleryMealPhotoAsset\(\): Promise<void> \{\s*\r?\n?\s*const owned = ownedNormalizedAsset;\s*\r?\n?\s*ownedNormalizedAsset = null;/.test(galleryNormalization)
);
check(
  "101. no backend/shared diff, no new dependency and no physical-device claim for R5-R3",
  git(["diff", "--name-only", "--", "supabase", "packages/shared"]).stdout.trim() === "" &&
    Object.keys(mobilePackage.dependencies ?? {}).length === MI_E_C5_R5_EXPECTED_MOBILE_DEPENDENCY_COUNT &&
    !/physical[^\n]{0,40}PASS/i.test(screen) &&
    !/physical[^\n]{0,40}PASS/i.test(mealPhotoScreen) &&
    !/physical[^\n]{0,40}PASS/i.test(sessionStore)
);


// ===========================================================================================
// MI-E-C5-R5-R4 — mounted-actor hook-state isolation and submission guards.
// ===========================================================================================
check(
  "102. useMealPhotoAnalysis owns its local mirrors with the frozen actor pair",
  /const actorIdentity = buildMealPhotoAnalysisActorIdentity\(\{\s*\r?\n?\s*actorKey: consumerRuntime\.state\.actorKey,\s*\r?\n?\s*actorGeneration: consumerRuntime\.state\.actorGeneration\s*\r?\n?\s*\}\);/.test(analysisHook) &&
    /const stateOwnerIdentityRef = useRef\(actorIdentity\);/.test(analysisHook) &&
    /const isCurrentActorState = stateOwnerIdentityRef\.current === actorIdentity;/.test(analysisHook)
);
check(
  "103. useMealPhotoFinalization owns its draft with the frozen actor pair",
  /const actorIdentity = buildMealPhotoAnalysisActorIdentity\(\{\s*\r?\n?\s*actorKey: runtime\.state\.actorKey,\s*\r?\n?\s*actorGeneration: runtime\.state\.actorGeneration\s*\r?\n?\s*\}\);/.test(finalizationHook) &&
    /const draftOwnerIdentityRef = useRef\(actorIdentity\);/.test(finalizationHook) &&
    /const isCurrentActorState = draftOwnerIdentityRef\.current === actorIdentity;/.test(finalizationHook)
);
check(
  "104. an actor mismatch masks every analysis public value to its safe initial state",
  /analysisInvocationStatus: isCurrentActorState \? displayedInvocationStatus : "not_started",/.test(analysisHook) &&
    /analysisCandidates: isCurrentActorState \? candidates : EMPTY_MEAL_PHOTO_ANALYSIS_CANDIDATES,/.test(analysisHook) &&
    /selectedCandidateId: isCurrentActorState \? selectedCandidateId : null,/.test(analysisHook) &&
    /analysisStatus: isCurrentActorState \? analysisStatus : null,/.test(analysisHook) &&
    /safeAnalysisErrorCode: isCurrentActorState \? safeErrorCode : null/.test(analysisHook)
);
check(
  "105. an actor mismatch masks the public finalization draft to null and unlocks nothing",
  /draft: isCurrentActorState \? draft : null,/.test(finalizationHook) &&
    /submitting: isCurrentActorState \? draft\?\.submissionStatus === "submitting" : false,/.test(finalizationHook) &&
    /uncertain: isCurrentActorState/.test(finalizationHook) &&
    /payloadLocked: isCurrentActorState/.test(finalizationHook)
);
check(
  "106. hook internal clearing runs in a layout effect, never a passive effect",
  /useLayoutEffect\(\(\) => \{\s*\r?\n?\s*if \(stateOwnerIdentityRef\.current === actorIdentity\) return;/.test(analysisHook) &&
    /useLayoutEffect\(\(\) => \{\s*\r?\n?\s*if \(draftOwnerIdentityRef\.current === actorIdentity\) return;/.test(finalizationHook) &&
    // the frozen session/photo boundary was promoted too
    /useLayoutEffect\(\(\) => \{\s*\r?\n?\s*if \(previousIdentityRef\.current === identity\) return;/.test(finalizationHook) &&
    !/useEffect\(\(\) => \{\s*\r?\n?\s*if \(previousIdentityRef\.current === identity\) return;/.test(finalizationHook)
);
check(
  "107. every showFinalizationEditor disjunct sits behind the actor-current gates",
  /const showFinalizationEditor =\s*\r?\n?\s*sessionReconciled &&\s*\r?\n?\s*mealPhotoAnalysis\.isCurrentActorState &&\s*\r?\n?\s*mealPhotoFinalization\.isCurrentActorState &&\s*\r?\n?\s*hasAiFinalizationFlow &&\s*\r?\n?\s*mealPhotoFinalization\.draft !== null &&/.test(screen)
);
check(
  "108. the editor never binds the hook submit directly",
  !/onSubmit=\{\(\) => void mealPhotoFinalization\.submit\(\)\}/.test(screen) &&
    /onSubmit=\{submitMealPhotoFinalizationEditor\}/.test(screen)
);
check(
  "109. the screen-level submit handler re-checks reconciliation and both hook owners",
  /const submitMealPhotoFinalizationEditor = useCallback\(\(\) => \{\s*\r?\n?\s*if \(!sessionReconciled\) return;\s*\r?\n?\s*if \(!mealPhotoAnalysis\.isCurrentActorState\) return;\s*\r?\n?\s*if \(!mealPhotoFinalization\.isCurrentActorState\) return;\s*\r?\n?\s*void mealPhotoFinalization\.submit\(\);/.test(screen)
);
check(
  // The hook must fail closed BEFORE the gate, before any UUID mint, before payload preparation
  // and before the runtime RPC — so index-compare the guard against each of those.
  "110. hook submit() fails closed before the gate, the UUID mint, preparation and the RPC",
  /const submit = useCallback\(async \(\) => \{[\s\S]{0,400}?if \(!ownsCurrentActorState\(\)\) return;/.test(finalizationHook) &&
    submitFn.indexOf("if (!ownsCurrentActorState()) return;") >= 0 &&
    submitFn.indexOf("if (!ownsCurrentActorState()) return;") < submitFn.indexOf("gateRef.current.tryStart()") &&
    submitFn.indexOf("if (!ownsCurrentActorState()) return;") < submitFn.indexOf("prepareMealPhotoFinalization(") &&
    submitFn.indexOf("if (!ownsCurrentActorState()) return;") < submitFn.indexOf("generateConsumerMealIdentificationFinalizationClientRequestId") &&
    submitFn.indexOf("if (!ownsCurrentActorState()) return;") < submitFn.indexOf("runtime.finalizeMealIdentification(")
);
check(
  "111. acceptCandidate() fails closed before the gate, the UUID mint, preparation and the RPC",
  acceptCandidateFn.indexOf("if (!ownsCurrentActorState()) return;") >= 0 &&
    acceptCandidateFn.indexOf("if (!ownsCurrentActorState()) return;") < acceptCandidateFn.indexOf("gateRef.current.tryStart()") &&
    acceptCandidateFn.indexOf("if (!ownsCurrentActorState()) return;") < acceptCandidateFn.indexOf("prepareMealPhotoFinalization(") &&
    acceptCandidateFn.indexOf("if (!ownsCurrentActorState()) return;") < acceptCandidateFn.indexOf("runtime.finalizeMealIdentification(")
);
check(
  "112. retryPending() refuses to replay a previous actor's frozen payload",
  /const retryPending = useCallback\(async \(\) => \{[\s\S]{0,300}?if \(!ownsCurrentActorState\(\)\) return;/.test(finalizationHook) &&
    retryPendingFn.indexOf("if (!ownsCurrentActorState()) return;") < retryPendingFn.indexOf("gateRef.current.tryStart()")
);
check(
  "113. local draft-mutating handlers also fail closed rather than adopting stale state",
  /const selectCandidate = useCallback\(\s*\r?\n?\s*\(candidate: MealPhotoAnalysisCandidate\) => \{\s*\r?\n?\s*if \(!ownsCurrentActorState\(\)\) return;/.test(finalizationHook) &&
    /const chooseManual = useCallback\(\(\) => \{\s*\r?\n?\s*if \(!ownsCurrentActorState\(\)\) return;/.test(finalizationHook) &&
    /\(field: MealPhotoFinalizationField, value: string\) => \{\s*\r?\n?\s*if \(!ownsCurrentActorState\(\)\) return;/.test(finalizationHook)
);
check(
  "114. the ownership predicate also requires a signed-in actor",
  /const ownsCurrentActorState = useCallback\(\s*\r?\n?\s*\(\) => draftOwnerIdentityRef\.current === actorIdentity && Boolean\(runtime\.state\.actorKey\),/.test(finalizationHook)
);
check(
  "115. hasAiFinalizationFlow derives only from actor-safe analysis state",
  /const hasAiFinalizationFlow =\s*\r?\n?\s*mealPhotoAnalysis\.analysisInvocationStatus === "completed" \|\|\s*\r?\n?\s*mealPhotoAnalysis\.analysisInvocationStatus === "low_confidence";/.test(screen) &&
    /analysisInvocationStatus: isCurrentActorState \? displayedInvocationStatus : "not_started",/.test(analysisHook)
);
check(
  "116. one-step acceptance also requires both hook owners",
  /if \(!mealPhotoAnalysis\.isCurrentActorState \|\| !mealPhotoFinalization\.isCurrentActorState\) return;/.test(oneStepAccept)
);
check(
  "117. retake fails closed until the reconciled actor owns the session",
  /function retakeMealPhoto\(\)[\s\S]{0,400}?if \(!sessionReconciled\) return;/.test(screen)
);
check(
  "118. the upload hook masks its actor-sensitive state and owns it",
  /const isCurrentActorState = stateOwnerIdentityRef\.current === actorIdentity;/.test(uploadHook) &&
    /uploadStatus: isCurrentActorState \? uploadStatus : initialSession\.uploadStatus,/.test(uploadHook) &&
    /imageObjectRef: isCurrentActorState \? imageObjectRef : initialSession\.imageObjectRef,/.test(uploadHook) &&
    /useLayoutEffect\(\(\) => \{\s*\r?\n?\s*if \(stateOwnerIdentityRef\.current === actorIdentity\) return;/.test(uploadHook)
);
check(
  // The legacy confirmed-match hero reads matchState and mealName, so both must be masked.
  // MI-E-C5-R5-R5: the same invariant, now expressed through the named actor-safe constants that
  // replaced the inline ternaries. Checks 122-132 extend this to every derived field.
  "119. the correction hook masks meal, restaurant, match state and photo for a previous actor",
  /const publicMatchState = isCurrentActorState \? matchState : session\.matchState;/.test(correctionStateHook) &&
    /const publicMealName = isCurrentActorState \? mealName : session\.mealName;/.test(correctionStateHook) &&
    /const publicRestaurantName = isCurrentActorState \? restaurantName : session\.restaurantName;/.test(correctionStateHook) &&
    /const publicCapturedImageUri = isCurrentActorState \? capturedImageUri : session\.capturedImageUri;/.test(correctionStateHook) &&
    /const publicCorrectionCompleted = isCurrentActorState \? correctionCompleted : session\.correctionCompleted;/.test(correctionStateHook) &&
    /useLayoutEffect\(\(\) => \{\s*\r?\n?\s*if \(stateOwnerIdentityRef\.current === correctionActorIdentity\) return;/.test(correctionStateHook)
);
check(
  "120. masking introduced no render-phase setState or external mutation in any of the four hooks",
  [analysisHook, finalizationHook, uploadHook, correctionStateHook].every(
    (src) => !/^  set[A-Z][A-Za-z0-9_]*\(/m.test(src)
  ) &&
    [analysisHook, uploadHook, correctionStateHook].every((src) => !/^  session = /m.test(src))
);
check(
  "121. the frozen in-flight late-response guard is still intact after the R4 changes",
  /!mountedRef\.current \|\|\s*\r?\n?\s*expectedIdentity !== identityRef\.current \|\|\s*\r?\n?\s*getAnalysisSession\(\)\.analysisRequestId !== frozen\.state\.analysisRequestId \|\|\s*\r?\n?\s*frozenSubmissionRef\.current !== frozen \|\|\s*\r?\n?\s*!current \|\|\s*\r?\n?\s*getMealPhotoFinalizationPayloadFingerprint\(current\) !== frozen\.fingerprint/.test(finalizationHook) &&
    git(["diff", "--name-only", "--", "supabase", "packages/shared"]).stdout.trim() === "" &&
    !/physical[^\n]{0,40}PASS/i.test(analysisHook) &&
    !/physical[^\n]{0,40}PASS/i.test(finalizationHook)
);


// ===========================================================================================
// MI-E-C5-R5-R5 — correction-hook derived-state actor masking.
// ===========================================================================================
// The actor-safe derivation block ONLY: from the first public constant to the first handler
// declaration that follows the derived values. Widening it past that point would sweep in the
// handler bodies, whose setState calls are legitimate (they run on user gestures, not on render).
const correctionPublicBlock = sliceBetween(
  correctionStateHook,
  "const publicMode = isCurrentActorState",
  "  function refreshNutrition"
);
const correctionReturn = sliceBetween(correctionStateHook, "    isCurrentActorState,\n    addSection:", "  };");
// Every actor-sensitive value the correction hook exposes, and the actor-safe constant each one
// must be built from. A field returning a bare identifier here would be an unmasked leak.
const CORRECTION_PUBLIC_BINDINGS = [
  ["mode", "publicMode"],
  ["mealName", "publicMealName"],
  ["restaurantName", "publicRestaurantName"],
  ["correctedRows", "publicCorrectedRows"],
  ["correctionCompleted", "publicCorrectionCompleted"],
  ["matchState", "publicMatchState"],
  ["selectedCandidate", "publicSelectedCandidate"],
  ["expandedCorrection", "publicExpandedCorrection"],
  ["addSection", "publicAddSection"],
  ["showExternalBreakdown", "publicShowExternalBreakdown"],
  ["externalBreakdownTriggered", "publicExternalBreakdownTriggered"],
  ["nutritionRefreshed", "publicNutritionRefreshed"],
  ["sourceContext", "publicSourceContext"],
  ["captureMethod", "publicCaptureMethod"],
  ["capturedImageUri", "publicCapturedImageUri"],
  ["recordTiming", "publicRecordTiming"],
  ["recordTimingConfirmed", "publicRecordTimingConfirmed"],
  ["occurredAt", "publicOccurredAt"]
];
const CORRECTION_MUTATING_HANDLERS = [
  "confirmAddedSection", "confirmCorrectionRow", "completeCorrection", "chooseNoneOfTheAbove",
  "confirmCatalogCandidate", "openCatalogUnavailableFallback", "openSupplementalData",
  "selectCatalogCandidate", "setMatchState", "updateMealName", "updateMode", "setSourceContext",
  "updateRestaurantName", "toggleAddSection", "toggleCorrectionRow", "toggleExternalBreakdown",
  "setMealSource", "confirmRecordTimingCurrent", "beginRecordTimingPostHoc", "cancelRecordTimingPostHoc"
];

check(
  "122. the correction hook derives every actor-sensitive primitive from one actor-safe authority",
  CORRECTION_PUBLIC_BINDINGS.every(([, safe]) =>
    new RegExp("const " + safe + " = isCurrentActorState \\? [A-Za-z]+ : session\\.[A-Za-z]+;").test(correctionPublicBlock)
  ) &&
    CORRECTION_PUBLIC_BINDINGS.every(([field, safe]) =>
      new RegExp("\\n    " + field + ": " + safe + ",").test(correctionReturn)
    )
);
check(
  "123. nutritionSummary is built only from actor-safe inputs",
  /buildNutritionSummary\(\{\s*\r?\n?\s*addedSections: publicAddedSections,\s*\r?\n?\s*correctedRows: publicCorrectedRows,\s*\r?\n?\s*mealName: publicMealName,\s*\r?\n?\s*nutritionRefreshed: publicNutritionRefreshed,\s*\r?\n?\s*restaurantName: publicRestaurantName\s*\r?\n?\s*\}\)/.test(correctionStateHook)
);
check(
  "124. nutritionSummary never reads the raw mealName",
  !/buildNutritionSummary\(\{[\s\S]{0,300}?[^c]mealName: mealName\b/.test(correctionStateHook) &&
    !/buildNutritionSummary\(\{ addedSections, correctedRows, mealName,/.test(correctionStateHook)
);
check(
  "125. nutritionSummary never reads the raw restaurantName",
  !/buildNutritionSummary\(\{[\s\S]{0,300}?restaurantName: restaurantName\b/.test(correctionStateHook) &&
    !/nutritionRefreshed, restaurantName \}\)/.test(correctionStateHook)
);
check(
  "126. nutritionSummary never reads the raw correctedRows or addedSections",
  !/buildNutritionSummary\(\{[\s\S]{0,300}?correctedRows: correctedRows\b/.test(correctionStateHook) &&
    !/buildNutritionSummary\(\{[\s\S]{0,300}?addedSections: addedSections\b/.test(correctionStateHook) &&
    !/\[addedSections, correctedRows, mealName, nutritionRefreshed, restaurantName\]/.test(correctionStateHook)
);
check(
  "127. nutritionSummary's memo dependencies are all actor-safe",
  /\[publicAddedSections, publicCorrectedRows, publicMealName, publicNutritionRefreshed, publicRestaurantName\]/.test(correctionStateHook)
);
check(
  "128. isSelfCooked derives from the actor-safe mode, never the raw mode",
  /const isSelfCooked = publicMode === "selfCooked";/.test(correctionStateHook) &&
    !/const isSelfCooked = mode === "selfCooked";/.test(correctionStateHook)
);
check(
  "129. hasRestaurantContext derives from that same actor-safe isSelfCooked",
  /hasRestaurantContext: !isSelfCooked,/.test(correctionReturn) &&
    /const isSelfCooked = publicMode === "selfCooked";/.test(correctionStateHook)
);
check(
  "130. correctionSections derives from the actor-safe added sections",
  /const correctionSections = useMemo\(\(\) => buildCorrectionSections\(publicAddedSections\), \[publicAddedSections\]\);/.test(correctionStateHook) &&
    !/buildCorrectionSections\(addedSections\)/.test(correctionStateHook)
);
check(
  "131. mealSource derives from the actor-safe source context",
  /publicSourceContext === "dine_in" \|\|/.test(correctionStateHook) &&
    /\? publicSourceContext\s*\r?\n?\s*: null;/.test(correctionStateHook) &&
    !/^\s*sourceContext === "dine_in" \|\|/m.test(correctionStateHook)
);
check(
  // Exhaustive: no returned property may be a bare actor-sensitive identifier. Only the actor-safe
  // constants, the actor-neutral derived values and the wrapped handlers are allowed.
  "132. no unmasked actor-sensitive field remains in the correction hook's public return",
  CORRECTION_PUBLIC_BINDINGS.every(([field]) => !new RegExp("\\n    " + field + ",").test(correctionReturn)) &&
    /\n    correctionSections,/.test(correctionReturn) &&
    /\n    nutritionSummary,/.test(correctionReturn) &&
    /\n    isSelfCooked,/.test(correctionReturn) &&
    /\n    mealSource,/.test(correctionReturn)
);
check(
  "133. every mutating correction handler fails closed on an actor mismatch",
  /function actorOwnedHandler<Args extends unknown\[\], Result>\(/.test(correctionStateHook) &&
    /return \(\.\.\.args: Args\) => \(isCurrentActorState \? handler\(\.\.\.args\) : undefined\);/.test(correctionStateHook) &&
    CORRECTION_MUTATING_HANDLERS.every((fn) => correctionReturn.includes("actorOwnedHandler(" + fn + ")"))
);
check(
  // A value-returning handler must fail closed with an explicit false, not undefined.
  "134. the value-returning post-hoc time handler fails closed with an explicit false",
  /function actorOwnedBooleanHandler<Args extends unknown\[\]>\(/.test(correctionStateHook) &&
    /return \(\.\.\.args: Args\) => \(isCurrentActorState \? handler\(\.\.\.args\) : false\);/.test(correctionStateHook) &&
    /setPostHocMealTime: actorOwnedBooleanHandler\(setPostHocMealTime\)/.test(correctionReturn)
);
check(
  "135. the correction hook's commit-phase clearing is preserved",
  /useLayoutEffect\(\(\) => \{\s*\r?\n?\s*if \(stateOwnerIdentityRef\.current === correctionActorIdentity\) return;/.test(correctionStateHook) &&
    !/useEffect\(\(\) => \{\s*\r?\n?\s*if \(stateOwnerIdentityRef\.current === correctionActorIdentity\) return;/.test(correctionStateHook)
);
check(
  "136. the actor-safe derivation block introduces no render-phase setState or store mutation",
  !/[^a-zA-Z]set[A-Z][A-Za-z]*\(/.test(correctionPublicBlock) &&
    !/session\.[A-Za-z]+ =[^=]/.test(correctionPublicBlock) &&
    !/await |Promise|\.then\(/.test(correctionPublicBlock)
);
check(
  "137. the correction hook still uses the one frozen actorKey/actorGeneration authority",
  /const correctionActorIdentity = buildMealPhotoAnalysisActorIdentity\(\{\s*\r?\n?\s*actorKey: consumerRuntimeForOwnership\.state\.actorKey,\s*\r?\n?\s*actorGeneration: consumerRuntimeForOwnership\.state\.actorGeneration\s*\r?\n?\s*\}\);/.test(correctionStateHook) &&
    (correctionStateHook.match(/buildMealPhotoAnalysisActorIdentity\(/g) ?? []).length === 1
);
check(
  "138. the legacy self-cooked and confirmed-match branches read only actor-safe values",
  /\{!hasAiFinalizationFlow && analysis\.isSelfCooked \?/.test(screen) &&
    /const isSelfCooked = publicMode === "selfCooked";/.test(correctionStateHook) &&
    /nutritionSummary=\{analysis\.nutritionSummary\}/.test(screen) &&
    /buildNutritionSummary\(\{\s*\r?\n?\s*addedSections: publicAddedSections,/.test(correctionStateHook)
);
check(
  "139. R5-R5 added no backend/shared diff, no dependency and no physical-device claim",
  git(["diff", "--name-only", "--", "supabase", "packages/shared"]).stdout.trim() === "" &&
    Object.keys(mobilePackage.dependencies ?? {}).length === MI_E_C5_R5_EXPECTED_MOBILE_DEPENDENCY_COUNT &&
    !/physical[^\n]{0,40}PASS/i.test(correctionStateHook)
);

// ---------------------------------------------------------------------------
// MI-E-C5-R5-R6 — per-analysis finalization runtime lifecycle.
// Physical regression: after one successful finalization the shared runtime kept
// status "succeeded" for the whole signed-in session, so payloadLocked stayed true and
// 「分析正確」 was permanently disabled for every later analysis. These checks pin the
// operation-scoped lifecycle that fixes it WITHOUT weakening same-operation locking.
// ---------------------------------------------------------------------------
const finalizationRuntime = read("apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationRuntime.ts");
const runtimeProvider = read("apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx");
const finalizationDraft = read("apps/mobile/features/analysis/mealPhotoFinalizationDraft.ts");

check(
  "140. R6 runtime carries a per-analysis operation identity alongside actor identity",
  /private operationId: string \| null = null;/.test(finalizationRuntime) &&
    /private actorKey: string \| null = null;/.test(finalizationRuntime)
);
check(
  "141. R6 canonical operation identity is derived from existing analysisRequestId + captureGeneration, not a new random id",
  /export function buildMealPhotoFinalizationOperationIdentity\(/.test(flowState) &&
    /analysisRequestId: string \| null \| undefined; captureGeneration: number/.test(flowState) &&
    /return `\$\{input\.analysisRequestId \?\? ""\}:\$\{input\.captureGeneration\}`;/.test(flowState) &&
    !/generateSecureUuidV4|Math\.random/.test(flowState)
);
check(
  "142. R6 beginAnalysisOperation is a no-op for the SAME operation and fails closed for a mismatched actor",
  /beginAnalysisOperation\(\s*\r?\n?\s*context: \{ actorKey: string; actorGeneration: number \},\s*\r?\n?\s*operationId: string\s*\r?\n?\s*\): boolean \{/.test(finalizationRuntime) &&
    /if \(!operationId\) return false;/.test(finalizationRuntime) &&
    /if \(!this\.matchesActor\(context\)\) return false;/.test(finalizationRuntime) &&
    /if \(this\.operationId === operationId\) return true;/.test(finalizationRuntime)
);
check(
  "143. R6 an unresolved submitting/pending payload is never silently discarded by a new operation",
  /if \(this\.inFlight \|\| this\.pending\) return false;/.test(finalizationRuntime)
);
check(
  "144. R6 a genuinely new operation resets the runtime to idle",
  /this\.operationId = operationId;\s*\r?\n?\s*this\.update\(idleState\(this\.state\.finalizationDataRevision\)\);\s*\r?\n?\s*return true;/.test(finalizationRuntime)
);
check(
  "145. R6 succeeded is still a payload lock — the lock predicate is unchanged",
  /return status === "submitting" \|\| status === "uncertain" \|\| status === "succeeded";/.test(finalizationDraft)
);
check(
  "146. R6 late responses are re-checked against actor AND operation before any state transition",
  /private isCurrentOperation\(actorKey: string, generation: number, operationId: string \| null\) \{\s*\r?\n?\s*return this\.isCurrent\(actorKey, generation\) && operationId === this\.operationId;/.test(finalizationRuntime) &&
    /const result = await this\.options\.service\.finalizeCurrentUserMealIdentification\(operation\.input\);[\s\S]{0,400}?if \(!this\.isCurrentOperation\(actorKey, generation, operationId\)\) return this\.state;/.test(finalizationRuntime)
);
check(
  "147. R6 the submitting operation id is frozen at submit time and threaded through execute",
  /const operationId = this\.operationId;\s*\r?\n?\s*this\.inFlight = this\.startOperation\(actorKey, generation, operationId, context\.timezone, draft\)/.test(finalizationRuntime) &&
    /private async execute\(\s*\r?\n?\s*actorKey: string,\s*\r?\n?\s*generation: number,\s*\r?\n?\s*operationId: string \| null,/.test(finalizationRuntime)
);
check(
  "148. R6-A an actor change drops the runtime's own binding, and the hook keeps NO local binding state to clear",
  /this\.operationId = null;/.test(finalizationRuntime) &&
    !/runtimeOperationIdentityRef/.test(finalizationHook)
);
check(
  "149. R6-A the hook binds the runtime in a LAYOUT effect, never during render",
  /useLayoutEffect\(\(\) => \{\s*\r?\n?\s*if \(isRuntimeBoundToCurrentOperation\) return;\s*\r?\n?\s*runtime\.beginMealIdentificationFinalizationOperation\(operationIdentity\);\s*\r?\n?\s*\}, \[isRuntimeBoundToCurrentOperation, operationIdentity, runtime\]\);/.test(finalizationHook) &&
    !/beginMealIdentificationFinalizationOperation\(/.test(
      finalizationHook.slice(0, finalizationHook.indexOf("useLayoutEffect"))
    )
);
check(
  "150. R6-A the layout effect is gated by the RUNTIME-OWNED pure query, not by a hook-local ref",
  /const isRuntimeBoundToCurrentOperation =\s*\r?\n?\s*runtime\.isMealIdentificationFinalizationBoundToOperation\(operationIdentity\);/.test(finalizationHook) &&
    !/useRef<string \| null>\(null\)/.test(finalizationHook)
);
check(
  "151. R6-A a previous operation's TERMINAL status reads as idle, while a LIVE one still locks — in ONE production helper",
  /const liveElsewhere = input\.runtimeStatus === "submitting" \|\| input\.runtimeStatus === "uncertain";/.test(finalizationDraft) &&
    /const runtimeStatus: MealPhotoFinalizationRuntimeStatus =\s*\r?\n?\s*input\.boundToCurrentOperation \|\| liveElsewhere \? input\.runtimeStatus : "idle";/.test(finalizationDraft) &&
    /payloadLocked: isMealPhotoFinalizationPayloadLocked\(runtimeStatus\)/.test(finalizationDraft)
);
check(
  "152. R6-A every public runtime-derived flag comes from that production helper, not from raw runtime status",
  /const operationSafeState = useMemo\(/.test(finalizationHook) &&
    /deriveMealPhotoFinalizationOperationSafeState\(\{\s*\r?\n?\s*runtimeStatus,\s*\r?\n?\s*boundToCurrentOperation: isRuntimeBoundToCurrentOperation\s*\r?\n?\s*\}\)/.test(finalizationHook) &&
    /uncertain: isCurrentActorState \? operationSafeState\.uncertain : false,/.test(finalizationHook) &&
    /payloadLocked: isCurrentActorState \? operationSafeState\.payloadLocked : false,/.test(finalizationHook) &&
    /runtimeStatus: isCurrentActorState \? operationSafeState\.runtimeStatus : "idle"/.test(finalizationHook)
);
check(
  "153. R6 both finalization START paths require the runtime to be bound to THIS operation, after the uncertain retry branch",
  /await retryPending\(\);\s*\r?\n?\s*return;\s*\r?\n?\s*\}[\s\S]{0,400}?if \(!ownsCurrentOperationState\(\)\) return;[\s\S]{0,300}?isMealPhotoFinalizationPayloadLocked\(\s*\r?\n?\s*runtime\.mealIdentificationFinalizationState\.status\s*\r?\n?\s*\)/.test(finalizationHook) &&
    /if \(!ownsCurrentOperationState\(\)\) return;\s*\r?\n?\s*if \(isMealPhotoFinalizationPayloadLocked\(runtime\.mealIdentificationFinalizationState\.status\)\) return;/.test(finalizationHook)
);
check(
  "154. R6 the screen's flow state consumes the operation-scoped status, not the raw shared runtime status",
  /finalizationRuntimeStatus: mealPhotoFinalization\.runtimeStatus,/.test(screen) &&
    !/finalizationRuntimeStatus: consumerRuntime\.mealIdentificationFinalizationState\.status/.test(screen)
);
check(
  "155. R6 the provider exposes the binding and fails closed when signed out, with no backend/shared diff and no physical PASS claim",
  /beginMealIdentificationFinalizationOperation\(operationId: string\): boolean;/.test(runtimeProvider) &&
    /if \(!mealIdentificationFinalizationRuntime \|\| !state\.actorKey \|\| state\.authState\.status !== "signedIn"\) \{\s*\r?\n?\s*return false;/.test(runtimeProvider) &&
    git(["diff", "--name-only", "--", "supabase", "packages/shared"]).stdout.trim() === "" &&
    Object.keys(mobilePackage.dependencies ?? {}).length === MI_E_C5_R5_EXPECTED_MOBILE_DEPENDENCY_COUNT &&
    !/physical[^\n]{0,40}PASS/i.test(finalizationRuntime) &&
    !/physical[^\n]{0,40}PASS/i.test(finalizationHook)
);

// ---------------------------------------------------------------------------
// MI-E-C5-R5-R6-A — runtime-owned operation binding and remount safety.
// The R6 audit proved a null-seeded hook ref made a same-operation succeeded remount
// report idle/unlocked on its first render, with no rerender to correct it. These checks
// pin the runtime-owned pure query that replaced it.
// ---------------------------------------------------------------------------
check(
  "156. R6-A hook public state does not depend on any null-seeded binding ref",
  !/runtimeOperationIdentityRef/.test(finalizationHook) &&
    !/useRef<string \| null>\(null\)/.test(finalizationHook)
);
check(
  "157. R6-A the runtime exposes a PURE binding query that mutates nothing and emits nothing",
  /isBoundToOperation\(context: \{ actorKey: string; actorGeneration: number \}, operationId: string\): boolean \{/.test(finalizationRuntime) &&
    /isBoundToOperation\([\s\S]{0,400}?return this\.operationId === operationId;\s*\r?\n?\s*\}/.test(finalizationRuntime) &&
    !/isBoundToOperation\([\s\S]{0,400}?this\.update\(/.test(finalizationRuntime)
);
check(
  "158. R6-A the pure query validates operation id AND actor identity (actorKey + generation)",
  /isBoundToOperation\([\s\S]{0,300}?if \(!operationId\) return false;\s*\r?\n?\s*if \(!this\.matchesActor\(context\)\) return false;/.test(finalizationRuntime) &&
    /private matchesActor\(context: \{ actorKey: string; actorGeneration: number \}\) \{\s*\r?\n?\s*return Boolean\(context\.actorKey\) && this\.isCurrent\(context\.actorKey, context\.actorGeneration\);/.test(finalizationRuntime)
);
check(
  "159. R6-A the provider exposes the query actor-safely and fails closed when signed out",
  /isMealIdentificationFinalizationBoundToOperation\(operationId: string\): boolean;/.test(runtimeProvider) &&
    /isMealIdentificationFinalizationBoundToOperation: \(operationId\) => \{\s*\r?\n?\s*if \(!mealIdentificationFinalizationRuntime \|\| !state\.actorKey \|\| state\.authState\.status !== "signedIn"\) \{\s*\r?\n?\s*return false;/.test(runtimeProvider) &&
    /return mealIdentificationFinalizationRuntime\.isBoundToOperation\(\s*\r?\n?\s*\{ actorKey: state\.actorKey, actorGeneration: state\.actorGeneration \},\s*\r?\n?\s*operationId\s*\r?\n?\s*\);/.test(runtimeProvider)
);
check(
  "160. R6-A the provider never hands the raw runtime or the bound operation id to the screen",
  !/mealIdentificationFinalizationRuntime;/.test(
    runtimeProvider.slice(0, runtimeProvider.indexOf("export function ConsumerRuntimeProvider"))
  ) && !/getBoundOperationId|operationId:\s*string;/.test(runtimeProvider)
);
check(
  "161. R6-A the hook evaluates the binding during RENDER via the pure query",
  /const isRuntimeBoundToCurrentOperation =\s*\r?\n?\s*runtime\.isMealIdentificationFinalizationBoundToOperation\(operationIdentity\);/.test(finalizationHook)
);
check(
  "162. R6-A the hook uses the production public-view helper rather than an inline rule",
  /import \{[\s\S]{0,600}?deriveMealPhotoFinalizationOperationSafeState,/.test(finalizationHook) &&
    /export function deriveMealPhotoFinalizationOperationSafeState\(/.test(finalizationDraft)
);
check(
  "163. R6-A same-operation succeeded remount stays LOCKED: bound=true passes the raw status through",
  /input\.boundToCurrentOperation \|\| liveElsewhere \? input\.runtimeStatus : "idle"/.test(finalizationDraft) &&
    /return status === "submitting" \|\| status === "uncertain" \|\| status === "succeeded";/.test(finalizationDraft)
);
check(
  "164. R6-A correctness never depends on an emission or a rerender — the helper is a pure function of (status, bound)",
  /export function deriveMealPhotoFinalizationOperationSafeState\(\s*\r?\n?\s*input: Readonly<\{\s*\r?\n?\s*runtimeStatus: MealPhotoFinalizationRuntimeStatus;\s*\r?\n?\s*boundToCurrentOperation: boolean;\s*\r?\n?\s*\}>\s*\r?\n?\s*\): MealPhotoFinalizationOperationSafeState \{/.test(finalizationDraft) &&
    !/useState|useRef|useEffect/.test(
      finalizationDraft.slice(finalizationDraft.indexOf("export function deriveMealPhotoFinalizationOperationSafeState"))
    )
);
check(
  "165. R6-A the new-operation reset still happens in the commit phase, never in render",
  /useLayoutEffect\(\(\) => \{\s*\r?\n?\s*if \(isRuntimeBoundToCurrentOperation\) return;\s*\r?\n?\s*runtime\.beginMealIdentificationFinalizationOperation\(operationIdentity\);/.test(finalizationHook)
);
check(
  "166. R6-A both finalization START handlers re-ask the RUNTIME at invocation time, not a render-time boolean",
  /const ownsCurrentOperationState = useCallback\(\s*\r?\n?\s*\(\) => runtime\.isMealIdentificationFinalizationBoundToOperation\(operationIdentity\),\s*\r?\n?\s*\[operationIdentity, runtime\]\s*\r?\n?\s*\);/.test(finalizationHook) &&
    (finalizationHook.match(/if \(!ownsCurrentOperationState\(\)\) return;/g) ?? []).length >= 2
);
check(
  "167. R6-A a DIFFERENT operation's uncertain/submitting is never masked to an operable idle",
  /const liveElsewhere = input\.runtimeStatus === "submitting" \|\| input\.runtimeStatus === "uncertain";/.test(finalizationDraft) &&
    /uncertain: runtimeStatus === "uncertain"/.test(finalizationDraft)
);
check(
  "168. R6-A adds no backend/shared diff, no dependency and no physical-device PASS claim",
  git(["diff", "--name-only", "--", "supabase", "packages/shared"]).stdout.trim() === "" &&
    Object.keys(mobilePackage.dependencies ?? {}).length === MI_E_C5_R5_EXPECTED_MOBILE_DEPENDENCY_COUNT &&
    !/physical[^\n]{0,40}PASS/i.test(finalizationDraft) &&
    !/physical[^\n]{0,40}PASS/i.test(runtimeProvider)
);

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  phase: "MI-E-C5-R5-R6 Per-Analysis Finalization Runtime Lifecycle Reset Guard",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  physicalDeviceUsed: false
}, null, 2));
if (failed.length) process.exitCode = 1;
