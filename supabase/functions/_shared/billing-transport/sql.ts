import type { NormalizedObservation } from "../billing-core/index.ts";
import type { BillingTransport, BillingTx, IngestResult, LinkResult, ProcessResult } from "../billing-ingest/index.ts";
import { BillingCommitPhaseError, type BillingDriver, type BillingSession } from "./executor.ts";

// ENT-F2: the product implementation of BillingTransport/BillingTx. It maps the five billing functions of the ENT-F1 migration (retention_billing.*) and nothing else: no ENT0 function, no resolver, no table.
// Every statement is a constant; values only ever travel as parameters. Every cast is explicit so the mapping does not depend on how a driver types a parameter.
export const BILLING_SQL = Object.freeze({
  ingestDelivery: "select retention_billing.ingest_delivery($1::text,$2::text,$3::text,$4::text,$5::text,$6::timestamptz,$7::timestamptz,$8::timestamptz,$9::text,$10::text,$11::text) as s",
  createLinkIntent: "select retention_billing.create_link_intent($1::text,$2::uuid,$3::text,$4::timestamptz) as s",
  nextCandidate: "select retention_billing.next_candidate($1::text) as s",
  processItem: "select retention_billing.process_item($1::uuid) as s",
  recordAttempt: "select retention_billing.record_attempt($1::uuid,$2::text) as s"
} as const);

// The commit outcome of a transaction is UNKNOWN: the COMMIT was sent but no definite answer came back (connection lost, reset, timeout). The database may have committed. The code is a connection-class SQLSTATE so
// the existing failure classification treats it as transient + retryable and never as success, Free or an advance of any watermark.
export class BillingCommitOutcomeUnknownError extends Error {
  readonly code = "08006";
  readonly commitOutcomeUnknown = true as const;
  // The original commit-phase failure, kept for diagnosis only (it is never answered to a caller).
  readonly commitFailure: unknown;
  constructor(commitFailure: unknown = null) {
    super("BILLING_COMMIT_OUTCOME_UNKNOWN");
    this.name = "BillingCommitOutcomeUnknownError";
    this.commitFailure = commitFailure;
  }
}

export class BillingTransportShapeError extends Error {
  constructor() {
    super("BILLING_TRANSPORT_SHAPE");
    this.name = "BillingTransportShapeError";
  }
}

const SQLSTATE = /^[0-9A-Z]{5}$/;
const CONNECTION_OR_SHUTDOWN_CLASS = /^(08|57P|58|XX)/;
// A failed COMMIT is a DEFINITE abort only when the DRIVER attests that the server itself answered the COMMIT with an ErrorResponse (BillingCommitPhaseError.serverAnswer), of severity ERROR and of a non-connection
// class (for example a deferred constraint, 40001, 40P01). The code of the raw failure is never evidence on its own: a Node/socket error (EPIPE, EBADF, ...) also has a five-character upper-case code. Anything else -
// no attested server answer, FATAL/PANIC, a connection or shutdown class - leaves the outcome unknown.
export function commitFailureIsDefinite(phase: { readonly serverAnswer?: unknown } | null | undefined): boolean {
  const answer = phase?.serverAnswer as { code?: unknown; severity?: unknown } | null | undefined;
  if (answer === null || answer === undefined || typeof answer !== "object") return false;
  const { code, severity } = answer;
  return typeof code === "string" && SQLSTATE.test(code) && severity === "ERROR" && !CONNECTION_OR_SHUTDOWN_CLASS.test(code);
}

function singleValue(rows: readonly Record<string, unknown>[]): unknown {
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0] === null || typeof rows[0] !== "object" || !("s" in rows[0])) throw new BillingTransportShapeError();
  return rows[0].s;
}
function jsonObject(value: unknown): Record<string, unknown> {
  const parsed = typeof value === "string" ? safeParse(value) : value;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || typeof (parsed as { outcome?: unknown }).outcome !== "string") throw new BillingTransportShapeError();
  return parsed as Record<string, unknown>;
}
function safeParse(text: string): unknown {
  try { return JSON.parse(text); } catch { throw new BillingTransportShapeError(); }
}
const textOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const isoOrNull = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

function transactionFor(session: BillingSession): BillingTx {
  return {
    async ingestDelivery(o: NormalizedObservation): Promise<IngestResult> {
      const r = jsonObject(singleValue(await session.query(BILLING_SQL.ingestDelivery, [
        o.namespace, o.deliveryId, o.subjectRef, o.payloadDigest, o.kind, isoOrNull(o.periodStartMs), isoOrNull(o.periodEndMs), new Date(o.signedAtMs).toISOString(), o.environment, o.bindingHash, o.reasonCode
      ])));
      return Object.freeze({ outcome: r.outcome as string, item_id: textOrNull(r.item_id) });
    },
    async createLinkIntent(namespace: string, ownerUserId: string, bindingHash: string, expiresAtMs: number): Promise<LinkResult> {
      const r = jsonObject(singleValue(await session.query(BILLING_SQL.createLinkIntent, [namespace, ownerUserId, bindingHash, new Date(expiresAtMs).toISOString()])));
      return Object.freeze({ outcome: r.outcome as string, link_id: textOrNull(r.link_id) });
    },
    async nextCandidate(namespace: string): Promise<string | null> {
      const v = singleValue(await session.query(BILLING_SQL.nextCandidate, [namespace]));
      if (v === null) return null;
      if (typeof v !== "string") throw new BillingTransportShapeError();
      return v;
    },
    async processItem(itemId: string): Promise<ProcessResult> {
      const r = jsonObject(singleValue(await session.query(BILLING_SQL.processItem, [itemId])));
      return Object.freeze({ outcome: r.outcome as string, item_id: textOrNull(r.item_id), reason: textOrNull(r.reason) });
    },
    async recordAttempt(itemId: string, reason: string): Promise<ProcessResult> {
      const r = jsonObject(singleValue(await session.query(BILLING_SQL.recordAttempt, [itemId, reason])));
      return Object.freeze({ outcome: r.outcome as string, item_id: textOrNull(r.item_id), reason: textOrNull(r.reason) });
    }
  };
}

export type ClosableBillingTransport = BillingTransport & { close(): Promise<void> };

// One BillingTransport.transaction = one database transaction on one connection. A body failure rolls the whole transaction back (never a partial commit). A failure in the COMMIT phase is classified honestly:
// a server-side abort attested by the driver is rethrown unchanged; anything else becomes BillingCommitOutcomeUnknownError - never "rolled back", never success.
export function createBillingTransport(driver: BillingDriver): ClosableBillingTransport {
  return {
    async transaction<T>(fn: (tx: BillingTx) => Promise<T>): Promise<T> {
      try {
        return await driver.withTransaction((session) => fn(transactionFor(session)));
      } catch (e) {
        if (e instanceof BillingCommitPhaseError) {
          if (commitFailureIsDefinite(e)) throw e.commitFailure;
          throw new BillingCommitOutcomeUnknownError(e.commitFailure);
        }
        throw e;
      }
    },
    close: () => driver.close()
  };
}
