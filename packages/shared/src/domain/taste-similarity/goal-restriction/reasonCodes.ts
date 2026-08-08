// TS-3D — closed reason-code vocabulary for goal compatibility and restriction eligibility.
//
// Its own vocabulary, separate from the taste and social-context codes. "You are both cutting" and
// "one of you has a constraint we could not classify" are not statements about taste or logistics,
// and a shared vocabulary would eventually let one render as another.
//
// Restriction evidence is classified `sensitive_internal` upstream, so these codes are the ONLY
// thing a caller may turn into wording. They carry no evidence values at all: never a restriction
// label, never a severity string, never a goal label, never a macro target, never a user id.
export const GOAL_RESTRICTION_REASON_CODES = [
  "shared_goal_label",
  "different_goal_label",
  "limited_goal_evidence",
  "shared_soft_restriction",
  "restriction_requires_attention",
  "restriction_evidence_unknown"
] as const;

export type GoalRestrictionReasonCode = (typeof GOAL_RESTRICTION_REASON_CODES)[number];

// Deterministic ordering authority: codes are emitted in this fixed declaration order, never in
// discovery order, so two runs over the same pair — and the same pair supplied in either argument
// order — produce an identical sequence.
const REASON_CODE_RANK = new Map<GoalRestrictionReasonCode, number>(
  GOAL_RESTRICTION_REASON_CODES.map((code, index) => [code, index])
);

export function orderGoalRestrictionReasonCodes(
  codes: Iterable<GoalRestrictionReasonCode>
): readonly GoalRestrictionReasonCode[] {
  return [...new Set(codes)].sort(
    (left, right) => (REASON_CODE_RANK.get(left) ?? 0) - (REASON_CODE_RANK.get(right) ?? 0)
  );
}
