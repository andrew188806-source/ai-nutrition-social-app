import { getConsumerMonthlyReviewFlags, type ConsumerMonthlyReviewFlags } from "./featureFlags";
import { ConsumerMonthlyNutritionReviewService, type MonthlyReviewRpcClient, type MonthlyReviewSessionPort } from "./service";
import type { MonthlyReviewRuntime } from "./types";

export type MonthlyReviewAuthFlags = { authSource: string; supabaseAuthEnabled: boolean };

/**
 * disabled: nothing requested (the existing screen stays as it is). live: explicit source + opt-in, live Auth and a client.
 * misconfigured: live was requested but cannot be composed; the screen must show "unavailable", never demo values.
 */
export function createConsumerMonthlyReviewRuntime(
  authFlags: MonthlyReviewAuthFlags | null,
  dependencies: { client?: unknown; sessionPort?: unknown },
  flags: ConsumerMonthlyReviewFlags = getConsumerMonthlyReviewFlags()
): MonthlyReviewRuntime {
  if (flags.requested === "disabled" && !flags.liveReadOptIn && flags.issues.length === 0) return { mode: "disabled" };
  const issues = [...flags.issues];
  if (flags.requested !== "supabase-live" || !flags.liveReadOptIn) issues.push("Monthly review live read was not fully requested.");
  if (!authFlags || authFlags.authSource !== "supabase-live" || !authFlags.supabaseAuthEnabled) issues.push("Monthly review live reads require live Supabase Auth.");
  const client = dependencies.client as MonthlyReviewRpcClient | undefined;
  const sessionPort = dependencies.sessionPort as MonthlyReviewSessionPort | undefined;
  if (!client || typeof client.rpc !== "function") issues.push("Monthly review live reads require the runtime Supabase client.");
  if (!sessionPort || typeof sessionPort.getCurrentSession !== "function") issues.push("Monthly review live reads require the runtime auth port.");
  if (issues.length) return { mode: "misconfigured", issues };
  return { mode: "live", service: new ConsumerMonthlyNutritionReviewService({ client: client!, sessionPort: sessionPort! }) };
}

/** Used when the whole runtime composition failed: a requested live review is reported as misconfigured, not silently hidden. */
export function fallbackMonthlyReviewRuntime(flags: ConsumerMonthlyReviewFlags = getConsumerMonthlyReviewFlags()): MonthlyReviewRuntime {
  return flags.requested === "disabled" && !flags.liveReadOptIn && flags.issues.length === 0
    ? { mode: "disabled" }
    : { mode: "misconfigured", issues: ["Consumer runtime composition is unavailable."] };
}
