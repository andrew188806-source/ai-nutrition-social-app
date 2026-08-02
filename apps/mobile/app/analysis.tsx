import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Animated, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import RNDateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, SectionTitle, TagRow, colors } from "../components/DemoUi";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import {
  CorrectionSuccessActions,
  EstimatePreview,
  ExternalCorrectionPanel,
  SelfCookedCorrectionPanel,
  commitAnalysisSessionActorOwnerReconciliation,
  getAnalysisSessionViewForActor,
  setMealPhotoCompletion,
  setMealPhotoFallbackRevealed,
  useAnalysisCorrectionState,
  useMealPhotoAnalysis,
  useMealPhotoFinalization,
  useMealPhotoUpload,
  type MealPhotoFinalizationDraftState,
  type MealPhotoFinalizationField
} from "../features/analysis";
import { getTodayMealRecords, saveCorrectedMealRecord, updateMealRecordByMealId } from "../features/analysis/analysisMealRecordStore";
import { getEffectiveCalories } from "../features/analysis/nutritionSummary";
import {
  buildAnalysisMealIdentificationFinalizationDraft,
  mapMealIdentificationFinalizationUiError
} from "../features/analysis/mealIdentificationFinalizationAdapter";
import {
  getCompactMealPhotoFinalizationCandidates,
  getMealPhotoFinalizationContextBlockReason,
  type MealPhotoFinalizationContextBlockReason
} from "../features/analysis/mealPhotoFinalizationReadiness";
import { releaseOwnedGalleryMealPhotoAsset } from "../features/analysis/galleryMealPhotoAssetNormalization";
import {
  buildCompletedMealPhotoAnalysisSnapshot,
  buildMealPhotoAnalysisActorIdentity,
  CLEARED_MEAL_PHOTO_ANALYSIS_ACTOR_STATE,
  deriveMealPhotoAnalysisFlowState,
  shouldResetMealPhotoAnalysisStateForActor,
  splitPrimaryAndFallbackCandidates,
  type CompletedMealPhotoAnalysisSnapshot
} from "../features/analysis/mealPhotoAnalysisFlowState";
import { maximumMealOccurrenceInstant } from "../features/analysis/mealOccurrenceTime";
import { generateMealId, generatePhotoId, SingleMealGuiltShare } from "../features/calorie-sharing";
import { useDemoUserPlan } from "../features/demo-user-plan";
import { getNextMealCandidateCount } from "../features/next-meal-prototype";
import { getPlannedDinner } from "../features/planned-meal";
import { useConsumerRuntime } from "../features/consumer-runtime";
import { toDateKeyInTimeZone } from "../features/consumer-meals/mealDateTime";
import {
  isSameCatalogCandidate,
  resolveCatalogMealCandidates,
  type CatalogMealIdentificationCandidate,
  type MealIdentificationCandidateResolution
} from "../features/meal-identification";
import { useRestaurantCatalog } from "../features/restaurants/catalog";
import { mobileMenuItemService } from "../services/mobile-menu-item-service";
import { Card as SnowCard, Chip, PrimaryButton, SecondaryButton, SectionHeader as SnowSectionHeader, StatCard } from "../theme/components";
import { Icon } from "../theme/icons";
import { fonts, hexA, radius, shadows, snowPalette as snow } from "../theme/tokens";

type NextMealRecommendationCard = {
  menuItemId: string;
  restaurantId: string;
  dishName: string;
  calories: number;
  restaurantName: string;
  distance: string;
  emoji: string;
  reason: string;
  matchPercent: number;
};

let hasPlayedRecommendationCardCue = false;

// MI-E-C5-R5-R2 §十一: the analysis session store deliberately does not import expo-file-system, so
// the R4 owned-gallery-cache release is injected here. It only ever deletes the app-private
// normalized JPEG this app created — never the user's original picker URI, never a camera URI, and
// never the remote Storage object (that stays with the existing upload lifecycle).
const ANALYSIS_SESSION_OWNER_DEPENDENCIES = Object.freeze({
  releaseOwnedGalleryAsset: () => {
    void releaseOwnedGalleryMealPhotoAsset();
  }
});

// Short, demo-friendly explanation derived from existing fields only (protein content
// and how close this dish's calories are to the user's current nutrition state) — not a
// new recommendation algorithm, just picking one of a few canned sentences.
function buildRecommendationReason(calories: number, protein: number, referenceCalories: number): string {
  if (protein >= 25) {
    return "今天蛋白質不足，這餐能補充高蛋白。";
  }
  if (Math.abs(calories - referenceCalories) <= 80) {
    return "熱量接近下一餐建議範圍。";
  }
  return "比較符合目前的營養缺口。";
}

// Cosmetic "match" percentage derived from the same calorie-proximity value already
// used to rank the list — not a separate scoring algorithm.
function buildMatchPercent(calories: number, referenceCalories: number): number {
  const delta = Math.abs(calories - referenceCalories);
  return Math.max(70, Math.min(99, 100 - Math.round(delta / 8)));
}

// Ranks every canonical menu item by how close its calories are to the user's
// current nutrition state (the just-analyzed meal, or the post-guilt-sharing
// adjusted calories) instead of forcing one dish per restaurant. This means the
// list naturally changes whenever that reference calorie value changes.
function buildNextMealRecommendationCards(limit: number, referenceCalories: number): NextMealRecommendationCard[] {
  return mobileMenuItemService.getRecommendedMenuItemsForNextMeal(limit, referenceCalories);
}

