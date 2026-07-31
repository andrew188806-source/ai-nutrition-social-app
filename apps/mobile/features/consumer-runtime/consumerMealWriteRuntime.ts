import type { ConsumerMealRecordWriteService } from "../consumer-meals/consumerMealRecordWriteService";
import type { ConsumerMealRecord } from "../consumer-meals/types";
import { validateCreateMealRecordInput } from "../consumer-meals/writeValidation";
import { mapConsumerAnalysisMealWrite, type ConsumerAnalysisMealWriteDraft } from "./consumerMealWriteMapper";
import {
  ConsumerMealWriteOperationStore,
  createConsumerMealWritePendingOperation,
  type ConsumerMealWritePendingOperation
} from "./consumerMealWriteOperationStore";
import { generateSecureUuidV4 } from "./secureUuidProvider";

export type ConsumerMealWriteErrorCode =
  | "authentication_required"
  | "profile_timezone_required"
  | "invalid_input"
  | "disabled"
  | "configuration_error"
  | "idempotency_conflict"
  | "provider_rejected"
  | "result_uncertain";

export type ConsumerMealWriteRuntimeState = {
  status: "idle" | "restoring" | "submitting" | "uncertain" | "succeeded" | "error";
  errorCode: ConsumerMealWriteErrorCode | null;
  mealRecordId: string | null;
  mealDate: string | null;
  pending: boolean;
  mealDataRevision: number;
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
};

const idleState = (revision: number): ConsumerMealWriteRuntimeState => ({
  status: "idle",
  errorCode: null,
  mealRecordId: null,
  mealDate: null,
  pending: false,
  mealDataRevision: revision
});

export class ConsumerMealWriteRuntime {
  private readonly listeners = new Set<(state: ConsumerMealWriteRuntimeState) => void>();
  private actorKey: string | null = null;
  private actorGeneration = 0;
  private actorReady = false;
  private pending: ConsumerMealWritePendingOperation | null = null;
  private inFlight: Promise<ConsumerMealWriteRuntimeState> | null = null;
  private state = idleState(0);

  constructor(private readonly options: ConsumerMealWriteRuntimeOptions) {}

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
    const previousActor = this.actorKey;
    this.actorKey = actorKey;
    this.actorGeneration = actorGeneration;
    this.actorReady = false;
    this.pending = null;
    this.inFlight = null;
    this.update(actorKey ? { ...idleState(this.state.mealDataRevision), status: "restoring" } : idleState(this.state.mealDataRevision));
    if (previousActor) await this.options.operationStore.clear(previousActor);
    if (!actorKey) return;
    const restored = await this.options.operationStore.load(actorKey);
    if (actorKey !== this.actorKey || actorGeneration !== this.actorGeneration) return;
    this.pending = restored;
    this.actorReady = true;
    this.update(restored
      ? { status: "uncertain", errorCode: "result_uncertain", mealRecordId: null, mealDate: null, pending: true, mealDataRevision: this.state.mealDataRevision }
      : idleState(this.state.mealDataRevision));
  }

  submit(context: ConsumerMealWriteActorContext, draft: ConsumerAnalysisMealWriteDraft) {
    if (this.inFlight) return this.inFlight;
    if (!this.matchesActor(context)) return Promise.resolve(this.fail("authentication_required"));
    if (!this.actorReady) return Promise.resolve(this.fail("configuration_error"));
    if (this.pending) return Promise.resolve(this.fail("result_uncertain", true));
    if (!validTimezone(context.timezone)) return Promise.resolve(this.fail("profile_timezone_required"));

    const generation = context.actorGeneration;
    const actorKey = context.actorKey;
    this.inFlight = this.startOperation(actorKey, generation, context.timezone, draft).finally(() => {
      if (actorKey === this.actorKey && generation === this.actorGeneration) this.inFlight = null;
    });
    return this.inFlight;
  }

  retry(context: Omit<ConsumerMealWriteActorContext, "timezone">) {
    if (this.inFlight) return this.inFlight;
    if (!this.matchesActor(context) || !this.pending) return Promise.resolve(this.fail("authentication_required"));
    const operation = this.pending;
    this.inFlight = this.execute(context.actorKey, context.actorGeneration, operation).finally(() => {
      if (context.actorKey === this.actorKey && context.actorGeneration === this.actorGeneration) this.inFlight = null;
    });
    return this.inFlight;
  }

  reject(errorCode: ConsumerMealWriteErrorCode) {
    return this.fail(errorCode);
  }

  private async startOperation(actorKey: string, generation: number, timezone: string, draft: ConsumerAnalysisMealWriteDraft) {
    try {
      const submittedAt = this.options.clock?.now() ?? new Date();
      const idempotencyKey = (this.options.uuidFactory ?? secureUuidV4)();
      const mapped = mapConsumerAnalysisMealWrite({ ...draft, timezone, submittedAt });
      const input = { ...mapped, idempotencyKey };
      validateCreateMealRecordInput(input);
      const operation = createConsumerMealWritePendingOperation(input, submittedAt);
      await this.options.operationStore.save(actorKey, operation);
      if (!this.isCurrent(actorKey, generation)) return this.state;
      this.pending = operation;
      return this.execute(actorKey, generation, operation);
    } catch {
      return this.isCurrent(actorKey, generation) ? this.fail("invalid_input") : this.state;
    }
  }

  private async execute(actorKey: string, generation: number, operation: ConsumerMealWritePendingOperation) {
    if (!this.isCurrent(actorKey, generation)) return this.state;
    this.update({ status: "submitting", errorCode: null, mealRecordId: null, mealDate: null, pending: true, mealDataRevision: this.state.mealDataRevision });
    const result = await this.options.service.createCurrentUserMealRecord(operation.input);
    if (!this.isCurrent(actorKey, generation)) return this.state;
    if (result.ok) return this.complete(actorKey, result.value, operation);

    const errorCode = mapWriteError(result.error.code, result.error.message);
    if (errorCode === "result_uncertain") {
      this.update({ status: "uncertain", errorCode, mealRecordId: null, mealDate: null, pending: true, mealDataRevision: this.state.mealDataRevision });
      return this.state;
    }
    await this.options.operationStore.clear(actorKey);
    this.pending = null;
    return this.fail(errorCode);
  }

  private async complete(actorKey: string, record: ConsumerMealRecord, operation: ConsumerMealWritePendingOperation) {
    await this.options.operationStore.clear(actorKey);
    this.pending = null;
    this.update({
      status: "succeeded",
      errorCode: null,
      mealRecordId: record.mealRecordId,
      mealDate: operation.input.mealDate,
      pending: false,
      mealDataRevision: this.state.mealDataRevision + 1
    });
    return this.state;
  }

  private fail(errorCode: ConsumerMealWriteErrorCode, pending = false) {
    this.update({ status: pending ? "uncertain" : "error", errorCode, mealRecordId: null, mealDate: null, pending, mealDataRevision: this.state.mealDataRevision });
    return this.state;
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

function mapWriteError(code: string, message: string): ConsumerMealWriteErrorCode {
  if (code === "meal_write_transport_failed" || code === "meal_write_mapping_failed" || code === "meal_write_read_after_write_failed") return "result_uncertain";
  if (code === "meal_write_authentication_required" || code === "meal_write_authorization_failed" || code === "session_expired") return "authentication_required";
  if (code === "meal_write_disabled" || code === "meal_write_phase_not_enabled") return "disabled";
  if (code === "meal_write_configuration_invalid") return "configuration_error";
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
