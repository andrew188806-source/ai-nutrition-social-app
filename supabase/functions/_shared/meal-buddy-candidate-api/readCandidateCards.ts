// SR-2G-D executor reads. Two statements, both frozen primitives, neither re-implementing any rule.
import { mealBuddyCandidateApiContractViolation } from "./policy.ts";
import type { MealBuddyCandidateCardRow, MealBuddySelectedCard } from "./types.ts";
import {
  defineSocialRuntimeExecutorStatement,
  type SocialRuntimeExecutorTransport
} from "../social-runtime-transport/executorTransactionTransport.ts";
import type { SocialInterestRow } from "../social-interest/types.ts";

// The SR-2G-D card projection over the frozen SR-2G-C pool. The verified actor, the source card id
// opened from the actor-bound ref, and the one server instant are its only arguments: no candidate
// array, no limit, no date, no meal period and no restaurant is expressible here, so a caller cannot
// widen, redirect or re-filter the pool.
// `dining_date` is rendered to text HERE, in SQL, and never converted in JavaScript. The driver maps
// a PostgreSQL `date` onto a JS Date, and turning that back into a calendar day client-side would
// re-open the UTC drift SR-2G-A stored a `date` column to avoid: between 00:00 and 08:00 Taipei it
// yields the previous day. `date::text` is the local calendar fact itself.
const CANDIDATE_CARDS = defineSocialRuntimeExecutorStatement<MealBuddyCandidateCardRow>`
  select candidate_owner_user_id, candidate_card_id, card_type, intention_type,
         restaurant_id, restaurant_name, dining_date::text as dining_date, meal_period
  from social_internal.meal_buddy_candidate_cards_with_restaurant($1::uuid, $2::uuid, $3::timestamptz)
`;

// The frozen SR-2C-R1 interest projection. Bounded by the same exposed-candidate array SR-2C uses.
const CANDIDATE_INTERESTS = defineSocialRuntimeExecutorStatement<SocialInterestRow>`
  select exposure_ordinal, namespace, tag_key, category_key, display_order
  from social_internal.project_public_social_interests($1::uuid, $2::uuid[])
`;

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

function parseCard(row: MealBuddyCandidateCardRow): MealBuddySelectedCard {
  if (
    !isNonEmptyString(row.candidate_owner_user_id) || !isNonEmptyString(row.candidate_card_id) ||
    !isNonEmptyString(row.card_type) || !isNonEmptyString(row.intention_type) ||
    !isNonEmptyString(row.dining_date) || !isNonEmptyString(row.meal_period)
  ) {
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
    mealPeriod: row.meal_period
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
