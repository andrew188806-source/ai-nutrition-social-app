import type { BillingDriver } from "../billing-transport/executor.ts";
import { advanceCursor, beginItem, claimPage, inAcquisitionTransaction, resolveItem } from "./sql.ts";

// ENT-W1 sweep: one bounded run. Transactions (each a separate driver transaction; the resolver transaction contains nothing before the resolver call):
//   claim  : read-only page of anchors without a receipt after the cursor (a lost answer loses nothing)
//   begin  : marks the start of one id (bounded attempt counter; the database refuses anything but the next unresolved id)
//   resolve: resolver call, then the cursor move onto that id, committed together
//   advance: an 'examined' move past receipted anchors, or a 'wrap' to the next cycle (refused while an unresolved anchor remains)
// The run STOPS at the first failure or unknown commit outcome; the caller then discards the driver (its connection is never reused). Nothing here decides eligibility: pending answers are only counted.
export type SweepLimits = Readonly<{ pageSize: number; examine: number; maxItems: number; maxClaims: number; budgetMs: number }>;
export const ACQUISITION_SWEEP_LIMITS: SweepLimits = Object.freeze({ pageSize: 20, examine: 1000, maxItems: 50, maxClaims: 10, budgetMs: 20000 });

export type SweepStop = "idle" | "limit" | "budget" | "busy" | "failure" | "commit_unknown";
export type SweepSummary = {
  status: "ok" | "stopped" | "failed" | "unknown";
  stoppedBecause: SweepStop;
  cycle: string | null;
  claims: number;
  recorded: number;
  replayed: number;
  pending: Record<string, number>;
  skippedAfterAttempts: number;
  stale: number;
  outOfOrder: number;
  refused: number;
  wrapped: number;
  commitOutcomeUnknown: boolean;
};

function isCommitOutcomeUnknown(e: unknown): boolean {
  return (e as { commitOutcomeUnknown?: unknown } | null)?.commitOutcomeUnknown === true;
}

export async function runAcquisitionSweep(driver: BillingDriver, limits: SweepLimits, now: () => number): Promise<SweepSummary> {
  const s: SweepSummary = { status: "ok", stoppedBecause: "idle", cycle: null, claims: 0, recorded: 0, replayed: 0, pending: {}, skippedAfterAttempts: 0, stale: 0, outOfOrder: 0, refused: 0, wrapped: 0, commitOutcomeUnknown: false };
  const stop = (why: SweepStop): SweepSummary => {
    s.stoppedBecause = why;
    s.status = why === "failure" ? "failed" : why === "commit_unknown" ? "unknown" : why === "idle" ? "ok" : "stopped";
    return s;
  };
  const deadline = now() + limits.budgetMs;
  let items = 0;
  try {
    while (s.claims < limits.maxClaims) {
      if (now() >= deadline) return stop("budget");
      const page = await inAcquisitionTransaction(driver, (q) => claimPage(q, limits.pageSize, limits.examine));
      s.claims += 1;
      s.cycle = page.cycle;
      if (page.ids.length === 0) {
        if (page.atEnd) {
          // The whole cycle is processed: a wrap starts the next cycle and ENDS this run, so a run never sweeps the same pending anchors twice. A refused wrap (an anchor without a receipt appeared after the
          // cursor) or a stale one (another worker wrapped) claims again.
          const a = await inAcquisitionTransaction(driver, (q) => advanceCursor(q, page.cycle, null, "wrap"));
          if (a === "busy") return stop("busy");
          if (a === "wrapped") { s.wrapped += 1; return stop("idle"); }
          if (a === "refused") s.refused += 1; else s.stale += 1;
          continue;
        }
        if (page.examinedThrough !== null) {
          const a = await inAcquisitionTransaction(driver, (q) => advanceCursor(q, page.cycle, page.examinedThrough, "examined"));
          if (a === "busy") return stop("busy");
          if (a === "refused") s.refused += 1; else if (a === "stale") s.stale += 1;
          continue;
        }
        return stop("idle");
      }
      let completedPage = true;
      for (const id of page.ids) {
        if (items >= limits.maxItems) return stop("limit");
        if (now() >= deadline) return stop("budget");
        const b = await inAcquisitionTransaction(driver, (q) => beginItem(q, page.cycle, id));
        if (b === "busy") return stop("busy");
        if (b === "stale") { s.stale += 1; continue; }
        if (b === "skipped_after_attempts") { s.skippedAfterAttempts += 1; continue; }
        if (b === "out_of_order") { s.outOfOrder += 1; completedPage = false; break; } // an earlier unresolved anchor became visible: claim again from the cursor
        items += 1;
        const r = await inAcquisitionTransaction(driver, async (q) => {
          const resolved = await resolveItem(q, id);
          const moved = await advanceCursor(q, page.cycle, id, "resolved");
          return { resolved, moved };
        });
        if (r.resolved.outcome === "recorded") s.recorded += 1;
        else if (r.resolved.outcome === "replayed") s.replayed += 1;
        else s.pending[r.resolved.reason] = (s.pending[r.resolved.reason] ?? 0) + 1;
        if (r.moved === "busy") return stop("busy");
        if (r.moved === "refused") { s.refused += 1; completedPage = false; break; }
        if (r.moved === "stale") s.stale += 1;
      }
      if (completedPage && page.examinedThrough !== null) {
        const a = await inAcquisitionTransaction(driver, (q) => advanceCursor(q, page.cycle, page.examinedThrough, "examined"));
        if (a === "busy") return stop("busy");
        if (a === "refused") s.refused += 1; else if (a === "stale") s.stale += 1;
      }
    }
    return stop("limit");
  } catch (e) {
    if (isCommitOutcomeUnknown(e)) { s.commitOutcomeUnknown = true; return stop("commit_unknown"); }
    return stop("failure");
  }
}
