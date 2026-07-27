import { useCallback, useEffect, useRef, useState } from "react";
import type { MealPhotoAnalysisCandidate, MealPhotoAnalysisStatus } from "@haocu/shared";
import { useConsumerRuntime } from "../consumer-runtime";
import type { MealPhotoAnalysisClientErrorCode } from "../meal-photo-analysis/types";
import {
  getAnalysisSession,
  setMealPhotoAnalysisState,
  setSelectedMealPhotoAnalysisCandidateId,
  type MealPhotoAnalysisInvocationStatus,
  type MealPhotoUploadStatus
} from "./analysisSessionStore";
import { isMealPhotoUploadResultStillCurrent } from "./mealPhotoUploadStaleGuard";

export type MealPhotoAnalysisUiState = {
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
export function useMealPhotoAnalysis(uploadStatus: MealPhotoUploadStatus, imageObjectRef: string | null): MealPhotoAnalysisUiState {
  const consumerRuntime = useConsumerRuntime();
  const initialSession = getAnalysisSession();
  const [invocationStatus, setInvocationStatus] = useState<MealPhotoAnalysisInvocationStatus>(initialSession.analysisInvocationStatus);
  const [candidates, setCandidates] = useState<MealPhotoAnalysisCandidate[]>(initialSession.analysisCandidates);
  const [selectedCandidateId, setSelectedCandidateIdState] = useState<string | null>(initialSession.selectedCandidateId);
  const [analysisStatus, setAnalysisStatus] = useState<MealPhotoAnalysisStatus | null>(initialSession.analysisStatus);
  const [safeErrorCode, setSafeErrorCode] = useState<MealPhotoAnalysisClientErrorCode | null>(initialSession.safeAnalysisErrorCode);
  const inFlightRef = useRef(false);

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

  const selectCandidate = useCallback((candidateId: string | null) => {
    setSelectedMealPhotoAnalysisCandidateId(candidateId);
    setSelectedCandidateIdState(getAnalysisSession().selectedCandidateId);
  }, []);

  const displayedInvocationStatus: MealPhotoAnalysisInvocationStatus =
    invocationStatus === "not_started" && uploadStatus !== "not_started" && uploadStatus !== "uploaded"
      ? "waiting_for_upload"
      : invocationStatus;

  return {
    analysisInvocationStatus: displayedInvocationStatus,
    analysisCandidates: candidates,
    selectedCandidateId,
    analysisStatus,
    safeAnalysisErrorCode: safeErrorCode,
    retryAnalysis: startAnalysis,
    selectCandidate
  };
}
