import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MealPhotoAnalysisCandidate } from "@haocu/shared";
import { useConsumerRuntime } from "../consumer-runtime";
import {
  generateConsumerMealIdentificationFinalizationClientRequestId,
  type ConsumerMealIdentificationFinalizationRuntimeState
} from "../consumer-runtime/consumerMealIdentificationFinalizationRuntime";
import {
  getAnalysisSession,
  setMealPhotoFinalizationDraft,
  setSelectedMealPhotoAnalysisCandidateId
} from "./analysisSessionStore";
import {
  applyMealPhotoFinalizationPayloadMutation,
  applyMealPhotoFinalizationResult,
  createCandidateMealPhotoFinalizationDraft,
  createManualMealPhotoFinalizationDraft,
  getMealPhotoFinalizationPayloadFingerprint,
  isMealPhotoFinalizationPayloadLocked,
  MealPhotoFinalizationSubmissionGate,
  prepareMealPhotoFinalization,
  updateMealPhotoFinalizationContext,
  updateMealPhotoFinalizationField,
  type MealPhotoFinalizationContext,
  type MealPhotoFinalizationDraftState,
  type MealPhotoFinalizationField
} from "./mealPhotoFinalizationDraft";

export type UseMealPhotoFinalizationInput = Readonly<{
  candidates: readonly MealPhotoAnalysisCandidate[];
  context: MealPhotoFinalizationContext;
  onSuccess: (state: MealPhotoFinalizationDraftState) => void;
}>;

