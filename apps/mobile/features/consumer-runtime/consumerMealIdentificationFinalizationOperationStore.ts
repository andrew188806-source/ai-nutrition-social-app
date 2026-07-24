import type { ConsumerAuthStorage } from "../consumer-auth/storage";
import type { FinalizeCurrentUserMealIdentificationInput } from "../meal-identification-finalization/types";

export const CONSUMER_MEAL_IDENTIFICATION_FINALIZATION_PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const storagePrefix = "tastkind.consumerMealIdentificationFinalization.pending.v1";

export type ConsumerMealIdentificationFinalizationPendingOperation = {
  clientRequestId: string;
  input: FinalizeCurrentUserMealIdentificationInput;
  createdAt: string;
  expiresAt: string;
};

export class ConsumerMealIdentificationFinalizationOperationStore {
  constructor(
    private readonly storage: ConsumerAuthStorage,
    private readonly now: () => Date = () => new Date()
  ) {}

  async save(actorKey: string, operation: ConsumerMealIdentificationFinalizationPendingOperation) {
    assertActor(actorKey);
    if (operation.input.clientRequestId !== operation.clientRequestId) {
      throw new Error("Pending key/input mismatch.");
    }
    await this.storage.setItem(storageKey(actorKey), JSON.stringify(operation));
  }

  async load(actorKey: string): Promise<ConsumerMealIdentificationFinalizationPendingOperation | null> {
    assertActor(actorKey);
    const key = storageKey(actorKey);
    const raw = await this.storage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as ConsumerMealIdentificationFinalizationPendingOperation;
      if (
        parsed.input.clientRequestId !== parsed.clientRequestId ||
        !parsed.expiresAt ||
        Date.parse(parsed.expiresAt) <= this.now().getTime()
      ) {
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

export function createConsumerMealIdentificationFinalizationPendingOperation(
  input: FinalizeCurrentUserMealIdentificationInput,
  submittedAt: Date
): ConsumerMealIdentificationFinalizationPendingOperation {
  return {
    clientRequestId: input.clientRequestId,
    input,
    createdAt: submittedAt.toISOString(),
    expiresAt: new Date(
      submittedAt.getTime() + CONSUMER_MEAL_IDENTIFICATION_FINALIZATION_PENDING_TTL_MS
    ).toISOString()
  };
}

function storageKey(actorKey: string) {
  return `${storagePrefix}.${encodeURIComponent(actorKey)}`;
}

function assertActor(actorKey: string) {
  if (!actorKey.trim()) throw new Error("Actor scope is required.");
}
