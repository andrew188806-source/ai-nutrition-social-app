// PC-1 B1: the actor's canonical Meal Buddy card quota.
//
// Source of truth is the frozen SR-2G-B `meal-buddy-card-list` response, whose `quota` block carries
// the server's active-card counts and the caps implied by the server-resolved entitlement. The frozen
// SR-2G-E source-card adapter deliberately drops that block, so this is a separate, additive reader:
// it reads ONLY `policyVersion` and `quota` and never exposes cards. Nothing here recounts cards,
// derives a tier or applies expiry/cancellation locally — the server's numbers are displayed as-is and
// the server remains the final enforcement authority on create.
import type { ConsumerAuthPort } from "../consumer-auth";
import { MEAL_BUDDY_CARD_LIST_FUNCTION_NAME } from "../meal-buddy-candidates/supabaseMealBuddyCandidateContracts";
import { getMealBuddyCardCreateRuntimeDependencies } from "./runtimeBinding";
import type { MealBuddyOwnCardQuota } from "./types";

export const MEAL_BUDDY_CARD_WRITE_POLICY_VERSION = "meal-buddy-card-write-api-v1" as const;

// The one named bound for the quota read; `schedule` is injectable so tests never wait in real time.
export const MEAL_BUDDY_OWN_CARD_QUOTA_TIMEOUT_MS = 15_000;
export type MealBuddyOwnCardQuotaTimeoutPolicy = Readonly<{
  timeoutMs: number;
  schedule(callback: () => void, delayMs: number): () => void;
}>;
export const DEFAULT_MEAL_BUDDY_OWN_CARD_QUOTA_TIMEOUT_POLICY: MealBuddyOwnCardQuotaTimeoutPolicy = Object.freeze({
  timeoutMs: MEAL_BUDDY_OWN_CARD_QUOTA_TIMEOUT_MS,
  schedule(callback: () => void, delayMs: number) {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  }
});

export type MealBuddyOwnCardQuotaErrorCode =
  | "authentication_required"
  | "network_error"
  | "server_unavailable"
  | "invalid_server_response"
  | "operation_not_enabled";

export type MealBuddyOwnCardQuotaOutcome =
  | Readonly<{ ok: true; value: MealBuddyOwnCardQuota }>
  | Readonly<{ ok: false; errorCode: MealBuddyOwnCardQuotaErrorCode }>;

export interface MealBuddyOwnCardQuotaRepository {
  readonly source: "disabled" | "supabase-live";
  readQuota(): Promise<MealBuddyOwnCardQuotaOutcome>;
}

export type SupabaseMealBuddyOwnCardQuotaClientLike = {
  functions: {
    invoke<T = unknown>(
      functionName: typeof MEAL_BUDDY_CARD_LIST_FUNCTION_NAME,
      options: Readonly<{ body: Readonly<Record<string, never>>; timeout?: number }>
    ): Promise<Readonly<{ data: T | null; error: Readonly<{ name?: string }> | null }>>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAllowance(value: unknown): Readonly<{ used: number; limit: number }> | null {
  if (!isRecord(value)) return null;
  const { used, limit } = value;
  if (!Number.isInteger(used) || !Number.isInteger(limit)) return null;
  if ((used as number) < 0 || (limit as number) < 0) return null;
  return Object.freeze({ used: used as number, limit: limit as number });
}

/** Validates a `quota` block exactly as the frozen SR-2G-B contract emits it. */
export function parseMealBuddyOwnCardQuota(value: unknown): MealBuddyOwnCardQuota | null {
  if (!isRecord(value)) return null;
  const general = parseAllowance(value.general);
  const restaurant = parseAllowance(value.restaurant);
  if (!general || !restaurant) return null;
  return Object.freeze({ general, restaurant });
}

/** Validates a whole `meal-buddy-card-list` (or create) response and returns only its quota. */
export function parseMealBuddyOwnCardQuotaResponse(value: unknown): MealBuddyOwnCardQuota | null {
  if (!isRecord(value) || value.policyVersion !== MEAL_BUDDY_CARD_WRITE_POLICY_VERSION) return null;
  return parseMealBuddyOwnCardQuota(value.quota);
}

export class SupabaseMealBuddyOwnCardQuotaRepository implements MealBuddyOwnCardQuotaRepository {
  readonly source = "supabase-live" as const;

  constructor(
    private readonly authPort: ConsumerAuthPort,
    private readonly client: SupabaseMealBuddyOwnCardQuotaClientLike,
    private readonly timeoutPolicy: MealBuddyOwnCardQuotaTimeoutPolicy = DEFAULT_MEAL_BUDDY_OWN_CARD_QUOTA_TIMEOUT_POLICY
  ) {}

  readQuota(): Promise<MealBuddyOwnCardQuotaOutcome> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (outcome: MealBuddyOwnCardQuotaOutcome) => {
        if (settled) return;
        settled = true;
        cancel();
        resolve(outcome);
      };
      const cancel = this.timeoutPolicy.schedule(() => finish(failure("network_error")), this.timeoutPolicy.timeoutMs);
      this.readUnbounded().then(finish, () => finish(failure("network_error")));
    });
  }

  private async readUnbounded(): Promise<MealBuddyOwnCardQuotaOutcome> {
    const session = await this.authPort.getCurrentSession();
    if (!session.ok || !session.value) return failure("authentication_required");
    let response;
    try {
      // The empty body IS the frozen contract: the owner is the verified caller.
      response = await this.client.functions.invoke(MEAL_BUDDY_CARD_LIST_FUNCTION_NAME, {
        body: {},
        timeout: this.timeoutPolicy.timeoutMs
      });
    } catch {
      return failure("network_error");
    }
    if (response.error) {
      return failure(response.error.name === "FunctionsFetchError" || response.error.name === "FunctionsRelayError"
        ? "network_error" : "server_unavailable");
    }
    const quota = parseMealBuddyOwnCardQuotaResponse(response.data);
    return quota ? Object.freeze({ ok: true as const, value: quota }) : failure("invalid_server_response");
  }
}

export class DisabledMealBuddyOwnCardQuotaRepository implements MealBuddyOwnCardQuotaRepository {
  readonly source = "disabled" as const;
  readQuota() { return Promise.resolve(failure("operation_not_enabled")); }
}

/** Live only when the canonical owner-card runtime (same client and auth port) is bound. */
export function createMealBuddyOwnCardQuotaRepository(): MealBuddyOwnCardQuotaRepository {
  const dependencies = getMealBuddyCardCreateRuntimeDependencies();
  if (!dependencies) return new DisabledMealBuddyOwnCardQuotaRepository();
  return new SupabaseMealBuddyOwnCardQuotaRepository(
    dependencies.authPort,
    dependencies.client as unknown as SupabaseMealBuddyOwnCardQuotaClientLike
  );
}

function failure(errorCode: MealBuddyOwnCardQuotaErrorCode): MealBuddyOwnCardQuotaOutcome {
  return Object.freeze({ ok: false as const, errorCode });
}
