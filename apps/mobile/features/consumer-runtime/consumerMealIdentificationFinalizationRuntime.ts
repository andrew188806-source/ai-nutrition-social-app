import { toDateKeyInTimeZone } from "../consumer-meals/mealDateTime";
import type { ConsumerMealIdentificationFinalizationService } from "../meal-identification-finalization/consumerMealIdentificationFinalizationService";
import type { ConsumerMealIdentificationFinalizationErrorCode } from "../meal-identification-finalization/errors";
import type {
  ConsumerMealIdentificationMealType,
  FinalizeCurrentUserMealIdentificationInput
} from "../meal-identification-finalization/types";
import type { MealIdentificationFinalizationCommand } from "../meal-identification";
import type { MealIdentificationFinalizationV3Command } from "../meal-identification-finalization/v3Contract";
import {
  ConsumerMealIdentificationFinalizationOperationStore,
  createConsumerMealIdentificationFinalizationPendingOperation,
  type ConsumerMealIdentificationFinalizationLedgerEntry,
  type ConsumerMealIdentificationFinalizationPendingOperation
} from "./consumerMealIdentificationFinalizationOperationStore";
import { MealSaveLedgerError } from "./mealSaveOperationLedger";
import {
  applyAttemptOutcome,
  blocksNewSave,
  classifyFinalizationOutcome,
  createLocalWait,
  describeFinalizationInput,
  isCancellable,
  proofFromError,
  summarizeMealSaveEntry,
  type LocalWait,
  type MealSaveClassification,
  type MealSaveDispatchBinding,
  type MealSaveOperationSummary
} from "./mealSaveRecovery";
import { generateSecureUuidV4 } from "./secureUuidProvider";

export type ConsumerMealIdentificationFinalizationRuntimeErrorCode =
  | ConsumerMealIdentificationFinalizationErrorCode
  | "profile_timezone_required"
  | "result_uncertain"
  | "save_failed_retryable"
  | "storage_unavailable"
  | "capacity_exhausted";

export type ConsumerMealIdentificationFinalizationRuntimeState = {
  status: "idle" | "restoring" | "submitting" | "uncertain" | "succeeded" | "error";
  errorCode: ConsumerMealIdentificationFinalizationRuntimeErrorCode | null;
  mealRecordId: string | null;
  mealRecordItemId: string | null;
  mealAnalysisId: string | null;
  mealIdentificationFinalizationId: string | null;
  mealCorrectionIds: readonly string[] | null;
  pending: boolean;
  finalizationDataRevision: number;
  // Every unresolved operation of the current actor (display summaries; storage is the authority).
  operations: readonly MealSaveOperationSummary[];
};

export type ConsumerMealIdentificationFinalizationDraft = {
  // B2 may allocate this from the same runtime UUID authority before submit so the UI's
  // single draft can preserve it across safe retries and rotate it after payload edits.
  // Legacy callers omit it and retain the exact pre-B2 runtime-generated behavior.
  clientRequestId?: string;
  mealType: ConsumerMealIdentificationMealType;
  finalization: MealIdentificationFinalizationCommand | MealIdentificationFinalizationV3Command;
};

export type ConsumerMealIdentificationFinalizationActorContext = {
  actorKey: string;
  actorGeneration: number;
  timezone: string;
};

export type ConsumerMealIdentificationFinalizationRuntimeOptions = {
  service: Pick<ConsumerMealIdentificationFinalizationService, "finalizeCurrentUserMealIdentification">;
  operationStore: ConsumerMealIdentificationFinalizationOperationStore;
  clock?: { now(): Date };
  uuidFactory?: () => string;
  // Registers the operation owner right before a dispatch (actor-bound dispatch guard).
  dispatchBinding?: MealSaveDispatchBinding;
  // Local stop-waiting limit (30 s). Not a cancel and not a retry.
  localWait?: LocalWait;
};

type FinalizationValue = {
  mealRecordId: string;
  mealRecordItemId: string;
  mealAnalysisId: string;
  mealIdentificationFinalizationId: string;
  mealCorrectionIds: readonly string[];
};

type ServiceResult = Awaited<ReturnType<ConsumerMealIdentificationFinalizationService["finalizeCurrentUserMealIdentification"]>>;

