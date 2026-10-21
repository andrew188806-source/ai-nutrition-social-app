import { isFinalOutcome } from "../_shared/billing-core/index.ts";
import { processNamespace } from "../_shared/billing-ingest/index.ts";
import type { BillingTransport, BillingTx, ProcessResult } from "../_shared/billing-ingest/index.ts";
import { createDenoBillingTransport } from "../_shared/billing-transport/denoPostgresBillingTransport.ts";
import { jsonResponse, secretMatches, unavailableResponse } from "../_shared/billing-transport/http.ts";
import type { ClosableBillingTransport } from "../_shared/billing-transport/sql.ts";
import {
  BILLING_PROCESS_ITEM_LIMIT, BILLING_PROCESS_SECRET_HEADER, loadBillingProcessConfigFromEnvironment, type BillingProcessConfigOutcome
} from "./config.ts";

export type BillingProcessDependencies = Readonly<{
  loadConfig: () => BillingProcessConfigOutcome;
  createTransport: (connectionUrl: string) => ClosableBillingTransport;
}>;

export function createDefaultBillingProcessDependencies(): BillingProcessDependencies {
  return Object.freeze({ loadConfig: loadBillingProcessConfigFromEnvironment, createTransport: createDenoBillingTransport });
}

// What the drain actually did, counted only from transactions that are CONFIRMED committed. A processed item stays committed whatever happens to a later item: this endpoint never claims the whole batch had no effect,
// and never claims the whole batch succeeded. `itemOutcomeUnknown` is true when the COMMIT of an item whose outcome is not known failed without an answer (the item may or may not have been processed; the database state is the
// truth and a later drain finds it again or finds it final).
type DrainState = { committed: Record<string, number>; completed: number; failedTransactions: number; itemOutcomeUnknown: boolean };

function isCommitOutcomeUnknown(e: unknown): boolean {
  return (e as { commitOutcomeUnknown?: unknown } | null)?.commitOutcomeUnknown === true;
}

function tracked(inner: BillingTransport, state: DrainState): BillingTransport {
  return {
    async transaction<T>(fn: (tx: BillingTx) => Promise<T>): Promise<T> {
      let touchedProcess = false;
      let lastProcess: ProcessResult | null = null;
      try {
        const result = await inner.transaction((tx) => fn({
          ingestDelivery: (o) => tx.ingestDelivery(o),
          createLinkIntent: (a, b, c, d) => tx.createLinkIntent(a, b, c, d),
          nextCandidate: (ns) => tx.nextCandidate(ns),
          recordAttempt: (id, reason) => tx.recordAttempt(id, reason),
          processItem: async (id) => { touchedProcess = true; const r = await tx.processItem(id); lastProcess = r; return r; }
        }));
        // Here the transaction is confirmed committed.
        const done = lastProcess as ProcessResult | null;
        if (done !== null) {
          const key = /^[a-z_]{1,32}$/.test(done.outcome) ? done.outcome : "other";
          state.committed[key] = (state.committed[key] ?? 0) + 1;
          if (isFinalOutcome(done.outcome)) state.completed += 1;
        }
        return result;
      } catch (e) {
        state.failedTransactions += 1;
        if (touchedProcess && isCommitOutcomeUnknown(e)) state.itemOutcomeUnknown = true;
        throw e;
      }
    }
  };
}

// Order of refusals: not configured -> 503 (no secret comparison, no database); method; the shared secret (constant time); only then a database connection (lazy), closed again in every case.
export async function processBillingProcessRequest(request: Request, dependencies: BillingProcessDependencies): Promise<Response> {
  const config = dependencies.loadConfig();
  if (!config.ok) return unavailableResponse();
  if (request.method !== "POST") return jsonResponse(405, { status: "method_not_allowed" });
  if (!secretMatches(config.value.processSecret, request.headers.get(BILLING_PROCESS_SECRET_HEADER))) return jsonResponse(401, { status: "unauthorized" });

  const state: DrainState = { committed: {}, completed: 0, failedTransactions: 0, itemOutcomeUnknown: false };
  let created: ClosableBillingTransport | null = null;
  const lazy: BillingTransport = {
    transaction(fn) {
      created ??= dependencies.createTransport(config.value.producerDbUrl);
      return created.transaction(fn);
    }
  };
  let stoppedBecause: string;
  try {
    const summary = await processNamespace(tracked(lazy, state), config.value.namespace, BILLING_PROCESS_ITEM_LIMIT);
    stoppedBecause = summary.stoppedBecause;
  } catch {
    stoppedBecause = "failure";
  } finally {
    if (created !== null) await (created as ClosableBillingTransport).close().catch(() => undefined);
  }

  const status = state.itemOutcomeUnknown ? "unknown"
    : stoppedBecause === "failure" || stoppedBecause === "transient_failure" ? "failed"
    : stoppedBecause === "blocked" || stoppedBecause === "busy_or_retry" ? "stopped" : "ok";
  // Numbers and fixed words only: no item id, subject, owner, payload or error text.
  return jsonResponse(status === "ok" || status === "stopped" ? 200 : 503, {
    status,
    completed: state.completed,
    stoppedBecause,
    committedOutcomes: state.committed,
    failedTransactions: state.failedTransactions,
    itemOutcomeUnknown: state.itemOutcomeUnknown,
    note: "items completed before a stop stay committed"
  });
}
