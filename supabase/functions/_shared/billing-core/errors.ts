// Classification of a database failure for the ingestion/processing worker. Hard rule: NOTHING here can turn a failure into success, Free, or an advance of any watermark. The default branch is "unclassified":
// the item stays retryable and non-terminal. Transient failures roll the whole transaction back (nothing is half done) and are retried with the same deterministic keys, so a retry is idempotent even when the
// previous COMMIT outcome is unknown.
export type DbFailure = Readonly<{ code?: string | null; message?: string | null }>;
export type FailureClass = "transient" | "incident" | "configuration" | "owner_absent" | "contract_violation" | "unclassified";
export type FailureDecision = Readonly<{ failure: FailureClass; retry: boolean; terminal: false }>;

const INCIDENT = ["ENT_EVENT_CONFLICT", "ENT_EVENT_BELOW_COVERAGE", "ENT_EVENT_BEFORE_PRODUCER_REGISTRATION"];
const CONTRACT = ["BILLING_INVALID_ARGUMENT", "BILLING_DIRTY_TRANSACTION", "BILLING_ISOLATION_UNSUPPORTED", "ENT_INVALID_ARGUMENT", "ENT_ISOLATION_UNSUPPORTED"];

export function classifyDbFailure(f: DbFailure): FailureDecision {
  const code = f.code ?? "";
  const message = f.message ?? "";
  const decide = (failure: FailureClass, retry: boolean): FailureDecision => Object.freeze({ failure, retry, terminal: false as const });
  if (INCIDENT.some((m) => message === m || message.startsWith(m + " "))) return decide("incident", false);
  if (message === "ENT_PRODUCER_NOT_AUTHORIZED" || code === "42501") return decide("configuration", false);
  if (CONTRACT.some((m) => message === m || message.startsWith(m + " ")) || code === "22023" || code === "25000" || code === "0A000") return decide("contract_violation", false);
  if (code === "23503") return decide("owner_absent", false);
  // deadlock, serialization failure, lock timeout, query cancel, shutdown, connection and resource classes: no effect, retry with the same keys.
  if (code === "40P01" || code === "40001" || code === "55P03" || code === "57014" || /^08/.test(code) || /^53/.test(code) || /^57P/.test(code)) return decide("transient", true);
  return decide("unclassified", true);
}

// The only successful processing outcomes. Everything else (retry, busy, blocked, an error, an unknown string) is "no answer".
export const FINAL_OUTCOMES = ["admitted", "already_asserted", "before_registration", "recorded_only", "dismissed", "quarantined"] as const;
export function isFinalOutcome(outcome: unknown): boolean {
  return typeof outcome === "string" && (FINAL_OUTCOMES as readonly string[]).includes(outcome);
}
