import type { ConsumerMealRecordWriteService } from "../consumer-meals/consumerMealRecordWriteService";
import type { ConsumerMealRecord } from "../consumer-meals/types";
import { validateCreateMealRecordInput } from "../consumer-meals/writeValidation";
import { mapConsumerAnalysisMealWrite, type ConsumerAnalysisMealWriteDraft } from "./consumerMealWriteMapper";
import {
  ConsumerMealWriteOperationStore,
  createConsumerMealWritePendingOperation,
  type ConsumerMealWriteLedgerEntry,
  type ConsumerMealWritePendingOperation
} from "./consumerMealWriteOperationStore";
import { MealSaveLedgerError } from "./mealSaveOperationLedger";
import {
  applyAttemptOutcome,
  blocksNewSave,
  classifyMealWriteErrorCode,
  createLocalWait,
  describeMealWriteInput,
  isCancellable,
  summarizeMealSaveEntry,
  type LocalWait,
  type MealSaveClassification,
  type MealSaveDispatchBinding,
  type MealSaveOperationSummary
} from "./mealSaveRecovery";
import { generateSecureUuidV4 } from "./secureUuidProvider";

export type ConsumerMealWriteErrorCode =
  | "authentication_required"
  | "profile_timezone_required"
  | "invalid_input"
  | "disabled"
  | "configuration_error"
  | "idempotency_conflict"
  | "provider_rejected"
  | "result_uncertain"
  | "eligibility_required"
  | "save_failed_retryable"
  | "actor_binding_mismatch"
  | "storage_unavailable"
  | "capacity_exhausted";

export type ConsumerMealWriteRuntimeState = {
  status: "idle" | "restoring" | "submitting" | "uncertain" | "succeeded" | "error";
  errorCode: ConsumerMealWriteErrorCode | null;
  mealRecordId: string | null;
  mealDate: string | null;
  pending: boolean;
  mealDataRevision: number;
  // Every unresolved operation of the current actor (display summaries; storage is the authority).
  operations: readonly MealSaveOperationSummary[];
};

export type ConsumerMealWriteActorContext = {
  actorKey: string;
  actorGeneration: number;
  timezone: string;
};

export type ConsumerMealWriteRuntimeOptions = {
  service: Pick<ConsumerMealRecordWriteService, "createCurrentUserMealRecord">;
  operationStore: ConsumerMealWriteOperationStore;
  clock?: { now(): Date };
  uuidFactory?: () => string;
  // Registers the operation owner right before a dispatch (actor-bound dispatch guard).
  dispatchBinding?: MealSaveDispatchBinding;
  // Local stop-waiting limit (30 s). Not a cancel and not a retry.
  localWait?: LocalWait;
};

const idleState = (revision: number, operations: readonly MealSaveOperationSummary[] = []): ConsumerMealWriteRuntimeState => ({
  status: "idle",
  errorCode: null,
  mealRecordId: null,
  mealDate: null,
  pending: false,
  mealDataRevision: revision,
  operations
});

export class ConsumerMealWriteRuntime {
  private readonly listeners = new Set<(state: ConsumerMealWriteRuntimeState) => void>();
  private actorKey: string | null = null;
  private actorGeneration = 0;
  private actorReady = false;
  private storageFailed = false;
  // The foreground operation: the one the user is currently looking at / acting on.
  private pending: ConsumerMealWriteLedgerEntry | null = null;
  // A NEW submit in progress (double taps share it).
  private inFlight: Promise<ConsumerMealWriteRuntimeState> | null = null;
  // One live attempt per operation key (joins repeated retries of the same operation).
  private readonly attempts = new Map<string, Promise<ConsumerMealWriteRuntimeState>>();
  private state = idleState(0);
  private readonly localWait: LocalWait;

  constructor(private readonly options: ConsumerMealWriteRuntimeOptions) {
    this.localWait = options.localWait ?? createLocalWait();
  }

  getState() {
    return this.state;
  }

