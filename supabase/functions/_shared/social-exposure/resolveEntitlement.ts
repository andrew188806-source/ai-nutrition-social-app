import {
  SOCIAL_ENTITLEMENT_PREMIUM_STATUSES,
  SOCIAL_ENTITLEMENT_STATUSES,
  SOCIAL_EXPOSURE_PLAN_CODES,
  socialEntitlementContractViolation
} from "./policy.ts";
import type {
  SocialEntitlementFact,
  SocialEntitlementRowSource
} from "./types.ts";

// Exactly the columns SR-2B interprets. Billing internals the policy has no business reading —
// id, entitlement_source, source_reference, created_at, updated_at — are never selected.
const ENTITLEMENT_COLUMNS = "plan_code,status,valid_from,valid_until";

const PLAN_CODES = new Set<string>(SOCIAL_EXPOSURE_PLAN_CODES);
const STATUSES = new Set<string>(SOCIAL_ENTITLEMENT_STATUSES);
const PREMIUM_STATUSES = new Set<string>(SOCIAL_ENTITLEMENT_PREMIUM_STATUSES);

const FREE: SocialEntitlementFact = Object.freeze({ class: "free" as const });
const PREMIUM: SocialEntitlementFact = Object.freeze({ class: "premium" as const });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function instant(value: unknown): number {
  if (typeof value !== "string" || value.length === 0) return socialEntitlementContractViolation();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return socialEntitlementContractViolation();
  return parsed;
}

// One row is premium-entitled only when the plan is premium, the stored status still carries
// entitlement, and the canonical request instant falls inside the stored validity window. A null
// valid_until means no upper bound. Any other shape is a contract failure, never a silent free.
function rowGrantsPremium(value: unknown, nowMs: number): boolean {
  if (!isRecord(value)) return socialEntitlementContractViolation();

  const planCode = value.plan_code;
  const status = value.status;
  if (typeof planCode !== "string" || !PLAN_CODES.has(planCode)) return socialEntitlementContractViolation();
  if (typeof status !== "string" || !STATUSES.has(status)) return socialEntitlementContractViolation();

  const validFromMs = instant(value.valid_from);
  const validUntil = value.valid_until;
  const validUntilMs = validUntil === null || validUntil === undefined ? null : instant(validUntil);

  if (planCode !== "premium") return false;
  if (!PREMIUM_STATUSES.has(status)) return false;
  if (nowMs < validFromMs) return false;
  if (validUntilMs !== null && nowMs > validUntilMs) return false;
  return true;
}

// Resolves the VERIFIED actor only. The owner predicate is explicit and required here, exactly as
// the frozen server taste reader requires: ownership is never inferred from the connection and
// never left to row level security alone, even though the owner-read policy also applies.
export async function resolveSocialEntitlement(
  rowSource: SocialEntitlementRowSource,
  actorUserId: string,
  now: Date
): Promise<SocialEntitlementFact> {
  if (typeof actorUserId !== "string" || actorUserId.length === 0) {
    return socialEntitlementContractViolation();
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return socialEntitlementContractViolation();
  }
  const nowMs = now.getTime();

  const outcome = await rowSource
    .from("subscription_entitlements")
    .select(ENTITLEMENT_COLUMNS)
    .eq("user_id", actorUserId);

  if (!isRecord(outcome)) return socialEntitlementContractViolation();
  // A read failure is a request-level failure. It is never reported as a canonical free tier and
  // never as premium, so infrastructure trouble cannot silently change what an actor may consume.
  if (outcome.error !== null && outcome.error !== undefined) return socialEntitlementContractViolation();
  if (!Array.isArray(outcome.data)) return socialEntitlementContractViolation();

  // No stored entitlement is a resolved canonical free state, not a failure. Every row is admitted
  // and validated, so an unknown plan anywhere in the actor's history still fails closed.
  const grantsPremium = outcome.data.map((row) => rowGrantsPremium(row, nowMs));
  return grantsPremium.some(Boolean) ? PREMIUM : FREE;
}
