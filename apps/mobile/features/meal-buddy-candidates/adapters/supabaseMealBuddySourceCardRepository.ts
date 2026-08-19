import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import type { MealBuddySourceCardRepository } from "../ports";
import {
  errSourceCards,
  MealBuddyCandidateClientError,
  okSourceCards,
  type MealBuddySourceCard
} from "../types";
import {
  MEAL_BUDDY_CARD_LIST_FUNCTION_NAME,
  type SupabaseMealBuddyClientLike
} from "../supabaseMealBuddyCandidateContracts";
import { mapInvokeErrorToClientError } from "./supabaseMealBuddyErrors";

export type SupabaseMealBuddySourceCardRepositoryOptions = {
  authPort: ConsumerAuthPort;
  mealBuddyClient: SupabaseMealBuddyClientLike;
};

const CARD_TYPES = new Set(["general", "restaurant"]);
const INTENTIONS = new Set(["chat_first", "eat_together"]);
const MEAL_PERIODS = new Set(["breakfast", "lunch", "dinner", "late_night"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The frozen SR-2G-B list response carries more owner-facing detail than SR-2G-E needs. Only the
// fields required to CHOOSE a source card and to send its reference are admitted; `area`,
// `preferredTime`, `createdAt`, `expiresAt` and the quota block are deliberately dropped at this
// boundary so no later screen can start depending on them through this feature.
function adaptSourceCard(value: unknown): MealBuddySourceCard | null {
  if (!isRecord(value)) return null;
  const { sourceCardRef, cardType, intentionType, restaurantId, diningDate, mealPeriod } = value;
  if (typeof sourceCardRef !== "string" || !sourceCardRef.startsWith("mbc1.")) return null;
  if (typeof cardType !== "string" || !CARD_TYPES.has(cardType)) return null;
  if (typeof intentionType !== "string" || !INTENTIONS.has(intentionType)) return null;
  if (typeof mealPeriod !== "string" || !MEAL_PERIODS.has(mealPeriod)) return null;
  // A dining date is a local calendar fact and is kept as the exact string the server sent.
  if (typeof diningDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(diningDate)) return null;
  if (restaurantId !== null && typeof restaurantId !== "string") return null;
  return Object.freeze({
    sourceCardRef,
    cardType: cardType as MealBuddySourceCard["cardType"],
    intentionType: intentionType as MealBuddySourceCard["intentionType"],
    restaurantId: (restaurantId as string | null) ?? null,
    diningDate,
    mealPeriod: mealPeriod as MealBuddySourceCard["mealPeriod"]
  });
}

// Reuses the caller's already-authenticated Supabase client. This adapter never builds a second
// (admin/service-role) client, never accepts a caller-supplied owner, and never attaches an
// Authorization header itself — JWT propagation is handled entirely by the Supabase SDK.
//
// The order the server returned is preserved exactly. No sorting, filtering by date, "pick the
// soonest" or other selection rule lives here: choosing among the actor's own cards is a product
// decision for the screen, not something this transport may quietly make.
export class SupabaseMealBuddySourceCardRepository implements MealBuddySourceCardRepository {
  readonly source = "supabase-live" as const;

  constructor(private readonly options: SupabaseMealBuddySourceCardRepositoryOptions) {}

  async listSourceCards() {
    const session = await this.options.authPort.getCurrentSession();
    if (!session.ok || !session.value) {
      return errSourceCards(new MealBuddyCandidateClientError(
        "authentication_required", "Meal Buddy cards require an authenticated session."));
    }

    let invokeResult;
    try {
      // The empty body IS the frozen contract: the actor is the verified caller and no other
      // owner's card is reachable.
      invokeResult = await this.options.mealBuddyClient.functions.invoke(
        MEAL_BUDDY_CARD_LIST_FUNCTION_NAME, { body: {} }
      );
    } catch {
      return errSourceCards(new MealBuddyCandidateClientError(
        "network_error", "Could not reach the Meal Buddy service."));
    }
    if (invokeResult.error) {
      return errSourceCards(await mapInvokeErrorToClientError(invokeResult.error));
    }

    const body = invokeResult.data;
    if (!isRecord(body) || !Array.isArray(body.cards)) {
      return errSourceCards(new MealBuddyCandidateClientError(
        "invalid_server_response", "The Meal Buddy card response failed local validation."));
    }
    const cards: MealBuddySourceCard[] = [];
    for (const entry of body.cards) {
      const card = adaptSourceCard(entry);
      // A card the client cannot understand is a contract failure, never a row to skip: skipping
      // would silently shrink the actor's own card list.
      if (!card) {
        return errSourceCards(new MealBuddyCandidateClientError(
          "invalid_server_response", "The Meal Buddy card response failed local validation."));
      }
      cards.push(card);
    }
    return okSourceCards(cards);
  }
}
