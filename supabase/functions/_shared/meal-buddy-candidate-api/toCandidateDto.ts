// SR-2G-D final client DTO composition.
//
// Runs strictly LAST, after the frozen SR-2B exposure has already decided who is visible. Nothing
// here can add, remove or reorder a candidate: it walks the SR-2C projection in the order that
// projection produced, looks each survivor's card up from the owner->card binding SR-2G-C fixed
// before ranking, and seals two references. There is no ranking rule, no exposure rule, no
// eligibility rule and no interest hierarchy in this module.
import {
  MEAL_BUDDY_CANDIDATE_API_MAXIMUM_CANDIDATES,
  MEAL_BUDDY_CANDIDATE_API_POLICY_VERSION,
  mealBuddyCandidateApiContractViolation
} from "./policy.ts";
import type {
  MealBuddyCandidateApiResponse,
  MealBuddyCandidateCardDto,
  MealBuddyCandidateDto,
  MealBuddyCandidateInterestsDto,
  MealBuddySelectedCard
} from "./types.ts";
import {
  aggregateInterestCategories,
  collectProfileInterests,
  deriveCompactInterests
} from "../social-interest/aggregate.ts";
import type { SocialInterestRow } from "../social-interest/types.ts";
import type { SocialExposureResult } from "../social-exposure/types.ts";
import type { SocialProfileProjectionResult } from "../social-profile/types.ts";
import type { SocialCandidateRefCipher } from "../social-candidate-ref/types.ts";
import { MEAL_BUDDY_CARD_REF_PURPOSE_CANDIDATE } from "../meal-buddy-card-ref/policy.ts";
import type { MealBuddyCardRefCipher } from "../meal-buddy-card-ref/types.ts";

export type MealBuddyCandidateDtoComposition = Readonly<{
  actorUserId: string;
  exposure: SocialExposureResult;
  projection: SocialProfileProjectionResult;
  interestRows: readonly SocialInterestRow[];
  cardByOwner: ReadonlyMap<string, MealBuddySelectedCard>;
  candidateCipher: SocialCandidateRefCipher;
  cardCipher: MealBuddyCardRefCipher;
  requestInstant: Date;
}>;

// The public card context. A general card never presents a restaurant even when its author attached
// one: a suggestion on a general card is not a settled venue, and V1 must not display it as one.
// This is presentation narrowing only — the card itself, and its place in the result, are unchanged.
function toCardDto(card: MealBuddySelectedCard): MealBuddyCandidateCardDto {
  if (card.cardType === "restaurant" && (typeof card.restaurantId !== "string" || card.restaurantId.length === 0)) {
    // The database forbids a restaurant card without a restaurant, so this is a broken invariant
    // rather than an optional field: fail closed instead of emitting a degraded card.
    return mealBuddyCandidateApiContractViolation();
  }
  const restaurant = card.cardType === "restaurant" && card.restaurantId !== null
    ? Object.freeze({ restaurantId: card.restaurantId, name: card.restaurantName })
    : null;
  return Object.freeze({
    diningDate: card.diningDate,
    mealPeriod: card.mealPeriod,
    intentionType: card.intentionType,
    restaurant
  });
}

// Compact presentation, derived entirely by the frozen SR-2C-R1 helpers. The category keys, their
// order and the three-visible limit are that module's authority; no hierarchy, catalog order or cap
// is restated here. The complete fine-grained selections stay canonical in the profile authority and
// deliberately never reach this DTO.
function toInterestsDto(rows: readonly SocialInterestRow[]): MealBuddyCandidateInterestsDto {
  const compact = deriveCompactInterests(aggregateInterestCategories(collectProfileInterests(rows)));
  if (
    compact.publicInterests.visibleCategories.length > 3 ||
    compact.foodInterests.visibleCategories.length > 3 ||
    !Number.isInteger(compact.publicInterests.overflowCount) || compact.publicInterests.overflowCount < 0 ||
    !Number.isInteger(compact.foodInterests.overflowCount) || compact.foodInterests.overflowCount < 0
  ) {
    return mealBuddyCandidateApiContractViolation();
  }
  return Object.freeze({
    generalCategoryKeys: compact.publicInterests.visibleCategories,
    generalOverflowCount: compact.publicInterests.overflowCount,
    foodCategoryKeys: compact.foodInterests.visibleCategories,
    foodOverflowCount: compact.foodInterests.overflowCount
  });
}

