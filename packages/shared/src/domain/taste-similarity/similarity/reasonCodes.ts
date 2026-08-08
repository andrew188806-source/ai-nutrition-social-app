// TS-3A — closed reason-code vocabulary.
//
// Reason codes are the ONLY thing a caller may turn into user-facing wording. They are enum values
// carrying no evidence values at all: never a cuisine name, never a flavor, never a restaurant or
// menu item id, never a count. That is what keeps an explanation safe to render even though the
// scorer itself reads evidence classified `sensitive_internal` elsewhere in the snapshot.
//
// Shared positive preference and shared avoidance get DIFFERENT codes on purpose. "You both like
// Japanese food" and "you both avoid coriander" are not the same statement, and collapsing them
// would make an avoidance render as a liking.
export const TASTE_SIMILARITY_REASON_CODES = [
  "shared_cuisine_preference",
  "shared_flavor_avoidance",
  "shared_spice_preference",
  "shared_favorite_restaurant",
  "shared_favorite_menu_item",
  // TS-3B-R1. Repeated CONSUMPTION is a weaker, observed signal than an explicit favorite, so it
  // gets its own codes rather than reusing the favorite codes. "You have both eaten there more than
  // once" must never be renderable as "you both marked it a favorite". The codes are ranked below
  // the favorite codes, which keeps every pre-R1 reason sequence byte-identical.
  "shared_repeated_restaurant_consumption",
  "shared_repeated_menu_item_consumption",
  "limited_evidence"
] as const;

export type TasteSimilarityReasonCode = (typeof TASTE_SIMILARITY_REASON_CODES)[number];

// Deterministic ordering authority: reason codes are emitted in this fixed declaration order, never
// in discovery order, so two runs over the same pair — and the same pair supplied in either
// argument order — produce an identical sequence.
const REASON_CODE_RANK = new Map<TasteSimilarityReasonCode, number>(
  TASTE_SIMILARITY_REASON_CODES.map((code, index) => [code, index])
);

export function orderTasteSimilarityReasonCodes(
  codes: Iterable<TasteSimilarityReasonCode>
): readonly TasteSimilarityReasonCode[] {
  return [...new Set(codes)].sort(
    (left, right) => (REASON_CODE_RANK.get(left) ?? 0) - (REASON_CODE_RANK.get(right) ?? 0)
  );
}
