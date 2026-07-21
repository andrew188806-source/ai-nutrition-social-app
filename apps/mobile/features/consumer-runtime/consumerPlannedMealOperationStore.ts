import type { ConsumerAuthStorage } from "../consumer-auth/storage";
import type { ConsumerConvertPlannedMealV2Input, ConsumerCreatePlannedMealV2Input } from "../consumer-meals/types";
import { validateConvertPlannedMealV2Input, validateCreatePlannedMealV2Input } from "../consumer-meals/plannedMealV2Mappers";

export const CONSUMER_PLANNED_MEAL_PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const prefix = "tastkind.consumerPlannedMeal.pending.v2";
export type ConsumerPlannedMealPendingOperation =
  | { kind: "create"; requestId: string; input: ConsumerCreatePlannedMealV2Input; createdAt: string; expiresAt: string }
  | { kind: "convert"; requestId: string; input: ConsumerConvertPlannedMealV2Input; createdAt: string; expiresAt: string };

export class ConsumerPlannedMealOperationStore {
  constructor(private readonly storage: ConsumerAuthStorage, private readonly now: () => Date = () => new Date()) {}
  async save(actorKey: string, operation: ConsumerPlannedMealPendingOperation) {
    assertActor(actorKey); validate(operation);
    if (operation.requestId !== (operation.kind === "create" ? operation.input.createRequestId : operation.input.conversionRequestId)) throw new Error("Pending key/input mismatch.");
    await this.storage.setItem(key(actorKey, operation.kind), JSON.stringify(operation));
  }
  async load(actorKey: string, kind: ConsumerPlannedMealPendingOperation["kind"]): Promise<ConsumerPlannedMealPendingOperation | null> {
    assertActor(actorKey); const storageKey = key(actorKey, kind); const raw = await this.storage.getItem(storageKey); if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as ConsumerPlannedMealPendingOperation;
      if (parsed.kind !== kind || !parsed.createdAt || Number.isNaN(Date.parse(parsed.createdAt)) ||
          !parsed.expiresAt || Date.parse(parsed.expiresAt) <= this.now().getTime()) throw new Error("Expired pending operation.");
      validate(parsed);
      const inputRequestId = parsed.kind === "create" ? parsed.input.createRequestId : parsed.input.conversionRequestId;
      if (parsed.requestId !== inputRequestId) throw new Error("Pending key/input mismatch.");
      return parsed;
    } catch { await this.storage.removeItem(storageKey); return null; }
  }
  async clear(actorKey: string, kind?: ConsumerPlannedMealPendingOperation["kind"]) {
    assertActor(actorKey);
    if (kind) return this.storage.removeItem(key(actorKey, kind));
    await this.storage.removeItem(key(actorKey, "create")); await this.storage.removeItem(key(actorKey, "convert"));
  }
}

export function createPendingPlannedMealOperation(kind: "create", input: ConsumerCreatePlannedMealV2Input, submittedAt: Date): ConsumerPlannedMealPendingOperation;
export function createPendingPlannedMealOperation(kind: "convert", input: ConsumerConvertPlannedMealV2Input, submittedAt: Date): ConsumerPlannedMealPendingOperation;
export function createPendingPlannedMealOperation(kind: "create" | "convert", input: ConsumerCreatePlannedMealV2Input | ConsumerConvertPlannedMealV2Input, submittedAt: Date): ConsumerPlannedMealPendingOperation {
  const requestId = kind === "create" ? (input as ConsumerCreatePlannedMealV2Input).createRequestId : (input as ConsumerConvertPlannedMealV2Input).conversionRequestId;
  return { kind, requestId, input, createdAt: submittedAt.toISOString(), expiresAt: new Date(submittedAt.getTime() + CONSUMER_PLANNED_MEAL_PENDING_TTL_MS).toISOString() } as ConsumerPlannedMealPendingOperation;
}
function validate(value: ConsumerPlannedMealPendingOperation) { value.kind === "create" ? validateCreatePlannedMealV2Input(value.input) : validateConvertPlannedMealV2Input(value.input); }
function key(actor: string, kind: string) { return `${prefix}.${encodeURIComponent(actor)}.${kind}`; }
function assertActor(actor: string) { if (!actor.trim()) throw new Error("Actor scope is required."); }
