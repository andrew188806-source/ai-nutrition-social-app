import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MealPhotoAnalysisCandidate, MealPhotoAnalysisStatus } from "@haocu/shared";
import { useConsumerRuntime } from "../consumer-runtime";
import type { MealPhotoAnalysisClientErrorCode } from "../meal-photo-analysis/types";
import {
  getAnalysisSession,
  setMealPhotoAnalysisState,
  setSelectedMealPhotoAnalysisCandidateId,
  type AnalysisSessionState,
  type MealPhotoAnalysisInvocationStatus,
  type MealPhotoUploadStatus
} from "./analysisSessionStore";
import { isMealPhotoUploadResultStillCurrent } from "./mealPhotoUploadStaleGuard";
import { buildMealPhotoAnalysisActorIdentity } from "./mealPhotoAnalysisFlowState";

// MI-E-C5-R5-R4: the one sanitized public view this hook exposes while its internal state still
// belongs to a previous actor. Frozen and module-level so masking allocates nothing per render.
const EMPTY_MEAL_PHOTO_ANALYSIS_CANDIDATES: MealPhotoAnalysisCandidate[] = [];

export type MealPhotoAnalysisUiState = {
  // MI-E-C5-R5-R4: false while the hook's internal mirrors still belong to a previous actor. Every
  // value below is already masked to its safe initial state in that case; this flag lets callers
  // additionally refuse to render or submit anything derived from them.
  isCurrentActorState: boolean;
  // "waiting_for_upload" is derived here for display only (a photo exists but hasn't finished
  // uploading yet) rather than stored in the session — the stored session value only ever
  // transitions through not_started -> invoking -> completed/low_confidence/failed, so there is
  // exactly one place that decides "has an invocation actually started."
  analysisInvocationStatus: MealPhotoAnalysisInvocationStatus;
  analysisCandidates: MealPhotoAnalysisCandidate[];
  selectedCandidateId: string | null;
  analysisStatus: MealPhotoAnalysisStatus | null;
  safeAnalysisErrorCode: MealPhotoAnalysisClientErrorCode | null;
  retryAnalysis: () => void;
  selectCandidate: (candidateId: string | null) => void;
};

