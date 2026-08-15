import type { SocialRankedCandidate } from "../social-ranking/types.ts";

// SR-2B is server-internal. The ordered candidates have already passed frozen SR-1D authorization
// and frozen SR-2A ranking before entering this exposure authority, which never reorders them.
export type SocialEntitlementClass = "free" | "premium";

// The only entitlement value permitted to cross from the resolver into exposure policy. Billing
// internals — plan_code, status, validity window, source, provider reference — stay inside the
// resolver and never reach policy, output or any later phase.
export type SocialEntitlementFact = Readonly<{
  class: SocialEntitlementClass;
}>;

// The narrow structural row source the resolver needs. Declared here rather than imported so the
// exposure module carries no Supabase, transport or environment dependency; the authenticated
// user-scoped client satisfies it structurally.
export type SocialEntitlementQueryOutcome = Readonly<{
  data: unknown;
  error: unknown;
}>;

export type SocialEntitlementRowSource = Readonly<{
  from(table: "subscription_entitlements"): Readonly<{
    select(columns: string): Readonly<{
      eq(column: "user_id", value: string): PromiseLike<SocialEntitlementQueryOutcome>;
    }>;
  }>;
}>;

export type SocialExposureResult = Readonly<{
  policyVersion: "social-exposure-v1";
  exposed: readonly SocialRankedCandidate[];
  truncated: boolean;
}>;
