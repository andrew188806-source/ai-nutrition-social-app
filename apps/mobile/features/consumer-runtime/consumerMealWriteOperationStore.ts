import type { ConsumerAuthStorage } from "../consumer-auth/storage";
import type { ConsumerCreateMealRecordInput } from "../consumer-meals/types";
import { validateCreateMealRecordInput } from "../consumer-meals/writeValidation";
import { MealSaveLedgerError, MealSaveOperationLedger, type MealSaveLedgerAddResult, type MealSaveLedgerListing, type MealSaveLedgerUpdateResult } from "./mealSaveOperationLedger";
import type { MealSaveEntry } from "./mealSaveRecovery";

// Since the recovery package the 24 h value is only a STALENESS hint (copy). It never deletes anything.
export const CONSUMER_MEAL_WRITE_PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const storagePrefix = "tastkind.consumerMealWrite.pending";
const legacyStoragePrefix = `${storagePrefix}.v1`;

export type ConsumerMealWritePendingInput = ConsumerCreateMealRecordInput & { idempotencyKey: string };

// Legacy single-operation shape, still the unit the runtime hands to `save`.
export type ConsumerMealWritePendingOperation = {
  idempotencyKey: string;
  input: ConsumerMealWritePendingInput;
  createdAt: string;
  expiresAt: string;
};

export type ConsumerMealWriteLedgerEntry = MealSaveEntry<ConsumerMealWritePendingInput>;

// Durable per-account store of unresolved normal-save operations: 20 fixed slots, persist-before-send
// journal, module-level lock (see mealSaveOperationLedger.ts). Nothing here deletes an operation by
// age or by actor change; `remove` is called only after a trusted success or an explicit cancel of a
// draft with no unknown history.
export class ConsumerMealWriteOperationStore {
  private readonly ledger: MealSaveOperationLedger<ConsumerMealWritePendingInput>;

  constructor(
    storage: ConsumerAuthStorage,
    private readonly now: () => Date = () => new Date()
  ) {
    this.ledger = new MealSaveOperationLedger<ConsumerMealWritePendingInput>({
      storage,
      kind: "meal_write",
      keyPrefix: storagePrefix,
      validateInput: (input) => {
        validateCreateMealRecordInput(input as ConsumerCreateMealRecordInput);
      }
    });
  }

  // Legacy v1 key of an actor (used by migration and by tests that seed legacy records).
  legacyStorageKey(actorKey: string) {
    return storageKey(actorKey);
  }

  list(actorKey: string): Promise<MealSaveLedgerListing<ConsumerMealWritePendingInput>> {
    return this.ledger.list(actorKey);
  }

  get(actorKey: string, opId: string) {
    return this.ledger.get(actorKey, opId);
  }

  add(
    actorKey: string,
    operation: ConsumerMealWritePendingOperation,
    options: { inflight?: boolean } = {}
  ): Promise<MealSaveLedgerAddResult<ConsumerMealWritePendingInput>> {
    assertActor(actorKey);
    validateCreateMealRecordInput(operation.input);
    if (operation.input.idempotencyKey !== operation.idempotencyKey) throw new Error("Pending key/input mismatch.");
    return this.ledger.add(actorKey, {
      opId: operation.idempotencyKey,
      input: operation.input,
      createdAt: operation.createdAt,
      expiresAt: operation.expiresAt
    }, options);
  }

  // Persist-before-send: resolves with the durable entry or throws MealSaveLedgerError (capacity,
  // too_large, storage). The runtime never dispatches when this throws.
  async save(actorKey: string, operation: ConsumerMealWritePendingOperation): Promise<ConsumerMealWriteLedgerEntry> {
    // The entry is born `inflight`: it is the journal of the attempt that follows immediately.
    const result = await this.add(actorKey, operation, { inflight: true });
    if (!result.ok) throw new MealSaveLedgerError(result.reason);
    return result.entry;
  }

  markInflight(actorKey: string, opId: string): Promise<MealSaveLedgerUpdateResult<ConsumerMealWritePendingInput>> {
    return this.ledger.markInflight(actorKey, opId);
  }

  update(
    actorKey: string,
    opId: string,
    mutate: (entry: ConsumerMealWriteLedgerEntry) => ConsumerMealWriteLedgerEntry | null
  ): Promise<MealSaveLedgerUpdateResult<ConsumerMealWritePendingInput>> {
    return this.ledger.update(actorKey, opId, mutate);
  }

  remove(actorKey: string, opId: string): Promise<MealSaveLedgerUpdateResult<ConsumerMealWritePendingInput>> {
    return this.ledger.remove(actorKey, opId);
  }

  // Legacy convenience: the most recent unresolved operation of the actor, or null.
  async load(actorKey: string): Promise<ConsumerMealWritePendingOperation | null> {
    const listing = await this.ledger.list(actorKey);
    const latest = listing.entries[listing.entries.length - 1];
    return latest ? { idempotencyKey: latest.opId, input: latest.input, createdAt: latest.createdAt, expiresAt: latest.expiresAt } : null;
  }
}

export function createConsumerMealWritePendingOperation(
  input: ConsumerMealWritePendingInput,
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
  return `${legacyStoragePrefix}.${encodeURIComponent(actorKey)}`;
}

function assertActor(actorKey: string) {
  if (!actorKey.trim()) throw new Error("Actor scope is required.");
}
