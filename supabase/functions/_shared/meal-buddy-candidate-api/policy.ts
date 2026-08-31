// SR-2G-D Meal Buddy candidate API policy constants.
//
// Every bound here is a restatement of a frozen predecessor bound, never a new one: the exposure cap
// is SR-2B's, the compact visible count is SR-2C-R1's. SR-2G-D introduces no cap of its own.

export const MEAL_BUDDY_CANDIDATE_API_POLICY_VERSION = "meal-buddy-candidate-api-v1" as const;

// The frozen SR-2B Premium exposure cap. SR-2G-D never raises it and never paginates past it.
export const MEAL_BUDDY_CANDIDATE_API_MAXIMUM_CANDIDATES = 10;

// The frozen source identity plus GEO-1D's sole optional context object. Actor, candidate, branch,
// radius and every other authority remain server-derived or fixed policy.
export const MEAL_BUDDY_CANDIDATE_API_REQUEST_KEY = "sourceCardRef" as const;
export const MEAL_BUDDY_CANDIDATE_API_GEO_REQUEST_KEY = "geo" as const;

// Business-control keys a caller must never be able to supply. Presence of any one is a rejected
// request, not a silently ignored field: silently ignoring would let a client believe it had
// influenced ranking, exposure, eligibility or identity.
export const MEAL_BUDDY_CANDIDATE_API_FORBIDDEN_REQUEST_KEYS = Object.freeze([
  "actorUserId", "sourceCardId", "ownerUserId", "candidateUserId", "candidateRef",
  "candidateCardRef", "limit", "page", "cursor", "tier", "entitlement", "isPremium",
  "clock", "authorityInstant", "diningDate", "mealPeriod", "restaurantId", "branchId", "area",
  "latitude", "longitude", "radiusMeters", "candidateCoordinates",
  "interests", "interestFilters", "tasteWeights", "rankingWeights"
]);

// A contract violation is a programming error in server composition, never a client-visible branch.
export function mealBuddyCandidateApiContractViolation(): never {
  throw new Error("MEAL_BUDDY_CANDIDATE_API_CONTRACT_VIOLATION");
}