  subscribe(listener: (state: ConsumerMealWriteRuntimeState) => void) {
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
    this.actorReady = false;
    this.storageFailed = false;
    this.pending = null;
    this.inFlight = null;
    this.update(actorKey ? { ...idleState(this.state.mealDataRevision), status: "restoring" } : idleState(this.state.mealDataRevision));
    if (!actorKey) return;
    // Unresolved operations of the previous actor, and of this actor before a generation change, are
    // never touched here: they live in that actor's own slots and are reloaded below.
    const listing = await this.options.operationStore.list(actorKey);
    if (!this.isCurrent(actorKey, actorGeneration)) return;
    if (!listing.ok) {
      this.storageFailed = true;
      this.update({ ...idleState(this.state.mealDataRevision), status: "error", errorCode: "storage_unavailable" });
      return;
    }
    this.actorReady = true;
    const foreground = listing.entries.find((entry) => blocksNewSave(entry)) ?? null;
    this.pending = foreground;
    this.update({
      status: foreground ? "uncertain" : "idle",
      errorCode: foreground ? "result_uncertain" : null,
      mealRecordId: null,
      mealDate: null,
      pending: Boolean(foreground),
      mealDataRevision: this.state.mealDataRevision,
      operations: this.summaries(listing.entries)
    });
  }

  submit(context: ConsumerMealWriteActorContext, draft: ConsumerAnalysisMealWriteDraft) {
    if (this.inFlight) return this.inFlight;
    if (!this.matchesActor(context)) return Promise.resolve(this.fail("authentication_required"));
    if (!this.actorReady) return Promise.resolve(this.fail(this.storageFailed ? "storage_unavailable" : "configuration_error"));
    if (this.pending) {
      const live = this.attempts.get(this.pending.opId);
      if (live) return live;
      if (blocksNewSave(this.pending)) return Promise.resolve(this.fail("result_uncertain", true));
    }
    if (!validTimezone(context.timezone)) return Promise.resolve(this.fail("profile_timezone_required"));

    const generation = context.actorGeneration;
    const actorKey = context.actorKey;
    this.inFlight = this.startOperation(actorKey, generation, context.timezone, draft).finally(() => {
      if (actorKey === this.actorKey && generation === this.actorGeneration) this.inFlight = null;
    });
    return this.inFlight;
  }

  // Manual retry of the SAME operation (same key, same payload). Without `opId` it retries the foreground
  // operation. Never automatic, never creates a key.
  retry(context: Omit<ConsumerMealWriteActorContext, "timezone">, opId?: string) {
    const target = opId ?? this.pending?.opId ?? null;
    const live = target ? this.attempts.get(target) : undefined;
    if (live) return live;
    if (!this.matchesActor(context)) return Promise.resolve(this.fail("authentication_required"));
    if (opId !== undefined) return this.retryById(context, opId);
    if (!this.pending) return Promise.resolve(this.fail("authentication_required"));
    const operation = this.pending;
    return this.runAttempt(operation, () => this.execute(context.actorKey, context.actorGeneration, operation));
  }

  // 暫不處理: set the operation aside. Key, payload, history and state are untouched; the in-flight
  // request (if any) is NOT cancelled.
  async defer(context: Omit<ConsumerMealWriteActorContext, "timezone">, opId?: string): Promise<ConsumerMealWriteRuntimeState> {
    if (!this.matchesActor(context)) return this.state;
    const target = opId ?? this.pending?.opId;
    if (!target) return this.state;
    const updated = await this.options.operationStore.update(context.actorKey, target, (entry) => ({ ...entry, deferred: true }));
    if (!this.isCurrent(context.actorKey, context.actorGeneration)) return this.state;
    if (updated.ok && this.pending?.opId === target) {
      this.pending = null;
      this.update({ ...idleState(this.state.mealDataRevision, this.state.operations) });
    }
    await this.refreshOperations(context.actorKey, context.actorGeneration);
    return this.state;
  }

  // Cancel a draft that never had an unknown result and is not on the wire. A possibly-committed
  // operation can never be cancelled to pretend it was not written.
  async cancel(context: Omit<ConsumerMealWriteActorContext, "timezone">, opId: string): Promise<ConsumerMealWriteRuntimeState> {
    if (!this.matchesActor(context)) return this.state;
    const entry = await this.options.operationStore.get(context.actorKey, opId);
    if (!entry || entry.ownerActorKey !== context.actorKey) return this.state;
    if (!isCancellable(entry, this.attempts.has(opId))) return this.state;
    const removed = await this.options.operationStore.update(context.actorKey, opId, (current) => (isCancellable(current, false) ? null : current));
    if (!this.isCurrent(context.actorKey, context.actorGeneration)) return this.state;
    if (removed.ok && removed.entry === null && this.pending?.opId === opId) {
      this.pending = null;
      this.update(idleState(this.state.mealDataRevision, this.state.operations));
    }
    await this.refreshOperations(context.actorKey, context.actorGeneration);
    return this.state;
  }

  reject(errorCode: ConsumerMealWriteErrorCode) {
    return this.fail(errorCode);
  }

