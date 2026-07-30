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

  submit(context: ConsumerMealIdentificationFinalizationActorContext, draft: ConsumerMealIdentificationFinalizationDraft) {
    if (this.inFlight) return this.inFlight;
    if (!this.matchesActor(context)) return Promise.resolve(this.fail("finalization_authentication_required"));
    if (!this.actorReady) return Promise.resolve(this.fail("finalization_configuration_invalid"));
    if (this.pending) return Promise.resolve(this.fail("result_uncertain", true));
    if (!validTimezone(context.timezone)) return Promise.resolve(this.fail("profile_timezone_required"));

    const generation = context.actorGeneration;
    const actorKey = context.actorKey;
    this.inFlight = this.startOperation(actorKey, generation, context.timezone, draft).finally(() => {
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
    this.inFlight = this.execute(context.actorKey, context.actorGeneration, operation).finally(() => {
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
      if (!this.isCurrent(actorKey, generation)) return this.state;
      this.pending = operation;
      return this.execute(actorKey, generation, operation);
    } catch {
      return this.isCurrent(actorKey, generation) ? this.fail("finalization_invalid_input") : this.state;
    }
  }

  private async execute(
    actorKey: string,
    generation: number,
    operation: ConsumerMealIdentificationFinalizationPendingOperation
  ) {
    if (!this.isCurrent(actorKey, generation)) return this.state;
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
    if (!this.isCurrent(actorKey, generation)) return this.state;
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
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== "function") throw new Error("Secure UUID generation unavailable.");
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
