export const SOCIAL_EXPOSURE_POLICY_VERSION = "social-exposure-v1" as const;

// Social candidate exposure only. These caps govern how much of the canonical SR-2A order an actor
// may consume, and nothing else: not card opportunities, invite, match, chat or swipe quotas, not
// next-meal candidates, not multiplayer capacity, and not pagination.
export const SOCIAL_EXPOSURE_FREE_CAP = 3 as const;
export const SOCIAL_EXPOSURE_PREMIUM_CAP = 10 as const;

export const SOCIAL_EXPOSURE_CAPS = Object.freeze({
  free: SOCIAL_EXPOSURE_FREE_CAP,
  premium: SOCIAL_EXPOSURE_PREMIUM_CAP
} as const);

// SR-2B V1 recognizes exactly these two plan codes. Any other stored plan_code is a contract
// failure, never a silent downgrade to free and never an upgrade to premium.
export const SOCIAL_EXPOSURE_PLAN_CODES = Object.freeze(["free", "premium"] as const);

// The frozen entitlement_status vocabulary, and the subset that keeps a premium plan entitled.
export const SOCIAL_ENTITLEMENT_STATUSES = Object.freeze([
  "active",
  "expired",
  "cancelled",
  "grace_period"
] as const);

export const SOCIAL_ENTITLEMENT_PREMIUM_STATUSES = Object.freeze([
  "active",
  "grace_period"
] as const);

export const SOCIAL_EXPOSURE_CONTRACT_ERROR = "social_entitlement_contract_violated" as const;

export function socialEntitlementContractViolation(): never {
  throw new Error(SOCIAL_EXPOSURE_CONTRACT_ERROR);
}
