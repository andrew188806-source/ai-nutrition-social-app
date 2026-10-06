import type { ConsumerAuthStorage } from "../consumer-auth/storage";
import type { FinalizeCurrentUserMealIdentificationInput } from "../meal-identification-finalization/types";
import { MealSaveLedgerError, MealSaveOperationLedger, type MealSaveLedgerAddResult, type MealSaveLedgerListing, type MealSaveLedgerUpdateResult } from "./mealSaveOperationLedger";
import type { MealSaveEntry } from "./mealSaveRecovery";

// Since the recovery package the 24 h value is only a STALENESS hint (copy). It never deletes anything.
export const CONSUMER_MEAL_IDENTIFICATION_FINALIZATION_PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const storagePrefix = "tastkind.consumerMealIdentificationFinalization.pending";
const legacyStoragePrefix = `${storagePrefix}.v1`;

export type ConsumerMealIdentificationFinalizationPendingOperation = {
  clientRequestId: string;
  input: FinalizeCurrentUserMealIdentificationInput;
  createdAt: string;
  expiresAt: string;
};

export type ConsumerMealIdentificationFinalizationLedgerEntry = MealSaveEntry<FinalizeCurrentUserMealIdentificationInput>;

// Durable per-account store of unresolved photo-finalization operations (same ledger as normal save,
// separate keys). See consumerMealWriteOperationStore.ts for the contract.
export class ConsumerMealIdentificationFinalizationOperationStore {
  private readonly ledger: MealSaveOperationLedger<FinalizeCurrentUserMealIdentificationInput>;

  constructor(
    storage: ConsumerAuthStorage,
    private readonly now: () => Date = () => new Date()
  ) {
    this.ledger = new MealSaveOperationLedger<FinalizeCurrentUserMealIdentificationInput>({
      storage,
      kind: "finalization",
      keyPrefix: storagePrefix,
      validateInput: (input) => {
        const value = input as Partial<FinalizeCurrentUserMealIdentificationInput> | null;
        if (!value || typeof value !== "object" || typeof value.clientRequestId !== "string" || !value.clientRequestId) {
          throw new Error("Pending finalization input is invalid.");
        }
      }
    });
  }

  legacyStorageKey(actorKey: string) {
    return storageKey(actorKey);
  }

  list(actorKey: string): Promise<MealSaveLedgerListing<FinalizeCurrentUserMealIdentificationInput>> {
    return this.ledger.list(actorKey);
  }

  get(actorKey: string, opId: string) {
    return this.ledger.get(actorKey, opId);
  }

  add(
    actorKey: string,
    operation: ConsumerMealIdentificationFinalizationPendingOperation,
    options: { inflight?: boolean } = {}
  ): Promise<MealSaveLedgerAddResult<FinalizeCurrentUserMealIdentificationInput>> {
    assertActor(actorKey);
    if (operation.input.clientRequestId !== operation.clientRequestId) {
      throw new Error("Pending key/input mismatch.");
    }
    return this.ledger.add(actorKey, {
      opId: operation.clientRequestId,
      input: operation.input,
      createdAt: operation.createdAt,
      expiresAt: operation.expiresAt
    }, options);
  }

  // Persist-before-send: resolves with the durable entry or throws MealSaveLedgerError.
  async save(actorKey: string, operation: ConsumerMealIdentificationFinalizationPendingOperation): Promise<ConsumerMealIdentificationFinalizationLedgerEntry> {
    // The entry is born `inflight`: it is the journal of the attempt that follows immediately.
    const result = await this.add(actorKey, operation, { inflight: true });
    if (!result.ok) throw new MealSaveLedgerError(result.reason);
    return result.entry;
  }

  markInflight(actorKey: string, opId: string): Promise<MealSaveLedgerUpdateResult<FinalizeCurrentUserMealIdentificationInput>> {
    return this.ledger.markInflight(actorKey, opId);
  }

  update(
    actorKey: string,
    opId: string,
    mutate: (entry: ConsumerMealIdentificationFinalizationLedgerEntry) => ConsumerMealIdentificationFinalizationLedgerEntry | null
  ): Promise<MealSaveLedgerUpdateResult<FinalizeCurrentUserMealIdentificationInput>> {
    return this.ledger.update(actorKey, opId, mutate);
  }

  remove(actorKey: string, opId: string): Promise<MealSaveLedgerUpdateResult<FinalizeCurrentUserMealIdentificationInput>> {
    return this.ledger.remove(actorKey, opId);
  }

  // Legacy convenience: the most recent unresolved operation of the actor, or null.
  async load(actorKey: string): Promise<ConsumerMealIdentificationFinalizationPendingOperation | null> {
    const listing = await this.ledger.list(actorKey);
    const latest = listing.entries[listing.entries.length - 1];
    return latest ? { clientRequestId: latest.opId, input: latest.input, createdAt: latest.createdAt, expiresAt: latest.expiresAt } : null;
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
  return `${legacyStoragePrefix}.${encodeURIComponent(actorKey)}`;
}

function assertActor(actorKey: string) {
  if (!actorKey.trim()) throw new Error("Actor scope is required.");
}
