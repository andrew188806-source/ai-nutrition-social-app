import { mealBuddyCardContractViolation } from "./policy.ts";
import type {
  InternalMealBuddyCardRow,
  MealBuddyCardCounts,
  MealBuddyCardCreateRequest
} from "./types.ts";
import {
  defineSocialRuntimeExecutorStatement,
  type SocialRuntimeExecutorTransport
} from "../social-runtime-transport/executorTransactionTransport.ts";

// The only three statements this module may issue. Each is a single static call into the frozen
// server-internal authority: no table name, predicate, ordering, limit or cap is expressible from
// here, and every value travels as a protocol parameter rather than as SQL text.
type PayloadRow = Readonly<{ payload: unknown }>;

const CREATE_CARD = defineSocialRuntimeExecutorStatement<PayloadRow>`
  select social_internal.create_meal_buddy_card_with_context($1::uuid, $2::text, $3::text, $4::text, $5::text, $6::date, $7::text, $8::time, $9::integer, $10::integer, $11::text) as payload
`;

const LIST_CARDS = defineSocialRuntimeExecutorStatement<PayloadRow>`
  select social_internal.list_owned_meal_buddy_cards_with_context($1::uuid) as payload
`;

const CANCEL_CARD = defineSocialRuntimeExecutorStatement<PayloadRow>`
  select social_internal.cancel_meal_buddy_card($1::uuid, $2::uuid) as payload
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The driver may hand back jsonb as an object or as text depending on column typing; both are
// admitted, anything else is a contract failure rather than a silent empty result.
function payloadOf(rows: readonly PayloadRow[]): Record<string, unknown> {
  if (rows.length !== 1) return mealBuddyCardContractViolation();
  const raw = rows[0].payload;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!isRecord(parsed)) return mealBuddyCardContractViolation();
  return parsed;
}

function parseCounts(value: unknown): MealBuddyCardCounts {
  if (!isRecord(value)) return mealBuddyCardContractViolation();
  const general = Number(value.general);
  const restaurant = Number(value.restaurant);
  if (!Number.isInteger(general) || !Number.isInteger(restaurant) || general < 0 || restaurant < 0) {
    return mealBuddyCardContractViolation();
  }
  return Object.freeze({ general, restaurant });
}

function parseCard(value: unknown): InternalMealBuddyCardRow {
  if (!isRecord(value)) return mealBuddyCardContractViolation();
  const text = (key: string): string => {
    const entry = value[key];
    if (typeof entry !== "string" || entry.length === 0) return mealBuddyCardContractViolation();
    return entry;
  };
  const nullableText = (key: string): string | null => {
    const entry = value[key];
    if (entry === null || entry === undefined) return null;
    if (typeof entry !== "string") return mealBuddyCardContractViolation();
    return entry;
  };
  return Object.freeze({
    id: text("id"),
    card_type: text("card_type"),
    intention_type: text("intention_type"),
    restaurant_id: nullableText("restaurant_id"),
    area: nullableText("area"),
    dining_date: text("dining_date"),
    meal_period: text("meal_period"),
    preferred_time: nullableText("preferred_time"),
    created_at: text("created_at"),
    expires_at: text("expires_at"),
    // SR-2G-F. Absent on every card authored before this round, so nullable rather than required.
    food_context_tag_key: nullableText("food_context_tag_key")
  });
}

export type CreateCardOutcome =
  | { ok: true; card: InternalMealBuddyCardRow; counts: MealBuddyCardCounts }
  | { ok: false; reason: "quota_exceeded" | "invalid_food_context" };

// The database raises this when a submitted context is not a currently selectable, active food tag.
// Matching the sentinel — never a SQLSTATE table, a message or a column name — is what keeps the
// distinction between "your request was wrong" and "our dependency failed" without leaking either.
const INVALID_FOOD_CONTEXT_SENTINEL = "INVALID_FOOD_CONTEXT";

// One transaction: the advisory lock, the active count and the insert are indivisible inside the
// frozen function, so two concurrent creates cannot both claim the final slot.
export async function createOwnedCard(
  transport: SocialRuntimeExecutorTransport,
  actorUserId: string,
  request: MealBuddyCardCreateRequest,
  caps: Readonly<{ general: number; restaurant: number }>
): Promise<CreateCardOutcome> {
  let payload: Record<string, unknown>;
  try {
    payload = await runCreate(transport, actorUserId, request, caps);
  } catch (error) {
    // Exactly one sentinel is translated. Everything else keeps propagating, so a genuine
    // dependency failure can never be mistaken for a rejected request.
    if (error instanceof Error && error.message.includes(INVALID_FOOD_CONTEXT_SENTINEL)) {
      return { ok: false, reason: "invalid_food_context" };
    }
    throw error;
  }

  if (payload.ok === false) {
    if (payload.reason !== "quota_exceeded") return mealBuddyCardContractViolation();
    return { ok: false, reason: "quota_exceeded" };
  }
  return finishCreate(payload);
}

async function runCreate(
  transport: SocialRuntimeExecutorTransport,
  actorUserId: string,
  request: MealBuddyCardCreateRequest,
  caps: Readonly<{ general: number; restaurant: number }>
): Promise<Record<string, unknown>> {
  return await transport.withTransaction(async (transaction) => payloadOf(
    await transaction.query(CREATE_CARD, [
      actorUserId,
      request.cardType,
      request.intentionType,
      request.restaurantId,
      request.area,
      request.diningDate,
      request.mealPeriod,
      request.preferredTime,
      caps.general,
      caps.restaurant,
      // The context the owner chose for their own card. The DATABASE validates it against the
      // canonical catalog; this layer only forwards what the request validator already admitted.
      request.foodContextTagKey
    ])
  ));
}

function finishCreate(payload: Record<string, unknown>): CreateCardOutcome {
  if (payload.ok !== true) return mealBuddyCardContractViolation();
  return { ok: true, card: parseCard(payload.card), counts: parseCounts(payload.counts) };
}

export async function listOwnedCards(
  transport: SocialRuntimeExecutorTransport,
  actorUserId: string
): Promise<{ cards: readonly InternalMealBuddyCardRow[]; counts: MealBuddyCardCounts }> {
  const payload = await transport.withTransaction(async (transaction) => payloadOf(
    await transaction.query(LIST_CARDS, [actorUserId])
  ));
  if (!Array.isArray(payload.cards)) return mealBuddyCardContractViolation();
  return {
    cards: Object.freeze(payload.cards.map(parseCard)),
    counts: parseCounts(payload.counts)
  };
}

// Returns whether a card owned by this actor was affected. A foreign card and a card that never
// existed produce the identical false, so nothing here can confirm a reference named a real card.
export async function cancelOwnedCard(
  transport: SocialRuntimeExecutorTransport,
  actorUserId: string,
  cardId: string
): Promise<boolean> {
  const payload = await transport.withTransaction(async (transaction) => payloadOf(
    await transaction.query(CANCEL_CARD, [actorUserId, cardId])
  ));
  if (typeof payload.ok !== "boolean") return mealBuddyCardContractViolation();
  return payload.ok;
}
