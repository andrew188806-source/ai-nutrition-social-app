import type { ConsumerPlannedMealV2Service } from "../consumer-meals/consumerPlannedMealV2Service";
import type { ConsumerConvertPlannedMealV2Input } from "../consumer-meals/types";
import { mapConsumerPlannedMealDraft, type ConsumerPlannedMealDraft } from "./consumerPlannedMealMapper";
import { ConsumerPlannedMealOperationStore, createPendingPlannedMealOperation, type ConsumerPlannedMealPendingOperation } from "./consumerPlannedMealOperationStore";

export type ConsumerPlannedMealRuntimeError = "authentication_required" | "timezone_required" | "invalid_input" | "disabled" | "configuration_error" | "conflict" | "provider_rejected" | "result_uncertain";
export type ConsumerPlannedMealRuntimeState = {
  status: "idle" | "restoring" | "submitting" | "uncertain" | "succeeded" | "error";
  pendingKind: "create" | "convert" | null;
  errorCode: ConsumerPlannedMealRuntimeError | null;
  plannedMealId: string | null;
  mealRecordId: string | null;
  revision: number;
};
export type ConsumerPlannedMealActorContext = { actorKey: string; actorGeneration: number; timezone: string };

export class ConsumerPlannedMealRuntime {
  private actorKey: string | null = null; private generation = 0; private ready = false;
  private pending: ConsumerPlannedMealPendingOperation | null = null; private inFlight: Promise<ConsumerPlannedMealRuntimeState> | null = null;
  private state: ConsumerPlannedMealRuntimeState = idle(0);
  private readonly listeners = new Set<(state: ConsumerPlannedMealRuntimeState) => void>();
  constructor(private readonly options: { service: Pick<ConsumerPlannedMealV2Service, "create" | "convert">; operationStore: ConsumerPlannedMealOperationStore; clock?: { now(): Date }; uuidFactory?: () => string }) {}
  getState() { return this.state; }
  subscribe(listener: (state: ConsumerPlannedMealRuntimeState) => void) { this.listeners.add(listener); listener(this.state); return () => { this.listeners.delete(listener); }; }
  async setActor(actorKey: string | null, generation: number) {
    if (actorKey === this.actorKey && generation === this.generation) return;
    const old = this.actorKey; this.actorKey = actorKey; this.generation = generation; this.ready = false; this.pending = null; this.inFlight = null;
    this.set(actorKey ? { ...idle(this.state.revision), status: "restoring" } : idle(this.state.revision));
    if (old) await this.options.operationStore.clear(old);
    if (!actorKey) return;
    const create = await this.options.operationStore.load(actorKey, "create");
    const convert = create ? null : await this.options.operationStore.load(actorKey, "convert");
    if (!this.current(actorKey, generation)) return;
    this.pending = create ?? convert; this.ready = true;
    this.set(this.pending ? { status: "uncertain", pendingKind: this.pending.kind, errorCode: "result_uncertain", plannedMealId: null, mealRecordId: null, revision: this.state.revision } : idle(this.state.revision));
  }
  submitCreate(context: ConsumerPlannedMealActorContext, draft: ConsumerPlannedMealDraft) {
    if (this.inFlight) return this.inFlight;
    if (!this.matches(context)) return Promise.resolve(this.fail("authentication_required"));
    if (!this.ready) return Promise.resolve(this.fail("configuration_error"));
    if (this.pending) return Promise.resolve(this.fail("result_uncertain", this.pending.kind));
    if (!validTimezone(context.timezone)) return Promise.resolve(this.fail("timezone_required"));
    const submittedAt = this.now();
    try {
      const input = mapConsumerPlannedMealDraft(draft, this.uuid(), context.timezone);
      return this.begin(context, createPendingPlannedMealOperation("create", input, submittedAt));
    } catch { return Promise.resolve(this.fail("invalid_input")); }
  }
  submitConversion(context: ConsumerPlannedMealActorContext, input: Omit<ConsumerConvertPlannedMealV2Input, "conversionRequestId" | "confirmationTimestamp" | "actorTimezone">) {
    if (this.inFlight) return this.inFlight;
    if (!this.matches(context)) return Promise.resolve(this.fail("authentication_required"));
    if (!this.ready) return Promise.resolve(this.fail("configuration_error"));
    if (this.pending) return Promise.resolve(this.fail("result_uncertain", this.pending.kind));
    if (!validTimezone(context.timezone)) return Promise.resolve(this.fail("timezone_required"));
    const submittedAt = this.now();
    try {
      const full = { ...input, conversionRequestId: this.uuid(), confirmationTimestamp: submittedAt.toISOString(), actorTimezone: context.timezone };
      return this.begin(context, createPendingPlannedMealOperation("convert", full, submittedAt));
    } catch { return Promise.resolve(this.fail("invalid_input")); }
  }
  retry(context: Omit<ConsumerPlannedMealActorContext, "timezone">) {
    if (this.inFlight) return this.inFlight;
    if (!this.matches(context) || !this.pending) return Promise.resolve(this.fail("authentication_required"));
    return this.launch(context.actorKey, context.actorGeneration, this.pending);
  }
  private begin(context: ConsumerPlannedMealActorContext, operation: ConsumerPlannedMealPendingOperation) {
    this.inFlight = (async () => {
      try { await this.options.operationStore.save(context.actorKey, operation); }
      catch { return this.fail("configuration_error"); }
      if (!this.current(context.actorKey, context.actorGeneration)) return this.state;
      this.pending = operation; return this.execute(context.actorKey, context.actorGeneration, operation);
    })().finally(() => { if (this.current(context.actorKey, context.actorGeneration)) this.inFlight = null; });
    return this.inFlight;
  }
  private launch(actor: string, generation: number, operation: ConsumerPlannedMealPendingOperation) {
    this.inFlight = this.execute(actor, generation, operation).finally(() => { if (this.current(actor, generation)) this.inFlight = null; }); return this.inFlight;
  }
  private async execute(actor: string, generation: number, operation: ConsumerPlannedMealPendingOperation) {
    if (!this.current(actor, generation)) return this.state;
    this.set({ status: "submitting", pendingKind: operation.kind, errorCode: null, plannedMealId: null, mealRecordId: null, revision: this.state.revision });
    try {
      const result = operation.kind === "create" ? await this.options.service.create(operation.input) : await this.options.service.convert(operation.input);
      if (!this.current(actor, generation)) return this.state;
      if (!result.ok) {
        const code = mapError(result.error.code, result.error.message);
        if (code === "result_uncertain") return this.fail(code, operation.kind);
        await this.options.operationStore.clear(actor, operation.kind); this.pending = null; return this.fail(code);
      }
      await this.options.operationStore.clear(actor, operation.kind); this.pending = null;
      const plannedMealId = "plannedMeal" in result.value ? result.value.plannedMeal.plannedMealId : result.value.plannedMealId;
      const mealRecordId = "mealRecordId" in result.value ? result.value.mealRecordId : null;
      this.set({ status: "succeeded", pendingKind: null, errorCode: null, plannedMealId, mealRecordId, revision: this.state.revision + 1 }); return this.state;
    } catch { return this.current(actor, generation) ? this.fail("result_uncertain", operation.kind) : this.state; }
  }
  private matches(context: { actorKey: string; actorGeneration: number }) { return Boolean(context.actorKey) && this.current(context.actorKey, context.actorGeneration); }
  private current(actor: string, generation: number) { return actor === this.actorKey && generation === this.generation; }
  private fail(errorCode: ConsumerPlannedMealRuntimeError, pendingKind: "create" | "convert" | null = null) { this.set({ status: pendingKind ? "uncertain" : "error", pendingKind, errorCode, plannedMealId: null, mealRecordId: null, revision: this.state.revision }); return this.state; }
  private set(state: ConsumerPlannedMealRuntimeState) { this.state = state; for (const listener of this.listeners) listener(state); }
  private now() { return this.options.clock?.now() ?? new Date(); }
  private uuid() { return (this.options.uuidFactory ?? secureUuidV4)(); }
}
function idle(revision: number): ConsumerPlannedMealRuntimeState { return { status: "idle", pendingKind: null, errorCode: null, plannedMealId: null, mealRecordId: null, revision }; }
function mapError(code: string, message: string): ConsumerPlannedMealRuntimeError {
  if (code === "meal_write_transport_failed" || code === "meal_write_mapping_failed") return "result_uncertain";
  if (code.includes("authentication") || code === "session_expired") return "authentication_required";
  if (code === "meal_write_disabled" || code === "meal_write_phase_not_enabled") return "disabled";
  if (code.includes("configuration")) return "configuration_error";
  if (message.includes("CONFLICT") || message.includes("converted") || message.includes("changed")) return "conflict";
  if (code.includes("invalid")) return "invalid_input"; return "provider_rejected";
}
function validTimezone(value: string) { try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0)); return Boolean(value.trim()); } catch { return false; } }
function secureUuidV4() { if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID(); throw new Error("Secure UUID generation unavailable."); }