export default function AnalysisScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mealSlot?: string }>();
  const consumerRuntime = useConsumerRuntime();
  // MI-E-C5-R5-R3 §三/§四 LAYER 1 — PURE render-time ownership gate.
  //
  // getAnalysisSessionViewForActor only compares identities and derives a view. It never assigns
  // to the store, never moves the epoch, never touches the gallery cache and never creates a
  // Promise, so an abandoned, interrupted, retried or concurrently-rendered pass costs nothing and
  // cannot damage the committed tree. Every session read below — this screen's own state
  // initializers AND all four session-reading hooks — consumes `ownershipSafeSession`, which is a
  // sanitized empty view for a different actor, a signed-out runtime, or an untrusted legacy
  // session. That is what makes the FIRST COMMITTED RENDER fail closed on its own merit, with no
  // external mutation involved. The mutating counterpart runs in the layout effect below.
  //
  // The ONE read of the frozen consumer-runtime identity pair in this screen. Both the session
  // ownership authority and the R5-R1 actor-identity string are derived from this single value, so
  // they can never disagree and no second identity source exists.
  const currentAnalysisActor = {
    actorKey: consumerRuntime.state.actorKey,
    actorGeneration: consumerRuntime.state.actorGeneration
  };
  const sessionOwnership = getAnalysisSessionViewForActor(currentAnalysisActor);
  const ownershipSafeSession = sessionOwnership.session;
  const analysis = useAnalysisCorrectionState(ownershipSafeSession);
  const mealPhotoUpload = useMealPhotoUpload(ownershipSafeSession);
  const mealPhotoAnalysis = useMealPhotoAnalysis(mealPhotoUpload.uploadStatus, mealPhotoUpload.imageObjectRef, ownershipSafeSession);
  const restaurantCatalog = useRestaurantCatalog();
  const [demoMode] = useDemoUserPlan();
  // Every local initializer below reads the ownership-SAFE view, never the raw store.
  const session = ownershipSafeSession;
  const [mealSaved, setMealSaved] = useState(session.mealSaved);
  const [analysisObservedAt] = useState(() => new Date().toISOString());
  const [localFinalizationErrorCode, setLocalFinalizationErrorCode] = useState<string | null>(null);
  const finalizationInvocationRef = useRef(false);
  const conflictFingerprintRef = useRef<string | null>(null);
  const defaultMealPeriod = zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotOptions[1];
  const initialMealPeriod = typeof params.mealSlot === "string" ? params.mealSlot : session.selectedMealPeriod || defaultMealPeriod;
  const [selectedMealPeriod, setSelectedMealPeriod] = useState(initialMealPeriod);
  const isAnalysisConfirmed = analysis.matchState === "confirmed";
  const profileTimezone =
    consumerRuntime.state.profileState.status === "available"
      ? consumerRuntime.state.profileState.profile.timezone
      : consumerRuntime.mode === "mock"
        ? "Asia/Taipei"
        : "";
  const canFinalize = Boolean(analysis.mealSource) && analysis.recordTimingConfirmed && Boolean(analysis.occurredAt);
  // Stable id for this meal record so 罪惡分擔 results can be attached to it later via updateMealRecordByMealId.
  // Reused across remounts within the same AI Analysis session (see analysisSessionStore).
  // MI-E-C5-R5-R3 §九: these now have setters. They are actor-sensitive local values — a mounted
  // actor change must be able to replace them with fresh actor-scoped ones instead of letting the
  // arriving actor inherit the previous actor's meal id and pre-meal photo ids.
  const [mealId, setMealId] = useState(() => session.mealId || generateMealId());
  const [preMealPhotoIds, setPreMealPhotoIds] = useState(() =>
    session.preMealPhotoIds.length ? session.preMealPhotoIds : [generatePhotoId("pre")]
  );
  const [guiltSharingResult, setGuiltSharingResult] = useState<{ peopleCount: number; sharedCaloriesPerPerson: number } | null>(session.guiltSharingResult);
  // Recalculated whenever guiltSharingResult changes, so completing Guilt Sharing
  // immediately replaces the recommendation list with one based on the updated calories.
  const referenceCalories = guiltSharingResult?.sharedCaloriesPerPerson ?? analysis.nutritionSummary.calories;
  const nextMealRecommendations = useMemo(
    () => buildNextMealRecommendationCards(getNextMealCandidateCount(demoMode), referenceCalories),
    [demoMode, referenceCalories]
  );
  const candidateResolution = useMemo(
    () =>
      resolveCatalogMealCandidates(restaurantCatalog.state, {
        restaurantName: analysis.restaurantName,
        mealItemName: analysis.mealName
      }),
    [analysis.mealName, analysis.restaurantName, restaurantCatalog.state]
  );
  const hasAiFinalizationFlow =
    mealPhotoAnalysis.analysisInvocationStatus === "completed" ||
    mealPhotoAnalysis.analysisInvocationStatus === "low_confidence";
  // MI-E-C5-R5 primary-first presentation. The compact ceiling from R2 still bounds the whole
  // response; the split then exposes exactly one primary best match plus the fallbacks that
  // actually exist. Production supplies at most 2 fallbacks today (1-3 total candidates).
  const { primary: primaryCandidate, fallbacks: fallbackCandidates } = useMemo(
    () => splitPrimaryAndFallbackCandidates(getCompactMealPhotoFinalizationCandidates(mealPhotoAnalysis.analysisCandidates)),
    [mealPhotoAnalysis.analysisCandidates]
  );
  const [fallbackRevealedState, setFallbackRevealed] = useState(session.mealPhotoFallbackRevealed);
  const [completionSnapshotState, setCompletionSnapshot] = useState<CompletedMealPhotoAnalysisSnapshot | null>(
    session.mealPhotoCompletion
  );
  // MI-E-C5-R5-R1 §八: the shared editor is no longer part of the accept path, so it needs its own
  // explicit trigger. Only 「修正內容」 and 「都不是／手動輸入」 set this.
  const [correctionRequestedState, setCorrectionRequested] = useState(false);
  // MI-E-C5-R5-R3 §七: PURE render-phase gate — no setState during render, no side effect at all.
  //
  // These three values are React state seeded at mount, so on an actor change while /analysis is
  // already mounted they would still hold the previous actor's values. `analysisSessionOwned` is
  // derived purely from the ownership decision, so the very first committed render after an actor
  // change reads them as null/false/false regardless of what the underlying state still holds and
  // regardless of whether commit-phase reconciliation has run yet. Signed-out, failed-restore,
  // untrusted and different-actor all report status !== "owned", so all four fail closed here.
  const analysisSessionOwned = sessionOwnership.status === "owned";
  const completionSnapshot = analysisSessionOwned ? completionSnapshotState : null;
  const fallbackRevealed = analysisSessionOwned ? fallbackRevealedState : false;
  const correctionRequested = analysisSessionOwned ? correctionRequestedState : false;
  // The captured photo is as actor-sensitive as the completion snapshot, and it lives in a hook
  // that snapshots the session at mount, so it gets the same ownership gate.
  const ownedCapturedImageUri = analysisSessionOwned ? analysis.capturedImageUri : null;
  // MI-E-C5-R5-R1 §四: actor identity isolation for the R5 state, now performed in the COMMIT
  // phase together with the store reconciliation. Same frozen actorKey/actorGeneration pair as
  // useMealPhotoFinalization — no second identity system. A same-actor rerender, a Fast Refresh
  // reload, a background → foreground return and a silent token refresh all leave the identity
  // untouched, so none of them trip this and none of them lose a valid session.
  const actorIdentity = buildMealPhotoAnalysisActorIdentity(currentAnalysisActor);
  const previousActorIdentityRef = useRef(actorIdentity);
  // MI-E-C5-R5-R3 §六 LAYER 2 — COMMIT-PHASE reconciliation.
  //
  // useLayoutEffect runs after React has committed and before the frame is presented, so it can
  // never be executed by an abandoned, interrupted or concurrently-discarded render, and the user
  // still never sees a pre-reconciliation frame. This is the ONLY place in this screen that mutates
  // the external session store or touches the gallery cache.
  const [reconciledActorIdentity, setReconciledActorIdentity] = useState<string | null>(null);
  useLayoutEffect(() => {
    // Re-derive against the live store: the decision computed during render may be stale by now.
    const decision = getAnalysisSessionViewForActor(currentAnalysisActor);
    if (decision.reconciliationRequired) {
      // Full reset + owner bind + owned-gallery-cache release, in that order, inside the store.
      // A throwing release cannot abort the privacy reset (it runs in the store's `finally`).
      commitAnalysisSessionActorOwnerReconciliation(currentAnalysisActor, ANALYSIS_SESSION_OWNER_DEPENDENCIES);
    }
    if (shouldResetMealPhotoAnalysisStateForActor(previousActorIdentityRef.current, actorIdentity) || decision.exposesSanitizedView) {
      // Local actor-sensitive state is cleared from the one shared cleared value, together with the
      // stored copies, so neither half can reinstate the previous actor's completion later.
      const cleared = CLEARED_MEAL_PHOTO_ANALYSIS_ACTOR_STATE;
      setCompletionSnapshot(cleared.completion);
      setMealPhotoCompletion(cleared.completion);
      setFallbackRevealed(cleared.fallbackRevealed);
      setMealPhotoFallbackRevealed(cleared.fallbackRevealed);
      setCorrectionRequested(cleared.correctionRequested);
      // MI-E-C5-R5-R3 §九: the actor-scoped local residue is replaced with fresh values rather than
      // inherited, so the arriving actor can never reuse the previous actor's meal id or photo ids.
      setMealId(generateMealId());
      setPreMealPhotoIds([generatePhotoId("pre")]);
    }
    previousActorIdentityRef.current = actorIdentity;
    setReconciledActorIdentity(actorIdentity);
  }, [actorIdentity, currentAnalysisActor.actorGeneration, currentAnalysisActor.actorKey]);
  // MI-E-C5-R5-R3 §八: nothing that captures, uploads, analyses, accepts or finalizes may run
  // before commit-phase reconciliation has bound this actor.
  const sessionReconciled = reconciledActorIdentity === actorIdentity && analysisSessionOwned;
  // MI-E-C5-R7-B1: restaurantId/branchId come from the R7-A ID-only session, surfaced through the
  // same actor-gated hook as every other context field, so they are already sanitized when this
  // render does not own the session. The legacy analysis.restaurantName is NOT read here, and the
  // catalog resolver's display name is presentation-only and never reaches this memo.
  const finalizationContext = useMemo(
    () => ({
      captureMethod: analysis.captureMethod,
      sourceContext: analysis.sourceContext,
      recordTiming: analysis.recordTiming,
      occurredAt: analysis.occurredAt ?? "",
      selectedMealPeriod,
      restaurantId: analysis.restaurantId,
      branchId: analysis.branchId
    }),
    [
      analysis.branchId,
      analysis.captureMethod,
      analysis.occurredAt,
      analysis.recordTiming,
      analysis.restaurantId,
      analysis.sourceContext,
      selectedMealPeriod
    ]
  );
  // MI-E-C5-R5: durable finalization success now stays on /analysis. The confirmed draft is frozen
  // into a completion snapshot (the single display authority for the completed screen) and the R4
  // owned gallery cache is released. The previous router.push("/today-intake") is deliberately
  // gone: it discarded the same-page completed state the moment it was set.
  const completeMealPhotoFinalization = useCallback(
    (draft: MealPhotoFinalizationDraftState) => {
      const snapshot = buildCompletedMealPhotoAnalysisSnapshot(draft);
      if (!snapshot) return;
      if (consumerRuntime.mode === "mock") {
        persistV3MealToExplicitDemoStore(
          draft,
          toDateKeyInTimeZone(new Date(draft.context.occurredAt), profileTimezone)
        );
      }
      setCompletionSnapshot(snapshot);
      setMealPhotoCompletion(snapshot);
      // Cleanup stays best-effort and must never reverse a durable success.
      void releaseOwnedGalleryMealPhotoAsset();
    },
    [consumerRuntime.mode, profileTimezone]
  );
  const mealPhotoFinalization = useMealPhotoFinalization({
    candidates: mealPhotoAnalysis.analysisCandidates,
    context: finalizationContext,
    onSuccess: completeMealPhotoFinalization,
    ownershipSafeSession
  });
  const frozenFinalizationContext =
    mealPhotoFinalization.payloadLocked && mealPhotoFinalization.draft
      ? mealPhotoFinalization.draft.context
      : null;
  // MI-E-C5-R5-R1 §九: readiness is evaluated at screen level, because acceptance now happens on the
  // result card and the user must be told what is missing right where the blocked action is — not
  // only inside an editor they are no longer required to open. "unknown" is an accepted meal source
  // (see mealPhotoFinalizationReadiness), so someone who genuinely does not know is never blocked.
  const finalizationContextBlockReason = getMealPhotoFinalizationContextBlockReason({
    occurredAt: frozenFinalizationContext?.occurredAt ?? analysis.occurredAt ?? "",
    recordTimingConfirmed: frozenFinalizationContext !== null || analysis.recordTimingConfirmed,
    sourceContext:
      frozenFinalizationContext?.sourceContext ?? analysis.mealSource ?? analysis.sourceContext,
    selectedMealPeriod: frozenFinalizationContext?.selectedMealPeriod ?? selectedMealPeriod
  });
  // MI-E-C5-R5: one ordered state derivation for the whole C5 screen. Exactly one state is active,
  // so legacy and new UI can never render together and no pre-durable state can look completed.
  const flowState = deriveMealPhotoAnalysisFlowState({
    hasCompletionSnapshot: completionSnapshot !== null,
    // MI-E-C5-R5-R6 §七: the OPERATION-scoped status, not the raw shared runtime status. A previous
    // meal's terminal result can no longer drive this screen's state machine for a new analysis.
    finalizationRuntimeStatus: mealPhotoFinalization.runtimeStatus,
    draftSubmissionStatus: mealPhotoFinalization.draft?.submissionStatus ?? null,
    draftMode: mealPhotoFinalization.draft?.mode ?? null,
    fallbackRevealed,
    analysisInvocationStatus: mealPhotoAnalysis.analysisInvocationStatus,
    uploadStatus: mealPhotoUpload.uploadStatus,
    hasCapturedPhoto: Boolean(ownedCapturedImageUri)
  });
  const isDurableCompleted = flowState === "durable_completed";
  // Legacy demo blocks and the legacy confirmed-match hero are suppressed for the entire real C5
  // flow, including its completed state, so the two UI generations never stack.
  const showLegacyAnalysisBlocks = !hasAiFinalizationFlow && !isDurableCompleted;

  function revealFallbackCandidates() {
    if (mealPhotoFinalization.payloadLocked) return;
    setFallbackRevealed(true);
    setMealPhotoFallbackRevealed(true);
  }

  // MI-E-C5-R5-R1 §六/§七: acceptance is ONE user action.
  //
  // 「分析正確」 and tapping a fallback both land here: a single gesture adopts the candidate AND
  // runs the one atomic finalization. There is no second standalone 加入今日飲食 press anywhere on
  // the accept path. The draft is built and submitted inside acceptCandidate from the same local
  // value, so this never depends on React state having flushed between adoption and submission.
  // Double taps are absorbed by the frozen single-flight gate inside acceptCandidate — the second
  // gesture finds the gate held and returns without minting a second clientRequestId. Success
  // resolves through completeMealPhotoFinalization into the same-page completed state; there is
  // deliberately no router.push("/today-intake") on this path.
  function acceptAnalysisCandidateInOneStep(
    candidate: (typeof mealPhotoAnalysis.analysisCandidates)[number]
  ) {
    // MI-E-C5-R5-R3 §八: acceptance is a durable write, so it fails closed until this actor owns
    // the session and commit-phase reconciliation has completed.
    // MI-E-C5-R5-R4 §十: both hook states must also belong to the current actor.
    if (!sessionReconciled) return;
    if (!mealPhotoAnalysis.isCurrentActorState || !mealPhotoFinalization.isCurrentActorState) return;
    if (mealPhotoFinalization.payloadLocked) return;
    if (finalizationContextBlockReason !== null) return;
    mealPhotoAnalysis.selectCandidate(candidate.candidateId);
    void mealPhotoFinalization.acceptCandidate(candidate);
  }

  function acceptPrimaryCandidate() {
    if (!primaryCandidate) return;
    acceptAnalysisCandidateInOneStep(primaryCandidate);
  }

  // Correction is the explicit opt-in into the editor: the primary is adopted as an editable draft
  // WITHOUT being submitted, so the user reviews and presses submit themselves.
  function requestPrimaryCorrection() {
    if (mealPhotoFinalization.payloadLocked || !primaryCandidate) return;
    mealPhotoAnalysis.selectCandidate(primaryCandidate.candidateId);
    mealPhotoFinalization.selectCandidate(primaryCandidate);
    setCorrectionRequested(true);
  }

  function chooseManualMealInput() {
    if (mealPhotoFinalization.payloadLocked) return;
    mealPhotoAnalysis.selectCandidate(null);
    mealPhotoFinalization.chooseManual();
    setCorrectionRequested(true);
  }

  // The shared editor/detail panel renders only on an explicit correction or manual choice, or when
  // a submission failed and fixing-and-retrying that same draft is the only way forward.
  // MI-E-C5-R5-R4 §八: EVERY disjunct is now behind the actor-current gates, not just
  // correctionRequested. A stale manual or failed draft belonging to a previous actor can no longer
  // open this editor for even one frame, because both hooks mask their public state synchronously
  // and both flags are required here alongside sessionReconciled.
  const showFinalizationEditor =
    sessionReconciled &&
    mealPhotoAnalysis.isCurrentActorState &&
    mealPhotoFinalization.isCurrentActorState &&
    hasAiFinalizationFlow &&
    mealPhotoFinalization.draft !== null &&
    (correctionRequested ||
      mealPhotoFinalization.draft.mode === "manual" ||
      mealPhotoFinalization.draft.submissionStatus === "failed");
  // MI-E-C5-R5-R4 §九: the editor never binds mealPhotoFinalization.submit directly. This screen-level
  // handler re-checks reconciliation and both hook owners before delegating; the hook re-checks
  // again before its gate, UUID mint, payload preparation and RPC.
  const submitMealPhotoFinalizationEditor = useCallback(() => {
    if (!sessionReconciled) return;
    if (!mealPhotoAnalysis.isCurrentActorState) return;
    if (!mealPhotoFinalization.isCurrentActorState) return;
    void mealPhotoFinalization.submit();
  }, [mealPhotoAnalysis.isCurrentActorState, mealPhotoFinalization, sessionReconciled]);

  // A new capture, a new analysis request or an actor change clears the finalization draft through
  // the frozen identity guard in useMealPhotoFinalization. The correction request belongs to that
  // draft, so it must not outlive it and re-open the editor over a fresh session's primary result.
  useEffect(() => {
    if (mealPhotoFinalization.draft === null) setCorrectionRequested(false);
  }, [mealPhotoFinalization.draft]);

  useEffect(() => {
    if (mealPhotoFinalization.payloadLocked) return;
    if (typeof params.mealSlot === "string") {
      setSelectedMealPeriod(params.mealSlot);
    }
  }, [mealPhotoFinalization.payloadLocked, params.mealSlot]);

  // Keep the session store in sync so visiting another screen and coming back
  // restores this exact state instead of starting a new AI Analysis session.
  // MI-E-C5-R5-R2: only ever writes back into a session this actor owns — otherwise a mounted
  // actor change would copy the previous actor's locally-held meal id, photo ids and guilt-sharing
  // result straight back into the freshly reset session.
  useEffect(() => {
    if (!analysisSessionOwned || !sessionReconciled) return;
    session.mealSaved = mealSaved;
    session.selectedMealPeriod = selectedMealPeriod;
    session.mealId = mealId;
    session.preMealPhotoIds = preMealPhotoIds;
    session.guiltSharingResult = guiltSharingResult;
  });

  function persistCanonicalMealToExplicitDemoStore(mealRecordId: string, mealDate: string) {
    saveCorrectedMealRecord({
      mealId: mealRecordId,
      restaurantName: analysis.restaurantName,
      mealName: analysis.mealName,
      calories: analysis.nutritionSummary.calories,
      protein: analysis.nutritionSummary.protein,
      carbohydrates: analysis.nutritionSummary.carbohydrates,
      fat: analysis.nutritionSummary.fat,
      ingredients: "",
      portion: analysis.nutritionSummary.portion,
      mealPeriod: selectedMealPeriod,
      date: mealDate.replaceAll("-", "/"),
      estimatedCalories: analysis.nutritionSummary.calories,
      source: analysis.isSelfCooked ? "self_made" : "ai_estimated"
    });
  }

  function persistV3MealToExplicitDemoStore(draft: MealPhotoFinalizationDraftState, mealDate: string) {
    if (!draft.resultIds) return;
    const nutritionNumber = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    saveCorrectedMealRecord({
      mealId: draft.resultIds.mealRecordId,
      restaurantName: "",
      mealName: draft.editable.mealName.trim(),
      calories: nutritionNumber(draft.editable.calories),
      protein: nutritionNumber(draft.editable.proteinGrams),
      carbohydrates: nutritionNumber(draft.editable.carbsGrams),
      fat: nutritionNumber(draft.editable.fatGrams),
      ingredients: draft.editable.components,
      portion: draft.editable.portion.trim(),
      mealPeriod: draft.context.selectedMealPeriod,
      date: mealDate.replaceAll("-", "/"),
      estimatedCalories: nutritionNumber(draft.editable.calories),
      source: draft.context.sourceContext === "self_cooked" ? "self_made" : "ai_estimated"
    });
  }

  function handleGuiltSharingConfirm(result: { peopleCount: number; sharedCaloriesPerPerson: number }) {
    // MI-E-C5-R5-R3 §九/§十: the handler carries its own authority check rather than trusting the UI
    // to be hidden — mealId is actor-scoped local state, so a mismatched or unreconciled actor must
    // never be able to attach a split result to the previous actor's meal record.
    if (!sessionReconciled) return;
    // 罪惡分擔 only attaches the split result to this meal record — it never asks
    // meal-completion questions (those live in the post-meal rating flow only).
    setGuiltSharingResult(result);
    updateMealRecordByMealId(mealId, {
      calorieSharingPeopleCount: result.peopleCount,
      sharedCaloriesPerPerson: result.sharedCaloriesPerPerson
    });
  }

  async function finalizeMealIdentificationFromExplicitGesture() {
    // MI-E-C5-R5-R3 §十: preMealPhotoIds is actor-scoped local state that enters the finalization
    // payload, so this legacy explicit-gesture path fails closed for a mismatched or unreconciled
    // actor. UI hiding alone is not the authority.
    if (!sessionReconciled) return;
    if (
      finalizationInvocationRef.current ||
      consumerRuntime.mealIdentificationFinalizationState.status === "submitting"
    ) {
      return;
    }
    if (!canFinalize || !analysis.occurredAt) {
      // Required meal source and/or actual meal time selection is incomplete — this
      // mirrors the existing "adapter rejected the draft" error surface rather than
      // silently submitting with a guessed source or timing.
      setLocalFinalizationErrorCode("finalization_invalid_input");
      return;
    }
    const adapted = buildAnalysisMealIdentificationFinalizationDraft({
      selectedMealPeriod,
      restaurantName: analysis.restaurantName,
      mealName: analysis.mealName,
      sourceContext: analysis.sourceContext,
      recordTiming: analysis.recordTiming,
      occurredAt: analysis.occurredAt,
      selectedCandidate: analysis.selectedCandidate,
      catalogConfirmed: analysis.matchState === "confirmed",
      isSelfCooked: analysis.isSelfCooked,
      nutritionSummary: analysis.nutritionSummary,
      nutritionRefreshed: analysis.nutritionRefreshed,
      correctionCompleted: analysis.correctionCompleted,
      correctedRows: analysis.correctedRows,
      preMealPhotoIds,
      analysisAvailability: "available",
      observedAt: analysisObservedAt
    });
    if (!adapted.ok) {
      setLocalFinalizationErrorCode("finalization_invalid_input");
      return;
    }
    const fingerprint = JSON.stringify(adapted.value);
    if (
      consumerRuntime.mealIdentificationFinalizationState.errorCode ===
        "finalization_idempotency_conflict" &&
      conflictFingerprintRef.current === fingerprint
    ) {
      setLocalFinalizationErrorCode("finalization_idempotency_conflict");
      return;
    }

    finalizationInvocationRef.current = true;
    setLocalFinalizationErrorCode(null);
    try {
      const result = await consumerRuntime.finalizeMealIdentification(adapted.value);
      if (result.errorCode === "finalization_idempotency_conflict") {
        conflictFingerprintRef.current = fingerprint;
      } else if (result.status === "succeeded") {
        conflictFingerprintRef.current = null;
      }
      completeSuccessfulMealIdentificationFinalization(result);
    } finally {
      finalizationInvocationRef.current = false;
    }
  }

  async function retryPendingMealIdentificationFinalization() {
    if (finalizationInvocationRef.current) return;
    finalizationInvocationRef.current = true;
    try {
      completeSuccessfulMealIdentificationFinalization(
        await consumerRuntime.retryPendingMealIdentificationFinalization()
      );
    } finally {
      finalizationInvocationRef.current = false;
    }
  }

  function completeSuccessfulMealIdentificationFinalization(
    result: typeof consumerRuntime.mealIdentificationFinalizationState
  ) {
    if (
      result.status !== "succeeded" ||
      !result.mealRecordId ||
      !result.mealRecordItemId ||
      !result.mealAnalysisId ||
      !result.mealIdentificationFinalizationId ||
      !result.mealCorrectionIds
    ) {
      return;
    }
    if (consumerRuntime.mode === "mock") {
      persistCanonicalMealToExplicitDemoStore(
        result.mealRecordId,
        new Date().toISOString().slice(0, 10)
      );
    }
    setMealSaved(true);
    void releaseOwnedGalleryMealPhotoAsset();
    router.push("/today-intake");
  }

  function renderSuccessActions() {
    if (consumerRuntime.mealIdentificationFinalizationState.status === "submitting") {
      return null;
    }
    return <CorrectionSuccessActions hasRestaurantContext={analysis.hasRestaurantContext} onOpenMealLog={finalizeMealIdentificationFromExplicitGesture} onOpenSocial={() => router.push("/meal-buddies")} />;
  }

  function openNextMealRecommendation(meal: NextMealRecommendationCard) {
    router.push({ pathname: "/recommendation", params: { prototypeId: meal.menuItemId } });
  }

  // Explicit "retake/replace photo" gesture (MI-E-C3 §九): best-effort delete the current
  // photo's already-uploaded staging object before navigating away to capture a new one. This
  // never blocks navigation — cleanup failure is silently ignored, matching the "cleanup failure
  // must not block the user" requirement. Only fires when there's actually an uploaded object to
  // clean up; a plain route unmount (back button, tab switch) never triggers this.
  function retakeMealPhoto() {
    // MI-E-C5-R5-R4 §十三: retake deletes the uploaded staging object, so it fails closed unless this
    // actor owns the reconciled session.
    if (!sessionReconciled) return;
    if (mealPhotoUpload.uploadStatus === "uploaded" && mealPhotoUpload.imageObjectRef) {
      void consumerRuntime.deleteMealPhotoObject(mealPhotoUpload.imageObjectRef);
    }
    void releaseOwnedGalleryMealPhotoAsset();
    router.push("/meal-photo");
  }

  return (
    <PlaceholderScreen
      title={zhTW.mobile.analysisTitle}
      subtitle={zhTW.mobile.analysisSubtitle}
    >
      {/* MI-E-C5-R5: the real C5 flow now completes in place. A durable finalization swaps this
          screen to the restored completed hero (success visual, confirmed macro summary, next-meal
          recommendation carousel) instead of pushing /today-intake. mealSaved remains the legacy
          non-C5 path and is unchanged. */}
      {isDurableCompleted && completionSnapshot ? (
        <>
          <SnowCard tone="primary">
            <SnowSectionHeader title={zhTW.mobile.correctedFlow.mealResultTitle} subtitle={zhTW.mobile.mealPhotoCompletion.body} />
            <View style={[styles.photoArea, styles.photoAreaConfirmed]}>
              {ownedCapturedImageUri ? (
                <Image source={{ uri: ownedCapturedImageUri }} style={styles.photoImage} resizeMode="cover" />
              ) : null}
              <View style={styles.photoCaptionBadge}>
                <Text style={styles.photoBadgeText}>{zhTW.mobile.analysis.imageLabel}</Text>
              </View>
            </View>
            <Text style={styles.finalizationFieldLabel}>{zhTW.mobile.mealPhotoFinalization.restaurantNameLabel}</Text>
            <Text style={styles.stateText}>{zhTW.mobile.mealPhotoFinalization.restaurantNameUnknown}</Text>
            <Text style={styles.finalizationFieldLabel}>{zhTW.mobile.mealPhotoFinalization.mealNameLabel}</Text>
            <Text style={styles.stateText}>{completionSnapshot.mealName}</Text>
          </SnowCard>
          <CompletedAnalysisHero
            completion={completionSnapshot}
            nutritionSummary={completionSnapshot.nutrition}
            mealName={completionSnapshot.mealName}
            guiltSharingResult={guiltSharingResult}
            finalizing={false}
            onOpenMealLog={() => router.push("/meal-log")}
            onOpenNutritionRecord={() => router.push("/meal-log")}
            onViewTodayIntake={() => router.push("/today-intake")}
            onAnalyzeAnother={() => router.push("/meal-photo")}
            onGuiltShare={handleGuiltSharingConfirm}
            nextMealRecommendations={nextMealRecommendations}
            isPremium={demoMode === "premium"}
            onSelectMeal={openNextMealRecommendation}
            onViewRestaurant={(restaurantId) => router.push({ pathname: "/restaurants", params: { restaurantId } })}
          />
        </>
      ) : mealSaved ? (
        <TodayIntakeSummary onFindBuddy={() => router.push("/meal-buddies")} onNextMeal={() => router.push("/recommendation")} onOpenMealLog={() => router.push("/meal-log")} />
      ) : (
        <>
          <SnowCard tone="primary">
            <SnowSectionHeader title={zhTW.mobile.correctedFlow.mealResultTitle} subtitle={zhTW.mobile.correctedFlow.mealResultBody} />
            <View style={[styles.photoArea, isAnalysisConfirmed && styles.photoAreaConfirmed]}>
              {ownedCapturedImageUri ? (
                <Image source={{ uri: ownedCapturedImageUri }} style={styles.photoImage} resizeMode="cover" />
              ) : null}
              {isAnalysisConfirmed ? (
                <>
                  {!ownedCapturedImageUri ? <LinearGradient colors={[snow.heroFrom, snow.heroTo]} style={styles.photoGradient} /> : null}
                  <View style={styles.photoConfidenceBadge}>
                    <Icon name="spark" size={12} color={snow.primaryDeep} />
                    <Text style={styles.photoBadgeText}>{zhTW.mobile.analysis.confidenceLevels[1]}</Text>
                  </View>
                  {!ownedCapturedImageUri ? (
                    <View style={styles.photoIconLarge}>
                      <Icon name="plate" size={26} color={snow.primaryDeep} />
                    </View>
                  ) : null}
                  {!ownedCapturedImageUri ? <Text style={styles.photoAreaText}>{zhTW.mobile.refinedLogic.aiEntry.heroBody}</Text> : null}
                  <View style={styles.photoCaptionBadge}>
                    <Text style={styles.photoBadgeText}>{zhTW.mobile.analysis.imageLabel}</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.photoBadge}>
                    <Icon name="spark" size={12} color={snow.primaryDeep} />
                    <Text style={styles.photoBadgeText}>{zhTW.mobile.nav.analysis}</Text>
                  </View>
                  {!ownedCapturedImageUri ? (
                    <>
                      <View style={styles.photoIcon}>
                        <Icon name="camera" size={22} color={snow.primaryDeep} />
                      </View>
                      <Text style={styles.photoAreaText}>{zhTW.mobile.refinedLogic.aiEntry.heroBody}</Text>
                    </>
                  ) : null}
                </>
              )}
              <SecondaryButton
                icon="camera"
                label={zhTW.mobile.refinedLogic.homeFocus.photoAnalysis}
                onPress={mealPhotoFinalization.payloadLocked ? undefined : () => retakeMealPhoto()}
              />
            </View>
          </SnowCard>

          {ownedCapturedImageUri ? <MealPhotoUploadStatusCard uploadStatus={mealPhotoUpload.uploadStatus} onRetry={mealPhotoUpload.retryUpload} /> : null}

          {ownedCapturedImageUri ? (
            <MealPhotoAnalysisResultCard
              invocationStatus={mealPhotoAnalysis.analysisInvocationStatus}
              primary={primaryCandidate}
              fallbacks={fallbackCandidates}
              fallbackRevealed={fallbackRevealed}
              onAcceptPrimary={acceptPrimaryCandidate}
              onRejectPrimary={revealFallbackCandidates}
              onRequestCorrection={requestPrimaryCorrection}
              contextBlockReason={finalizationContextBlockReason}
              // Compact inline controls, rendered inside the result card exactly where the blocked
              // acceptance lives. Suppressed while the editor is open because that panel already
              // carries the same three controls — they must never appear twice.
              contextControls={
                showFinalizationEditor ? null : (
                  <>
                    <MealSourceSection
                      embedded
                      analysis={analysis}
                      payloadLocked={mealPhotoFinalization.payloadLocked}
                      frozenContext={frozenFinalizationContext}
                    />
                    <RecordTimingSection
                      embedded
                      analysis={analysis}
                      timezone={profileTimezone}
                      payloadLocked={mealPhotoFinalization.payloadLocked}
                      frozenContext={frozenFinalizationContext}
                    />
                    <MealPeriodSection
                      embedded
                      selectedMealPeriod={
                        frozenFinalizationContext?.selectedMealPeriod ?? selectedMealPeriod
                      }
                      payloadLocked={mealPhotoFinalization.payloadLocked}
                      onSelect={setSelectedMealPeriod}
                    />
                  </>
                )
              }
              selectedCandidateId={
                mealPhotoFinalization.payloadLocked && mealPhotoFinalization.draft
                  ? mealPhotoFinalization.draft.selectedCandidateId
                  : mealPhotoAnalysis.selectedCandidateId
              }
              safeErrorCode={mealPhotoAnalysis.safeAnalysisErrorCode}
              consumerRuntimeMode={consumerRuntime.mode}
              payloadLocked={mealPhotoFinalization.payloadLocked}
              onRetry={
                mealPhotoFinalization.payloadLocked
                  ? undefined
                  : mealPhotoAnalysis.retryAnalysis
              }
              onAcceptFallback={acceptAnalysisCandidateInOneStep}
              onChooseManual={chooseManualMealInput}
            />
          ) : null}

          {showFinalizationEditor && mealPhotoFinalization.draft ? (
            <SnowCard tone="ai">
              <SnowSectionHeader
                title={zhTW.mobile.mealPhotoFinalization.editorTitle}
                subtitle={
                  mealPhotoFinalization.draft.mode === "manual"
                    ? zhTW.mobile.mealPhotoFinalization.manualMode
                    : zhTW.mobile.mealPhotoFinalization.candidateMode
                }
              />
              <MealPeriodSection
                embedded
                selectedMealPeriod={
                  frozenFinalizationContext?.selectedMealPeriod ??
                  selectedMealPeriod
                }
                payloadLocked={mealPhotoFinalization.payloadLocked}
                onSelect={setSelectedMealPeriod}
              />
              <MealSourceSection
                embedded
                analysis={analysis}
                payloadLocked={mealPhotoFinalization.payloadLocked}
                frozenContext={frozenFinalizationContext}
              />
              <RecordTimingSection
                embedded
                analysis={analysis}
                timezone={profileTimezone}
                payloadLocked={mealPhotoFinalization.payloadLocked}
                frozenContext={frozenFinalizationContext}
              />
              <MealPhotoFinalizationEditor
                embedded
                draft={mealPhotoFinalization.draft}
                contextBlockReason={getMealPhotoFinalizationContextBlockReason({
                  occurredAt:
                    frozenFinalizationContext?.occurredAt ??
                    analysis.occurredAt ??
                    "",
                  recordTimingConfirmed:
                    frozenFinalizationContext !== null ||
                    analysis.recordTimingConfirmed,
                  sourceContext:
                    frozenFinalizationContext?.sourceContext ??
                    analysis.mealSource ??
                    analysis.sourceContext,
                  selectedMealPeriod:
                    frozenFinalizationContext?.selectedMealPeriod ??
                    selectedMealPeriod
                })}
                payloadLocked={mealPhotoFinalization.payloadLocked}
                onChange={mealPhotoFinalization.updateField}
                onSubmit={submitMealPhotoFinalizationEditor}
              />
            </SnowCard>
          ) : !hasAiFinalizationFlow ? (
            /* MI-E-C5-R5-R1 §九: these standalone cards belong to the legacy non-C5 path only. In
               the real C5 flow the same three controls are rendered compactly inside the result
               card, next to the acceptance they are actually blocking. */
            <>
              <MealPeriodSection
                selectedMealPeriod={
                  frozenFinalizationContext?.selectedMealPeriod ??
                  selectedMealPeriod
                }
                payloadLocked={mealPhotoFinalization.payloadLocked}
                onSelect={setSelectedMealPeriod}
              />
              <MealSourceSection
                analysis={analysis}
                payloadLocked={mealPhotoFinalization.payloadLocked}
                frozenContext={frozenFinalizationContext}
              />
              <RecordTimingSection
                analysis={analysis}
                timezone={profileTimezone}
                payloadLocked={mealPhotoFinalization.payloadLocked}
                frozenContext={frozenFinalizationContext}
              />
            </>
          ) : null}

          {!hasAiFinalizationFlow && analysis.isSelfCooked ? (
            <SelfCookedIntro nutritionSummary={analysis.nutritionSummary} />
          ) : !hasAiFinalizationFlow && isAnalysisConfirmed ? (
            <CompletedAnalysisHero
              nutritionSummary={analysis.nutritionSummary}
              mealName={analysis.mealName}
              guiltSharingResult={guiltSharingResult}
              onOpenMealLog={finalizeMealIdentificationFromExplicitGesture}
              finalizing={consumerRuntime.mealIdentificationFinalizationState.status === "submitting" || !canFinalize}
              onOpenNutritionRecord={() => router.push("/meal-log")}
              onGuiltShare={handleGuiltSharingConfirm}
              nextMealRecommendations={nextMealRecommendations}
              isPremium={demoMode === "premium"}
              onSelectMeal={openNextMealRecommendation}
              onViewRestaurant={(restaurantId) => router.push({ pathname: "/restaurants", params: { restaurantId } })}
            />
          ) : !hasAiFinalizationFlow ? (
            <ExternalDiningAnalysis
              analysis={analysis}
              resolution={candidateResolution}
              onRetry={restaurantCatalog.refresh}
            />
          ) : null}

          {!hasAiFinalizationFlow && !analysis.isSelfCooked && analysis.matchState === "editing" ? (
            <CandidateCorrectionList
              analysis={analysis}
              resolution={candidateResolution}
              onRetry={restaurantCatalog.refresh}
              renderSuccessActions={renderSuccessActions}
            />
          ) : null}

          {consumerRuntime.mealIdentificationFinalizationState.status === "submitting" ? (
            <Card><SectionTitle title={zhTW.mobile.mealIdentificationFinalization.submitting} /></Card>
          ) : null}
          {consumerRuntime.mealIdentificationFinalizationState.status === "uncertain" ? (
            <Card>
              <SectionTitle title={zhTW.mobile.mealIdentificationFinalization.uncertainTitle} subtitle={zhTW.mobile.mealIdentificationFinalization.uncertainBody} />
              <View style={styles.ctaColumn}>
                <PrimaryButton
                  icon="check"
                  label={zhTW.mobile.mealIdentificationFinalization.retrySameRequest}
                  onPress={
                    hasAiFinalizationFlow
                      ? () => void mealPhotoFinalization.retryPending()
                      : retryPendingMealIdentificationFinalization
                  }
                />
                <SecondaryButton icon="chart" label={zhTW.mobile.mealIdentificationFinalization.checkTodayIntake} onPress={() => router.push("/today-intake")} />
              </View>
            </Card>
          ) : (hasAiFinalizationFlow
              ? Boolean(mealPhotoFinalization.draft?.lastSafeError)
              : consumerRuntime.mealIdentificationFinalizationState.status === "error" ||
                Boolean(localFinalizationErrorCode)) ? (
            <MealIdentificationFinalizationErrorCard
              kind={mapMealIdentificationFinalizationUiError(
                hasAiFinalizationFlow
                  ? mealPhotoFinalization.draft?.lastSafeError ?? null
                  : localFinalizationErrorCode ??
                    consumerRuntime.mealIdentificationFinalizationState.errorCode
              )}
              onCheckTodayIntake={() => router.push("/today-intake")}
            />
          ) : null}

          {showLegacyAnalysisBlocks && !isAnalysisConfirmed ? (
            <SnowCard>
              <SnowSectionHeader title={zhTW.mobile.analysis.summary} subtitle={zhTW.mobile.analysis.summaryDemoDisclosure} />
              <View style={styles.statGrid}>
                <StatCard icon="flame" label={zhTW.mobile.analysis.calories} value={`${analysis.nutritionSummary.calories} kcal`} tone="primary" />
                <StatCard icon="leaf" label={zhTW.mobile.analysis.protein} value={`${analysis.nutritionSummary.protein}g`} />
                <StatCard icon="target" label={zhTW.mobile.analysis.carbs} value={`${analysis.nutritionSummary.carbohydrates}g`} tone="ai" />
                <StatCard icon="star" label={zhTW.mobile.analysis.fat} value={`${analysis.nutritionSummary.fat}g`} />
                <StatCard icon="bookmark" label={zhTW.mobile.finalUx.mealRecordFields[3]} value={analysis.nutritionSummary.portion} />
                <StatCard icon="check" label={zhTW.mobile.analysis.balanceScore} value={`${analysis.nutritionSummary.balanceScore}`} tone="primary" />
              </View>
              <View style={styles.ingredientSection}>
                <Text style={styles.ingredientLabel}>{zhTW.mobile.finalUx.ingredientCorrectionTitle}</Text>
                <View style={styles.ingredientList}>
                  {analysis.nutritionSummary.ingredientSummary
                    .split(/[、,，]/)
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .map((item, index) => (
                      <View key={item} style={styles.ingredientRow}>
                        <View style={[styles.ingredientDot, [styles.ingredientDotPrimary, styles.ingredientDotAccent, styles.ingredientDotAmber, styles.ingredientDotGreen][index % 4]]} />
                        <Text style={styles.ingredientName}>{item}</Text>
                      </View>
                    ))}
                </View>
              </View>
            </SnowCard>
          ) : null}

          {!hasAiFinalizationFlow && analysis.isSelfCooked ? (
            <Card>
              <SectionTitle title={zhTW.mobile.finalUx.ingredientCorrectionTitle} subtitle={zhTW.mobile.finalUx.ingredientCorrectionBody} />
              <SelfCookedCorrectionPanel
                addSection={analysis.addSection}
                confirmAddedSection={analysis.confirmAddedSection}
                confirmCorrectionRow={analysis.confirmCorrectionRow}
                correctedRows={analysis.correctedRows}
                correctionCompleted={analysis.correctionCompleted}
                correctionSections={analysis.correctionSections}
                completeCorrection={analysis.completeCorrection}
                expandedCorrection={analysis.expandedCorrection}
                nutritionRefreshed={analysis.nutritionRefreshed}
                nutritionSummary={analysis.nutritionSummary}
                renderSuccessActions={renderSuccessActions}
                toggleAddSection={analysis.toggleAddSection}
                toggleCorrectionRow={analysis.toggleCorrectionRow}
              />
            </Card>
          ) : null}

          {showLegacyAnalysisBlocks && !isAnalysisConfirmed ? (
            <SnowCard tone="ai">
              <SnowSectionHeader title={zhTW.mobile.nextMealTitle} subtitle={zhTW.mobile.analysis.recommendation} />
              <Text style={styles.stateText}>{zhTW.mobile.refinedLogic.analysisFlow.bridgeBody}</Text>
            </SnowCard>
          ) : null}

          {showLegacyAnalysisBlocks && !isAnalysisConfirmed ? (
            <SnowCard>
              <SnowSectionHeader title={zhTW.mobile.analysis.mealTagsTitle} />
              <View style={styles.chipRow}>
                {(analysis.isSelfCooked ? zhTW.mobile.analysis.selfCookedTags : zhTW.mobile.analysis.mealTags).map((tag) => (
                  <Chip key={tag} label={tag} />
                ))}
              </View>
            </SnowCard>
          ) : null}

          {showLegacyAnalysisBlocks && !isAnalysisConfirmed ? (
            <SnowCard>
              <SnowSectionHeader title={zhTW.mobile.analysis.goalTagsTitle} />
              <View style={styles.chipRow}>
                {zhTW.mobile.analysis.goalTags.map((tag) => (
                  <Chip key={tag} label={tag} tone="ai" />
                ))}
              </View>
            </SnowCard>
          ) : null}
        </>
      )}
    </PlaceholderScreen>
  );
}

