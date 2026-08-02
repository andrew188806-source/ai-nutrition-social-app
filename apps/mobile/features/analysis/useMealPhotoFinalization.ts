import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MealPhotoAnalysisCandidate } from "@haocu/shared";
import { useConsumerRuntime } from "../consumer-runtime";
import {
  buildMealPhotoAnalysisActorIdentity,
  buildMealPhotoFinalizationOperationIdentity
} from "./mealPhotoAnalysisFlowState";
import {
  generateConsumerMealIdentificationFinalizationClientRequestId,
  type ConsumerMealIdentificationFinalizationRuntimeState
} from "../consumer-runtime/consumerMealIdentificationFinalizationRuntime";
import {
  getAnalysisSession,
  isAnalysisSessionOwnedBy,
  setMealPhotoFinalizationDraft,
  setSelectedMealPhotoAnalysisCandidateId,
  type AnalysisSessionState
} from "./analysisSessionStore";
import {
  applyMealPhotoFinalizationPayloadMutation,
  applyMealPhotoFinalizationResult,
  createCandidateMealPhotoFinalizationDraft,
  createManualMealPhotoFinalizationDraft,
  deriveMealPhotoFinalizationOperationSafeState,
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
  // MI-E-C5-R5-R3 §五: the ownership-SAFE session view from the pure render-time authority.
  // Optional so legacy callers keep working; /analysis always supplies it.
  ownershipSafeSession?: AnalysisSessionState;
}>;

