import type { BillingEnvironment, Interval, LedgerClass, NamespaceConfig, NormalizedObservation } from "./types.ts";

// A new observation may only ADD time that is not asserted yet: segments = observation interval minus the already-asserted set A of (namespace, subject, class). This never shortens or removes anything.
export function subtractAsserted(interval: Interval, asserted: readonly Interval[]): Interval[] {
  const [start, end] = interval;
  if (!(end > start)) return [];
  const sorted = [...asserted].filter(([s, e]) => e > start && s < end).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Interval[] = [];
  let cursor = start;
  for (const [s, e] of sorted) {
    if (s > cursor) out.push([cursor, Math.min(s, end)]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < end) out.push([cursor, end]);
  return out;
}

// Union of intervals as maximal non-touching intervals (the oracle form of the asserted set; touching intervals are merged because no millisecond lies between them).
export function unionIntervals(xs: readonly Interval[]): Interval[] {
  const sorted = [...xs].filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: [number, number][] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

export function clipToRegistration(interval: Interval, registeredAtMs: number): Interval | null {
  const start = Math.max(interval[0], registeredAtMs);
  return interval[1] > start ? [start, interval[1]] : null;
}

export type Plan =
  | { action: "segments"; segments: Interval[]; gapObservedMs: number | null }
  | { action: "terminal"; state: "dismissed" | "recorded_only" | "quarantined" | "before_registration" | "already_asserted"; reason: string };

// Mirror of the database decision tree for a paid/trial/revocation/non-entitling observation whose OWNER is already known. The database is authoritative; this function is the independent oracle the tests
// compare it with, and the planning aid for adapters.
export function planObservation(obs: NormalizedObservation, cfg: NamespaceConfig, asserted: readonly Interval[]): Plan {
  if (obs.kind === "non_entitling") return { action: "terminal", state: "dismissed", reason: obs.reasonCode && obs.reasonCode !== "" ? obs.reasonCode : "non_entitling" };
  if (obs.kind === "revocation") return { action: "terminal", state: "recorded_only", reason: "revocation_observed" };
  if (obs.kind !== "paid_period" && obs.kind !== "trial_period") return { action: "terminal", state: "quarantined", reason: "unsupported_kind" };
  if (obs.periodStartMs === null || obs.periodEndMs === null) return { action: "terminal", state: "quarantined", reason: "period_missing" };
  if (obs.environment !== (cfg.environment as BillingEnvironment)) return { action: "terminal", state: "quarantined", reason: "environment_mismatch" };
  if (obs.periodEndMs - obs.periodStartMs > cfg.maxPeriodMs) return { action: "terminal", state: "quarantined", reason: "period_too_long" };
  const clipped = clipToRegistration([obs.periodStartMs, obs.periodEndMs], cfg.registeredAtMs);
  if (!clipped) return { action: "terminal", state: "before_registration", reason: "before_registration" };
  const segments = subtractAsserted(clipped, asserted);
  if (segments.length === 0) return { action: "terminal", state: "already_asserted", reason: "covered" };
  const chainMax = asserted.length ? Math.max(...asserted.map((x) => x[1])) : null;
  return { action: "segments", segments, gapObservedMs: chainMax !== null && segments[0][0] > chainMax ? segments[0][0] - chainMax : null };
}

export function classOf(kind: string): LedgerClass | null {
  return kind === "paid_period" ? "paid" : kind === "trial_period" ? "trial" : null;
}