// MI-E-C3/R1: photo upload status only — deliberately never claims AI analysis is running or
// done. meal-photo.tsx's demo-timer card (zhTW.mobile.refinedLogic.aiEntry.loading*) was
// corrected in MI-E-C3-R1 to stop claiming "AI 分析中"; this card only ever speaks to whether the
// photo itself has safely reached private Storage yet.
function MealPhotoUploadStatusCard({
  uploadStatus,
  onRetry
}: {
  uploadStatus: ReturnType<typeof useMealPhotoUpload>["uploadStatus"];
  onRetry: () => void;
}) {
  const copy = zhTW.mobile.mealPhotoUpload;
  if (uploadStatus === "not_started") return null;
  return (
    <SnowCard>
      <SnowSectionHeader title={copy.title} />
      <Text style={styles.stateText}>
        {uploadStatus === "uploading" ? copy.uploadingLabel : uploadStatus === "uploaded" ? copy.uploadedLabel : copy.failedLabel}
      </Text>
      {uploadStatus === "uploaded" ? <Text style={styles.disclaimer}>{copy.pendingNote}</Text> : null}
      {uploadStatus === "failed" ? (
        <View style={styles.ctaColumn}>
          <SecondaryButton icon="camera" label={copy.retryCta} onPress={onRetry} />
        </View>
      ) : null}
    </SnowCard>
  );
}

