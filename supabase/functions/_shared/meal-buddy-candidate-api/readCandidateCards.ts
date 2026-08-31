// SR-2G-D executor reads. Two statements, both frozen primitives, neither re-implementing any rule.
import { mealBuddyCandidateApiContractViolation } from "./policy.ts";
import type {
  MealBuddyCardBranchContext,
  MealBuddyCardBranchContextRow,
  MealBuddyCandidateCardRow,
  MealBuddySelectedCard
} from "./types.ts";
import {
  defineSocialRuntimeExecutorStatement,
  type SocialRuntimeExecutorTransport
} from "../social-runtime-transport/executorTransactionTransport.ts";
import type { SocialInterestRow } from "../social-interest/types.ts";
import { MEAL_BUDDY_CONTEXT_STATES } from "../meal-buddy-context/types.ts";

// The SR-2G-D card projection over the frozen SR-2G-C pool. The verified actor, the source card id
// opened from the actor-bound ref, and the one server instant are its only arguments: no candidate
// array, no limit, no date, no meal period and no restaurant is expressible here, so a caller cannot
// widen, redirect or re-filter the pool.
// `dining_date` is rendered to text HERE, in SQL, and never converted in JavaScript. The driver maps
// a PostgreSQL `date` onto a JS Date, and turning that back into a calendar day client-side would
// re-open the UTC drift SR-2G-A stored a `date` column to avoid: between 00:00 and 08:00 Taipei it
// yields the previous day. `date::text` is the local calendar fact itself.
// SR-2G-F reads the CONTEXT primitive, which calls the SR-2G-D bridge, which calls the frozen
// SR-2G-C pool. The argument list is unchanged — still only the verified actor, the source card id
// opened from the actor-bound ref, and the one server instant — so a caller still cannot express a
// context, a weight, a dish or a filter. The context is resolved from the actor's own card inside
// the primitive.
const CANDIDATE_CARDS = defineSocialRuntimeExecutorStatement<MealBuddyCandidateCardRow>`
  select candidate_owner_user_id, candidate_card_id, card_type, intention_type,
         restaurant_id, restaurant_name, dining_date::text as dining_date, meal_period,
         context_state
  from social_internal.canonical_meal_buddy_context_candidates($1::uuid, $2::uuid, $3::timestamptz)
`;

// The frozen SR-2C-R1 interest projection. Bounded by the same exposed-candidate array SR-2C uses.
const CANDIDATE_INTERESTS = defineSocialRuntimeExecutorStatement<SocialInterestRow>`
  select exposure_ordinal, namespace, tag_key, category_key, display_order
  from social_internal.project_public_social_interests($1::uuid, $2::uuid[])
`;

// GEO-1D-P0's sealed exact selected-card binding. This calls the bounded private reader only; it
// never reads the table directly and cannot infer a branch from restaurant identity.
const CARD_BRANCH_CONTEXTS = defineSocialRuntimeExecutorStatement<MealBuddyCardBranchContextRow>`
  select card_id::text, restaurant_id::text, branch_id::text
  from social_internal.read_meal_buddy_card_branch_context($1::uuid[])
`;
const CARD_BRANCH_CONTEXT_READ_LIMIT = 200;

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

const CONTEXT_STATES = new Set<string>(MEAL_BUDDY_CONTEXT_STATES);

function parseCard(row: MealBuddyCandidateCardRow): MealBuddySelectedCard {
  if (
    !isNonEmptyString(row.candidate_owner_user_id) || !isNonEmptyString(row.candidate_card_id) ||
    !isNonEmptyString(row.card_type) || !isNonEmptyString(row.intention_type) ||
    !isNonEmptyString(row.dining_date) || !isNonEmptyString(row.meal_period)
  ) {
    return mealBuddyCandidateApiContractViolation();
  }
  // A state outside the closed vocabulary fails the request rather than being coerced to a default:
  // coercing would let a broken classification masquerade as "everyone is neutral".
  if (!isNonEmptyString(row.context_state) || !CONTEXT_STATES.has(row.context_state)) {
    return mealBuddyCandidateApiContractViolation();
  }
  return Object.freeze({
    ownerUserId: row.candidate_owner_user_id,
    cardId: row.candidate_card_id,
    cardType: row.card_type,
    intentionType: row.intention_type,
    restaurantId: row.restaurant_id ?? null,
    restaurantName: row.restaurant_name ?? null,
    diningDate: row.dining_date,
    mealPeriod: row.meal_period,
    contextState: row.context_state as MealBuddySelectedCard["contextState"]
  });
}

