import type { ConsumerAuthStorage } from "../consumer-auth/storage";
import type { ConsumerCreateMealRecordInput } from "../consumer-meals/types";
import { validateCreateMealRecordInput } from "../consumer-meals/writeValidation";

export const CONSUMER_MEAL_WRITE_PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const storagePrefix = "tastkind.consumerMealWrite.pending.v1";

export type ConsumerMealWritePendingOperation = {
  idempotencyKey: string;
  input: ConsumerCreateMealRecordInput & { idempotencyKey: string };
  createdAt: string;
  expiresAt: string;
};

export class ConsumerMealWriteOperationStore {
  constructor(
    private readonly storage: ConsumerAuthStorage,
    private readonly now: () => Date = () => new Date()
  ) {}

  async save(actorKey: string, operation: ConsumerMealWritePendingOperation) {
    assertActor(actorKey);
    validateCreateMealRecordInput(operation.input);
    if (operation.input.idempotencyKey !== operation.idempotencyKey) throw new Error("Pending key/input mismatch.");
    await this.storage.setItem(storageKey(actorKey), JSON.stringify(operation));
  }

  async load(actorKey: string): Promise<ConsumerMealWritePendingOperation | null> {
    assertActor(actorKey);
    const key = storageKey(actorKey);
    const raw = await this.storage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as ConsumerMealWritePendingOperation;
      validateCreateMealRecordInput(parsed.input);
      if (parsed.input.idempotencyKey !== parsed.idempotencyKey || !parsed.expiresAt || Date.parse(parsed.expiresAt) <= this.now().getTime()) {
        await this.storage.removeItem(key);
        return null;
      }
      return parsed;
    } catch {
      await this.storage.removeItem(key);
      return null;
    }
  }

  async clear(actorKey: string) {
    assertActor(actorKey);
    await this.storage.removeItem(storageKey(actorKey));
  }
}

export function createConsumerMealWritePendingOperation(
  input: ConsumerCreateMealRecordInput & { idempotencyKey: string },
  submittedAt: Date
): ConsumerMealWritePendingOperation {
  return {
    idempotencyKey: input.idempotencyKey,
    input,
    createdAt: submittedAt.toISOString(),
    expiresAt: new Date(submittedAt.getTime() + CONSUMER_MEAL_WRITE_PENDING_TTL_MS).toISOString()
  };
}

function storageKey(actorKey: string) {
  return `${storagePrefix}.${encodeURIComponent(actorKey)}`;
}

function assertActor(actorKey: string) {
  if (!actorKey.trim()) throw new Error("Actor scope is required.");
}