// MI-E-C5-A: real AI-observation candidate presentation only — never a confirmed/final result.
// requiresUserConfirmation is enforced server-side and by the shared response validator (see
// meal-photo-analysis/adapters/supabaseMealPhotoAnalysisRepository.ts); this card's copy always
// reinforces that regardless, since a user should never read "AI 已產生候選" as "meal saved."
function MealPhotoAnalysisResultCard({
  invocationStatus,
  primary,
  fallbacks,
  fallbackRevealed,
  selectedCandidateId,
  onAcceptPrimary,
  onRejectPrimary,
  onRequestCorrection,
  contextBlockReason,
  contextControls,
  safeErrorCode,
  consumerRuntimeMode,
  payloadLocked,
  onRetry,
  onAcceptFallback,
  onChooseManual
}: {
  invocationStatus: ReturnType<typeof useMealPhotoAnalysis>["analysisInvocationStatus"];
  primary: ReturnType<typeof useMealPhotoAnalysis>["analysisCandidates"][number] | null;
  fallbacks: readonly ReturnType<typeof useMealPhotoAnalysis>["analysisCandidates"][number][];
  fallbackRevealed: boolean;
  selectedCandidateId: string | null;
  safeErrorCode: ReturnType<typeof useMealPhotoAnalysis>["safeAnalysisErrorCode"];
  consumerRuntimeMode: ReturnType<typeof useConsumerRuntime>["mode"];
  payloadLocked: boolean;
  onRetry?: () => void;
  onAcceptPrimary: () => void;
  onRejectPrimary: () => void;
  onRequestCorrection: () => void;
  contextBlockReason: MealPhotoFinalizationContextBlockReason | null;
  contextControls: ReactNode;
  onAcceptFallback: (candidate: ReturnType<typeof useMealPhotoAnalysis>["analysisCandidates"][number]) => void;
  onChooseManual: () => void;
}) {
  const copy = zhTW.mobile.mealPhotoAnalysis;
  const primaryCopy = zhTW.mobile.mealPhotoPrimaryResult;
  if (invocationStatus === "not_started") return null;

  if (invocationStatus === "waiting_for_upload") {
    return (
      <SnowCard>
        <SnowSectionHeader title={copy.title} />
        <Text style={styles.stateText}>{copy.waitingForUploadLabel}</Text>
      </SnowCard>
    );
  }

  if (invocationStatus === "invoking") {
    return (
      <SnowCard>
        <SnowSectionHeader title={copy.title} />
        <Text style={styles.stateText}>{copy.invokingLabel}</Text>
      </SnowCard>
    );
  }

  if (invocationStatus === "failed") {
    // analysis_disabled is included in this same table, so a disabled runtime explicitly says
    // "not enabled" here rather than falling through to a generic failure message.
    const errorLabel = (safeErrorCode ? copy.errorCodeLabels[safeErrorCode] : null) ?? copy.errorCodeLabels.internal_error;
    return (
      <SnowCard>
        <SnowSectionHeader title={copy.title} />
        <Text style={styles.stateText}>{copy.failedLabel}</Text>
        <Text style={styles.disclaimer}>{errorLabel}</Text>
        {safeErrorCode !== "analysis_disabled" ? (
          <View style={styles.ctaColumn}>
            <SecondaryButton icon="camera" label={copy.retryCta} onPress={onRetry} />
          </View>
        ) : null}
      </SnowCard>
    );
  }

  // MI-E-C5-R5 primary-first presentation: the AI's single best match is shown alone with an
  // accept/reject pair. Fallback alternatives are not rendered at all until the user explicitly
  // rejects the primary, and only the fallbacks the response actually contained are ever shown.
  //
  // MI-E-C5-R5-R1: both accept gestures are terminal — pressing them finalizes. So they are the
  // actions that readiness must block, and the missing control is offered right here rather than
  // behind an editor the accept path never opens.
  const finalizationCopy = zhTW.mobile.mealPhotoFinalization;
  const contextBlockLabel =
    contextBlockReason === "missing_meal_source"
      ? finalizationCopy.missingMealSource
      : contextBlockReason === "missing_occurred_at"
        ? finalizationCopy.missingOccurredAt
        : contextBlockReason === "missing_record_timing"
          ? finalizationCopy.missingRecordTiming
          : contextBlockReason === "missing_meal_period"
            ? finalizationCopy.missingMealPeriod
            : null;
  const acceptBlocked = payloadLocked || contextBlockReason !== null;

  return (
    <SnowCard>
      <SnowSectionHeader
        title={primaryCopy.title}
        subtitle={invocationStatus === "low_confidence" ? primaryCopy.lowConfidenceSubtitle : primaryCopy.subtitle}
      />
      {consumerRuntimeMode === "mock" ? <Text style={styles.disclaimer}>{copy.mockBadge}</Text> : null}
      {primary ? (
        <MealPhotoAnalysisCandidateRow
          candidate={primary}
          selected={primary.candidateId === selectedCandidateId}
          disabled={payloadLocked}
          onSelect={undefined}
        />
      ) : null}
      <Text style={styles.disclaimer}>
        {copy.disclaimerEstimate}　·　{copy.disclaimerNutrition}
      </Text>
      {contextBlockLabel ? (
        <View style={styles.finalizationPanelSection}>
          <SnowSectionHeader title={primaryCopy.contextRequiredTitle} subtitle={contextBlockLabel} />
          {contextControls}
        </View>
      ) : null}
      {!fallbackRevealed ? (
        <View style={styles.ctaColumn}>
          <Text style={styles.disclaimer}>{primaryCopy.acceptPrimaryNote}</Text>
          <View style={styles.ctaRow2}>
            <View style={styles.ctaItem}>
              <PrimaryButton
                icon="check"
                disabled={acceptBlocked || !primary}
                label={zhTW.mobile.analysis.confirmMatch}
                onPress={acceptBlocked || !primary ? undefined : onAcceptPrimary}
              />
            </View>
            <View style={styles.ctaItem}>
              <SecondaryButton
                icon="edit"
                label={zhTW.mobile.analysis.notThis}
                onPress={payloadLocked ? undefined : onRejectPrimary}
              />
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.finalizationPanelSection}>
          <SnowSectionHeader
            title={primaryCopy.fallbackTitle}
            subtitle={fallbacks.length > 0 ? primaryCopy.fallbackBody : primaryCopy.fallbackEmptyBody}
          />
          {fallbacks.map((candidate) => (
            <MealPhotoAnalysisCandidateRow
              key={candidate.candidateId}
              candidate={candidate}
              selected={candidate.candidateId === selectedCandidateId}
              disabled={acceptBlocked}
              actionLabel={primaryCopy.fallbackSelectCta}
              onSelect={acceptBlocked ? undefined : () => onAcceptFallback(candidate)}
            />
          ))}
          {fallbacks.length > 0 ? (
            <Text style={styles.disclaimer}>{primaryCopy.fallbackActionNote}</Text>
          ) : null}
          <View style={styles.ctaColumn}>
            <SecondaryButton
              icon="edit"
              label={primaryCopy.correctCta}
              onPress={payloadLocked ? undefined : onRequestCorrection}
            />
            <SecondaryButton
              icon="edit"
              label={zhTW.mobile.mealPhotoFinalization.noneOfAboveCta}
              onPress={payloadLocked ? undefined : onChooseManual}
            />
          </View>
        </View>
      )}
    </SnowCard>
  );
}