// Returns the owner -> exact selected card binding. SR-2G-C already reduced each owner to one card,
// so a second card for the same owner would mean the frozen guarantee had been violated: that is a
// contract violation, never something this module resolves by picking a winner itself.
export async function readMealBuddyCandidateCards(
  transport: SocialRuntimeExecutorTransport,
  actorUserId: string,
  sourceCardId: string,
  authorityInstant: Date
): Promise<readonly MealBuddySelectedCard[]> {
  if (!isNonEmptyString(actorUserId) || !isNonEmptyString(sourceCardId)) {
    return mealBuddyCandidateApiContractViolation();
  }
  if (!(authorityInstant instanceof Date) || !Number.isFinite(authorityInstant.getTime())) {
    return mealBuddyCandidateApiContractViolation();
  }
  const rows = await transport.withTransaction((transaction) =>
    transaction.query(CANDIDATE_CARDS, [actorUserId, sourceCardId, authorityInstant.toISOString()])
  );
  const cards = rows.map(parseCard);
  const owners = new Set(cards.map((card) => card.ownerUserId));
  if (owners.size !== cards.length) return mealBuddyCandidateApiContractViolation();
  // The actor can never be their own candidate; the frozen pool already excludes them.
  if (owners.has(actorUserId)) return mealBuddyCandidateApiContractViolation();
  return Object.freeze(cards);
}

// Reads branch context only for cards already selected by frozen Social authority. The P0 function
// accepts at most 200 ids, so larger complete pools are chunked inside one executor transaction;
// there is no candidate cap and no alternate-card lookup. Missing rows remain explicitly unbound.
export async function readMealBuddyCandidateBranchContexts(
  transport: SocialRuntimeExecutorTransport,
  selectedCards: readonly MealBuddySelectedCard[]
): Promise<ReadonlyMap<string, MealBuddyCardBranchContext>> {
  if (!Array.isArray(selectedCards)) return mealBuddyCandidateApiContractViolation();
  if (selectedCards.length === 0) return new Map();
  const selectedByCardId = new Map(selectedCards.map((card) => [card.cardId, card]));
  if (selectedByCardId.size !== selectedCards.length) return mealBuddyCandidateApiContractViolation();

  const rows = await transport.withTransaction(async (transaction) => {
    const result: MealBuddyCardBranchContextRow[] = [];
    const cardIds = [...selectedByCardId.keys()];
    for (let index = 0; index < cardIds.length; index += CARD_BRANCH_CONTEXT_READ_LIMIT) {
      result.push(...await transaction.query(
        CARD_BRANCH_CONTEXTS,
        [cardIds.slice(index, index + CARD_BRANCH_CONTEXT_READ_LIMIT)]
      ));
    }
    return result;
  });

  const contexts = new Map<string, MealBuddyCardBranchContext>();
  for (const row of rows) {
    if (!isNonEmptyString(row.card_id) || !isNonEmptyString(row.restaurant_id)
      || !isNonEmptyString(row.branch_id)) return mealBuddyCandidateApiContractViolation();
    const selected = selectedByCardId.get(row.card_id);
    if (!selected || selected.restaurantId !== row.restaurant_id || contexts.has(row.card_id)) {
      return mealBuddyCandidateApiContractViolation();
    }
    contexts.set(row.card_id, Object.freeze({
      cardId: row.card_id,
      restaurantId: row.restaurant_id,
      branchId: row.branch_id
    }));
  }
  return contexts;
}

// Reads the CURRENT profile interests for exactly the exposed candidate owners. Nothing here reads a
// Meal Buddy card, a snapshot, a Taste profile, a favorite or a meal record.
export async function readExposedCandidateInterests(
  transport: SocialRuntimeExecutorTransport,
  actorUserId: string,
  exposedOwnerUserIds: readonly string[]
): Promise<readonly SocialInterestRow[]> {
  if (!isNonEmptyString(actorUserId)) return mealBuddyCandidateApiContractViolation();
  if (!Array.isArray(exposedOwnerUserIds) || !exposedOwnerUserIds.every(isNonEmptyString)) {
    return mealBuddyCandidateApiContractViolation();
  }
  // An empty exposure needs no read at all, and the primitive would reject a zero-length array only
  // by returning nothing anyway.
  if (exposedOwnerUserIds.length === 0) return Object.freeze([]);
  const rows = await transport.withTransaction((transaction) =>
    transaction.query(CANDIDATE_INTERESTS, [actorUserId, exposedOwnerUserIds])
  );
  return Object.freeze(rows.map((row) => Object.freeze({
    exposure_ordinal: Number(row.exposure_ordinal),
    namespace: String(row.namespace),
    tag_key: String(row.tag_key),
    category_key: String(row.category_key),
    display_order: Number(row.display_order)
  })));
}
