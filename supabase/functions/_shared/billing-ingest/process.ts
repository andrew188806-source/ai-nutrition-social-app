import { classifyDbFailure, isFinalOutcome } from "../billing-core/index.ts";
import type { BillingTransport } from "./types.ts";

export type ProcessSummary = Readonly<{
  processed: number;
  outcomes: Readonly<Record<string, number>>;
  stoppedBecause: "idle" | "limit" | "transient_failure" | "blocked" | "busy_or_retry";
}>;

// Drains up to `limit` items of one namespace, ONE item per transaction (one owner per transaction). A failed transaction has rolled back completely; its failure is recorded for the item in a SEPARATE transaction
// and the loop stops on transient failures so a struggling database is not hammered. A failure, a retry, a busy row or an unknown outcome is never counted as processed and never as a final outcome.
export async function processNamespace(transport: BillingTransport, namespace: string, limit: number): Promise<ProcessSummary> {
  const outcomes: Record<string, number> = {};
  const bump = (k: string) => { outcomes[k] = (outcomes[k] ?? 0) + 1; };
  let processed = 0;
  for (let i = 0; i < limit; i++) {
    const id = await transport.transaction((tx) => tx.nextCandidate(namespace));
    if (id === null) return { processed, outcomes, stoppedBecause: "idle" };
    let result;
    try {
      result = await transport.transaction((tx) => tx.processItem(id));
    } catch (e) {
      const d = classifyDbFailure(e as { code?: string; message?: string });
      bump("error:" + d.failure);
      try { await transport.transaction((tx) => tx.recordAttempt(id, d.failure + ":" + String((e as { code?: string }).code ?? ""))); } catch { /* the attempt record is best effort; the item stays non-terminal */ }
      return { processed, outcomes, stoppedBecause: "transient_failure" };
    }
    bump(result.outcome);
    if (result.outcome === "blocked") return { processed, outcomes, stoppedBecause: "blocked" };
    if (result.outcome === "retry" || result.outcome === "busy") {
      if (result.outcome === "retry") { try { await transport.transaction((tx) => tx.recordAttempt(id, "LOCK_TIMEOUT")); } catch { /* best effort */ } }
      return { processed, outcomes, stoppedBecause: "busy_or_retry" };
    }
    if (isFinalOutcome(result.outcome)) processed++;
    else if (result.outcome === "mapping_pending") { /* waits for a link; not a failure, not final */ }
    else if (result.outcome === "disabled" || result.outcome === "not_found" || result.outcome === "already_final") return { processed, outcomes, stoppedBecause: "idle" };
    else return { processed, outcomes, stoppedBecause: "transient_failure" }; // unknown answer: no progress is claimed
  }
  return { processed, outcomes, stoppedBecause: "limit" };
}
