// SR-2G-F meal/menu context policy constants.
//
// This module introduces NO cap, NO weight, NO score, NO threshold and NO tunable of any kind. The
// exposure caps stay SR-2B's, the ranking stays SR-2A's, and hard eligibility stays SR-2G-C's.
// Everything SR-2G-F adds is a closed vocabulary and a fixed bucket sequence.

export const MEAL_BUDDY_CONTEXT_POLICY_VERSION = "meal-buddy-context-v1" as const;

// The catalog namespace SR-2G-F is allowed to read. The `general` namespace — entertainment, gaming,
// fitness and the rest — is presentation-only and is never meal-context evidence.
export const MEAL_BUDDY_CONTEXT_NAMESPACE = "food" as const;

// Namespaces and concepts that must never reach a context decision. Health, restriction, allergy and
// nutrition data are excluded by design, not by omission: meal context is an explicit food
// preference, never a medical inference about somebody.
export const MEAL_BUDDY_CONTEXT_FORBIDDEN_EVIDENCE = Object.freeze([
  "general", "allergen", "allergy", "restriction", "condition", "medical", "diagnosis",
  "healthGoal", "nutritionGoal", "calorie", "macro", "bmi", "weight_goal"
]);

// A contract violation is a programming error in server composition, never a client-visible branch.
export function mealBuddyContextContractViolation(): never {
  throw new Error("MEAL_BUDDY_CONTEXT_CONTRACT_VIOLATION");
}
