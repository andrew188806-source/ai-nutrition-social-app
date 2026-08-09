// TS-5 — the COLD START EVIDENCE policy authority.
//
// Cold start describes EVIDENCE READINESS and the structural reason a comparison was limited. It
// never describes how good a match is, and it never decides anything: whether to show, hide, rank or
// proceed with a pair is Social Runtime consumer policy, and the shared adapter above this layer is
// composition only.
//
// Independent version line. It reads six frozen authorities and bumps none of them; a later change
// to how evidence state is classified bumps this one alone.
export const COLD_START_POLICY_VERSION = "cold-start-policy-v1" as const;

// The closed signal-family set. These are the independent families the frozen layers already
// produce; TS-5 reports which of them carry usable information and which rest on degraded sources.
export const COLD_START_SIGNAL_FAMILIES = [
  "taste",
  "meal_pattern",
  "dining",
  "social_logistics",
  "goal",
  "restriction"
] as const;

// The comparison families. `restriction` is deliberately absent: it is an eligibility state, not a
// comparison, so "no comparable evidence anywhere" must not be silenced by a restriction verdict
// happening to exist.
export const COLD_START_COMPARISON_FAMILIES = [
  "taste",
  "meal_pattern",
  "dining",
  "social_logistics",
  "goal"
] as const;

// Closed reason vocabulary. Structural descriptions only — never a judgement, never a raw value, and
// never a restriction statement: restriction safety lives in its own field, because folding it into a
// generic explanation is exactly how "cold start" becomes an excuse to discount a dietary warning.
export const COLD_START_REASON_CODES = [
  "no_comparable_taste_evidence",
  "limited_taste_evidence",
  "incomplete_taste_sources",
  "incomplete_history",
  "context_only_evidence",
  "goal_only_evidence",
  "no_comparable_evidence",
  "unsupported_schema"
] as const;

export type ColdStartReasonCodeName = (typeof COLD_START_REASON_CODES)[number];

// Deterministic ordering authority: reason codes are emitted in this fixed declaration order, never
// in discovery order, so two runs over the same pair produce an identical sequence.
const REASON_CODE_ORDER = new Map<ColdStartReasonCodeName, number>(
  COLD_START_REASON_CODES.map((code, index) => [code, index])
);

export function orderColdStartReasonCodes(
  codes: Iterable<ColdStartReasonCodeName>
): readonly ColdStartReasonCodeName[] {
  return Object.freeze(
    [...new Set(codes)].sort(
      (left, right) => (REASON_CODE_ORDER.get(left) ?? 0) - (REASON_CODE_ORDER.get(right) ?? 0)
    )
  );
}

// The TS-4 basis values that mean the taste evidence rests on degraded sources rather than on a
// short list of preferences. Inherited from the frozen confidence vocabulary rather than re-derived,
// so this policy introduces no boundary of its own.
export const COLD_START_DEGRADED_SOURCE_BASES: readonly string[] = Object.freeze([
  "source_unavailable",
  "incomplete_history"
]);

// The TS-4 basis that means coverage was minimal. Also inherited: TS-4 sets it at the single-family
// boundary, which itself mirrors the frozen taste comparator's own limited-evidence rule. TS-5 adds
// no threshold of its own and compares no number.
export const COLD_START_LIMITED_COVERAGE_BASIS = "limited_evidence_coverage" as const;