function MealPhotoFinalizationSubsection({
  children,
  embedded = false,
  tone = "default"
}: {
  children: ReactNode;
  embedded?: boolean;
  tone?: "default" | "ai";
}) {
  return embedded ? (
    <View style={styles.finalizationPanelSection}>{children}</View>
  ) : (
    <SnowCard tone={tone}>{children}</SnowCard>
  );
}

function MealPeriodSection({
  selectedMealPeriod,
  payloadLocked,
  onSelect,
  embedded = false
}: {
  selectedMealPeriod: string;
  payloadLocked: boolean;
  onSelect: (period: string) => void;
  embedded?: boolean;
}) {
  return (
    <MealPhotoFinalizationSubsection embedded={embedded}>
      <SnowSectionHeader title={zhTW.mobile.analysis.modeTitle} subtitle="這是第幾餐？" />
      <View style={styles.chipRow}>
        {zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotOptions.map((period) => (
          <Chip
            key={period}
            label={period}
            active={selectedMealPeriod === period}
            onPress={payloadLocked ? undefined : () => onSelect(period)}
          />
        ))}
      </View>
    </MealPhotoFinalizationSubsection>
  );
}

function MealSourceSection({
  analysis,
  payloadLocked,
  frozenContext,
  embedded = false
}: {
  analysis: ReturnType<typeof useAnalysisCorrectionState>;
  payloadLocked: boolean;
  frozenContext: MealPhotoFinalizationDraftState["context"] | null;
  embedded?: boolean;
}) {
  const selectedSource = frozenContext?.sourceContext ?? analysis.mealSource;
  return (
    <MealPhotoFinalizationSubsection embedded={embedded}>
      <SnowSectionHeader
        title={zhTW.mobile.analysis.mealSourceTitle}
        subtitle={zhTW.mobile.analysis.mealSourceSubtitle}
      />
      <View style={styles.chipRow}>
        <Chip
          label={zhTW.mobile.analysis.mealSourceDineIn}
          active={selectedSource === "dine_in"}
          onPress={payloadLocked ? undefined : () => analysis.setMealSource("dine_in")}
        />
        <Chip
          label={zhTW.mobile.analysis.mealSourceTakeout}
          active={selectedSource === "takeout"}
          onPress={payloadLocked ? undefined : () => analysis.setMealSource("takeout")}
        />
        <Chip
          label={zhTW.mobile.analysis.mealSourceDelivery}
          active={selectedSource === "delivery"}
          onPress={payloadLocked ? undefined : () => analysis.setMealSource("delivery")}
        />
        <Chip
          label={zhTW.mobile.analysis.mealSourceSelfCooked}
          active={selectedSource === "self_cooked"}
          onPress={payloadLocked ? undefined : () => analysis.setMealSource("self_cooked")}
        />
      </View>
      {!selectedSource ? (
        <Text style={styles.stateText}>{zhTW.mobile.analysis.mealSourceRequiredHint}</Text>
      ) : null}
    </MealPhotoFinalizationSubsection>
  );
}

function MealPhotoFinalizationEditor({
  draft,
  contextBlockReason,
  payloadLocked,
  onChange,
  onSubmit,
  embedded = false
}: {
  draft: MealPhotoFinalizationDraftState;
  contextBlockReason: MealPhotoFinalizationContextBlockReason | null;
  payloadLocked: boolean;
  onChange: (field: MealPhotoFinalizationField, value: string) => void;
  onSubmit: () => void;
  embedded?: boolean;
}) {
  const copy = zhTW.mobile.mealPhotoFinalization;
  const submitting = draft.submissionStatus === "submitting";
  const succeeded = draft.submissionStatus === "succeeded";
  const hardFailure =
    draft.lastSafeError === "finalization_analysis_already_finalized" ||
    draft.lastSafeError === "finalization_idempotency_conflict";
  const fields: Array<{
    key: MealPhotoFinalizationField;
    label: string;
    numeric?: boolean;
    multiline?: boolean;
  }> = [
    { key: "mealName", label: copy.mealNameLabel },
    { key: "components", label: copy.componentsLabel, multiline: true },
    { key: "portion", label: copy.portionLabel },
    { key: "calories", label: copy.caloriesLabel, numeric: true },
    { key: "proteinGrams", label: copy.proteinLabel, numeric: true },
    { key: "carbsGrams", label: copy.carbsLabel, numeric: true },
    { key: "fatGrams", label: copy.fatLabel, numeric: true }
  ];
  const hasValidation = Object.keys(draft.validation).length > 0;
  const submitDisabled =
    payloadLocked ||
    submitting ||
    succeeded ||
    hardFailure ||
    contextBlockReason !== null ||
    hasValidation;
  const submitUnavailableReason =
    contextBlockReason === "missing_meal_source"
      ? copy.missingMealSource
      : contextBlockReason === "missing_occurred_at"
        ? copy.missingOccurredAt
        : contextBlockReason === "missing_record_timing"
          ? copy.missingRecordTiming
          : contextBlockReason === "missing_meal_period"
            ? copy.missingMealPeriod
            : hasValidation
              ? copy.resolveValidation
              : hardFailure
                ? copy.hardFailure
                : payloadLocked
                  ? copy.payloadLocked
                  : succeeded
                    ? copy.succeeded
                    : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <MealPhotoFinalizationSubsection embedded={embedded} tone="ai">
        {!embedded ? (
          <SnowSectionHeader
            title={copy.editorTitle}
            subtitle={draft.mode === "manual" ? copy.manualMode : copy.candidateMode}
          />
        ) : null}
        {/* MI-E-C5-R3: read-only presentation only — no authoritative restaurant source exists
            anywhere in the AI candidate contract yet, so this always shows the 未知 fallback. Not
            part of MealPhotoFinalizationDraftState: nothing here needs to be tracked, retried, or
            sent in the finalization payload, so it stays out of the draft/fingerprint entirely. */}
        <View style={styles.finalizationField}>
          <Text style={styles.finalizationFieldLabel}>{copy.restaurantNameLabel}</Text>
          <Text accessibilityLabel={copy.restaurantNameLabel} accessibilityRole="text" style={styles.stateText}>
            {copy.restaurantNameUnknown}
          </Text>
        </View>
        {fields.map((field) => {
          const error = draft.validation[field.key];
          return (
            <View key={field.key} style={styles.finalizationField}>
              <Text style={styles.finalizationFieldLabel}>{field.label}</Text>
              <TextInput
                accessibilityLabel={field.label}
                editable={!submitting && !succeeded && !payloadLocked}
                keyboardType={field.numeric ? "decimal-pad" : "default"}
                multiline={field.multiline}
                onChangeText={(value) => onChange(field.key, value)}
                style={[styles.finalizationInput, field.multiline ? styles.finalizationInputMultiline : null]}
                value={draft.editable[field.key]}
              />
              {error ? (
                <Text style={styles.validationText}>
                  {error === "required"
                    ? copy.requiredError
                    : error === "too_large"
                      ? copy.limitError
                      : copy.numberError}
                </Text>
              ) : null}
            </View>
          );
        })}
        <Text style={styles.stateText}>
          {draft.mode === "candidate" && !draft.dirty ? copy.unchangedBadge : copy.changedBadge}
        </Text>
        <Text style={styles.disclaimer}>{copy.serverAuthorityNote}</Text>
        {submitUnavailableReason ? (
          <Text accessibilityLiveRegion="polite" style={styles.validationText}>
            {submitUnavailableReason}
          </Text>
        ) : null}
        <PrimaryButton
          disabled={submitDisabled}
          icon="check"
          label={
            submitting
              ? copy.submittingLabel
              : draft.attempted && draft.submissionStatus === "failed"
                ? copy.retryCta
                : copy.submitCta
          }
          onPress={submitDisabled ? undefined : onSubmit}
        />
      </MealPhotoFinalizationSubsection>
    </KeyboardAvoidingView>
  );
}

function MealPhotoAnalysisCandidateRow({
  candidate,
  selected,
  disabled,
  actionLabel,
  onSelect
}: {
  candidate: ReturnType<typeof useMealPhotoAnalysis>["analysisCandidates"][number];
  selected: boolean;
  disabled: boolean;
  // MI-E-C5-R5-R1: a fallback row now finalizes on tap, so its caller can say so instead of the
  // frozen 「選擇這個候選」 wording, which would understate what the gesture does.
  actionLabel?: string;
  onSelect?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onSelect}
      style={[styles.candidateRow, selected && styles.candidateRowSelected]}
    >
      <Text style={styles.stateText}>{candidate.observedName}</Text>
      <Text style={[styles.disclaimer, selected ? styles.candidateSelectedLabel : null]}>
        {selected
          ? zhTW.mobile.mealPhotoAnalysis.selectedBadge
          : actionLabel ?? zhTW.mobile.mealPhotoAnalysis.selectCta}
      </Text>
    </Pressable>
  );
}