// Orchestrates invoking the meal-photo-analysis Edge Function once (and only once) the current
// session's photo has finished uploading to private Storage. Reuses the exact same
// actorKey/actorGeneration + analysisRequestId/captureGeneration stale-result guard
// (isMealPhotoUploadResultStillCurrent) that useMealPhotoUpload.ts already established — this is
// deliberately not a second, parallel generation system. A completion is only ever applied if all
// four still match what was current when the call started; discarded silently otherwise. This is
// what protects against a stale analysis response overwriting a newer photo's session (new
// analysisRequestId/captureGeneration from a retake) and a stale response polluting a different
// actor's state after sign-out/actor switch.
// MI-E-C5-R5-R3 §五: ownershipSafeSession is the pure-derived view; only the FIRST read is
// gated, exactly as in useMealPhotoUpload.
export function useMealPhotoAnalysis(uploadStatus: MealPhotoUploadStatus, imageObjectRef: string | null, ownershipSafeSession: AnalysisSessionState = getAnalysisSession()): MealPhotoAnalysisUiState {
  const consumerRuntime = useConsumerRuntime();
  const initialSession = ownershipSafeSession;
  const [invocationStatus, setInvocationStatus] = useState<MealPhotoAnalysisInvocationStatus>(initialSession.analysisInvocationStatus);
  const [candidates, setCandidates] = useState<MealPhotoAnalysisCandidate[]>(initialSession.analysisCandidates);
  const [selectedCandidateId, setSelectedCandidateIdState] = useState<string | null>(initialSession.selectedCandidateId);
  const [analysisStatus, setAnalysisStatus] = useState<MealPhotoAnalysisStatus | null>(initialSession.analysisStatus);
  const [safeErrorCode, setSafeErrorCode] = useState<MealPhotoAnalysisClientErrorCode | null>(initialSession.safeAnalysisErrorCode);
  const inFlightRef = useRef(false);
  // MI-E-C5-R5-R4 §三/§四: which actor the local mirrors above belong to. Same frozen
  // actorKey/actorGeneration pair as everywhere else — no second identity system. The comparison is
  // PURE: it reads a ref and compares two strings, mutating nothing, so it is safe in any render.
  const actorIdentity = buildMealPhotoAnalysisActorIdentity({
    actorKey: consumerRuntime.state.actorKey,
    actorGeneration: consumerRuntime.state.actorGeneration
  });
  const stateOwnerIdentityRef = useRef(actorIdentity);
  const isCurrentActorState = stateOwnerIdentityRef.current === actorIdentity;

  const startAnalysis = useCallback(() => {
    const current = getAnalysisSession();
    if (!current.imageObjectRef || !current.analysisRequestId || !current.captureMethod || current.uploadStatus !== "uploaded") return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const expected = {
      analysisRequestId: current.analysisRequestId,
      captureGeneration: current.captureGeneration,
      actorKey: consumerRuntime.state.actorKey,
      actorGeneration: consumerRuntime.state.actorGeneration
    };
    const nextAttemptCount = current.analysisAttemptCount + 1;
    const startedAt = new Date().toISOString();
    const profile = consumerRuntime.state.profileState.status === "available" ? consumerRuntime.state.profileState.profile : null;

    setMealPhotoAnalysisState({
      analysisInvocationStatus: "invoking",
      analysisAttemptCount: nextAttemptCount,
      analysisStartedAt: startedAt,
      safeAnalysisErrorCode: null
    });
    setInvocationStatus("invoking");
    setSafeErrorCode(null);

    function stillCurrent() {
      const latest = getAnalysisSession();
      return isMealPhotoUploadResultStillCurrent(expected, {
        analysisRequestId: latest.analysisRequestId,
        captureGeneration: latest.captureGeneration,
        actorKey: consumerRuntime.state.actorKey,
        actorGeneration: consumerRuntime.state.actorGeneration
      });
    }

    void consumerRuntime
      .analyzeMealPhoto({
        analysisRequestId: expected.analysisRequestId,
        imageObjectRef: current.imageObjectRef,
        captureMethod: current.captureMethod,
        mealSourceContext: current.sourceContext,
        capturedAt: current.occurredAt ?? startedAt,
        locale: profile?.locale ?? "zh-TW"
      })
      .then((outcome) => {
        inFlightRef.current = false;
        if (!stillCurrent()) return;
        const completedAt = new Date().toISOString();

        if (outcome.ok) {
          const nextInvocationStatus: MealPhotoAnalysisInvocationStatus =
            outcome.value.analysisStatus === "low_confidence"
              ? "low_confidence"
              : outcome.value.analysisStatus === "completed"
                ? "completed"
                : "failed";
          const safeErrorFromResponse = (outcome.value.safeUserFacingErrorCode as MealPhotoAnalysisClientErrorCode | null) ?? null;
          setMealPhotoAnalysisState({
            analysisInvocationStatus: nextInvocationStatus,
            analysisCandidates: outcome.value.candidates,
            analysisStatus: outcome.value.analysisStatus,
            requiresUserConfirmation: outcome.value.requiresUserConfirmation,
            analysisEngineVersion: outcome.value.analysisEngineVersion,
            analysisPromptVersion: outcome.value.promptVersion,
            analysisResponseSchemaVersion: outcome.value.schemaVersion,
            safeAnalysisErrorCode: safeErrorFromResponse,
            analysisCompletedAt: completedAt
          });
          setInvocationStatus(nextInvocationStatus);
          setCandidates(outcome.value.candidates);
          setAnalysisStatus(outcome.value.analysisStatus);
          setSafeErrorCode(safeErrorFromResponse);
          // setMealPhotoAnalysisState (above) already drops a previously-selected candidateId that
          // no longer exists in the fresh candidate list (e.g. this was a retry that replaced the
          // list) — read the resulting value back rather than re-deciding it here.
          setSelectedCandidateIdState(getAnalysisSession().selectedCandidateId);
          return;
        }

        setMealPhotoAnalysisState({
          analysisInvocationStatus: "failed",
          safeAnalysisErrorCode: outcome.error.code,
          analysisCompletedAt: completedAt
        });
        setInvocationStatus("failed");
        setSafeErrorCode(outcome.error.code);
      })
      .catch(() => {
        inFlightRef.current = false;
        if (!stillCurrent()) return;
        setMealPhotoAnalysisState({ analysisInvocationStatus: "failed", safeAnalysisErrorCode: "internal_error" });
        setInvocationStatus("failed");
        setSafeErrorCode("internal_error");
      });
  }, [consumerRuntime]);

  useEffect(() => {
    if (uploadStatus === "uploaded" && imageObjectRef && getAnalysisSession().analysisInvocationStatus === "not_started") {
      startAnalysis();
    }
  }, [uploadStatus, imageObjectRef, startAnalysis]);

  // MI-E-C5-R5-R4 §五: internal clearing happens in the COMMIT phase, never in a passive effect and
  // never during render. Until this runs, the public view above is already masked, so an actor
  // change is fail-closed on the first committed render and the clearing is only bookkeeping.
  // StrictMode double-invocation is safe: the second run finds the ref already updated and returns.
  useLayoutEffect(() => {
    if (stateOwnerIdentityRef.current === actorIdentity) return;
    stateOwnerIdentityRef.current = actorIdentity;
    inFlightRef.current = false;
    setInvocationStatus("not_started");
    setCandidates(EMPTY_MEAL_PHOTO_ANALYSIS_CANDIDATES);
    setSelectedCandidateIdState(null);
    setAnalysisStatus(null);
    setSafeErrorCode(null);
  }, [actorIdentity]);

  const selectCandidate = useCallback(
    (candidateId: string | null) => {
      // Fail closed rather than promoting a previous actor's selection into this actor's session.
      if (stateOwnerIdentityRef.current !== actorIdentity) return;
      setSelectedMealPhotoAnalysisCandidateId(candidateId);
      setSelectedCandidateIdState(getAnalysisSession().selectedCandidateId);
    },
    [actorIdentity]
  );

  const retryAnalysis = useCallback(() => {
    if (stateOwnerIdentityRef.current !== actorIdentity) return;
    startAnalysis();
  }, [actorIdentity, startAnalysis]);

  const displayedInvocationStatus: MealPhotoAnalysisInvocationStatus =
    invocationStatus === "not_started" && uploadStatus !== "not_started" && uploadStatus !== "uploaded"
      ? "waiting_for_upload"
      : invocationStatus;

  // MI-E-C5-R5-R4 §四: SYNCHRONOUS actor-safe public view. While the internal mirrors still belong
  // to a previous actor, every public value reads as its safe initial state, so a mounted actor
  // change cannot put Actor A's completed status, candidates, selection or errors on Actor B's
  // screen for even one frame — and hasAiFinalizationFlow, which derives from
  // analysisInvocationStatus, therefore cannot pull Actor B into the C5 editor/completed flow.
  return {
    isCurrentActorState,
    analysisInvocationStatus: isCurrentActorState ? displayedInvocationStatus : "not_started",
    analysisCandidates: isCurrentActorState ? candidates : EMPTY_MEAL_PHOTO_ANALYSIS_CANDIDATES,
    selectedCandidateId: isCurrentActorState ? selectedCandidateId : null,
    analysisStatus: isCurrentActorState ? analysisStatus : null,
    safeAnalysisErrorCode: isCurrentActorState ? safeErrorCode : null,
    retryAnalysis,
    selectCandidate
  };
}
