import type { BillingDriver } from "../_shared/billing-transport/executor.ts";
import { createDenoBillingDriver } from "../_shared/billing-transport/denoPostgresBillingTransport.ts";
import { jsonResponse, secretMatches, unavailableResponse } from "../_shared/billing-transport/http.ts";
import { ACQUISITION_SWEEP_LIMITS, runAcquisitionSweep, type SweepLimits } from "../_shared/acquisition-resolve/worker.ts";
import { loadRetentionResolveConfigFromEnvironment, RETENTION_RESOLVE_SECRET_HEADER, type RetentionResolveConfigOutcome } from "./config.ts";

export type RetentionResolveDependencies = Readonly<{
  loadConfig: () => RetentionResolveConfigOutcome;
  createDriver: (connectionUrl: string) => BillingDriver;
  limits: SweepLimits;
  now: () => number;
}>;

export function createDefaultRetentionResolveDependencies(): RetentionResolveDependencies {
  return Object.freeze({ loadConfig: loadRetentionResolveConfigFromEnvironment, createDriver: createDenoBillingDriver, limits: ACQUISITION_SWEEP_LIMITS, now: () => Date.now() });
}

// Order of refusals: not configured -> 503 (no secret comparison, no database); method; the shared secret (constant time); only then one driver for this run, closed in every case (a driver whose last transaction had an
// unknown outcome is never reused: every run creates its own and the run stops at the first failure or unknown outcome).
export async function processRetentionResolveRequest(request: Request, dependencies: RetentionResolveDependencies): Promise<Response> {
  const config = dependencies.loadConfig();
  if (!config.ok) return unavailableResponse();
  if (request.method !== "POST") return jsonResponse(405, { status: "method_not_allowed" });
  if (!secretMatches(config.value.secret, request.headers.get(RETENTION_RESOLVE_SECRET_HEADER))) return jsonResponse(401, { status: "unauthorized" });

  const driver = dependencies.createDriver(config.value.resolverDbUrl);
  let summary;
  try {
    summary = await runAcquisitionSweep(driver, dependencies.limits, dependencies.now);
  } finally {
    await driver.close().catch(() => undefined);
  }
  // Fixed words and counts only: no resource id, owner, instant, receipt content or error text.
  return jsonResponse(summary.status === "ok" || summary.status === "stopped" ? 200 : 503, {
    status: summary.status,
    stoppedBecause: summary.stoppedBecause,
    cycle: summary.cycle,
    claims: summary.claims,
    recorded: summary.recorded,
    replayed: summary.replayed,
    pending: summary.pending,
    skippedAfterAttempts: summary.skippedAfterAttempts,
    stale: summary.stale,
    outOfOrder: summary.outOfOrder,
    refused: summary.refused,
    wrapped: summary.wrapped,
    commitOutcomeUnknown: summary.commitOutcomeUnknown
  });
}