// Structural prop type: accepts both the legacy correction-state summary and the MI-E-C5-R5
// confirmed completion snapshot's nutrition, without either having to know about the other.
function MacroChipsRow({
  nutritionSummary
}: {
  nutritionSummary: { calories: number; protein: number; carbohydrates: number; fat: number };
}) {
  const items: { label: string; value: string; unit: string; chipStyle: object; valueStyle: object }[] = [
    { label: zhTW.mobile.analysis.calories, value: `${nutritionSummary.calories}`, unit: "kcal", chipStyle: styles.macroChipPrimary, valueStyle: styles.macroValuePrimary },
    { label: zhTW.mobile.analysis.protein, value: `${nutritionSummary.protein}`, unit: "g", chipStyle: styles.macroChipPrimary, valueStyle: styles.macroValuePrimary },
    { label: zhTW.mobile.analysis.carbs, value: `${nutritionSummary.carbohydrates}`, unit: "g", chipStyle: styles.macroChipAccent, valueStyle: styles.macroValueAccent },
    { label: zhTW.mobile.analysis.fat, value: `${nutritionSummary.fat}`, unit: "g", chipStyle: styles.macroChipAmber, valueStyle: styles.macroValueAmber }
  ];

  return (
    <View style={styles.macroRow}>
      {items.map((item) => (
        <View key={item.label} style={[styles.macroChip, item.chipStyle]}>
          <Text style={[styles.macroChipValue, item.valueStyle]}>
            {item.value}
            <Text style={styles.macroChipUnit}> {item.unit}</Text>
          </Text>
          <Text style={styles.macroChipLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function SelfCookedIntro({ nutritionSummary }: { nutritionSummary: ReturnType<typeof useAnalysisCorrectionState>["nutritionSummary"] }) {
  return (
    <SnowCard tone="primary">
      <SnowSectionHeader title={zhTW.mobile.analysis.selfCookedTitle} subtitle={zhTW.mobile.analysis.selfCookedBody} />
      <MacroChipsRow nutritionSummary={nutritionSummary} />
      <Text style={styles.disclaimer}>{zhTW.mobile.analysis.nutritionDisclaimer}</Text>
      <EstimatePreview title={zhTW.mobile.analysis.estimatedIngredientsTitle} items={zhTW.mobile.analysis.estimatedIngredients} />
      <EstimatePreview title={zhTW.mobile.analysis.estimatedPortionsTitle} items={zhTW.mobile.analysis.estimatedPortions} />
      <EstimatePreview title={zhTW.mobile.analysis.estimatedCookingTitle} items={zhTW.mobile.analysis.estimatedCooking} />
      <Text style={styles.confidence}>{zhTW.mobile.analysis.confidenceLevels[1]}</Text>
      <Text style={styles.stateText}>{zhTW.mobile.analysis.selfCookedSaved}</Text>
      <View style={styles.chipRow}>
        {zhTW.mobile.analysis.selfCookedTags.map((tag) => (
          <Chip key={tag} label={tag} tone="primary" />
        ))}
      </View>
    </SnowCard>
  );
}

function CompletedAnalysisHero({
  nutritionSummary,
  mealName,
  finalizing,
  guiltSharingResult,
  onOpenMealLog,
  onOpenNutritionRecord,
  onGuiltShare,
  nextMealRecommendations,
  isPremium,
  onSelectMeal,
  onViewRestaurant,
  completion = null,
  onViewTodayIntake,
  onAnalyzeAnother
}: {
  nutritionSummary: { calories: number; protein: number; carbohydrates: number; fat: number };
  mealName: string;
  finalizing: boolean;
  guiltSharingResult: { peopleCount: number; sharedCaloriesPerPerson: number } | null;
  onOpenMealLog: () => void;
  onOpenNutritionRecord: () => void;
  onGuiltShare: (result: { peopleCount: number; sharedCaloriesPerPerson: number }) => void;
  nextMealRecommendations: NextMealRecommendationCard[];
  isPremium: boolean;
  onSelectMeal: (item: NextMealRecommendationCard) => void;
  onViewRestaurant: (restaurantId: string) => void;
  completion?: CompletedMealPhotoAnalysisSnapshot | null;
  onViewTodayIntake?: () => void;
  onAnalyzeAnother?: () => void;
}) {
  const completedCopy = zhTW.mobile.mealPhotoCompletion;
  return (
    <SnowCard tone="primary">
      <View style={styles.completedHeroVisual}>
        <View style={styles.completedCheck}>
          <Icon name="check" size={36} color="#FFFFFF" />
        </View>
      </View>
      {/* MI-E-C5-R5: in the real C5 flow every value below is the user-confirmed draft plus a
          durable finalization result, so this copy can truthfully say the meal is analyzed and
          saved. The legacy demo path keeps the older "示範資料" disclosure. */}
      {completion ? (
        <SnowSectionHeader title={completedCopy.title} subtitle={completedCopy.body} />
      ) : (
        <SnowSectionHeader title={zhTW.mobile.refinedLogic.analysisFlow.bridgeTitle} subtitle={zhTW.mobile.refinedLogic.analysisFlow.bridgeBody} />
      )}
      <MacroChipsRow nutritionSummary={nutritionSummary} />
      <NextMealRecommendationCarousel recommendations={nextMealRecommendations} isPremium={isPremium} onSelectMeal={onSelectMeal} onViewRestaurant={onViewRestaurant} />
      <SingleMealGuiltShare
        estimatedCalories={nutritionSummary.calories}
        mealName={mealName}
        calorieSharingPeopleCount={guiltSharingResult?.peopleCount}
        sharedCaloriesPerPerson={guiltSharingResult?.sharedCaloriesPerPerson}
        onShare={onGuiltShare}
      />
      {/* MI-E-C5-R5: after a durable finalization the meal is already saved, so none of these
          actions may call the finalization RPC again. They are read-only navigations plus a
          "start a new analysis" entry, and the 加入今日飲食 wording is deliberately gone here so
          it can never read as "this meal has not been stored yet". */}
      {completion ? (
        <>
          <Text style={styles.disclaimer}>{completedCopy.savedNote}</Text>
          <View style={styles.ctaColumn}>
            <View style={styles.ctaRow2}>
              <View style={styles.ctaItem}>
                <SecondaryButton icon="chart" label={completedCopy.viewTodayIntake} onPress={onViewTodayIntake} />
              </View>
              <View style={styles.ctaItem}>
                <SecondaryButton icon="bookmark" label={completedCopy.viewFoodDiary} onPress={onOpenNutritionRecord} />
              </View>
            </View>
            <SecondaryButton icon="camera" label={completedCopy.analyzeAnother} onPress={onAnalyzeAnother} />
          </View>
        </>
      ) : (
        <View style={styles.ctaColumn}>
          <View style={styles.ctaRow2}>
            <View style={styles.ctaItem}>
              <SecondaryButton
                icon="check"
                label={zhTW.mobile.refinedLogic.analysisFlow.saveMealRecord}
                onPress={finalizing ? undefined : onOpenMealLog}
              />
            </View>
            <View style={styles.ctaItem}>
              <SecondaryButton icon="chart" label={zhTW.mobile.refinedLogic.analysisFlow.viewNutritionRecord} onPress={onOpenNutritionRecord} />
            </View>
          </View>
        </View>
      )}
    </SnowCard>
  );
}

function MealIdentificationFinalizationErrorCard({
  kind,
  onCheckTodayIntake
}: {
  kind: ReturnType<typeof mapMealIdentificationFinalizationUiError>;
  onCheckTodayIntake: () => void;
}) {
  const copy = zhTW.mobile.mealIdentificationFinalization.errors[kind];
  return (
    <Card>
      <SectionTitle title={copy.title} subtitle={copy.body} />
      {(kind === "conflict" ||
        kind === "catalog" ||
        kind === "alreadyFinalized" ||
        kind === "persistence" ||
        kind === "generic") ? (
        <View style={styles.ctaColumn}>
          <SecondaryButton
            icon="chart"
            label={zhTW.mobile.mealIdentificationFinalization.checkTodayIntake}
            onPress={onCheckTodayIntake}
          />
        </View>
      ) : null}
    </Card>
  );
}

// Shows and lets the user edit meal source timing before finalization (Section E of
// MI-E-B2). Camera-captured sessions never render a current/post-hoc toggle at all —
// recordTiming stays "current" with no way to switch, matching the frozen product rule
// that camera flow cannot accidentally become post_hoc.
function RecordTimingSection({
  analysis,
  timezone,
  payloadLocked,
  frozenContext,
  embedded = false
}: {
  analysis: ReturnType<typeof useAnalysisCorrectionState>;
  timezone: string;
  payloadLocked: boolean;
  frozenContext: MealPhotoFinalizationDraftState["context"] | null;
  embedded?: boolean;
}) {
  const copy = zhTW.mobile.mealRecordTiming;

  if (payloadLocked && frozenContext) {
    return (
      <MealPhotoFinalizationSubsection embedded={embedded}>
        <SnowSectionHeader title={copy.actualMealTimeTitle} />
        <Text style={styles.stateText}>
          {frozenContext.recordTiming === "current"
            ? copy.currentSummaryLabel
            : `${copy.postHocSummaryLabel}：${formatMealOccurrenceDisplay(
                frozenContext.occurredAt,
                timezone
              )}`}
        </Text>
      </MealPhotoFinalizationSubsection>
    );
  }

  if (analysis.captureMethod === "camera") {
    return (
      <MealPhotoFinalizationSubsection embedded={embedded}>
        <SnowSectionHeader title={copy.actualMealTimeTitle} />
        <Text style={styles.stateText}>{copy.currentSummaryLabel}</Text>
      </MealPhotoFinalizationSubsection>
    );
  }

  if (analysis.recordTiming === "post_hoc" && !analysis.recordTimingConfirmed) {
    return <PostHocPicker analysis={analysis} embedded={embedded} />;
  }

  if (!analysis.recordTimingConfirmed) {
    return (
      <MealPhotoFinalizationSubsection embedded={embedded} tone="ai">
        <SnowSectionHeader title={copy.confirmTitle} subtitle={copy.confirmBody} />
        <View style={styles.ctaColumn}>
          <PrimaryButton icon="check" label={copy.currentOption} onPress={analysis.confirmRecordTimingCurrent} />
          <SecondaryButton icon="clock" label={copy.postHocOption} onPress={analysis.beginRecordTimingPostHoc} />
        </View>
      </MealPhotoFinalizationSubsection>
    );
  }

  return (
    <MealPhotoFinalizationSubsection embedded={embedded}>
      <SnowSectionHeader title={copy.actualMealTimeTitle} />
      <Text style={styles.stateText}>
        {analysis.recordTiming === "current"
          ? copy.currentSummaryLabel
          : `${copy.postHocSummaryLabel}：${formatMealOccurrenceDisplay(analysis.occurredAt, timezone)}`}
      </Text>
      <View style={styles.ctaRow2}>
        <View style={styles.ctaItem}>
          <SecondaryButton icon="edit" label={copy.editLabel} onPress={analysis.beginRecordTimingPostHoc} />
        </View>
        {analysis.recordTiming === "post_hoc" ? (
          <View style={styles.ctaItem}>
            <SecondaryButton icon="clock" label={copy.cancelPostHocLabel} onPress={analysis.confirmRecordTimingCurrent} />
          </View>
        ) : null}
      </View>
    </MealPhotoFinalizationSubsection>
  );
}

// Full native date-time picker replacing MI-E-B2's preset-chip picker. Android's native
// pickers are always modal dialogs and only pick one of date/time per dialog, so on
// Android this component opens a date dialog then chains into a time dialog, merging
// both into one single draft Date — the "consistent single draft state" the two
// platforms share despite their different interaction patterns. iOS's combined
// "datetime" mode picks both in one inline control, confirmed/canceled by our own
// buttons. Either way, a Date returned by the native picker already represents an
// unambiguous absolute instant, so no manual timezone conversion is needed here.
function PostHocPicker({
  analysis,
  embedded = false
}: {
  analysis: ReturnType<typeof useAnalysisCorrectionState>;
  embedded?: boolean;
}) {
  const copy = zhTW.mobile.mealRecordTiming;
  const [referenceNow] = useState(() => new Date());
  const maximumDate = useMemo(() => maximumMealOccurrenceInstant(referenceNow), [referenceNow]);
  const initialDraft = useMemo(() => {
    const fromExisting = analysis.occurredAt ? new Date(analysis.occurredAt) : null;
    if (fromExisting && !Number.isNaN(fromExisting.getTime()) && fromExisting.getTime() <= maximumDate.getTime()) {
      return fromExisting;
    }
    return referenceNow;
  }, [analysis.occurredAt, maximumDate, referenceNow]);
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const [androidStage, setAndroidStage] = useState<"date" | "time" | "done">("date");

  function confirm(value: Date): boolean {
    const ok = analysis.setPostHocMealTime(value);
    setError(ok ? null : copy.futureTimeHint);
    return ok;
  }

  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (androidStage === "date") {
      DateTimePickerAndroid.open({
        value: draft,
        mode: "date",
        maximumDate,
        onChange: (event, selectedDate) => {
          if (event.type !== "set" || !selectedDate) {
            analysis.cancelRecordTimingPostHoc();
            return;
          }
          const merged = new Date(draft);
          merged.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
          setDraft(merged);
          setAndroidStage("time");
        }
      });
      return;
    }
    if (androidStage === "time") {
      DateTimePickerAndroid.open({
        value: draft,
        mode: "time",
        is24Hour: true,
        onChange: (event, selectedTime) => {
          if (event.type !== "set" || !selectedTime) {
            analysis.cancelRecordTimingPostHoc();
            return;
          }
          const merged = new Date(draft);
          merged.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
          setDraft(merged);
          // A rejected (future) time leaves androidStage="done" without an open dialog —
          // the retry button below restarts the date→time flow rather than leaving the
          // user stuck on a dead card.
          setAndroidStage(confirm(merged) ? "done" : "date");
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [androidStage]);

  if (Platform.OS === "android") {
    return (
      <MealPhotoFinalizationSubsection embedded={embedded} tone="ai">
        <SnowSectionHeader title={copy.actualMealTimeTitle} subtitle={copy.actualMealTimeBody} />
        {error ? (
          <>
            <Text style={styles.disclaimer}>{error}</Text>
            <View style={styles.ctaColumn}>
              <PrimaryButton icon="clock" label={copy.confirmPostHocCta} onPress={() => setAndroidStage("date")} />
              <SecondaryButton icon="clock" label={copy.cancelPostHocLabel} onPress={analysis.cancelRecordTimingPostHoc} />
            </View>
          </>
        ) : null}
      </MealPhotoFinalizationSubsection>
    );
  }

  return (
    <MealPhotoFinalizationSubsection embedded={embedded} tone="ai">
      <SnowSectionHeader title={copy.actualMealTimeTitle} subtitle={copy.actualMealTimeBody} />
      <RNDateTimePicker
        value={draft}
        mode="datetime"
        maximumDate={maximumDate}
        display="spinner"
        onChange={(_event, selectedValue) => {
          if (selectedValue) setDraft(selectedValue);
        }}
      />
      {error ? <Text style={styles.disclaimer}>{error}</Text> : null}
      <View style={styles.ctaColumn}>
        <PrimaryButton icon="check" label={copy.confirmPostHocCta} onPress={() => confirm(draft)} />
        <SecondaryButton icon="clock" label={copy.cancelPostHocLabel} onPress={analysis.confirmRecordTimingCurrent} />
      </View>
    </MealPhotoFinalizationSubsection>
  );
}

function formatMealOccurrenceDisplay(iso: string | null, timezone: string): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: timezone || undefined,
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(parsed);
  } catch {
    return parsed.toLocaleString();
  }
}

function NextMealRecommendationCarousel({
  recommendations,
  isPremium,
  onSelectMeal,
  onViewRestaurant
}: {
  recommendations: NextMealRecommendationCard[];
  isPremium: boolean;
  onSelectMeal: (item: NextMealRecommendationCard) => void;
  onViewRestaurant: (restaurantId: string) => void;
}) {
  const [expandedReasonId, setExpandedReasonId] = useState("");
  const copy = zhTW.mobile.refinedLogic.analysisFlow;
  const cueScale = useMemo(() => new Animated.Value(hasPlayedRecommendationCardCue ? 1 : 0.985), []);

  useEffect(() => {
    if (hasPlayedRecommendationCardCue || recommendations.length === 0) {
      return;
    }

    hasPlayedRecommendationCardCue = true;
    Animated.sequence([
      Animated.timing(cueScale, { toValue: 1.012, duration: 180, useNativeDriver: true }),
      Animated.timing(cueScale, { toValue: 1, duration: 180, useNativeDriver: true })
    ]).start();
  }, [cueScale, recommendations.length]);

  return (
    <View style={styles.nextMealPanel}>
      <Text style={styles.nextMealEyebrow}>{zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.nextMealSocialTitle}</Text>
      <Text style={styles.nextMealTitle}>{copy.nextMealCarouselTitle}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recoTrack}>
        {recommendations.map((item) => {
          const reasonExpanded = expandedReasonId === item.menuItemId;
          return (
            <Animated.View key={item.menuItemId} style={[styles.recoCard, { transform: [{ scale: cueScale }] }]}>
              <Pressable
                accessibilityHint="查看這筆下一餐推薦結果"
                accessibilityRole="button"
                style={({ pressed }) => [styles.recoCardTapArea, pressed && styles.recoCardTapAreaPressed]}
                onPress={() => onSelectMeal(item)}
              >
                <View style={styles.recoPhoto}>
                  <Text style={styles.recoEmoji}>{item.emoji}</Text>
                </View>
                <Chip label={copy.aiRecommendedBadge} tone="primary" />
                <Text style={styles.recoMatchLabel}>{item.matchPercent}% {copy.matchLabelSuffix}</Text>
                <Text style={styles.recoName}>{item.dishName}</Text>
                <Text style={styles.recoCalories}>{item.calories} kcal</Text>
                <Text style={styles.recoRestaurant}>{item.restaurantName}</Text>
                <Text style={styles.recoDistance}>{item.distance}</Text>
              </Pressable>
              <Pressable
                style={styles.recoReasonToggle}
                onPress={() => setExpandedReasonId((current) => (current === item.menuItemId ? "" : item.menuItemId))}
              >
                <Text style={styles.recoReasonToggleText}>{copy.aiReasonToggleLabel}</Text>
              </Pressable>
              {reasonExpanded ? <Text style={styles.recoReasonText}>{item.reason}</Text> : null}
              <SecondaryButton icon="plate" label={copy.viewRestaurantCta} onPress={() => onViewRestaurant(item.restaurantId)} />
              <Text style={styles.recoTapHint}>點擊餐點查看「這是你的下一餐」</Text>
            </Animated.View>
          );
        })}
      </ScrollView>
      {!isPremium ? <Text style={styles.recoPremiumHint}>{copy.premiumMoreHint}</Text> : null}
    </View>
  );
}

function TodayIntakeSummary({ onFindBuddy, onNextMeal, onOpenMealLog }: { onFindBuddy: () => void; onNextMeal: () => void; onOpenMealLog: () => void }) {
  const intake = zhTW.mobile.analysis.savedIntake;
  const daily = zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake;
  const mealRecords = getTodayMealRecords();
  const lunchRecord = mealRecords.find((meal) => meal.mealPeriod === zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotOptions[1]) ?? mealRecords[0];
  const currentPlannedDinner = getPlannedDinner();
  const plannedDinnerTitle = currentPlannedDinner?.plannedMealName ?? daily.plannedMeal.title;
  const plannedDinnerCalories = currentPlannedDinner?.calories ?? daily.plannedMeal.calories;
  const plannedDinnerNote = currentPlannedDinner ? `${currentPlannedDinner.restaurantName}｜預計，尚未算作已吃` : daily.plannedMeal.note;
  const plannedDinnerTags = currentPlannedDinner ? [currentPlannedDinner.mealType, "預計", "營養估算"] : daily.plannedMeal.tags;

  return (
    <>
      <SnowCard tone="primary">
        <View style={styles.chipRow}>
          <Chip label={intake.savedMessage} />
        </View>
        <SnowSectionHeader title={intake.title} subtitle={intake.body} />
        <View style={styles.intakeHero}>
          <View style={styles.intakeScore}>
            <Text style={styles.intakeScoreText}>82</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.intakeInsight}>{intake.insight}</Text>
            <Text style={styles.intakeAdvice}>{intake.dinnerAdvice}</Text>
            <Text style={styles.intakeAdvice}>{intake.balanceNote}</Text>
          </View>
        </View>
        <View style={styles.statGrid}>
          <StatCard icon="flame" label={intake.caloriesTitle} value={intake.caloriesValue} tone="primary" />
          <StatCard icon="leaf" label={intake.proteinTitle} value={intake.proteinValue} />
          <StatCard icon="target" label={intake.carbsTitle} value={intake.carbsValue} tone="ai" />
          <StatCard icon="star" label={intake.fatTitle} value={intake.fatValue} />
          <StatCard icon="check" label={intake.balanceTitle} value={intake.balanceValue} tone="primary" />
          <StatCard icon="bookmark" label={intake.remainingTitle} value={intake.remainingValue} />
        </View>
      </SnowCard>

      <SnowCard>
        <SnowSectionHeader title={daily.mealRecordsTitle} />
        <View style={styles.mealRecordList}>
          {mealRecords.map((meal) => (
            <View key={meal.mealId ?? `${meal.date}-${meal.mealPeriod}-${meal.mealName}`} style={styles.mealRecordCard}>
              <View style={styles.mealRecordHeader}>
                <Text style={styles.mealTimePill}>{meal.mealPeriod}</Text>
                <Text style={styles.mealRecordCalories}>{getEffectiveCalories(meal)} kcal</Text>
              </View>
              <Text style={styles.mealRecordTitle}>{meal.mealName}</Text>
              <Text style={styles.mealRecordNote}>{meal.restaurantName}｜{meal.ingredients}｜{meal.portion}</Text>
              <TagRow tags={[meal.source ?? "manual", zhTW.mobile.refinedLogic.analysisFlow.saveMealRecord]} />
            </View>
          ))}
        </View>
      </SnowCard>

      <SnowCard tone="ai">
        <SnowSectionHeader title={zhTW.mobile.plannedDinner.lunchRecommendationLabel} subtitle={zhTW.mobile.plannedDinner.lunchAdvice[0]} />
        {lunchRecord ? (
          <View style={styles.currentMealCard}>
            <View style={styles.mealRecordHeader}>
              <Text style={styles.mealTimePill}>{lunchRecord.mealPeriod}</Text>
              <Text style={styles.mealRecordCalories}>{getEffectiveCalories(lunchRecord)} kcal</Text>
            </View>
            <Text style={styles.mealRecordTitle}>{lunchRecord.mealName}</Text>
            <Text style={styles.mealRecordNote}>{lunchRecord.restaurantName}｜{lunchRecord.ingredients}</Text>
            <TagRow tags={[lunchRecord.source ?? "manual", zhTW.mobile.refinedLogic.analysisFlow.saveMealRecord]} />
          </View>
        ) : null}
      </SnowCard>

      <SnowCard tone="primary">
        <SnowSectionHeader title={daily.plannedMealTitle} />
        <View style={styles.plannedMealCard}>
          <Text style={styles.mealRecordTitle}>{plannedDinnerTitle}</Text>
          <Text style={styles.mealRecordCalories}>{plannedDinnerCalories}</Text>
          <Text style={styles.mealRecordNote}>{plannedDinnerNote}</Text>
          <Text style={styles.balanceHint}>{zhTW.mobile.plannedDinner.lunchAdvice[1]}</Text>
          <TagRow tags={plannedDinnerTags} />
        </View>
      </SnowCard>

      <SnowCard tone="primary">
        <SnowSectionHeader title={intake.nextActionsTitle} />
        <View style={styles.ctaColumn}>
          <PrimaryButton icon="buddies" label={intake.findBuddy} onPress={onFindBuddy} />
          <View style={styles.ctaRow2}>
            <View style={styles.ctaItem}>
              <SecondaryButton icon="chart" label={intake.viewLog} onPress={onOpenMealLog} />
            </View>
            <View style={styles.ctaItem}>
              <SecondaryButton icon="clock" label={intake.nextMeal} onPress={onNextMeal} />
            </View>
          </View>
        </View>
      </SnowCard>
    </>
  );
}

function ExternalDiningAnalysis({
  analysis,
  resolution,
  onRetry
}: {
  analysis: ReturnType<typeof useAnalysisCorrectionState>;
  resolution: MealIdentificationCandidateResolution;
  onRetry: () => Promise<void>;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const topCandidate =
    analysis.selectedCandidate?.kind === "catalog_item"
      ? analysis.selectedCandidate
      : resolution.status === "available"
        ? resolution.candidates[0]
        : null;
  const catalogFailed =
    resolution.status === "unavailable" || resolution.status === "error";

  return (
    <SnowCard tone="ai">
      <SnowSectionHeader title={zhTW.mobile.analysis.precisionTitle} subtitle={zhTW.mobile.analysis.precisionBody} />
      <View style={styles.chipRow}>
        <Chip label={topCandidate?.branchContext || zhTW.mobile.analysis.locationLabel} />
        <Chip label={topCandidate ? `${topCandidate.restaurantName}｜${topCandidate.mealItemName}` : zhTW.mobile.analysis.catalogFallbackLabel} />
        <Chip label={zhTW.mobile.analysis.explicitConfirmationLabel} />
      </View>
      <View style={styles.restaurantSummary}>
        <Text style={styles.summaryLabel}>{zhTW.mobile.finalUx.restaurantNameLabel}</Text>
        <Text style={styles.summaryValue}>{topCandidate?.restaurantName ?? analysis.restaurantName}</Text>
        {topCandidate ? <Text style={styles.candidateBody}>{topCandidate.branchName} · {topCandidate.menuName} / {topCandidate.menuCategoryName}</Text> : null}
        <Text style={styles.summaryLabel}>{zhTW.mobile.finalUx.mealNameLabel}</Text>
        <Text style={styles.summaryValue}>{topCandidate?.mealItemName ?? analysis.mealName}</Text>
        {topCandidate ? <Text style={styles.candidateBody}>NT${topCandidate.price} · {nutritionProvenanceLabel(topCandidate)}</Text> : null}
      </View>
      <CandidateResolutionState resolution={resolution} onRetry={onRetry} />
      <MacroChipsRow nutritionSummary={analysis.nutritionSummary} />
      <SecondaryButton
        icon="chevron"
        label={showDetails ? zhTW.mobile.refinedLogic.aiEntry.detailToggleClose : zhTW.mobile.refinedLogic.aiEntry.detailToggleOpen}
        onPress={() => setShowDetails((current) => !current)}
      />
      {showDetails ? (
        <>
          <Text style={styles.costHint}>{zhTW.mobile.finalUx.aiCostControlHint}</Text>
          <View style={styles.chipRow}>
            {zhTW.mobile.analysis.catalogMatchSources.map((source) => (
              <Chip key={source} label={source} />
            ))}
          </View>
          <View style={styles.reasonList}>
            {zhTW.mobile.analysis.matchReasons.map((reason) => (
              <Text key={reason} style={styles.reasonItem}>
                {reason}
              </Text>
            ))}
          </View>
        </>
      ) : null}
      <View style={styles.ctaRow2}>
        <View style={styles.ctaItem}>
          {topCandidate ? (
            <PrimaryButton icon="check" label={zhTW.mobile.analysis.confirmMatch} onPress={() => analysis.confirmCatalogCandidate(topCandidate)} />
          ) : catalogFailed ? (
            <PrimaryButton icon="edit" label={zhTW.mobile.analysis.catalogManualCta} onPress={analysis.openCatalogUnavailableFallback} />
          ) : (
            <PrimaryButton icon="edit" label={zhTW.mobile.finalUx.supplementalDataCta} onPress={analysis.chooseNoneOfTheAbove} />
          )}
        </View>
        <View style={styles.ctaItem}>
          <SecondaryButton icon="edit" label={zhTW.mobile.analysis.notThis} onPress={analysis.chooseNoneOfTheAbove} />
        </View>
      </View>
      {analysis.matchState === "confirmed" ? <Text style={styles.stateText}>{zhTW.mobile.analysis.confirmedMatch}</Text> : null}
      {analysis.matchState === "editing" ? (
        <>
          <Text style={styles.stateText}>{zhTW.mobile.analysis.correctionSaved}</Text>
          <Text style={styles.stateText}>{zhTW.mobile.analysis.futureLearning}</Text>
        </>
      ) : null}
    </SnowCard>
  );
}

function CandidateCorrectionList({
  analysis,
  resolution,
  onRetry,
  renderSuccessActions
}: {
  analysis: ReturnType<typeof useAnalysisCorrectionState>;
  resolution: MealIdentificationCandidateResolution;
  onRetry: () => Promise<void>;
  renderSuccessActions: () => ReactNode;
}) {
  const selectedCatalogCandidate =
    analysis.selectedCandidate?.kind === "catalog_item" ? analysis.selectedCandidate : null;
  return (
    <SnowCard>
      <SnowSectionHeader title={zhTW.mobile.finalUx.notThisMenuTitle} subtitle={zhTW.mobile.finalUx.notThisMenuBody} />
      <View style={styles.candidateList}>
        <CandidateResolutionState resolution={resolution} onRetry={onRetry} />
        {resolution.status === "available" ? resolution.candidates.map((candidate) => {
          const isSelected = isSameCatalogCandidate(selectedCatalogCandidate, candidate);
          return (
          <Pressable
            key={candidate.identity.branchMenuItemId}
            style={[styles.candidate, isSelected && styles.activeMode]}
            onPress={() => analysis.selectCatalogCandidate(candidate)}
          >
            <View style={styles.candidateHeader}>
              <View style={styles.flex}>
                <Text style={styles.candidateTitle}>{candidate.restaurantName} · {candidate.branchName}</Text>
                <Text style={styles.candidateBody}>{candidate.mealItemName}</Text>
                <Text style={styles.candidateBody}>{candidate.menuName} / {candidate.menuCategoryName} · NT${candidate.price}</Text>
              </View>
              <View style={styles.candidateConfidence}>
                <Icon name="check" size={14} color={snow.primaryDeep} />
                <Text style={styles.candidateConfidenceText}>{nutritionProvenanceLabel(candidate)}</Text>
              </View>
            </View>
            <TagRow tags={candidate.tags} />
            <Text style={styles.optionCta}>{isSelected ? zhTW.mobile.analysis.candidateSelectedLabel : zhTW.mobile.finalUx.candidateOptionCta}</Text>
          </Pressable>
        ); }) : null}
        {selectedCatalogCandidate ? (
          <PrimaryButton
            icon="check"
            label={zhTW.mobile.analysis.confirmSelectedCandidate}
            onPress={() => analysis.confirmCatalogCandidate()}
          />
        ) : null}
        <Pressable style={[styles.candidate, styles.supplementalCandidate]} onPress={analysis.chooseNoneOfTheAbove}>
          <Text style={styles.candidateTitle}>{zhTW.mobile.finalUx.supplementalDataTitle}</Text>
          <Text style={styles.candidateBody}>{zhTW.mobile.finalUx.supplementalDataBody}</Text>
          <Text style={styles.optionCta}>{zhTW.mobile.finalUx.supplementalDataCta}</Text>
        </Pressable>
      </View>
      {analysis.externalBreakdownTriggered ? <Text style={styles.stateText}>{analysis.showExternalBreakdown ? zhTW.mobile.finalUx.externalAiBreakdownReady : zhTW.mobile.finalUx.externalAiBreakdownLoading}</Text> : null}
      {analysis.showExternalBreakdown ? (
        <ExternalCorrectionPanel
          addSection={analysis.addSection}
          confirmAddedSection={analysis.confirmAddedSection}
          confirmCorrectionRow={analysis.confirmCorrectionRow}
          correctedRows={analysis.correctedRows}
          correctionSections={analysis.correctionSections}
          completeCorrection={analysis.completeCorrection}
          expandedCorrection={analysis.expandedCorrection}
          mealName={analysis.mealName}
          nutritionRefreshed={analysis.nutritionRefreshed}
          nutritionSummary={analysis.nutritionSummary}
          restaurantName={analysis.restaurantName}
          setMealName={analysis.setMealName}
          setRestaurantName={analysis.setRestaurantName}
          toggleAddSection={analysis.toggleAddSection}
          toggleCorrectionRow={analysis.toggleCorrectionRow}
        />
      ) : null}
      {analysis.correctionCompleted ? renderSuccessActions() : null}
    </SnowCard>
  );
}

function CandidateResolutionState({
  resolution,
  onRetry
}: {
  resolution: MealIdentificationCandidateResolution;
  onRetry: () => Promise<void>;
}) {
  if (resolution.status === "available") return null;
  const label =
    resolution.status === "loading"
      ? zhTW.mobile.analysis.catalogLoading
      : resolution.status === "empty"
        ? zhTW.mobile.analysis.catalogEmpty
        : resolution.status === "unavailable"
          ? zhTW.mobile.analysis.catalogUnavailable
          : zhTW.mobile.analysis.catalogError;
  return (
    <View style={styles.ctaColumn}>
      <Text style={styles.stateText}>{label}</Text>
      {resolution.status === "error" && resolution.retryable ? (
        <SecondaryButton icon="clock" label={zhTW.mobile.analysis.catalogRetry} onPress={() => void onRetry()} />
      ) : null}
      <Text style={styles.candidateBody}>{zhTW.mobile.analysis.catalogManualFallback}</Text>
    </View>
  );
}

function nutritionProvenanceLabel(candidate: CatalogMealIdentificationCandidate): string {
  if (candidate.nutritionProvenance === "ai_estimated") return zhTW.mobile.analysis.nutritionAiEstimated;
  if (candidate.nutritionProvenance === "restaurant_confirmed") return zhTW.mobile.analysis.nutritionRestaurantVerified;
  if (candidate.nutritionProvenance === "platform_reviewed") return zhTW.mobile.analysis.nutritionPlatformReviewed;
  return zhTW.mobile.analysis.nutritionMissing;
}

const styles = StyleSheet.create({
  activeMode: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  activeModeText: {
    color: colors.ink
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  balanceHint: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19
  },
  candidate: {
    gap: 8,
    borderColor: snow.line,
    borderRadius: radius.base,
    borderWidth: 1,
    backgroundColor: snow.card,
    padding: 14,
    ...shadows.soft
  },
  candidateBody: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800"
  },
  candidateList: {
    gap: 12,
    marginVertical: 14
  },
  candidateTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  candidateHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  candidateConfidence: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: snow.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  candidateConfidenceText: {
    color: snow.primaryDeep,
    fontSize: 11.5,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  optionCta: {
    alignSelf: "flex-start",
    borderColor: hexA(snow.primary, 0.2),
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: snow.primarySoft,
    color: snow.primaryDeep,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  confidence: {
    color: colors.coral,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 8
  },
  completedCheck: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#ffffff",
    borderRadius: 54,
    borderWidth: 7,
    backgroundColor: "#8AAE97",
    height: 108,
    shadowColor: "#2d6b52",
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    width: 108
  },
  completedCheckText: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "900"
  },
  completedHeroVisual: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: "rgba(255,255,255,0.7)",
    borderRadius: 32,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.38)",
    marginBottom: 16,
    minHeight: 168
  },
  completedSparkRow: {
    flexDirection: "row",
    gap: 9,
    marginTop: 14
  },
  completionPill: {
    alignSelf: "center",
    borderColor: "rgba(255,255,255,0.36)",
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.16)",
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  completionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    textAlign: "center"
  },
  confirmButton: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.coral,
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  confirmButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  costHint: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    marginTop: 12
  },
  contextPill: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: colors.card,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  contextRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  currentMealCard: {
    gap: 8,
    borderColor: "rgba(255,255,255,0.7)",
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.48)",
    marginTop: 12,
    padding: 14
  },
  disclaimer: {
    color: colors.coral,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    marginVertical: 12
  },
  detailToggle: {
    alignSelf: "flex-start",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  detailToggleText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900"
  },
  disabledButton: {
    opacity: 0.64
  },
  editButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  editButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  imageIcon: {
    color: "#ffffff",
    fontSize: 38,
    fontWeight: "900"
  },
  imageLabel: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  imagePreview: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderColor: "#2d2823",
    borderRadius: 34,
    borderWidth: 1,
    backgroundColor: colors.ink,
    gap: 8,
    minHeight: 218,
    shadowColor: "#2d2823",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 }
  },
  intakeAdvice: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
  },
  intakeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  intakeHero: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    borderColor: "rgba(255,255,255,0.72)",
    borderRadius: 26,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.34)",
    marginTop: 16,
    padding: 14
  },
  intakeInsight: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24
  },
  intakeItem: {
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: colors.card,
    flexGrow: 1,
    flexBasis: 145,
    padding: 16
  },
  intakeLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  intakeScore: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#ffffff",
    borderRadius: 42,
    borderWidth: 5,
    backgroundColor: snow.primary,
    height: 82,
    shadowColor: snow.primaryDeep,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    width: 82
  },
  intakeScoreText: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900"
  },
  intakeValue: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 6
  },
  mealRecordCard: {
    gap: 8,
    borderColor: snow.line,
    borderRadius: radius.base,
    borderWidth: 1,
    backgroundColor: snow.card,
    padding: 14,
    ...shadows.soft
  },
  mealRecordCalories: {
    color: snow.primaryDeep,
    fontSize: 13,
    fontWeight: "900"
  },
  mealRecordHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  mealRecordList: {
    gap: 10,
    marginTop: 12
  },
  mealRecordNote: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  },
  mealRecordTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900"
  },
  mealTimePill: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    backgroundColor: snow.primarySoft,
    color: snow.primaryDeep,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  mealPlate: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: "rgba(255,255,255,0.78)",
    borderRadius: 58,
    borderWidth: 8,
    backgroundColor: colors.coral,
    height: 116,
    width: 116
  },
  foodDots: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8
  },
  foodDot: {
    borderRadius: 999,
    height: 12,
    width: 12
  },
  foodDotCoral: {
    backgroundColor: colors.coral
  },
  foodDotGreen: {
    backgroundColor: "#8AAE97"
  },
  foodDotAmber: {
    backgroundColor: colors.amber
  },
  flex: {
    flex: 1,
    gap: 6
  },
  finalizationField: {
    gap: 6,
    marginTop: 10
  },
  finalizationFieldLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  finalizationInput: {
    borderColor: snow.line,
    borderRadius: radius.base,
    borderWidth: 1,
    backgroundColor: snow.card,
    color: colors.ink,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 13,
    paddingVertical: 10
  },
  finalizationInputMultiline: {
    minHeight: 76,
    textAlignVertical: "top"
  },
  finalizationPanelSection: {
    borderTopColor: snow.line,
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 16
  },
  location: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    color: colors.teal,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  modeButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  mealPeriodButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  formLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 8,
    marginTop: 12
  },
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  modeText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "900"
  },
  nextMealBody: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  },
  nextMealEyebrow: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  nextMealPanel: {
    gap: 8,
    borderColor: "rgba(255,255,255,0.72)",
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.44)",
    marginTop: 14,
    padding: 14
  },
  nextMealTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  recoTrack: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
    paddingRight: 6,
    paddingVertical: 4
  },
  recoCard: {
    width: 188,
    gap: 10,
    borderRadius: radius.lg,
    backgroundColor: "#ffffff",
    padding: 12,
    ...shadows.soft
  },
  recoCardTapArea: {
    gap: 6
  },
  recoCardTapAreaPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }]
  },
  recoPhoto: {
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: snow.primarySoft
  },
  recoEmoji: {
    fontSize: 24
  },
  recoName: {
    color: snow.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  recoCalories: {
    color: snow.primaryDeep,
    fontSize: 12.5,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  recoRestaurant: {
    color: snow.sub,
    fontSize: 12,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  recoDistance: {
    color: snow.sub,
    fontSize: 11,
    fontFamily: fonts.body
  },
  recoMatchLabel: {
    color: snow.primaryDeep,
    fontSize: 11,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  recoReasonToggle: {
    alignSelf: "flex-start"
  },
  recoReasonToggleText: {
    color: snow.sub,
    fontSize: 11,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  recoReasonText: {
    color: snow.sub,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: fonts.body
  },
  recoTapHint: {
    color: snow.sub,
    fontSize: 10.5,
    lineHeight: 14,
    fontFamily: fonts.body,
    fontWeight: "600",
    textAlign: "center",
    opacity: 0.72
  },
  recoPremiumHint: {
    color: snow.sub,
    fontSize: 11.5,
    fontFamily: fonts.medium,
    fontWeight: "700",
    marginTop: 10
  },
  reasonItem: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19
  },
  reasonList: {
    gap: 8,
    marginTop: 12
  },
  restaurantSummary: {
    gap: 6,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 14,
    padding: 12
  },
  plannedDinnerCard: {
    gap: 8,
    borderColor: "rgba(255,255,255,0.66)",
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.42)",
    marginTop: 12,
    padding: 14
  },
  plannedDinnerHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  plannedMealCard: {
    gap: 8,
    borderColor: "rgba(255,255,255,0.66)",
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.42)",
    marginTop: 12,
    padding: 14
  },
  plannedHint: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    marginVertical: 12
  },
  scanning: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 14
  },
  savedBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  sourceList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  dinnerModalContent: {
    gap: 14,
    paddingBottom: 8
  },
  radioRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  conditionChip: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  conditionChipActive: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  conditionChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  conditionChipTextActive: {
    color: colors.ink
  },
  aiPlanBox: {
    gap: 8,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: colors.card,
    padding: 14
  },
  conditionGroup: {
    gap: 8
  },
  sourcePill: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  supplementalCandidate: {
    borderColor: hexA(snow.ai, 0.18),
    backgroundColor: snow.aiSoft
  },
  stateText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    marginTop: 12
  },
  validationText: {
    color: colors.coral,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  summaryValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900"
  },
  macroRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  macroChip: {
    flexGrow: 1,
    flexBasis: "22%",
    alignItems: "center",
    borderRadius: radius.base,
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 2
  },
  macroChipPrimary: {
    backgroundColor: hexA(snow.primary, 0.12)
  },
  macroChipAccent: {
    backgroundColor: hexA(snow.accent, 0.12)
  },
  macroChipAmber: {
    backgroundColor: hexA(snow.amber, 0.14)
  },
  macroChipValue: {
    color: snow.ink,
    fontSize: 16,
    fontFamily: fonts.numeral,
    fontWeight: "800"
  },
  macroValuePrimary: {
    color: snow.primaryDeep
  },
  macroValueAccent: {
    color: snow.accent
  },
  macroValueAmber: {
    color: snow.amber
  },
  macroChipUnit: {
    color: snow.sub,
    fontSize: 10,
    fontFamily: fonts.body
  },
  macroChipLabel: {
    color: snow.sub,
    fontSize: 11,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  todayIntakeButton: {
    alignItems: "center",
    borderColor: colors.teal,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  todayIntakeButtonText: {
    color: colors.teal,
    fontSize: 14,
    fontWeight: "900"
  },
  toast: {
    alignSelf: "center",
    borderRadius: 999,
    backgroundColor: colors.ink,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    shadowColor: "#3f2d12",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18
  },
  toastText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  topMatch: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "900",
    marginTop: 14
  },
  photoArea: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: hexA(snow.primary, 0.24),
    borderStyle: "dashed",
    backgroundColor: snow.card,
    minHeight: 160,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    position: "relative",
    overflow: "hidden"
  },
  photoAreaConfirmed: {
    borderStyle: "solid",
    borderColor: hexA(snow.primary, 0.12)
  },
  photoGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  },
  photoImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  },
  photoBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: snow.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  photoConfidenceBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.78)",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  photoCaptionBadge: {
    position: "absolute",
    bottom: 12,
    left: 12,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.78)",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  photoBadgeText: {
    color: snow.primaryDeep,
    fontSize: 11,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  photoIconLarge: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.7)"
  },
  photoIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: snow.primarySoft
  },
  photoAreaText: {
    color: snow.sub,
    fontSize: 13,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  mealSourceRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14
  },
  // Matches recoCard's visual language (radius.lg + shadows.soft + white background)
  // so the meal-source picker reads as the same card style as the recommendation cards.
  mealSourceCard: {
    flex: 1,
    gap: 6,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: snow.line,
    backgroundColor: "#ffffff",
    padding: 16,
    minHeight: 108,
    position: "relative",
    ...shadows.soft
  },
  mealSourceCardActive: {
    borderColor: snow.primary,
    backgroundColor: snow.primarySoft
  },
  mealSourceCheck: {
    position: "absolute",
    top: 10,
    right: 10,
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: snow.primary
  },
  mealSourceTitle: {
    color: snow.ink,
    fontSize: 15,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  mealSourceTitleActive: {
    color: snow.primaryDeep
  },
  mealSourceSubtitle: {
    color: snow.sub,
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 17
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  ingredientSection: {
    marginTop: 16
  },
  ingredientLabel: {
    color: snow.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800",
    marginBottom: 8
  },
  ingredientList: {
    gap: 8
  },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: snow.line,
    backgroundColor: snow.card,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  ingredientDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  ingredientDotPrimary: {
    backgroundColor: snow.primary
  },
  ingredientDotAccent: {
    backgroundColor: snow.accent
  },
  ingredientDotAmber: {
    backgroundColor: snow.amber
  },
  ingredientDotGreen: {
    backgroundColor: snow.green
  },
  ingredientName: {
    color: snow.ink,
    fontSize: 13.5,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  ctaColumn: {
    gap: 10,
    marginTop: 16
  },
  candidateRow: {
    borderColor: snow.line,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
    padding: 14
  },
  candidateRowSelected: {
    borderColor: snow.primary,
    backgroundColor: snow.primarySoft
  },
  candidateSelectedLabel: {
    color: snow.primaryDeep
  },
  ctaRow2: {
    flexDirection: "row",
    gap: 10
  },
  ctaItem: {
    flex: 1
  }
});
