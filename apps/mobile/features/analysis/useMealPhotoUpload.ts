import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useConsumerRuntime } from "../consumer-runtime";
import type { MealPhotoUploadErrorCode } from "../meal-photo-upload/types";
import { getAnalysisSession, setMealPhotoUploadState, type AnalysisSessionState, type MealPhotoUploadStatus } from "./analysisSessionStore";
import { buildMealPhotoAnalysisActorIdentity } from "./mealPhotoAnalysisFlowState";
import { isMealPhotoUploadResultStillCurrent } from "./mealPhotoUploadStaleGuard";

export type MealPhotoUploadUiState = {
  // MI-E-C5-R5-R4: false while the internal mirrors still belong to a previous actor. The values
  // below are already masked to the ownership-safe session view in that case.
  isCurrentActorState: boolean;
  uploadStatus: MealPhotoUploadStatus;
  uploadErrorCode: MealPhotoUploadErrorCode | null;
  imageObjectRef: string | null;
  retryUpload: () => void;
};

// Orchestrates uploading the current session's captured/picked photo to private Storage.
// Reuses the existing actorKey/actorGeneration pattern from consumer-runtime (rather than
// inventing a second one) combined with analysisSessionStore's own analysisRequestId +
// captureGeneration (see isMealPhotoUploadResultStillCurrent), so a completion is only ever
// applied to state if all four still match what was captured when the call started — discarding
// it silently otherwise. This is what protects against: a stale upload completing after a new
// photo replaced this one (captureGeneration/analysisRequestId mismatch), and a stale upload
// completing after sign-out/actor switch (actorKey/actorGeneration mismatch).
// MI-E-C5-R5-R3 §五: ownershipSafeSession is the pure-derived view; only the FIRST read is
// gated. Every later read inside handlers/effects runs after commit-phase reconciliation, so those
// deliberately keep reading the live store through their existing stale-result guards.
export function useMealPhotoUpload(ownershipSafeSession: AnalysisSessionState = getAnalysisSession()): MealPhotoUploadUiState {
  const consumerRuntime = useConsumerRuntime();
  const initialSession = ownershipSafeSession;
  // MI-E-C5-R5-R4 §十二: imageObjectRef is a per-actor Storage path and uploadStatus/uploadErrorCode
  // describe that actor's photo, so this hook gets the same actor ownership as the analysis and
  // finalization hooks. Same frozen actorKey/actorGeneration pair; the comparison is PURE.
  const actorIdentity = buildMealPhotoAnalysisActorIdentity({
    actorKey: consumerRuntime.state.actorKey,
    actorGeneration: consumerRuntime.state.actorGeneration
  });
  const stateOwnerIdentityRef = useRef(actorIdentity);
  const isCurrentActorState = stateOwnerIdentityRef.current === actorIdentity;
  const [uploadStatus, setUploadStatus] = useState<MealPhotoUploadStatus>(initialSession.uploadStatus);
  const [uploadErrorCode, setUploadErrorCode] = useState<MealPhotoUploadErrorCode | null>(initialSession.uploadErrorCode);
  const [imageObjectRef, setImageObjectRef] = useState<string | null>(initialSession.imageObjectRef);
  const inFlightRef = useRef(false);

  const startUpload = useCallback(() => {
    const current = getAnalysisSession();
    if (!current.capturedImageUri || !current.analysisRequestId || !current.captureMethod) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const expected = {
      analysisRequestId: current.analysisRequestId,
      captureGeneration: current.captureGeneration,
      actorKey: consumerRuntime.state.actorKey,
      actorGeneration: consumerRuntime.state.actorGeneration
    };
    const nextAttemptCount = current.uploadAttemptCount + 1;

    setMealPhotoUploadState({ uploadStatus: "uploading", uploadErrorCode: null, uploadAttemptCount: nextAttemptCount });
    setUploadStatus("uploading");
    setUploadErrorCode(null);

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
      .uploadMealPhoto({
        analysisRequestId: expected.analysisRequestId,
        localImageUri: current.capturedImageUri,
        captureMethod: current.captureMethod,
        candidateMimeType: current.capturedImageMimeType,
        candidateFileName: current.capturedImageFileName
      })
      .then((outcome) => {
        inFlightRef.current = false;
        if (!stillCurrent()) return;

        if (outcome.ok) {
          setMealPhotoUploadState({
            uploadStatus: "uploaded",
            imageObjectRef: outcome.value.imageObjectRef,
            uploadedAt: outcome.value.uploadedAt,
            uploadErrorCode: null
          });
          setUploadStatus("uploaded");
          setImageObjectRef(outcome.value.imageObjectRef);
          setUploadErrorCode(null);
          return;
        }
        setMealPhotoUploadState({ uploadStatus: "failed", uploadErrorCode: outcome.error.code });
        setUploadStatus("failed");
        setUploadErrorCode(outcome.error.code);
      })
      .catch(() => {
        inFlightRef.current = false;
        if (!stillCurrent()) return;
        setMealPhotoUploadState({ uploadStatus: "failed", uploadErrorCode: "storage_upload_failed" });
        setUploadStatus("failed");
        setUploadErrorCode("storage_upload_failed");
      });
  }, [consumerRuntime]);

  useEffect(() => {
    if (initialSession.uploadStatus === "not_started" && initialSession.capturedImageUri) {
      startUpload();
    }
    // Intentionally mount-only: a genuine new photo always arrives via a fresh analysis.tsx
    // mount (meal-photo.tsx always navigates to /analysis after beginAnalysisCapture), so there
    // is no "same mount, new photo" case this needs to react to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Commit-phase internal clearing. Until it runs, the masked public view below already hides the
  // previous actor's upload state, so an actor change is fail-closed on the first committed render.
  useLayoutEffect(() => {
    if (stateOwnerIdentityRef.current === actorIdentity) return;
    stateOwnerIdentityRef.current = actorIdentity;
    inFlightRef.current = false;
    setUploadStatus(initialSession.uploadStatus);
    setUploadErrorCode(initialSession.uploadErrorCode);
    setImageObjectRef(initialSession.imageObjectRef);
  }, [actorIdentity, initialSession.imageObjectRef, initialSession.uploadErrorCode, initialSession.uploadStatus]);

  const retryUpload = useCallback(() => {
    if (stateOwnerIdentityRef.current !== actorIdentity) return;
    startUpload();
  }, [actorIdentity, startUpload]);

  // MI-E-C5-R5-R4 §四: synchronous actor-safe public view. When the internal mirrors belong to a
  // previous actor these fall back to the ownership-safe session view — which is itself the
  // sanitized empty session in exactly that case — so no Storage object ref, upload status or
  // upload error of the previous actor can reach the screen.
  return {
    isCurrentActorState,
    uploadStatus: isCurrentActorState ? uploadStatus : initialSession.uploadStatus,
    uploadErrorCode: isCurrentActorState ? uploadErrorCode : initialSession.uploadErrorCode,
    imageObjectRef: isCurrentActorState ? imageObjectRef : initialSession.imageObjectRef,
    retryUpload
  };
}