  // An unresolved result (result_uncertain) always keeps the operation pending.
  private fail(errorCode: ConsumerMealWriteErrorCode, pending = false) {
    const unresolved = pending || errorCode === "result_uncertain";
    this.update({ status: unresolved ? "uncertain" : "error", errorCode, mealRecordId: null, mealDate: null, pending: unresolved, mealDataRevision: this.state.mealDataRevision, operations: this.state.operations });
    return this.state;
  }

  private async startOperation(actorKey: string, generation: number, timezone: string, draft: ConsumerAnalysisMealWriteDraft) {
    let operation: ConsumerMealWritePendingOperation;
    try {
      const submittedAt = this.options.clock?.now() ?? new Date();
      const idempotencyKey = (this.options.uuidFactory ?? secureUuidV4)();
      const mapped = mapConsumerAnalysisMealWrite({ ...draft, timezone, submittedAt });
      const input = { ...mapped, idempotencyKey };
      validateCreateMealRecordInput(input);
      operation = createConsumerMealWritePendingOperation(input, submittedAt);
    } catch {
      return this.isCurrent(actorKey, generation) ? this.fail("invalid_input") : this.state;
    }
    let entry: ConsumerMealWriteLedgerEntry;
    try {
      // Persist-before-send: the durable, verified entry exists before anything is dispatched. A local
      // storage failure never sends.
      entry = await this.options.operationStore.save(actorKey, operation);
    } catch (error) {
      if (!this.isCurrent(actorKey, generation)) return this.state;
      if (error instanceof MealSaveLedgerError) {
        if (error.reason === "capacity") return this.fail("capacity_exhausted");
        if (error.reason === "too_large") return this.fail("invalid_input");
      }
      return this.fail("storage_unavailable");
    }
    if (!this.isCurrent(actorKey, generation)) {
      // The actor changed while persisting: nothing was dispatched, so the journal returns to `new`.
      await this.reconcile(actorKey, entry.opId, { cls: "not_sent", meta: {} });
      return this.state;
    }
    this.pending = entry;
    await this.refreshOperations(actorKey, generation);
    return this.runAttempt(entry, () => this.execute(actorKey, generation, entry));
  }

  private async retryById(context: Omit<ConsumerMealWriteActorContext, "timezone">, opId: string) {
    const found = await this.options.operationStore.get(context.actorKey, opId);
    if (!this.isCurrent(context.actorKey, context.actorGeneration)) return this.state;
    if (!found || found.ownerActorKey !== context.actorKey) return this.state;
    // An explicit retry brings the operation back to the foreground — unless ANOTHER unresolved operation holds it
    // and blocks new saves: then this attempt runs alongside and that block is left untouched.
    const updated = found.deferred
      ? await this.options.operationStore.update(context.actorKey, opId, (entry) => ({ ...entry, deferred: false }))
      : { ok: true as const, entry: found };
    const entry = updated.ok && updated.entry ? updated.entry : found;
    if (!this.isCurrent(context.actorKey, context.actorGeneration)) return this.state;
    if (!this.pending || this.pending.opId === opId || !blocksNewSave(this.pending)) this.pending = entry;
    return this.runAttempt(entry, () => this.execute(context.actorKey, context.actorGeneration, entry));
  }