export function useMealPhotoFinalization(input: UseMealPhotoFinalizationInput) {
  const runtime = useConsumerRuntime();
  const initialSession = getAnalysisSession();
  const [draft, setDraftState] = useState<MealPhotoFinalizationDraftState | null>(
    initialSession.mealPhotoFinalizationDraft
  );
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const mountedRef = useRef(true);
  const gateRef = useRef(new MealPhotoFinalizationSubmissionGate());
  const initialFrozenState =
    initialSession.mealPhotoFinalizationDraft?.attempted &&
    initialSession.mealPhotoFinalizationDraft.clientRequestId
      ? initialSession.mealPhotoFinalizationDraft
      : null;
  const frozenSubmissionRef = useRef<{
    state: MealPhotoFinalizationDraftState;
    fingerprint: string;
  } | null>(
    initialFrozenState
      ? {
          state: initialFrozenState,
          fingerprint: getMealPhotoFinalizationPayloadFingerprint(initialFrozenState)
        }
      : null
  );
  const identity = `${runtime.state.actorKey ?? ""}:${runtime.state.actorGeneration}:${initialSession.analysisRequestId ?? ""}:${initialSession.captureGeneration}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const previousIdentityRef = useRef(identity);

  const setDraft = useCallback((next: MealPhotoFinalizationDraftState | null) => {
    draftRef.current = next;
    setMealPhotoFinalizationDraft(next);
    setDraftState(next);
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      gateRef.current.reset();
    };
  }, []);

  // Actor/session/photo replacement is a hard boundary. Clear all B2 state instead of
  // allowing a response or request ID from the previous identity to cross it.
  useEffect(() => {
    if (previousIdentityRef.current === identity) return;
    previousIdentityRef.current = identity;
    gateRef.current.reset();
    frozenSubmissionRef.current = null;
    setSelectedMealPhotoAnalysisCandidateId(null);
    setDraft(null);
  }, [identity, setDraft]);

  // Context fields are fingerprint-bearing. If the user changes source/time/meal period
  // after an attempt, the pure state transition rotates the UUID before another submit.
  useEffect(() => {
    const current = draftRef.current;
    if (!current) return;
    const next = applyMealPhotoFinalizationPayloadMutation(
      current,
      runtime.mealIdentificationFinalizationState.status,
      () =>
        updateMealPhotoFinalizationContext(
          current,
          input.context,
          generateConsumerMealIdentificationFinalizationClientRequestId
        )
    );
    if (next === current) return;
    frozenSubmissionRef.current = null;
    setDraft(next);
  }, [
    input.context.captureMethod,
    input.context.occurredAt,
    input.context.recordTiming,
    input.context.selectedMealPeriod,
    input.context.sourceContext,
    runtime.mealIdentificationFinalizationState.status,
    setDraft
  ]);

  // A retry can replace the C5-A candidate list. Never keep a draft pointing at a
  // candidate that is absent from the new authoritative response.
  useEffect(() => {
    const current = draftRef.current;
    if (
      isMealPhotoFinalizationPayloadLocked(
        runtime.mealIdentificationFinalizationState.status
      )
    ) {
      return;
    }
    if (
      current?.mode === "candidate" &&
      !input.candidates.some((candidate) => candidate.candidateId === current.selectedCandidateId)
    ) {
      gateRef.current.reset();
      frozenSubmissionRef.current = null;
      setSelectedMealPhotoAnalysisCandidateId(null);
      setDraft(null);
    }
  }, [input.candidates, runtime.mealIdentificationFinalizationState.status, setDraft]);

  const selectCandidate = useCallback(
    (candidate: MealPhotoAnalysisCandidate) => {
      const status = runtime.mealIdentificationFinalizationState.status;
      const current = draftRef.current;
      const next = applyMealPhotoFinalizationPayloadMutation(current, status, () => {
        const analysisRequestId = getAnalysisSession().analysisRequestId;
        if (!analysisRequestId) return current;
        return createCandidateMealPhotoFinalizationDraft(analysisRequestId, candidate, input.context);
      });
      if (next === current) return;
      gateRef.current.reset();
      frozenSubmissionRef.current = null;
      setSelectedMealPhotoAnalysisCandidateId(candidate.candidateId);
      setDraft(next);
    },
    [input.context, runtime.mealIdentificationFinalizationState.status, setDraft]
  );

  const chooseManual = useCallback(() => {
    const status = runtime.mealIdentificationFinalizationState.status;
    const current = draftRef.current;
    const next = applyMealPhotoFinalizationPayloadMutation(current, status, () => {
      const analysisRequestId = getAnalysisSession().analysisRequestId;
      if (!analysisRequestId) return current;
      return createManualMealPhotoFinalizationDraft(analysisRequestId, input.context);
    });
    if (next === current) return;
    gateRef.current.reset();
    frozenSubmissionRef.current = null;
    setSelectedMealPhotoAnalysisCandidateId(null);
    setDraft(next);
  }, [input.context, runtime.mealIdentificationFinalizationState.status, setDraft]);

  const updateField = useCallback(
    (field: MealPhotoFinalizationField, value: string) => {
      const current = draftRef.current;
      if (!current) return;
      const next = applyMealPhotoFinalizationPayloadMutation(
        current,
        runtime.mealIdentificationFinalizationState.status,
        () =>
        updateMealPhotoFinalizationField(
          current,
          field,
          value,
          generateConsumerMealIdentificationFinalizationClientRequestId
        )
      );
      if (next === current) return;
      frozenSubmissionRef.current = null;
      setDraft(next);
    },
    [runtime.mealIdentificationFinalizationState.status, setDraft]
  );

  const applyResultIfCurrent = useCallback(
    (
      frozen: NonNullable<typeof frozenSubmissionRef.current>,
      result: ConsumerMealIdentificationFinalizationRuntimeState,
      expectedIdentity: string
    ) => {
      const current = draftRef.current;
      if (
        !mountedRef.current ||
        expectedIdentity !== identityRef.current ||
        getAnalysisSession().analysisRequestId !== frozen.state.analysisRequestId ||
        frozenSubmissionRef.current !== frozen ||
        !current ||
        getMealPhotoFinalizationPayloadFingerprint(current) !== frozen.fingerprint
      ) {
        return;
      }
      const next = applyMealPhotoFinalizationResult(frozen.state, result);
      if (result.status !== "uncertain" && next.submissionStatus !== "succeeded") {
        frozenSubmissionRef.current = null;
      }
      setDraft(next);
      if (next.submissionStatus === "succeeded" && gateRef.current.tryNavigate()) {
        input.onSuccess(next);
      }
    },
    [input.onSuccess, setDraft]
  );

  const retryPending = useCallback(async () => {
    if (
      runtime.mealIdentificationFinalizationState.status !== "uncertain" ||
      !gateRef.current.tryStart()
    ) {
      return;
    }
    const frozen = frozenSubmissionRef.current;
    const current = draftRef.current;
    if (
      !frozen ||
      !current ||
      getMealPhotoFinalizationPayloadFingerprint(current) !== frozen.fingerprint
    ) {
      gateRef.current.finish();
      return;
    }
    const expectedIdentity = identityRef.current;
    try {
      const result = await runtime.retryPendingMealIdentificationFinalization();
      applyResultIfCurrent(frozen, result, expectedIdentity);
    } finally {
      gateRef.current.finish();
    }
  }, [applyResultIfCurrent, runtime]);

  const submit = useCallback(async () => {
    if (runtime.mealIdentificationFinalizationState.status === "uncertain") {
      await retryPending();
      return;
    }
    if (
      isMealPhotoFinalizationPayloadLocked(
        runtime.mealIdentificationFinalizationState.status
      )
    ) {
      return;
    }
    const current = draftRef.current;
    if (!current || !gateRef.current.tryStart()) return;
    const expectedIdentity = identityRef.current;
    const prepared = prepareMealPhotoFinalization(
      current,
      generateConsumerMealIdentificationFinalizationClientRequestId
    );
    setDraft(prepared.state);
    if (!prepared.ok) {
      gateRef.current.finish();
      return;
    }
    const frozen = {
      state: prepared.state,
      fingerprint: getMealPhotoFinalizationPayloadFingerprint(prepared.state)
    };
    frozenSubmissionRef.current = frozen;

    try {
      const result = await runtime.finalizeMealIdentification(prepared.draft);
      applyResultIfCurrent(frozen, result, expectedIdentity);
    } finally {
      gateRef.current.finish();
    }
  }, [applyResultIfCurrent, retryPending, runtime, setDraft]);

  return useMemo(
    () => ({
      draft,
      selectCandidate,
      chooseManual,
      updateField,
      submit,
      retryPending,
      submitting: draft?.submissionStatus === "submitting",
      uncertain: runtime.mealIdentificationFinalizationState.status === "uncertain",
      payloadLocked: isMealPhotoFinalizationPayloadLocked(
        runtime.mealIdentificationFinalizationState.status
      )
    }),
    [
      chooseManual,
      draft,
      retryPending,
      runtime.mealIdentificationFinalizationState.status,
      selectCandidate,
      submit,
      updateField
    ]
  );
}
