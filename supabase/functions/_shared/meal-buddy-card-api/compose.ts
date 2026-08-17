import {
  MEAL_BUDDY_CARD_WRITE_POLICY_VERSION,
  mealBuddyCardContractViolation,
  resolveMealBuddyCardCaps
} from "./policy.ts";
import { cancelOwnedCard, createOwnedCard, listOwnedCards } from "./runtime.ts";
import type {
  InternalMealBuddyCardRow,
  MealBuddyCardCancelResponse,
  MealBuddyCardCounts,
  MealBuddyCardCreateRequest,
  MealBuddyCardCreateResponse,
  MealBuddyCardEntitlementRowSource,
  MealBuddyCardListResponse,
  MealBuddyCardQuotaDto,
  OwnedMealBuddyCardDto
} from "./types.ts";
import { resolveSocialEntitlement } from "../social-exposure/index.ts";
import type { SocialEntitlementRowSource } from "../social-exposure/types.ts";
import {
  createMealBuddyCardRefCipher,
  MEAL_BUDDY_CARD_REF_PURPOSE_SOURCE,
  type MealBuddyCardRefCipher
} from "../meal-buddy-card-ref/index.ts";
import type { SocialRuntimeExecutorTransport } from "../social-runtime-transport/executorTransactionTransport.ts";

export type MealBuddyCardComposition = Readonly<{
  transport: SocialRuntimeExecutorTransport;
  entitlementRowSource: MealBuddyCardEntitlementRowSource;
  cardRefKey: Uint8Array;
  actorUserId: string;
  requestInstant: Date;
}>;

export type MealBuddyCardCreateOutcome =
  | { ok: true; value: MealBuddyCardCreateResponse }
  | { ok: false; errorCode: "card_quota_exceeded" };

function requireActor(actorUserId: string): string {
  if (typeof actorUserId !== "string" || actorUserId.length === 0) return mealBuddyCardContractViolation();
  return actorUserId;
}

function requireInstant(instant: Date): Date {
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) return mealBuddyCardContractViolation();
  return instant;
}

// The raw uuid is consumed here and nowhere else: it is sealed into a source reference and the row
// it came from is discarded. Nothing downstream of this function can see a card id.
async function toOwnedCardDto(
  cipher: MealBuddyCardRefCipher,
  actorUserId: string,
  row: InternalMealBuddyCardRow,
  issuedAt: Date
): Promise<OwnedMealBuddyCardDto> {
  const sourceCardRef = await cipher.seal(actorUserId, MEAL_BUDDY_CARD_REF_PURPOSE_SOURCE, row.id, issuedAt);
  if (typeof sourceCardRef !== "string" || sourceCardRef.length === 0) return mealBuddyCardContractViolation();
  // Last-line structural assertion: the internal identifier must not survive into the client value.
  if (sourceCardRef.includes(row.id) || sourceCardRef.includes(actorUserId)) {
    return mealBuddyCardContractViolation();
  }
  return Object.freeze({
    sourceCardRef,
    cardType: row.card_type as OwnedMealBuddyCardDto["cardType"],
    intentionType: row.intention_type as OwnedMealBuddyCardDto["intentionType"],
    restaurantId: row.restaurant_id,
    area: row.area,
    diningDate: row.dining_date,
    mealPeriod: row.meal_period as OwnedMealBuddyCardDto["mealPeriod"],
    preferredTime: row.preferred_time,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  });
}

function toQuotaDto(
  counts: MealBuddyCardCounts,
  caps: Readonly<{ general: number; restaurant: number }>
): MealBuddyCardQuotaDto {
  return Object.freeze({
    general: Object.freeze({ used: counts.general, limit: caps.general }),
    restaurant: Object.freeze({ used: counts.restaurant, limit: caps.restaurant })
  });
}

// Entitlement is resolved through the frozen SR-2B canonical resolver on the AUTHENTICATED
// user-scoped client. The caps it produces are server authority; the class itself is never
// disclosed to the client, only the numbers it implies.
async function resolveCaps(composition: MealBuddyCardComposition) {
  const entitlement = await resolveSocialEntitlement(
    composition.entitlementRowSource as unknown as SocialEntitlementRowSource,
    composition.actorUserId,
    composition.requestInstant
  );
  return resolveMealBuddyCardCaps(entitlement.class);
}

export async function composeMealBuddyCardCreate(
  composition: MealBuddyCardComposition,
  request: MealBuddyCardCreateRequest
): Promise<MealBuddyCardCreateOutcome> {
  const actorUserId = requireActor(composition.actorUserId);
  const requestInstant = requireInstant(composition.requestInstant);
  const caps = await resolveCaps(composition);

  const outcome = await createOwnedCard(composition.transport, actorUserId, request, caps);
  if (!outcome.ok) return { ok: false, errorCode: "card_quota_exceeded" };

  const cipher = createMealBuddyCardRefCipher(composition.cardRefKey);
  return {
    ok: true,
    value: Object.freeze({
      policyVersion: MEAL_BUDDY_CARD_WRITE_POLICY_VERSION,
      card: await toOwnedCardDto(cipher, actorUserId, outcome.card, requestInstant),
      quota: toQuotaDto(outcome.counts, caps)
    })
  };
}

export async function composeMealBuddyCardList(
  composition: MealBuddyCardComposition
): Promise<MealBuddyCardListResponse> {
  const actorUserId = requireActor(composition.actorUserId);
  const requestInstant = requireInstant(composition.requestInstant);
  const caps = await resolveCaps(composition);

  const { cards, counts } = await listOwnedCards(composition.transport, actorUserId);
  const cipher = createMealBuddyCardRefCipher(composition.cardRefKey);
  // A fresh reference per row per request. References are not identity and are never reused.
  const dtos: OwnedMealBuddyCardDto[] = [];
  for (const row of cards) dtos.push(await toOwnedCardDto(cipher, actorUserId, row, requestInstant));

  return Object.freeze({
    policyVersion: MEAL_BUDDY_CARD_WRITE_POLICY_VERSION,
    cards: Object.freeze(dtos),
    quota: toQuotaDto(counts, caps)
  });
}

export type MealBuddyCardCancelOutcome =
  | { ok: true; value: MealBuddyCardCancelResponse }
  | { ok: false; errorCode: "invalid_request" };

export async function composeMealBuddyCardCancel(
  composition: MealBuddyCardComposition,
  sourceCardRef: string
): Promise<MealBuddyCardCancelOutcome> {
  const actorUserId = requireActor(composition.actorUserId);
  const requestInstant = requireInstant(composition.requestInstant);
  const cipher = createMealBuddyCardRefCipher(composition.cardRefKey);

  // The reference must open for THIS actor and for the source purpose. A candidate-purpose
  // reference, another actor's reference, a tampered reference and an expired reference are one
  // indistinguishable failure.
  let cardId: string;
  try {
    const claims = await cipher.open(actorUserId, MEAL_BUDDY_CARD_REF_PURPOSE_SOURCE, sourceCardRef, requestInstant);
    cardId = claims.cardId;
  } catch {
    return { ok: false, errorCode: "invalid_request" };
  }

  // Ownership is re-verified in the statement itself; possessing a reference is never authority.
  const cancelled = await cancelOwnedCard(composition.transport, actorUserId, cardId);
  if (!cancelled) return { ok: false, errorCode: "invalid_request" };

  return {
    ok: true,
    value: Object.freeze({
      policyVersion: MEAL_BUDDY_CARD_WRITE_POLICY_VERSION,
      cancelled: true
    })
  };
}