export function useMealPhotoFinalization(input: UseMealPhotoFinalizationInput) {
  const runtime = useConsumerRuntime();
  const initialSession = input.ownershipSafeSession ?? getAnalysisSession();
  // MI-E-C5-R5-R2 §九: a stored draft may only be restored when the session is stamped with EXACTLY
  // this actor. /analysis reconciles ownership synchronously before this hook runs, so an unowned
  // session is normally already cleared — this is the independent second gate that keeps a previous
  // actor's candidate, clientRequestId, frozen submission and durable result IDs out of the hook's
  // initial state even if a caller ever mounts the hook without reconciling first.
  const restorableDraft = isAnalysisSessionOwnedBy(initialSession, {
    actorKey: runtime.state.actorKey,
    actorGeneration: runtime.state.actorGeneration
  })
    ? initialSession.mealPhotoFinalizationDraft
    : null;
  const [draft, setDraftState] = useState<MealPhotoFinalizationDraftState | null>(restorableDraft);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const mountedRef = useRef(true);
  const gateRef = useRef(new MealPhotoFinalizationSubmissionGate());
  const initialFrozenState =
    restorableDraft?.attempted && restorableDraft.clientRequestId ? restorableDraft : null;
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
  // MI-E-C5-R5-R4 §三/§六: which ACTOR the draft and frozen submission below belong to. Derived from
  // the same frozen actorKey/actorGeneration pair as `identity` above (which additionally scopes to
  // the analysis request/photo) — one identity source, two scopes, no second system. The comparison
  // is PURE: it reads a ref and compares strings, mutating nothing.
  const actorIdentity = buildMealPhotoAnalysisActorIdentity({
    actorKey: runtime.state.actorKey,
    actorGeneration: runtime.state.actorGeneration
  });
  const draftOwnerIdentityRef = useRef(actorIdentity);
  const isCurrentActorState = draftOwnerIdentityRef.current === actorIdentity;
  // MI-E-C5-R5-R6-A §三: which ANALYSIS OPERATION the shared finalization runtime is currently bound
  // to is owned by the RUNTIME, not by this hook. R6 kept it in a null-seeded ref, which made a
  // same-operation remount report a succeeded operation as idle/unlocked on its first render and —
  // because a same-operation rebind is a no-op that emits nothing — never corrected itself.
  //
  // The binding is now a PURE runtime-owned query evaluated during render. A freshly mounted hook
  // therefore computes the correct value immediately, with no ref, no effect and no rerender.
  const operationIdentity = buildMealPhotoFinalizationOperationIdentity({
    analysisRequestId: initialSession.analysisRequestId,
    captureGeneration: initialSession.captureGeneration
  });
  const isRuntimeBoundToCurrentOperation =
    runtime.isMealIdentificationFinalizationBoundToOperation(operationIdentity);
  const runtimeStatus = runtime.mealIdentificationFinalizationState.status;
  // Single production authority for the operation-scoped public surface (see
  // deriveMealPhotoFinalizationOperationSafeState). The smoke executes this same function.
  // Memoised on its two primitive inputs only, so the public object keeps a stable identity across
  // unrelated rerenders. The derivation itself stays pure and is re-run whenever either input moves.
  const operationSafeState = useMemo(
    () =>
      deriveMealPhotoFinalizationOperationSafeState({
        runtimeStatus,
        boundToCurrentOperation: isRuntimeBoundToCurrentOperation
      }),
    [isRuntimeBoundToCurrentOperation, runtimeStatus]
  );
  // MI-E-C5-R5-R6-A §五: handlers re-ask the runtime at INVOCATION time rather than trusting a
  // render-time boolean captured in a closure, so a stale render can never authorise a submission.
  const ownsCurrentOperationState = useCallback(
    () => runtime.isMealIdentificationFinalizationBoundToOperation(operationIdentity),
    [operationIdentity, runtime]
  );
  // Every server-mutating and draft-mutating handler calls this FIRST, before the single-flight
  // gate, before any secure-UUID mint, before payload preparation and before any runtime call.
  const ownsCurrentActorState = useCallback(
    () => draftOwnerIdentityRef.current === actorIdentity && Boolean(runtime.state.actorKey),
    [actorIdentity, runtime.state.actorKey]
  );

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
  // MI-E-C5-R5-R4 §五: promoted from a passive effect to a COMMIT-PHASE layout effect, so the
  // internal draft cannot survive into a painted frame. The public view is masked synchronously
  // regardless, so this is defence in depth rather than the only barrier.
  useLayoutEffect(() => {
    if (previousIdentityRef.current === identity) return;
    previousIdentityRef.current = identity;
    gateRef.current.reset();
    frozenSubmissionRef.current = null;
    setSelectedMealPhotoAnalysisCandidateId(null);
    setDraft(null);
  }, [identity, setDraft]);

  // MI-E-C5-R5-R4 §五: actor-level internal clearing, also commit phase. A same-actor rerender, a
  // background → foreground return and a silent token refresh all leave actorIdentity untouched and
  // therefore preserve a legitimate manual or failed-recovery draft. A generation change, a
  // different actor, a sign-out and a failed restore all change it and clear everything.
  useLayoutEffect(() => {
    if (draftOwnerIdentityRef.current === actorIdentity) return;
    draftOwnerIdentityRef.current = actorIdentity;
    gateRef.current.reset();
    frozenSubmissionRef.current = null;
    // MI-E-C5-R5-R6-A: no hook-local binding state to clear — the runtime drops its own operation
    // binding in setActor, and the pure query reflects that on the very next render.
    setDraft(null);
  }, [actorIdentity, setDraft]);

  // MI-E-C5-R5-R6 §五/§七: bind the shared finalization runtime to THIS analysis operation, in the
  // commit phase. Running here rather than in render means an abandoned or speculative render can
  // never reset a live operation, and the binding still lands before paint — so the user never sees
  // a frame in which the previous meal's succeeded state disables acceptance for a new analysis.
  //
  // The ref only advances when the runtime confirms the binding. If it refuses (signed out, another
  // actor, or an unresolved submitting/uncertain payload) the ref stays stale, every mutating
  // handler below keeps failing closed, and the existing uncertain retry UI stays authoritative.
  useLayoutEffect(() => {
    if (isRuntimeBoundToCurrentOperation) return;
    runtime.beginMealIdentificationFinalizationOperation(operationIdentity);
  }, [isRuntimeBoundToCurrentOperation, operationIdentity, runtime]);

  // ==========================================================================================
  // MI-E-C5-R7-B1-R1 §四: THE single invocation-time context authority.
  //
  // Every NEW durable submission calls this immediately before preparing its payload, so the
  // payload is always built from the context this render can see — never from whatever the last
  // committed effect happened to leave in the draft. The eager synchronisation below is now a
  // layout effect (pre-paint) as defence in depth, but it is NOT the safety authority: a handler
  // can be invoked programmatically, and React gives no ordering guarantee strong enough to bet a
  // durable write on.
  //
  // It owns no rules of its own. Change detection is `sameContext` (via
  // updateMealPhotoFinalizationContext), token rotation is that same pure transition's
  // attempted-only secure-UUID semantics, and the payload lock is the existing
  // applyMealPhotoFinalizationPayloadMutation — so a locked payload cannot drift here either.
  //
  // Returns the state the caller MUST prepare from. Callers must not fall back to
  // draftRef.current afterwards, which is exactly the stale read this exists to remove.
  //
  // Deliberately NOT used by retryPending: an uncertain retry replays the frozen submission and
  // must never re-read live session context.
  const reconcileDraftWithCurrentContext = useCallback(
    (current: MealPhotoFinalizationDraftState): MealPhotoFinalizationDraftState => {
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
      if (next === current) return current;
      // The context moved, so any frozen submission describes a payload that is no longer the
      // one being sent.
      frozenSubmissionRef.current = null;
      setDraft(next);
      return next;
    },
    [input.context, runtime.mealIdentificationFinalizationState.status, setDraft]
  );

  // Context fields are fingerprint-bearing. If the user changes source/time/meal period
  // after an attempt, the pure state transition rotates the UUID before another submit.
  // MI-E-C5-R7-B1-R1: promoted to a LAYOUT effect so the draft is already reconciled before the
  // user can see (and therefore touch) the new context. Eager only — the real guarantee is the
  // invocation-time reconciliation above.
  useLayoutEffect(() => {
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
    // MI-E-C5-R7-B1: the restaurant ids are fingerprint-bearing context, so they must appear here
    // too. Without them a venue change alone would not re-run this effect, the draft would keep the
    // previous restaurant, and no clientRequestId rotation would happen.
    input.context.branchId,
    input.context.captureMethod,
    input.context.occurredAt,
    input.context.recordTiming,
    input.context.restaurantId,
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
      if (!ownsCurrentActorState()) return;
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
    if (!ownsCurrentActorState()) return;
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
      if (!ownsCurrentActorState()) return;
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
    // A previous actor's frozen payload must never be retried under the current actor.
    if (!ownsCurrentActorState()) return;
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
    // MI-E-C5-R5-R4 §九: fail closed BEFORE the single-flight gate, any secure-UUID mint, any
    // payload preparation and any runtime RPC. A stale manual/failed draft belonging to a previous
    // actor can therefore never be submitted under the current actor's identity.
    if (!ownsCurrentActorState()) return;
    if (!mountedRef.current) return;
    if (runtime.mealIdentificationFinalizationState.status === "uncertain") {
      await retryPending();
      return;
    }
    // MI-E-C5-R5-R6 §五: a NEW submission may only start once the shared runtime is bound to THIS
    // analysis operation. Placed after the uncertain branch so resolving a previous operation's
    // pending payload through retry is never blocked by this gate.
    if (!ownsCurrentOperationState()) return;
    if (
      isMealPhotoFinalizationPayloadLocked(
        runtime.mealIdentificationFinalizationState.status
      )
    ) {
      return;
    }
    const existing = draftRef.current;
    if (!existing || !gateRef.current.tryStart()) return;
    // MI-E-C5-R7-B1-R1: reconcile with the CURRENT context before preparing. Without this the
    // editor could submit a payload built from a restaurant/source the user has already changed,
    // because the eager sync is only an effect.
    const current = reconcileDraftWithCurrentContext(existing);
    const expectedIdentity = identityRef.current;

    // prepareMealPhotoFinalization calls the secure UUID provider, which can throw on a runtime
    // with no available secure-random source (MI-E-C5-R3: Hermes/Expo Go with no global.crypto and
    // no expo-crypto fallback). That throw must never escape as an uncaught rejection, must never
    // be mistaken for a network/transport failure, and must always release the single-flight gate
    // — no runtime call is ever reached on this path, so no pending operation is ever created.
    let prepared: ReturnType<typeof prepareMealPhotoFinalization> | null;
    try {
      prepared = prepareMealPhotoFinalization(
        current,
        generateConsumerMealIdentificationFinalizationClientRequestId
      );
    } catch {
      prepared = null;
    }
    if (!prepared) {
      setDraft(
        Object.freeze({
          ...current,
          submissionStatus: "failed" as const,
          lastSafeError: "finalization_client_error",
          attempted: true
        })
      );
      gateRef.current.finish();
      return;
    }
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
    // MI-E-C5-R7-B1-R1: reconcileDraftWithCurrentContext MUST be a dependency. It closes over
    // input.context, so omitting it would leave submit holding a stale reconciler — reintroducing
    // exactly the stale-context submission this repair removes.
  }, [applyResultIfCurrent, reconcileDraftWithCurrentContext, retryPending, runtime, setDraft]);

  // MI-E-C5-R5-R1 one-step acceptance. 「分析正確」 and tapping a fallback are FINAL acceptance
  // actions, not selection actions — each must adopt the candidate and run the one atomic
  // finalization in a single user gesture, with no second standalone 加入今日飲食 step.
  //
  // The draft is built and submitted from the SAME local value rather than "select, then re-read
  // state and submit", so the flow can never depend on React state/ref update timing. Everything
  // else is the frozen path: same single-flight gate, same stable clientRequestId (reused on
  // retry of the same candidate), same fingerprint, same R3-A exception boundary.
  const acceptCandidate = useCallback(
    async (candidate: MealPhotoAnalysisCandidate) => {
      if (!ownsCurrentActorState()) return;
      if (!mountedRef.current) return;
      if (runtime.mealIdentificationFinalizationState.status === "uncertain") {
        await retryPending();
        return;
      }
      // MI-E-C5-R5-R6 §五: same gate as submit() — one-step acceptance is a finalization start, so
      // it may only run once the shared runtime is bound to THIS analysis operation.
      if (!ownsCurrentOperationState()) return;
      if (isMealPhotoFinalizationPayloadLocked(runtime.mealIdentificationFinalizationState.status)) return;
      const analysisRequestId = getAnalysisSession().analysisRequestId;
      if (!analysisRequestId) return;
      // Double tap: the second gesture finds the gate already held and returns without creating a
      // second request id or a second finalization call.
      if (!gateRef.current.tryStart()) return;
      const expectedIdentity = identityRef.current;

      const existing = draftRef.current;
      // MI-E-C5-R7-B1-R1: the SAME invocation-time authority the editor submit uses, so the two
      // durable entry points cannot drift apart. A brand-new draft is created from input.context
      // directly, which is already the current context.
      const base =
        existing &&
        existing.mode === "candidate" &&
        existing.selectedCandidateId === candidate.candidateId &&
        existing.analysisRequestId === analysisRequestId
          ? reconcileDraftWithCurrentContext(existing)
          : createCandidateMealPhotoFinalizationDraft(analysisRequestId, candidate, input.context);

      setSelectedMealPhotoAnalysisCandidateId(candidate.candidateId);

      let prepared: ReturnType<typeof prepareMealPhotoFinalization> | null;
      try {
        prepared = prepareMealPhotoFinalization(
          base,
          generateConsumerMealIdentificationFinalizationClientRequestId
        );
      } catch {
        prepared = null;
      }
      if (!prepared) {
        setDraft(
          Object.freeze({
            ...base,
            submissionStatus: "failed" as const,
            lastSafeError: "finalization_client_error",
            attempted: true
          })
        );
        gateRef.current.finish();
        return;
      }
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
    },
    // MI-E-C5-R7-B1-R1: same reason as submit — the reconciler closes over input.context.
    [applyResultIfCurrent, input.context, reconcileDraftWithCurrentContext, retryPending, runtime, setDraft]
  );

  // MI-E-C5-R5-R4 §四: SYNCHRONOUS actor-safe public view. While the internal draft still belongs to
  // a previous actor the public draft reads as null and every derived flag reads as its safe
  // initial value, so a stale manual or failed draft can never make the editor render, can never
  // expose that actor's meal name/nutrition, and can never supply a clientRequestId, frozen payload
  // or durable result IDs to the current actor.
  return useMemo(
    () => ({
      isCurrentActorState,
      draft: isCurrentActorState ? draft : null,
      selectCandidate,
      acceptCandidate,
      chooseManual,
      updateField,
      submit,
      retryPending,
      submitting: isCurrentActorState ? draft?.submissionStatus === "submitting" : false,
      // MI-E-C5-R5-R6 §四/§十: every runtime-derived flag is now scoped to the CURRENT analysis
      // operation as well as the current actor. `operationSafeRuntimeStatus` keeps a live
      // submitting/uncertain payload locked no matter which operation it belongs to, but reports a
      // previous operation's terminal succeeded/error as plain idle — so a newly analysed meal is
      // accept-ready without a sign-out, while the finished meal itself stays permanently locked
      // against a second write.
      uncertain: isCurrentActorState ? operationSafeState.uncertain : false,
      payloadLocked: isCurrentActorState ? operationSafeState.payloadLocked : false,
      runtimeStatus: isCurrentActorState ? operationSafeState.runtimeStatus : "idle"
    }),
    [
      acceptCandidate,
      chooseManual,
      draft,
      isCurrentActorState,
      operationSafeState,
      retryPending,
      selectCandidate,
      submit,
      updateField
    ]
  );
}
