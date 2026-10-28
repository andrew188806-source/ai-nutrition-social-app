import { BillingCommitPhaseError, type BillingDriver, type BillingSession } from "../billing-transport/executor.ts";
import { commitFailureIsDefinite } from "../billing-transport/sql.ts";

// ENT-W1: the SQL side of the acquisition sweep. It reuses ONLY the generic driver port (one connection, BEGIN / body / COMMIT, driver-attested server answer) and the commit classification of ENT-F2; every result and error
// type here is acquisition-specific. Every statement is a constant; values travel only as parameters.
export const ACQUISITION_SWEEP_SQL = Object.freeze({
  claim: "select retention_acquisition.claim_resolution_page($1::integer,$2::integer) as s",
  begin: "select retention_acquisition.begin_resolution_item($1::bigint,$2::uuid) as s",
  resolve: "select retention_acquisition.resolve_detail_acquisition($1::uuid) as s",
  advance: "select retention_acquisition.advance_resolution_cursor($1::bigint,$2::uuid,$3::text) as s"
} as const);

// The COMMIT of an acquisition transaction was sent but no definite server answer came back: the database may or may not have committed (a receipt and a cursor move are committed together or not at all).
export class AcquisitionCommitOutcomeUnknownError extends Error {
  readonly commitOutcomeUnknown = true as const;
  // The original commit-phase failure, kept for diagnosis only (never answered to a caller).
  readonly commitFailure: unknown;
  constructor(commitFailure: unknown) {
    super("ACQUISITION_COMMIT_OUTCOME_UNKNOWN");
    this.name = "AcquisitionCommitOutcomeUnknownError";
    this.commitFailure = commitFailure;
  }
}

export class AcquisitionShapeError extends Error {
  constructor() {
    super("ACQUISITION_RESULT_SHAPE");
    this.name = "AcquisitionShapeError";
  }
}

// One database transaction. A body failure is rethrown unchanged (rolled back by the driver); a COMMIT-phase failure is a definite abort only with a driver-attested server answer, otherwise it is unknown.
export async function inAcquisitionTransaction<T>(driver: BillingDriver, fn: (session: BillingSession) => Promise<T>): Promise<T> {
  try {
    return await driver.withTransaction(fn);
  } catch (e) {
    if (e instanceof BillingCommitPhaseError) {
      if (commitFailureIsDefinite(e)) throw e.commitFailure;
      throw new AcquisitionCommitOutcomeUnknownError(e.commitFailure);
    }
    throw e;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REASON = /^[A-Z][A-Z0-9_]{0,63}$/;

function single(rows: readonly Record<string, unknown>[]): Record<string, unknown> {
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0] === null || typeof rows[0] !== "object" || !("s" in rows[0])) throw new AcquisitionShapeError();
  const v = rows[0].s;
  const parsed = typeof v === "string" ? safeParse(v) : v;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new AcquisitionShapeError();
  return parsed as Record<string, unknown>;
}
function safeParse(text: string): unknown {
  try { return JSON.parse(text); } catch { throw new AcquisitionShapeError(); }
}
function cycleOf(v: unknown): string {
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return String(v);
  if (typeof v === "string" && /^(0|[1-9][0-9]{0,18})$/.test(v)) return v;
  throw new AcquisitionShapeError();
}
const uuidOrNull = (v: unknown): string | null => {
  if (v === null) return null;
  if (typeof v === "string" && UUID.test(v)) return v;
  throw new AcquisitionShapeError();
};

export type ClaimedPage = Readonly<{ cycle: string; ids: readonly string[]; examined: number; atEnd: boolean; examinedThrough: string | null }>;
export async function claimPage(session: BillingSession, pageSize: number, examine: number): Promise<ClaimedPage> {
  const r = single(await session.query(ACQUISITION_SWEEP_SQL.claim, [pageSize, examine]));
  const ids = r.ids;
  if (r.outcome !== "page" || !Array.isArray(ids) || ids.length > pageSize || !ids.every((x) => typeof x === "string" && UUID.test(x))) throw new AcquisitionShapeError();
  for (let i = 1; i < ids.length; i++) if (!((ids[i - 1] as string) < (ids[i] as string))) throw new AcquisitionShapeError();
  if (typeof r.examined !== "number" || !Number.isSafeInteger(r.examined) || r.examined < 0 || typeof r.at_end !== "boolean") throw new AcquisitionShapeError();
  return Object.freeze({ cycle: cycleOf(r.cycle), ids: Object.freeze([...ids] as string[]), examined: r.examined, atEnd: r.at_end, examinedThrough: uuidOrNull(r.examined_through ?? null) });
}

export type BeginOutcome = "proceed" | "skipped_after_attempts" | "stale" | "out_of_order" | "busy";
export async function beginItem(session: BillingSession, cycle: string, id: string): Promise<BeginOutcome> {
  const r = single(await session.query(ACQUISITION_SWEEP_SQL.begin, [cycle, id]));
  if (r.outcome === "proceed" || r.outcome === "skipped_after_attempts" || r.outcome === "stale" || r.outcome === "out_of_order" || r.outcome === "busy") return r.outcome;
  throw new AcquisitionShapeError();
}

export type AdvanceOutcome = "advanced" | "wrapped" | "stale" | "refused" | "busy";
export async function advanceCursor(session: BillingSession, cycle: string, to: string | null, kind: "resolved" | "examined" | "wrap"): Promise<AdvanceOutcome> {
  const r = single(await session.query(ACQUISITION_SWEEP_SQL.advance, [cycle, to, kind]));
  if (r.outcome === "advanced" || r.outcome === "wrapped" || r.outcome === "stale" || r.outcome === "refused" || r.outcome === "busy") return r.outcome;
  throw new AcquisitionShapeError();
}

// The resolver's own answer, reduced to what the sweep may count. The receipt content (owner, T0, evidence) is read only to validate the shape and is never returned.
export type ResolveOutcome = Readonly<{ outcome: "recorded" }> | Readonly<{ outcome: "replayed" }> | Readonly<{ outcome: "pending"; reason: string }>;
export async function resolveItem(session: BillingSession, id: string): Promise<ResolveOutcome> {
  const r = single(await session.query(ACQUISITION_SWEEP_SQL.resolve, [id]));
  if (r.resource_id !== id) throw new AcquisitionShapeError();
  if (r.outcome === "recorded" || r.outcome === "replayed") {
    if (r.receipt === null || typeof r.receipt !== "object" || Array.isArray(r.receipt)) throw new AcquisitionShapeError();
    return Object.freeze({ outcome: r.outcome });
  }
  if (r.outcome === "pending") {
    if (r.receipt !== null) throw new AcquisitionShapeError();
    const reason = typeof r.reason === "string" && REASON.test(r.reason) ? r.reason : "OTHER";
    return Object.freeze({ outcome: "pending", reason });
  }
  throw new AcquisitionShapeError();
}