const idleState = (revision: number, operations: readonly MealSaveOperationSummary[] = []): ConsumerMealIdentificationFinalizationRuntimeState => ({
  status: "idle",
  errorCode: null,
  mealRecordId: null,
  mealRecordItemId: null,
  mealAnalysisId: null,
  mealIdentificationFinalizationId: null,
  mealCorrectionIds: null,
  pending: false,
  finalizationDataRevision: revision,
  operations
});

export class ConsumerMealIdentificationFinalizationRuntime {
  private readonly listeners = new Set<(state: ConsumerMealIdentificationFinalizationRuntimeState) => void>();
  private actorKey: string | null = null;
  private actorGeneration = 0;
  // MI-E-C5-R5-R6 §三: the runtime is bounded by actor AND by the current analysis operation.
  // Without this second axis a terminal `succeeded` from one meal stayed applied to every later
  // analysis of the same signed-in actor, keeping payloadLocked true and permanently disabling
  // acceptance until sign-out. null means "not yet bound to any operation" and fails closed.
  private operationId: string | null = null;
  private actorReady = false;
  private storageFailed = false;
  // The foreground operation: the one the bound analysis screen is looking at / acting on.
  private pending: ConsumerMealIdentificationFinalizationLedgerEntry | null = null;
  // A NEW submit in progress (double taps share it).
  private inFlight: Promise<ConsumerMealIdentificationFinalizationRuntimeState> | null = null;
  // One live attempt per operation key (joins repeated retries of the same operation).
  private readonly attempts = new Map<string, Promise<ConsumerMealIdentificationFinalizationRuntimeState>>();
  private state = idleState(0);
  private readonly localWait: LocalWait;

  constructor(private readonly options: ConsumerMealIdentificationFinalizationRuntimeOptions) {
    this.localWait = options.localWait ?? createLocalWait();
  }

  getState() {
    return this.state;
  }

