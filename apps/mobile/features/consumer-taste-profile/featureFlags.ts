import type { ConsumerTasteProfileRuntimeFlags } from "./types";

// TS-2D live activation authority.
//
// Live foundation reads are resolved from the EXISTING consumer runtime/environment authority, not
// from a new toggle of their own. Three conditions must all hold, and any shortfall falls back to
// the deferred seam rather than degrading into a partial live read:
//
//   1. EXPO_PUBLIC_TASTKIND_ENVIRONMENT === "development"
//   2. EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE === "supabase-live"
//   3. EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED === "true"
//
// Condition 1 is the Production fence and is deliberate. This round activates Development only, so
// a non-development environment can never resolve `live` here — there is no env value that silently
// turns Production on. Widening beyond Development is a later, explicit decision, not a
// configuration accident. Conditions 2 and 3 are the same pair the consumer auth authority already
// requires before any live Supabase read exists at all: without a live authenticated session there
// is no `auth.uid()` for the owner policies to match, so a live foundation read could only fail.
export const TASTE_FOUNDATION_LIVE_ENVIRONMENT = "development" as const;

export function getConsumerTasteProfileRuntimeFlags(
  env: Record<string, string | undefined> = {}
): ConsumerTasteProfileRuntimeFlags {
  const issues: string[] = [];
  // Same resolution as the canonical Development launcher (scripts/start-mobile.mjs), which reads
  // `EXPO_PUBLIC_TASTKIND_ENVIRONMENT ?? "development"` and refuses to start on anything else. The
  // repository's Development configuration deliberately leaves the key unset, so re-deriving it any
  // other way here would create a SECOND environment authority that disagrees with the launcher.
  // A Production runtime sets the key explicitly, and any explicit non-development value falls
  // through to the deferred branch below.
  const environment = env.EXPO_PUBLIC_TASTKIND_ENVIRONMENT ?? TASTE_FOUNDATION_LIVE_ENVIRONMENT;
  const authSource = env.EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE;
  const authEnabled = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED === "true";

  const environmentAllowsLive = environment === TASTE_FOUNDATION_LIVE_ENVIRONMENT;
  const authAllowsLive = authSource === "supabase-live" && authEnabled;

  if (environmentAllowsLive && authSource === "supabase-live" && !authEnabled) {
    issues.push("Live taste foundation reads require EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED=true.");
  }
  if (environmentAllowsLive && authSource !== "supabase-live" && authEnabled) {
    issues.push("Live taste foundation reads require EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE=supabase-live.");
  }

  if (environmentAllowsLive && authAllowsLive) {
    return {
      foundationSource: "supabase-live",
      foundationActivation: "live",
      liveFoundationReadsEnabled: true,
      // Live activation has no placeholder state: every source state now comes from a real read.
      sourceState: null,
      issues
    };
  }

  return {
    foundationSource: "supabase-prepared",
    foundationActivation: "deferred",
    liveFoundationReadsEnabled: false,
    sourceState: { status: "deferred", evidenceCount: 0, reason: "acl_activation_pending" },
    issues
  };
}
