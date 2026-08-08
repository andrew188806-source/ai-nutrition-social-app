// TS-3C — closed reason-code vocabulary for social context compatibility.
//
// Separate vocabulary from the taste reason codes on purpose. "You both prefer to split the bill" is
// not a statement about taste, and a shared vocabulary would eventually let one render as the other.
//
// Codes carry no evidence values at all: never a meal type, never a dining style, never a payment
// preference, never a user id, never a count. That is what keeps an explanation safe to render even
// though the comparator reads preference rows classified `internal`.
export const SOCIAL_CONTEXT_COMPATIBILITY_REASON_CODES = [
  "shared_meal_type_preference",
  "similar_dining_style",
  "compatible_payment_preference",
  "limited_context_evidence"
] as const;

export type SocialContextCompatibilityReasonCode =
  (typeof SOCIAL_CONTEXT_COMPATIBILITY_REASON_CODES)[number];

// Deterministic ordering authority: codes are emitted in this fixed declaration order, never in
// discovery order, so two runs over the same pair — and the same pair supplied in either argument
// order — produce an identical sequence.
const REASON_CODE_RANK = new Map<SocialContextCompatibilityReasonCode, number>(
  SOCIAL_CONTEXT_COMPATIBILITY_REASON_CODES.map((code, index) => [code, index])
);

export function orderSocialContextCompatibilityReasonCodes(
  codes: Iterable<SocialContextCompatibilityReasonCode>
): readonly SocialContextCompatibilityReasonCode[] {
  return [...new Set(codes)].sort(
    (left, right) => (REASON_CODE_RANK.get(left) ?? 0) - (REASON_CODE_RANK.get(right) ?? 0)
  );
}
