// SR-2G-F meal/menu context types.
//
// The context state is a CLOSED FINITE VOCABULARY, never a number. There is deliberately no score,
// no weight, no distance, no similarity and no confidence here: a float would immediately invite
// blending with the frozen SR-2A Taste score, which is the one thing this round must not do.
export const MEAL_BUDDY_CONTEXT_STATES = Object.freeze(["matched", "neutral", "unsupported"] as const);

export type MealBuddyContextState = (typeof MEAL_BUDDY_CONTEXT_STATES)[number];

// The canonical bucket sequence. `matched` first because the actor asked for that context;
// `unsupported` last because the candidate explicitly declared a different cuisine family for this
// same meal. Nobody is removed — the least compatible bucket is still in the universe, and with a
// short exposure prefix it simply rarely survives the cap.
export const MEAL_BUDDY_CONTEXT_BUCKET_ORDER = Object.freeze(
  ["matched", "neutral", "unsupported"] as const
);

// One classified row of the SR-2G-F primitive, which composes the frozen SR-2G-D bridge.
export type MealBuddyContextCandidateRow = Readonly<{
  candidate_owner_user_id: string;
  candidate_card_id: string;
  card_type: string;
  intention_type: string;
  restaurant_id: string | null;
  restaurant_name: string | null;
  dining_date: string;
  meal_period: string;
  context_state: string;
}>;