  private runAttempt(entry: ConsumerMealWriteLedgerEntry, run: () => Promise<ConsumerMealWriteRuntimeState>) {
    const existing = this.attempts.get(entry.opId);
    if (existing) return existing;
    // The attempt is deregistered BEFORE the summaries are refreshed, so the operation list the UI sees after
    // the attempt shows its real state and actions (not "in flight").
    const promise: Promise<ConsumerMealWriteRuntimeState> = run().then(
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

  private async execute(actorKey: string, generation: number, operation: ConsumerMealWriteLedgerEntry) {
    if (!this.isCurrent(actorKey, generation)) return this.state;
    // Early refusal only; the isolation of the dispatch itself is the actor-bound guard.
    if (operation.ownerActorKey !== actorKey) {
      return this.isCurrent(actorKey, generation) ? this.fail("actor_binding_mismatch") : this.state;
    }
    // Journal: `inflight` is durable and verified BEFORE the dispatch. A new operation was created `inflight`
    // by `save`; a retry marks it here. If it cannot be written nothing is sent.
    const marked = operation.state === "inflight"
      ? { ok: true as const, entry: operation }
      : await this.options.operationStore.markInflight(actorKey, operation.opId);
    const foreground = this.pending?.opId === operation.opId;
    if (!marked.ok || !marked.entry) {
      if (!this.isCurrent(actorKey, generation)) return this.state;
      if (foreground) return this.fail("storage_unavailable");
      await this.refreshOperations(actorKey, generation);
      return this.state;
    }
    if (!this.isCurrent(actorKey, generation)) {
      // The actor changed while persisting: nothing was dispatched, so restore the previous state.
      await this.reconcile(actorKey, operation.opId, { cls: "not_sent", meta: {} });
      return this.state;
    }
    const entry = marked.entry;
    // An attempt beside the foreground (another operation holds it) shows only as "in flight" in the list.
    if (!foreground) await this.refreshOperations(actorKey, generation);
    if (this.pending?.opId === operation.opId) this.pending = entry;
    if (this.pending?.opId === operation.opId) {
      this.update({ status: "submitting", errorCode: null, mealRecordId: null, mealDate: null, pending: true, mealDataRevision: this.state.mealDataRevision, operations: this.state.operations });
    }

    this.options.dispatchBinding?.bind(operation.opId, actorKey);
    let call: Promise<Awaited<ReturnType<ConsumerMealRecordWriteService["createCurrentUserMealRecord"]>>>;
    try {
      call = Promise.resolve(this.options.service.createCurrentUserMealRecord(operation.input));
    } catch (error) {
      call = Promise.reject(error);
    }
    const settled = call.then(
      (result) => ({ result }) as const,
      (thrown: unknown) => ({ thrown }) as const
    );
    const raced = await this.localWait.race(settled);
    this.options.dispatchBinding?.release(operation.opId);
    if (raced.timedOut) {
      // Stop waiting locally. The request is NOT cancelled and may still commit: unknown, sticky.
      void settled.then((late) => this.settleAttempt(actorKey, generation, entry, late, true));
      return this.settleAttempt(actorKey, generation, entry, { timeout: true }, false);
    }
    return this.settleAttempt(actorKey, generation, entry, raced.value, false);
  }

  private async settleAttempt(
    actorKey: string,
    generation: number,
    operation: ConsumerMealWriteLedgerEntry,
    answer: { timeout: true } | { thrown: unknown } | { result: Awaited<ReturnType<ConsumerMealRecordWriteService["createCurrentUserMealRecord"]>> },
    late: boolean
  ): Promise<ConsumerMealWriteRuntimeState> {
    let classification: MealSaveClassification;
    let errorCode: string | null = null;
    let errorMessage = "";
    if ("timeout" in answer) classification = { cls: "unknown", meta: { reason: "deadline" } };
    else if ("thrown" in answer) classification = { cls: "unknown", meta: { reason: "transport" } };
    else if (answer.result.ok) classification = { cls: "saved", meta: {} };
    else {
      errorCode = answer.result.error.code;
      errorMessage = answer.result.error.message;
      const sqlstate = (answer.result.error as { sqlstate?: string | null }).sqlstate ?? null;
      const httpStatus = (answer.result.error as { httpStatus?: number | null }).httpStatus ?? null;
      classification = classifyMealWriteErrorCode(errorCode, errorMessage, sqlstate);
      classification = { ...classification, meta: { ...classification.meta, httpStatus } };
    }

    const reconciled = await this.reconcile(actorKey, operation.opId, classification);
    const ownerIsCurrent = this.actorKey === actorKey;

    if (classification.cls === "saved") {
      const record = "result" in answer && answer.result.ok ? answer.result.value : null;
      const wasForeground = this.pending?.opId === operation.opId;
      if (wasForeground) this.pending = null;
      if (!late && wasForeground && this.isCurrent(actorKey, generation) && record) {
        return this.complete(actorKey, record, operation);
      }
      // Late (or no-longer-foreground) success: the ledger is already reconciled; refresh data for the
      // owner's current session only, and never touch another account's state.
      if (ownerIsCurrent) {
        this.update({ ...this.state, mealDataRevision: this.state.mealDataRevision + 1, ...(wasForeground ? idleBody() : {}) });
        await this.refreshOperations(actorKey, this.actorGeneration);
      }
      return this.state;
    }

    if (late || !this.isCurrent(actorKey, generation) || this.pending?.opId !== operation.opId) {
      if (ownerIsCurrent) await this.refreshOperations(actorKey, this.actorGeneration);
      return this.state;
    }

    const entry = reconciled.entry;
    if (entry) this.pending = entry;
    else this.pending = null;
    if (classification.cls === "not_sent") {
      this.update({ ...this.state, status: "error", errorCode: "actor_binding_mismatch", mealRecordId: null, mealDate: null, pending: false });
    } else if (entry === null) {
      // Removed: rejected input or conflict without unknown history — rollback is proven, key is spent.
      this.update({ ...this.state, status: "error", errorCode: legacyErrorCode(errorCode ?? "", errorMessage, classification), mealRecordId: null, mealDate: null, pending: false });
    } else if (entry.state === "unknown" || entry.state === "inflight" || entry.state === "new") {
      this.update({ ...this.state, status: "uncertain", errorCode: "result_uncertain", mealRecordId: null, mealDate: null, pending: true });
    } else if (entry.state === "blocked_login") {
      this.update({ ...this.state, status: "error", errorCode: "authentication_required", mealRecordId: null, mealDate: null, pending: false });
    } else if (entry.state === "blocked_consent") {
      this.update({ ...this.state, status: "error", errorCode: "eligibility_required", mealRecordId: null, mealDate: null, pending: false });
    } else {
      this.update({ ...this.state, status: "error", errorCode: "save_failed_retryable", mealRecordId: null, mealDate: null, pending: false });
    }
    await this.refreshOperations(actorKey, generation);
    return this.state;
  }

  // Applies one attempt outcome to the OWNER's ledger entry, independent of the current actor. Pure policy
  // (applyAttemptOutcome) decides; storage is the authority.
  private async reconcile(actorKey: string, opId: string, classification: MealSaveClassification) {
    let removed = false;
    const result = await this.options.operationStore.update(actorKey, opId, (entry) => {
      let cls = classification.cls;
      if (classification.localFailure) cls = entry.hadUnknown ? "not_sent" : "rejected_input";
      const transition = applyAttemptOutcome(entry, { cls, meta: classification.meta }, new Date().toISOString());
      if (transition.action === "remove") {
        removed = true;
        return null;
      }
      return transition.entry;
    });
    return { ok: result.ok, removed, entry: result.ok ? result.entry : null };
  }

  private async complete(actorKey: string, record: ConsumerMealRecord, operation: ConsumerMealWriteLedgerEntry) {
    this.update({
      status: "succeeded",
      errorCode: null,
      mealRecordId: record.mealRecordId,
      mealDate: operation.input.mealDate,
      pending: false,
      mealDataRevision: this.state.mealDataRevision + 1,
      operations: this.state.operations
    });
    await this.refreshOperations(actorKey, this.actorGeneration);
    return this.state;
  }

  private summaries(entries: readonly ConsumerMealWriteLedgerEntry[]) {
    const nowMs = Date.now();
    return entries.map((entry) => summarizeMealSaveEntry(entry, { nowMs, inFlight: this.attempts.has(entry.opId), describe: describeMealWriteInput }));
  }

  private async refreshOperations(actorKey: string, generation: number) {
    if (!this.isCurrent(actorKey, generation)) return;
    const listing = await this.options.operationStore.list(actorKey);
    if (!this.isCurrent(actorKey, generation) || !listing.ok) return;
    // A capacity refusal ends as soon as the ledger has a free slot again (after a confirmed save); nothing
    // was evicted to get there.
    const capacityCleared = this.state.errorCode === "capacity_exhausted" && listing.free > 0;
    this.update({ ...this.state, ...(capacityCleared ? idleBody() : {}), operations: this.summaries(listing.entries) });
  }

  private matchesActor(context: { actorKey: string; actorGeneration: number }) {
    return Boolean(context.actorKey) && this.isCurrent(context.actorKey, context.actorGeneration);
  }

  private isCurrent(actorKey: string, generation: number) {
    return actorKey === this.actorKey && generation === this.actorGeneration;
  }

  private update(next: ConsumerMealWriteRuntimeState) {
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }
}

function idleBody() {
  return { status: "idle" as const, errorCode: null, mealRecordId: null, mealDate: null, pending: false };
}

// Foreground code for an operation that was removed (rollback proven): the pre-existing vocabulary.
function legacyErrorCode(code: string, message: string, classification: MealSaveClassification): ConsumerMealWriteErrorCode {
  if (classification.localFailure === "disabled") return "disabled";
  if (classification.localFailure === "configuration") return "configuration_error";
  if (classification.cls === "conflict") return "idempotency_conflict";
  if (code === "meal_write_function_rejected" && message.toLowerCase().includes("idempotency")) return "idempotency_conflict";
  if (code.startsWith("meal_write_invalid") || code === "meal_write_payload_too_large" || code === "meal_write_ownership_field_rejected") return "invalid_input";
  return "provider_rejected";
}

function validTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
    return Boolean(timezone.trim());
  } catch {
    return false;
  }
}

function secureUuidV4(): string {
  return generateSecureUuidV4();
}