// The verified actor is an explicit parameter, never derived from the exposure, the projection or
// any client value, and no actor state is held at module scope: an Edge isolate serves concurrent
// requests, so shared mutable actor state could bleed across them.
export async function toMealBuddyCandidateApiResponse(
  composition: MealBuddyCandidateDtoComposition
): Promise<MealBuddyCandidateApiResponse> {
  const {
    actorUserId, exposure, projection, interestRows, cardByOwner,
    candidateCipher, cardCipher, requestInstant
  } = composition;

  if (typeof actorUserId !== "string" || actorUserId.length === 0) {
    return mealBuddyCandidateApiContractViolation();
  }
  if (!(requestInstant instanceof Date) || !Number.isFinite(requestInstant.getTime())) {
    return mealBuddyCandidateApiContractViolation();
  }
  if (
    typeof exposure !== "object" || exposure === null ||
    exposure.policyVersion !== "social-exposure-v1" || !Array.isArray(exposure.exposed)
  ) {
    return mealBuddyCandidateApiContractViolation();
  }
  if (
    typeof projection !== "object" || projection === null ||
    projection.policyVersion !== "social-profile-projection-v1" || !Array.isArray(projection.candidates)
  ) {
    return mealBuddyCandidateApiContractViolation();
  }
  // The frozen SR-2B cap is the only bound; a projection can never exceed the exposure it came from.
  if (
    exposure.exposed.length > MEAL_BUDDY_CANDIDATE_API_MAXIMUM_CANDIDATES ||
    projection.candidates.length > exposure.exposed.length
  ) {
    return mealBuddyCandidateApiContractViolation();
  }
  if (!(cardByOwner instanceof Map) || !Array.isArray(interestRows)) {
    return mealBuddyCandidateApiContractViolation();
  }

  // Interest rows are keyed by the SR-2B exposure ordinal, so they attach to an already-exposed
  // position. An ordinal outside the exposure would mean the projection had answered about somebody
  // who was never exposed.
  const interestsByOrdinal = new Map<number, SocialInterestRow[]>();
  for (const row of interestRows) {
    const ordinal = row?.exposure_ordinal;
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= exposure.exposed.length) {
      return mealBuddyCandidateApiContractViolation();
    }
    const bucket = interestsByOrdinal.get(ordinal);
    if (bucket === undefined) interestsByOrdinal.set(ordinal, [row]);
    else bucket.push(row);
  }

  const seen = new Set<number>();
  const candidates: MealBuddyCandidateDto[] = [];
  for (const profile of projection.candidates) {
    const ordinal = profile.exposureIndex;
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= exposure.exposed.length) {
      return mealBuddyCandidateApiContractViolation();
    }
    if (seen.has(ordinal)) return mealBuddyCandidateApiContractViolation();
    seen.add(ordinal);

    const exposed = exposure.exposed[ordinal];
    if (
      typeof exposed !== "object" || exposed === null ||
      typeof exposed.candidateUserId !== "string" || exposed.candidateUserId.length === 0
    ) {
      return mealBuddyCandidateApiContractViolation();
    }
    // The exact card SR-2G-C bound to this owner before any ranking ran. It is looked up, never
    // chosen: there is no card selection expressible at this point in the pipeline.
    const card = cardByOwner.get(exposed.candidateUserId);
    if (card === undefined || card.ownerUserId !== exposed.candidateUserId) {
      return mealBuddyCandidateApiContractViolation();
    }

    if (typeof profile.displayName !== "string" || profile.displayName.length === 0) {
      return mealBuddyCandidateApiContractViolation();
    }
    // consumer_profiles.mascot_avatar_key is NOT NULL, so a null here is a broken invariant rather
    // than an optional field, and the request fails closed instead of emitting a degraded card.
    if (typeof profile.mascotAvatarKey !== "string" || profile.mascotAvatarKey.length === 0) {
      return mealBuddyCandidateApiContractViolation();
    }
    if (profile.publicBio !== null && typeof profile.publicBio !== "string") {
      return mealBuddyCandidateApiContractViolation();
    }
    // Presentation only. A candidate unwilling to chat stays in the result; this is never a filter.
    if (typeof profile.willingToChat !== "boolean") {
      return mealBuddyCandidateApiContractViolation();
    }

    // A PERSON reference under the frozen SR-2D authority, and a CARD reference under the frozen
    // SR-2G-A authority minted for the candidate purpose only. A candidate card reference can
    // therefore never be replayed where a source card reference is expected.
    const candidateRef = await candidateCipher.seal(actorUserId, exposed.candidateUserId, requestInstant);
    const candidateCardRef = await cardCipher.seal(
      actorUserId, MEAL_BUDDY_CARD_REF_PURPOSE_CANDIDATE, card.cardId, requestInstant
    );
    if (
      typeof candidateRef !== "string" || candidateRef.length === 0 ||
      typeof candidateCardRef !== "string" || candidateCardRef.length === 0
    ) {
      return mealBuddyCandidateApiContractViolation();
    }
    // Last-line structural assertion at the client boundary: no internal identifier may survive into
    // either reference, so neither people nor cards are enumerable from a response.
    const identifiers = [actorUserId, exposed.candidateUserId, card.ownerUserId, card.cardId];
    if (identifiers.some((value) => candidateRef.includes(value) || candidateCardRef.includes(value))) {
      return mealBuddyCandidateApiContractViolation();
    }

    candidates.push(Object.freeze({
      candidateRef,
      candidateCardRef,
      displayName: profile.displayName,
      mascotAvatarKey: profile.mascotAvatarKey,
      publicBio: profile.publicBio,
      willingToChat: profile.willingToChat,
      // Read after exposure, from the candidate owner's CURRENT profile settings. An owner with no
      // selections contributes no rows and yields empty arrays with a zero overflow, never a
      // fabricated default.
      interests: toInterestsDto(interestsByOrdinal.get(ordinal) ?? []),
      card: toCardDto(card)
    }));
  }

  return Object.freeze({
    policyVersion: MEAL_BUDDY_CANDIDATE_API_POLICY_VERSION,
    candidates: Object.freeze(candidates)
  });
}