  subscribe(listener: (state: ConsumerMealIdentificationFinalizationRuntimeState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async setActor(actorKey: string | null, actorGeneration: number) {
    if (actorKey === this.actorKey && actorGeneration === this.actorGeneration) return;
    this.actorKey = actorKey;
    this.actorGeneration = actorGeneration;
    // An actor change invalidates the previous actor's operation binding as well, so the next
    // analysis screen must re-bind explicitly before it can submit.
    this.operationId = null;
    this.actorReady = false;
    this.storageFailed = false;
    this.pending = null;
    this.inFlight = null;
    this.update(actorKey ? { ...idleState(this.state.finalizationDataRevision), status: "restoring" } : idleState(this.state.finalizationDataRevision));
    if (!actorKey) return;
    // Unresolved operations are never deleted by an actor/generation change: they live in the owner's
    // own slots and are reloaded for that owner only.
    const listing = await this.options.operationStore.list(actorKey);
    if (!this.isCurrent(actorKey, actorGeneration)) return;
    if (!listing.ok) {
      this.storageFailed = true;
      this.update({ ...idleState(this.state.finalizationDataRevision), status: "error", errorCode: "storage_unavailable" });
      return;
    }
    this.actorReady = true;
    const foreground = listing.entries.find((entry) => blocksNewSave(entry)) ?? null;
    this.pending = foreground;
    this.update({
      ...idleState(this.state.finalizationDataRevision, this.summaries(listing.entries)),
      status: foreground ? "uncertain" : "idle",
      errorCode: foreground ? "result_uncertain" : null,
      pending: Boolean(foreground)
    });
  }

  // MI-E-C5-R5-R6-A §二: PURE runtime-owned binding query — the single authority for "is the shared
  // finalization runtime currently serving THIS analysis operation for THIS actor". Mutates nothing,
  // emits nothing, mints nothing, so it is safe to call during render. Because the answer comes from
  // the runtime itself rather than hook-local state, a freshly mounted hook gets the correct answer
  // on its FIRST render — no effect and no rerender are needed to correct it.
  isBoundToOperation(context: { actorKey: string; actorGeneration: number }, operationId: string): boolean {
    if (!operationId) return false;
    if (!this.matchesActor(context)) return false;
    return this.operationId === operationId;
  }

  // MI-E-C5-R5-R6 §五: bind the runtime to the analysis operation that is currently on screen.
  //
  //  * same operation            → no-op, returns true (an ordinary rerender, a token refresh and
  //                                navigation back to the same analysis all land here)
  //  * signed out / other actor  → fails closed, returns false, touches nothing
  //  * unresolved submission     → refuses, returns false, while an attempt is on the wire or the
  //                                foreground operation may still have committed and the user has not
  //                                set it aside (暫不處理). A set-aside or known-not-written operation
  //                                stays in its slot and no longer blocks another analysis.
  //  * otherwise                 → adopts the new operation and resets to idle, dropping the
  //                                previous operation's succeeded/failed result, durable IDs and
  //                                error so the new analysis starts unlocked.
  //
  // Never called during render — analysis.tsx/useMealPhotoFinalization drive it from a layout
  // effect, so an abandoned render can never reset a live operation.
  beginAnalysisOperation(
    context: { actorKey: string; actorGeneration: number },
    operationId: string
  ): boolean {
    if (!operationId) return false;
    if (!this.matchesActor(context)) return false;
    if (this.operationId === operationId) return true;
    if (this.inFlight) return false;
    if (this.pending && (this.attempts.has(this.pending.opId) || blocksNewSave(this.pending))) return false;
    this.operationId = operationId;
    this.pending = null;
    this.update(idleState(this.state.finalizationDataRevision, this.state.operations));
    return true;
  }

  submit(context: ConsumerMealIdentificationFinalizationActorContext, draft: ConsumerMealIdentificationFinalizationDraft) {
    if (this.inFlight) return this.inFlight;
    if (!this.matchesActor(context)) return Promise.resolve(this.fail("finalization_authentication_required"));
    if (!this.actorReady) return Promise.resolve(this.fail(this.storageFailed ? "storage_unavailable" : "finalization_configuration_invalid"));
    if (this.pending) {
      const live = this.attempts.get(this.pending.opId);
      if (live && draft.clientRequestId !== this.pending.opId) return live;
      if (blocksNewSave(this.pending) && draft.clientRequestId !== this.pending.opId) return Promise.resolve(this.fail("result_uncertain", true));
    }
    if (!validTimezone(context.timezone)) return Promise.resolve(this.fail("profile_timezone_required"));

    const generation = context.actorGeneration;
    const actorKey = context.actorKey;
    // MI-E-C5-R5-R6 §八: the operation this submission belongs to is frozen here. Every later state
    // transition re-checks it, so a slow response from this operation can never land on a newer one.
    const operationId = this.operationId;
    this.inFlight = this.startOperation(actorKey, generation, operationId, context.timezone, draft).finally(() => {
      if (actorKey === this.actorKey && generation === this.actorGeneration) this.inFlight = null;
    });
    return this.inFlight;
  }

  // Manual retry of the SAME operation (same key, same payload). Without `opId` it retries the foreground
  // operation. Never automatic, never creates a key.
  retry(context: Omit<ConsumerMealIdentificationFinalizationActorContext, "timezone">, opId?: string) {
    const target = opId ?? this.pending?.opId ?? null;
    const live = target ? this.attempts.get(target) : undefined;
    if (live) return live;
    if (!this.matchesActor(context)) return Promise.resolve(this.fail("finalization_authentication_required"));
    if (opId !== undefined) return this.retryById(context, opId);
    if (!this.pending) return Promise.resolve(this.fail("finalization_authentication_required"));
    const operation = this.pending;
    const operationId = this.operationId;
    return this.runAttempt(operation, () => this.execute(context.actorKey, context.actorGeneration, operationId, operation));
  }

  // 暫不處理: set the operation aside. Key, payload, history and state are untouched; the in-flight
  // request (if any) is NOT cancelled. The bound analysis keeps its locked, uncertain presentation; any
  // OTHER analysis may now start (beginAnalysisOperation no longer refuses).
  async defer(context: Omit<ConsumerMealIdentificationFinalizationActorContext, "timezone">, opId?: string) {
    if (!this.matchesActor(context)) return this.state;
    const target = opId ?? this.pending?.opId;
    if (!target) return this.state;
    await this.options.operationStore.update(context.actorKey, target, (entry) => ({ ...entry, deferred: true }));
    if (!this.isCurrent(context.actorKey, context.actorGeneration)) return this.state;
    if (this.pending?.opId === target) this.pending = { ...this.pending, deferred: true };
    await this.refreshOperations(context.actorKey, context.actorGeneration);
    return this.state;
  }

  // Cancel a draft that never had an unknown result and is not on the wire. A possibly-committed
  // operation can never be cancelled to pretend it was not written.
  async cancel(context: Omit<ConsumerMealIdentificationFinalizationActorContext, "timezone">, opId: string) {
    if (!this.matchesActor(context)) return this.state;
    const entry = await this.options.operationStore.get(context.actorKey, opId);
    if (!entry || entry.ownerActorKey !== context.actorKey) return this.state;
    if (!isCancellable(entry, this.attempts.has(opId))) return this.state;
    const removed = await this.options.operationStore.update(context.actorKey, opId, (current) => (isCancellable(current, false) ? null : current));
    if (!this.isCurrent(context.actorKey, context.actorGeneration)) return this.state;
    if (removed.ok && removed.entry === null && this.pending?.opId === opId) {
      this.pending = null;
      this.update(idleState(this.state.finalizationDataRevision, this.state.operations));
    }
    await this.refreshOperations(context.actorKey, context.actorGeneration);
    return this.state;
  }

  reject(errorCode: ConsumerMealIdentificationFinalizationRuntimeErrorCode) {
    return this.fail(errorCode);
  }

  // An unresolved result (result_uncertain) always keeps the operation pending.
  private fail(errorCode: ConsumerMealIdentificationFinalizationRuntimeErrorCode, pending = false) {
    const unresolved = pending || errorCode === "result_uncertain";
    this.update({
      status: unresolved ? "uncertain" : "error",
      errorCode,
      mealRecordId: null,
      mealRecordItemId: null,
      mealAnalysisId: null,
      mealIdentificationFinalizationId: null,
      mealCorrectionIds: null,
      pending: unresolved,
      finalizationDataRevision: this.state.finalizationDataRevision,
      operations: this.state.operations
    });
    return this.state;
  }

  private async startOperation(
    actorKey: string,
    generation: number,
    operationId: string | null,
    timezone: string,
    draft: ConsumerMealIdentificationFinalizationDraft
  ) {
    let operation: ConsumerMealIdentificationFinalizationPendingOperation;
    try {
      const submittedAt = this.options.clock?.now() ?? new Date();
      const clientRequestId =
        draft.clientRequestId ??
        (this.options.uuidFactory ?? generateConsumerMealIdentificationFinalizationClientRequestId)();
      const occurredAt = new Date(draft.finalization.occurredAt);
      if (Number.isNaN(occurredAt.getTime())) {
        throw new Error("Actual meal time is invalid.");
      }
      const input: FinalizeCurrentUserMealIdentificationInput = {
        clientRequestId,
        mealType: draft.mealType,
        occurredAt: draft.finalization.occurredAt,
        mealDate: toDateKeyInTimeZone(occurredAt, timezone),
        timezone,
        finalization: draft.finalization
      };
      operation = createConsumerMealIdentificationFinalizationPendingOperation(input, submittedAt);
    } catch {
      return this.isCurrentOperation(actorKey, generation, operationId) ? this.fail("finalization_invalid_input") : this.state;
    }

    // The same key may already be in the ledger (a screen resubmitting its frozen draft after 暫不處理 or
    // a restart). Same payload = the SAME operation, retried manually; a different payload under an
    // existing key is refused locally and nothing is sent.
    const existing = await this.options.operationStore.get(actorKey, operation.clientRequestId);
    if (!this.isCurrentOperation(actorKey, generation, operationId)) return this.state;
    if (existing && existing.ownerActorKey === actorKey) {
      if (JSON.stringify(existing.input) !== JSON.stringify(operation.input)) return this.fail("finalization_idempotency_conflict");
      const revived = existing.deferred
        ? await this.options.operationStore.update(actorKey, existing.opId, (entry) => ({ ...entry, deferred: false }))
        : { ok: true as const, entry: existing };
      const entry = revived.ok && revived.entry ? revived.entry : existing;
      if (!this.isCurrentOperation(actorKey, generation, operationId)) return this.state;
      this.pending = entry;
      return this.runAttempt(entry, () => this.execute(actorKey, generation, operationId, entry));
    }

    let entry: ConsumerMealIdentificationFinalizationLedgerEntry;
    try {
      // Persist-before-send: the durable, verified entry exists before anything is dispatched.
      entry = await this.options.operationStore.save(actorKey, operation);
    } catch (error) {
      if (!this.isCurrentOperation(actorKey, generation, operationId)) return this.state;
      if (error instanceof MealSaveLedgerError) {
        if (error.reason === "capacity") return this.fail("capacity_exhausted");
        if (error.reason === "too_large") return this.fail("finalization_invalid_input");
      }
      return this.fail("storage_unavailable");
    }
    if (!this.isCurrentOperation(actorKey, generation, operationId)) {
      // The actor/operation changed while persisting: nothing was dispatched, so the journal returns to `new`.
      await this.reconcile(actorKey, entry.opId, { cls: "not_sent", meta: {} });
      return this.state;
    }
    this.pending = entry;
    await this.refreshOperations(actorKey, generation);
    return this.runAttempt(entry, () => this.execute(actorKey, generation, operationId, entry));
  }

  private async retryById(context: Omit<ConsumerMealIdentificationFinalizationActorContext, "timezone">, opId: string) {
    const found = await this.options.operationStore.get(context.actorKey, opId);
    if (!this.isCurrent(context.actorKey, context.actorGeneration)) return this.state;
    if (!found || found.ownerActorKey !== context.actorKey) return this.state;
    const updated = found.deferred
      ? await this.options.operationStore.update(context.actorKey, opId, (entry) => ({ ...entry, deferred: false }))
      : { ok: true as const, entry: found };
    const entry = updated.ok && updated.entry ? updated.entry : found;
    if (!this.isCurrent(context.actorKey, context.actorGeneration)) return this.state;
    // The foreground belongs to the analysis bound to this runtime. Re-confirming ANY other operation (e.g. a
    // set-aside one from the notice) runs alongside it and never takes over that analysis' state, so another
    // operation's result can never appear as — or lock — the current photo's save.
    if (this.pending?.opId === opId) this.pending = entry;
    const operationId = this.operationId;
    return this.runAttempt(entry, () => this.execute(context.actorKey, context.actorGeneration, operationId, entry));
  }

  private runAttempt(entry: ConsumerMealIdentificationFinalizationLedgerEntry, run: () => Promise<ConsumerMealIdentificationFinalizationRuntimeState>) {
    const existing = this.attempts.get(entry.opId);
    if (existing) return existing;
    // The attempt is deregistered BEFORE the summaries are refreshed, so the operation list the UI sees after
    // the attempt shows its real state and actions (not "in flight").
    const promise: Promise<ConsumerMealIdentificationFinalizationRuntimeState> = run().then(
      async () => {
        if (this.attempts.get(entry.opId) === promise) this.attempts.delete(entry.opId);
        if (this.actorKey !== null) await this.refreshOperations(this.actorKey, this.actorGeneration);
        return this.state;
      },
      async (error: unknown) => {
        if (this.attempts.get(entry.opId) === promise) this.attempts.delete(entry.opId);
        throw error;
      }
    );
    this.attempts.set(entry.opId, promise);
    return promise;
  }

  private async execute(
    actorKey: string,
    generation: number,
    operationId: string | null,
    operation: ConsumerMealIdentificationFinalizationLedgerEntry
  ) {
    if (!this.isCurrentOperation(actorKey, generation, operationId)) return this.state;
    const foreground = this.pending?.opId === operation.opId;
    // Early refusal only; the isolation of the dispatch itself is the actor-bound guard.
    if (operation.ownerActorKey !== actorKey) return foreground ? this.fail("finalization_actor_binding_mismatch") : this.state;
    // Journal: `inflight` is durable and verified BEFORE the dispatch. A new operation was created `inflight`
    // by `save`; a retry marks it here. If it cannot be written nothing is sent.
    const marked = operation.state === "inflight"
      ? { ok: true as const, entry: operation }
      : await this.options.operationStore.markInflight(actorKey, operation.opId);
    if (!marked.ok || !marked.entry) {
      if (!this.isCurrentOperation(actorKey, generation, operationId)) return this.state;
      if (foreground) return this.fail("storage_unavailable");
      await this.refreshOperations(actorKey, generation);
      return this.state;
    }
    if (!this.isCurrentOperation(actorKey, generation, operationId)) {
      await this.reconcile(actorKey, operation.opId, { cls: "not_sent", meta: {} });
      return this.state;
    }
    const entry = marked.entry;
    if (this.pending?.opId === operation.opId) this.pending = entry;
    // An attempt beside the foreground shows only as "in flight" in the operation list; the bound analysis' state is untouched.
    if (!foreground) await this.refreshOperations(actorKey, generation);
    else this.update({
      status: "submitting",
      errorCode: null,
      mealRecordId: null,
      mealRecordItemId: null,
      mealAnalysisId: null,
      mealIdentificationFinalizationId: null,
      mealCorrectionIds: null,
      pending: true,
      finalizationDataRevision: this.state.finalizationDataRevision,
      operations: this.state.operations
    });

    this.options.dispatchBinding?.bind(operation.opId, actorKey);
    let call: Promise<ServiceResult>;
    try {
      call = Promise.resolve(this.options.service.finalizeCurrentUserMealIdentification(operation.input));
    } catch (error) {
      call = Promise.reject(error);
    }
    const settled = call.then(
      (result) => ({ result }) as const,
      (thrown: unknown) => ({ thrown }) as const
    );
    const raced = await this.localWait.race(settled);
    this.options.dispatchBinding?.release(operation.opId);
    // See the normal-save runtime: the observation is only valid for an attempt that has not timed out.
    const observation = raced.timedOut ? undefined : this.options.dispatchBinding?.observe?.(operation.opId);
    if (raced.timedOut) {
      // Stop waiting locally. The request is NOT cancelled and may still commit: unknown, sticky.
      void settled.then((late) => this.settleAttempt(actorKey, generation, operationId, entry, late, true));
      return this.settleAttempt(actorKey, generation, operationId, entry, { timeout: true }, false);
    }
    return this.settleAttempt(actorKey, generation, operationId, entry, raced.value, false, observation);
  }

  private async settleAttempt(
    actorKey: string,
    generation: number,
    operationId: string | null,
    operation: ConsumerMealIdentificationFinalizationLedgerEntry,
    answer: { timeout: true } | { thrown: unknown } | { result: ServiceResult },
    late: boolean,
    observation?: { called: boolean; refused: boolean }
  ): Promise<ConsumerMealIdentificationFinalizationRuntimeState> {
    let classification: MealSaveClassification;
    let errorCode: string | null = null;
    if ("timeout" in answer) classification = { cls: "unknown", meta: { reason: "deadline" } };
    else if ("thrown" in answer) classification = { cls: "unknown", meta: { reason: "transport" } };
    else if (answer.result.ok) classification = { cls: "saved", meta: {} };
    else {
      errorCode = answer.result.error.code;
      const sqlstate = (answer.result.error as { sqlstate?: string | null }).sqlstate ?? null;
      const httpStatus = (answer.result.error as { httpStatus?: number | null }).httpStatus ?? null;
      const structured = (answer.result.error as { structured?: boolean }).structured === true;
      classification = classifyFinalizationOutcome(errorCode, sqlstate, structured, proofFromError("finalize", answer.result.error, observation, answer.result.source !== "supabase"));
      classification = { ...classification, meta: { ...classification.meta, httpStatus } };
    }

    const reconciled = await this.reconcile(actorKey, operation.opId, classification);
    const ownerIsCurrent = this.actorKey === actorKey;
    const publishable = !late && this.isCurrentOperation(actorKey, generation, operationId) && this.pending?.opId === operation.opId;

    if (classification.cls === "saved") {
      const value = "result" in answer && answer.result.ok ? (answer.result.value as FinalizationValue) : null;
      const wasForeground = this.pending?.opId === operation.opId;
      // A trusted success of the operation that is still the foreground of the analysis bound to this runtime (same
      // actor, generation and analysis operation) resolves it — also when it arrives after the local wait. Any other
      // success is reconciled in the owner's ledger only and is never published to another analysis or account.
      if (wasForeground && value && this.isCurrentOperation(actorKey, generation, operationId)) return this.complete(actorKey, value);
      if (wasForeground) this.pending = null;
      // Late (or no-longer-foreground) success: the ledger is reconciled; refresh data for the owner's
      // current session only, and never touch another account's state.
      if (ownerIsCurrent) {
        this.update(wasForeground ? idleState(this.state.finalizationDataRevision + 1, this.state.operations) : { ...this.state, finalizationDataRevision: this.state.finalizationDataRevision + 1 });
        await this.refreshOperations(actorKey, this.actorGeneration);
      }
      return this.state;
    }

    if (!publishable) {
      if (ownerIsCurrent) await this.refreshOperations(actorKey, this.actorGeneration);
      return this.state;
    }

    const entry = reconciled.entry;
    this.pending = entry;
    const base = { ...this.state, mealRecordId: null, mealRecordItemId: null, mealAnalysisId: null, mealIdentificationFinalizationId: null, mealCorrectionIds: null };
    if (classification.cls === "not_sent") {
      this.update({ ...base, status: "error", errorCode: "finalization_actor_binding_mismatch", pending: false });
    } else if (entry === null) {
      // Removed: rejected input or conflict without unknown history — rollback is proven, the key is spent.
      this.update({ ...base, status: "error", errorCode: (errorCode ?? "finalization_invalid_input") as ConsumerMealIdentificationFinalizationRuntimeErrorCode, pending: false });
    } else if (entry.state === "unknown" || entry.state === "inflight" || entry.state === "new") {
      this.update({ ...base, status: "uncertain", errorCode: "result_uncertain", pending: true });
    } else if (entry.state === "blocked_login") {
      this.update({ ...base, status: "error", errorCode: "finalization_authentication_required", pending: false });
    } else if (entry.state === "blocked_consent") {
      this.update({ ...base, status: "error", errorCode: "finalization_eligibility_required", pending: false });
    } else {
      this.update({ ...base, status: "error", errorCode: "save_failed_retryable", pending: false });
    }
    await this.refreshOperations(actorKey, generation);
    return this.state;
  }

  // Applies one attempt outcome to the OWNER's ledger entry, independent of the current actor. Pure policy
  // (applyAttemptOutcome) decides; storage is the authority.
  private async reconcile(actorKey: string, opId: string, classification: MealSaveClassification) {
    const result = await this.options.operationStore.update(actorKey, opId, (entry) => {
      let cls = classification.cls;
      if (classification.localFailure) cls = entry.hadUnknown ? "not_sent" : "rejected_input";
      const transition = applyAttemptOutcome(entry, { cls, meta: classification.meta }, new Date().toISOString());
      return transition.action === "remove" ? null : transition.entry;
    });
    return { ok: result.ok, entry: result.ok ? result.entry : null };
  }

  private async complete(actorKey: string, value: FinalizationValue) {
    this.pending = null;
    this.update({
      status: "succeeded",
      errorCode: null,
      mealRecordId: value.mealRecordId,
      mealRecordItemId: value.mealRecordItemId,
      mealAnalysisId: value.mealAnalysisId,
      mealIdentificationFinalizationId: value.mealIdentificationFinalizationId,
      mealCorrectionIds: value.mealCorrectionIds,
      pending: false,
      finalizationDataRevision: this.state.finalizationDataRevision + 1,
      operations: this.state.operations
    });
    await this.refreshOperations(actorKey, this.actorGeneration);
    return this.state;
  }

  private summaries(entries: readonly ConsumerMealIdentificationFinalizationLedgerEntry[]) {
    const nowMs = Date.now();
    return entries.map((entry) => summarizeMealSaveEntry(entry, { nowMs, inFlight: this.attempts.has(entry.opId), describe: describeFinalizationInput }));
  }

  private async refreshOperations(actorKey: string, generation: number) {
    if (!this.isCurrent(actorKey, generation)) return;
    const listing = await this.options.operationStore.list(actorKey);
    if (!this.isCurrent(actorKey, generation) || !listing.ok) return;
    const operations = this.summaries(listing.entries);
    // A capacity refusal ends as soon as the ledger has a free slot again (after a confirmed save); nothing
    // was evicted to get there.
    if (this.state.errorCode === "capacity_exhausted" && listing.free > 0) {
      this.update(idleState(this.state.finalizationDataRevision, operations));
      return;
    }
    this.update({ ...this.state, operations });
  }

  private matchesActor(context: { actorKey: string; actorGeneration: number }) {
    return Boolean(context.actorKey) && this.isCurrent(context.actorKey, context.actorGeneration);
  }

  private isCurrent(actorKey: string, generation: number) {
    return actorKey === this.actorKey && generation === this.actorGeneration;
  }

  // Actor identity AND analysis operation must both still match before any state transition from an
  // awaited call is applied.
  private isCurrentOperation(actorKey: string, generation: number, operationId: string | null) {
    return this.isCurrent(actorKey, generation) && operationId === this.operationId;
  }

  private update(next: ConsumerMealIdentificationFinalizationRuntimeState) {
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }
}

function validTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
    return Boolean(timezone.trim());
  } catch {
    return false;
  }
}

export function generateConsumerMealIdentificationFinalizationClientRequestId(): string {
  return generateSecureUuidV4();
}
