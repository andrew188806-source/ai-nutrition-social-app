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
  type ConsumerMealIdentificationFinalizationPendingOperation
} from "./consumerMealIdentificationFinalizationOperationStore";
import { generateSecureUuidV4 } from "./secureUuidProvider";

export type ConsumerMealIdentificationFinalizationRuntimeErrorCode =
  | ConsumerMealIdentificationFinalizationErrorCode
  | "profile_timezone_required"
  | "result_uncertain";

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
};

const idleState = (revision: number): ConsumerMealIdentificationFinalizationRuntimeState => ({
  status: "idle",
  errorCode: null,
  mealRecordId: null,
  mealRecordItemId: null,
  mealAnalysisId: null,
  mealIdentificationFinalizationId: null,
  mealCorrectionIds: null,
  pending: false,
  finalizationDataRevision: revision
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
  private pending: ConsumerMealIdentificationFinalizationPendingOperation | null = null;
  private inFlight: Promise<ConsumerMealIdentificationFinalizationRuntimeState> | null = null;
  private state = idleState(0);

  constructor(private readonly options: ConsumerMealIdentificationFinalizationRuntimeOptions) {}

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
    const previousActor = this.actorKey;
    this.actorKey = actorKey;
    this.actorGeneration = actorGeneration;
    // An actor change invalidates the previous actor's operation binding as well, so the next
    // analysis screen must re-bind explicitly before it can submit.
    this.operationId = null;
    this.actorReady = false;
    this.pending = null;
    this.inFlight = null;
    this.update(
      actorKey
        ? { ...idleState(this.state.finalizationDataRevision), status: "restoring" }
        : idleState(this.state.finalizationDataRevision)
    );
    if (previousActor) await this.options.operationStore.clear(previousActor);
    if (!actorKey) return;
    const restored = await this.options.operationStore.load(actorKey);
    if (actorKey !== this.actorKey || actorGeneration !== this.actorGeneration) return;
    this.pending = restored;
    this.actorReady = true;
    this.update(
      restored
        ? {
            status: "uncertain",
            errorCode: "result_uncertain",
            mealRecordId: null,
            mealRecordItemId: null,
            mealAnalysisId: null,
            mealIdentificationFinalizationId: null,
            mealCorrectionIds: null,
            pending: true,
            finalizationDataRevision: this.state.finalizationDataRevision
          }
        : idleState(this.state.finalizationDataRevision)
    );
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
  //  * unresolved submission     → refuses, returns false. An in-flight or persisted-pending
  //                                payload still owns the runtime; adopting a new operation would
  //                                silently discard it, so `uncertain` stays locked until the user
  //                                resolves it through the existing retry path.
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
    if (this.inFlight || this.pending) return false;
    this.operationId = operationId;
    this.update(idleState(this.state.finalizationDataRevision));
    return true;
  }

  submit(context: ConsumerMealIdentificationFinalizationActorContext, draft: ConsumerMealIdentificationFinalizationDraft) {
    if (this.inFlight) return this.inFlight;
    if (!this.matchesActor(context)) return Promise.resolve(this.fail("finalization_authentication_required"));
    if (!this.actorReady) return Promise.resolve(this.fail("finalization_configuration_invalid"));
    if (this.pending) return Promise.resolve(this.fail("result_uncertain", true));
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

  retry(context: Omit<ConsumerMealIdentificationFinalizationActorContext, "timezone">) {
    if (this.inFlight) return this.inFlight;
    if (!this.matchesActor(context) || !this.pending) {
      return Promise.resolve(this.fail("finalization_authentication_required"));
    }
    const operation = this.pending;
    const operationId = this.operationId;
    this.inFlight = this.execute(context.actorKey, context.actorGeneration, operationId, operation).finally(() => {
      if (context.actorKey === this.actorKey && context.actorGeneration === this.actorGeneration) this.inFlight = null;
    });
    return this.inFlight;
  }

  reject(errorCode: ConsumerMealIdentificationFinalizationRuntimeErrorCode) {
    return this.fail(errorCode);
  }

  private async startOperation(
    actorKey: string,
    generation: number,
    operationId: string | null,
    timezone: string,
    draft: ConsumerMealIdentificationFinalizationDraft
  ) {
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
      const operation = createConsumerMealIdentificationFinalizationPendingOperation(input, submittedAt);
      await this.options.operationStore.save(actorKey, operation);
      if (!this.isCurrentOperation(actorKey, generation, operationId)) return this.state;
      this.pending = operation;
      return this.execute(actorKey, generation, operationId, operation);
    } catch {
      return this.isCurrentOperation(actorKey, generation, operationId)
        ? this.fail("finalization_invalid_input")
        : this.state;
    }
  }

  private async execute(
    actorKey: string,
    generation: number,
    operationId: string | null,
    operation: ConsumerMealIdentificationFinalizationPendingOperation
  ) {
    if (!this.isCurrentOperation(actorKey, generation, operationId)) return this.state;
    this.update({
      status: "submitting",
      errorCode: null,
      mealRecordId: null,
      mealRecordItemId: null,
      mealAnalysisId: null,
      mealIdentificationFinalizationId: null,
      mealCorrectionIds: null,
      pending: true,
      finalizationDataRevision: this.state.finalizationDataRevision
    });
    const result = await this.options.service.finalizeCurrentUserMealIdentification(operation.input);
    // MI-E-C5-R5-R6 §八: a response that returns after the screen moved on to another analysis is
    // dropped here — it cannot mark the newer operation succeeded, re-lock it, or overwrite it.
    if (!this.isCurrentOperation(actorKey, generation, operationId)) return this.state;
    if (result.ok) return this.complete(actorKey, result.value);

    if (result.error.code === "finalization_transport_failed") {
      this.update({
        status: "uncertain",
        errorCode: "result_uncertain",
        mealRecordId: null,
        mealRecordItemId: null,
        mealAnalysisId: null,
        mealIdentificationFinalizationId: null,
        mealCorrectionIds: null,
        pending: true,
        finalizationDataRevision: this.state.finalizationDataRevision
      });
      return this.state;
    }
    await this.options.operationStore.clear(actorKey);
    this.pending = null;
    return this.fail(result.error.code);
  }

  private async complete(
    actorKey: string,
    value: {
      mealRecordId: string;
      mealRecordItemId: string;
      mealAnalysisId: string;
      mealIdentificationFinalizationId: string;
      mealCorrectionIds: readonly string[];
    }
  ) {
    await this.options.operationStore.clear(actorKey);
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
      finalizationDataRevision: this.state.finalizationDataRevision + 1
    });
    return this.state;
  }

  private fail(errorCode: ConsumerMealIdentificationFinalizationRuntimeErrorCode, pending = false) {
    this.update({
      status: pending ? "uncertain" : "error",
      errorCode,
      mealRecordId: null,
      mealRecordItemId: null,
      mealAnalysisId: null,
      mealIdentificationFinalizationId: null,
      mealCorrectionIds: null,
      pending,
      finalizationDataRevision: this.state.finalizationDataRevision
    });
    return this.state;
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
