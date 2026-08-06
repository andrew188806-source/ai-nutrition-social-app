import type { ConsumerRuntimeFlags } from "./types";

// MI-E-C5-R7-C4-R1 — the single authority for turning canonical Consumer Runtime flags into the
// flags that may construct a LIVE Supabase consumer client.
//
// getConsumerRuntimeFlags still records the Consumer Runtime Phase 1D statement below whenever
// writes are enabled, and SupabaseConsumerClientFactory still refuses to build a client while that
// statement is present or while the writes gate is set. Both gates predate the product actually
// shipping consumer writes: today the Development runtime legitimately runs with
// EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED=true, so every live call site has to
// reconcile the two before it can obtain a client.
//
// The main Consumer Runtime composition already did exactly that with two private helpers. The
// Restaurant Catalog, Favorites and Ratings compositions did not, so each of them silently fell back
// to a disabled repository the moment writes were enabled — which is what made the Development
// Restaurant Catalog report "Supabase restaurant catalog client is unavailable." on a physical
// device while the rest of the app was live.
//
// This module exists so that reconciliation is written ONCE and imported, rather than re-derived per
// feature. It lives in consumer-auth because that is where the flag type and the client factory
// already live: consumer-runtime and every feature composition already depend on this directory, so
// sharing from here introduces no new dependency direction and no cycle.
//
// Deliberately NOT done here: the factory's fail-closed gates are left in place. They still protect
// any caller that has not opted in, and a caller that forgets this helper keeps failing closed
// rather than silently constructing a client from unreviewed flags.
export const CONSUMER_PHASE_1D_WRITES_ISSUE = "Consumer Supabase writes are not enabled in Consumer Runtime Phase 1D.";

// Drops ONLY the obsolete Phase 1D statement. Every other issue — an unknown flag value, a live auth
// source without auth enabled, a live profile source without live auth — is preserved verbatim, so a
// genuinely misconfigured runtime still fails closed.
export function withoutObsoleteConsumerWritesIssue(flags: ConsumerRuntimeFlags): ConsumerRuntimeFlags {
  if (!flags.supabaseWritesEnabled) return flags;
  const issues = flags.issues.filter((issue) => issue !== CONSUMER_PHASE_1D_WRITES_ISSUE);
  if (issues.length === flags.issues.length) return flags;
  return { ...flags, issues };
}

// The flags a live Supabase consumer client may be constructed from.
//
// Clears the factory-facing writes gate IN THE CONSTRUCTION FLAGS ONLY. The caller's own capability
// flags are untouched, so whether the product performs writes stays governed by the unmodified
// runtime flags — this never grants a write capability, it only stops an obsolete gate from denying
// client creation. authSource, profileSource, supabaseAuthEnabled and every unrelated issue are
// passed through unchanged, so a mock, disabled or misconfigured runtime is never normalized into a
// live one.
export function deriveLiveSupabaseClientFlags(flags: ConsumerRuntimeFlags): ConsumerRuntimeFlags {
  if (!flags.supabaseWritesEnabled) return flags;
  return { ...withoutObsoleteConsumerWritesIssue(flags), supabaseWritesEnabled: false };
}
