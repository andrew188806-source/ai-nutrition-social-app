export type NextMealCandidateEntitlement = "free" | "premium";

const nextMealCandidateCountByEntitlement: Record<NextMealCandidateEntitlement, number> = {
  free: 3,
  premium: 10
};

export function normalizeNextMealCandidateEntitlement(value: unknown): NextMealCandidateEntitlement {
  return value === "premium" ? "premium" : "free";
}

export function getNextMealCandidateCount(value: unknown) {
  return nextMealCandidateCountByEntitlement[normalizeNextMealCandidateEntitlement(value)];
}
