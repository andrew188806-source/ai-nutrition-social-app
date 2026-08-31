// The whole SR-2G-D server composition, with the SR-2G-F meal/menu context stage inserted between
// the candidate pool and ranking. Every stage is an authority called once. This module reproduces no
// eligibility rule, no Taste algorithm, no ranking rule, no exposure cap, no profile policy, no
// interest hierarchy and no context classification of its own, and issues no refill query.
//
// GEO-1D adds only optional foreground coordinates to the frozen source-reference request. Actor,
// selected cards, branches, radius, eligibility and ranking remain server authority.
import { mealBuddyCandidateApiContractViolation } from "./policy.ts";
import {
  readExposedCandidateInterests,
  readMealBuddyCandidateBranchContexts,
  readMealBuddyCandidateCards
} from "./readCandidateCards.ts";
import { toMealBuddyCandidateApiResponse } from "./toCandidateDto.ts";
import type {
  MealBuddyCandidateApiResponse, MealBuddyCandidateEntitlementRowSource, MealBuddySelectedCard
} from "./types.ts";
import {
  adaptAuthorizedPairSources, compareComposedServerPair, composeServerSnapshot
} from "../social-pair/index.ts";
import { buildSocialCandidateApiAsOf, readSocialCandidateTasteSources } from "../social-candidate-api/readCandidateTasteSources.ts";
import { composeMealBuddyContextRanking } from "../meal-buddy-context/index.ts";
import type { SocialRankingCandidateInput } from "../social-ranking/types.ts";
import { applySocialExposure, resolveSocialEntitlement } from "../social-exposure/index.ts";
import { projectPublicSocialProfiles, readExposedSocialProfileFacts } from "../social-profile/index.ts";
import type { SocialRuntimeExecutorTransport } from "../social-runtime-transport/executorTransactionTransport.ts";
import type { SocialCandidateRefCipher } from "../social-candidate-ref/types.ts";
import type { MealBuddyCardRefCipher } from "../meal-buddy-card-ref/types.ts";
import { ExecutorGeoRepository, parseGeoQuery, parseGeoPoint, type GeoPoint } from "../geo-api/index.ts";
import {
  NEXT_MEAL_GEO_BRANCH_LIMIT,
  NEXT_MEAL_GEO_RADIUS_METERS
} from "../next-meal-geo-api/policy.ts";

export type MealBuddyCandidateListComposition = Readonly<{
  transport: SocialRuntimeExecutorTransport;
  entitlementRowSource: MealBuddyCandidateEntitlementRowSource;
  candidateCipher: SocialCandidateRefCipher;
  cardCipher: MealBuddyCardRefCipher;
  actorUserId: string;
  sourceCardId: string;
  requestInstant: Date;
  geoOrigin?: GeoPoint | null;
}>;

export type MealBuddyGeoApplicationStatus = "not_applied" | "applied" | "empty" | "fallback";
type MealBuddyGeoApplication = Readonly<{
  status: MealBuddyGeoApplicationStatus;
  cards: readonly MealBuddySelectedCard[];
}>;

const EMPTY: MealBuddyCandidateApiResponse = Object.freeze({
  policyVersion: "meal-buddy-candidate-api-v1" as const,
  candidates: Object.freeze([])
});

async function applyMealBuddyGeoEligibility(
  transport: SocialRuntimeExecutorTransport,
  selectedCards: readonly MealBuddySelectedCard[],
  geoOrigin: GeoPoint | null
): Promise<MealBuddyGeoApplication> {
  if (geoOrigin === null) return Object.freeze({ status: "not_applied", cards: selectedCards });

  try {
    // The reader receives only the cards already selected by frozen Social/Meal Context authority.
    // A missing row is an unbound historical card and therefore an applied exclusion, not a reason
    // to infer another branch or to enter fallback.
    const contexts = await readMealBuddyCandidateBranchContexts(transport, selectedCards);
    if (contexts.size === 0) return Object.freeze({ status: "empty", cards: Object.freeze([]) });

    const query = parseGeoQuery({
      latitude: geoOrigin.latitude,
      longitude: geoOrigin.longitude,
      radiusMeters: NEXT_MEAL_GEO_RADIUS_METERS,
      limit: NEXT_MEAL_GEO_BRANCH_LIMIT
    });
    if (!query.ok) return mealBuddyCandidateApiContractViolation();
    const nearbyBranches = await new ExecutorGeoRepository(transport).narrowBranchCandidates(query.value);
    const nearbyExactBindings = new Set(
      nearbyBranches.map((branch) => `${branch.restaurantId}\u0000${branch.branchId}`)
    );

    // Preserve the frozen person/card order. GEO answers membership only: its nearest-first row
    // order and raw distance never become Social/Taste ranking input or public projection.
    const survivors = Object.freeze(selectedCards.filter((card) => {
      const context = contexts.get(card.cardId);
      return context !== undefined
        && nearbyExactBindings.has(`${context.restaurantId}\u0000${context.branchId}`);
    }));
    return Object.freeze({ status: survivors.length === 0 ? "empty" : "applied", cards: survivors });
  } catch {
    // One high-level fallback only. Successful empty/unbound/outside/unknown-coordinate outcomes
    // return above and can never reach this branch or repopulate the pool.
    return Object.freeze({ status: "fallback", cards: selectedCards });
  }
}

export async function composeMealBuddyCandidateList(
  composition: MealBuddyCandidateListComposition
): Promise<MealBuddyCandidateApiResponse> {
  const {
    transport, entitlementRowSource, candidateCipher, cardCipher,
    actorUserId, sourceCardId, requestInstant, geoOrigin = null
  } = composition;
  if (typeof actorUserId !== "string" || actorUserId.length === 0) {
    return mealBuddyCandidateApiContractViolation();
  }
  if (typeof sourceCardId !== "string" || sourceCardId.length === 0) {
    return mealBuddyCandidateApiContractViolation();
  }
  if (!(requestInstant instanceof Date) || !Number.isFinite(requestInstant.getTime())) {
    return mealBuddyCandidateApiContractViolation();
  }
  if (geoOrigin !== null) {
    const parsedOrigin = parseGeoPoint(geoOrigin.latitude, geoOrigin.longitude);
    if (!parsedOrigin.ok) return mealBuddyCandidateApiContractViolation();
  }

  // 1. Frozen SR-2G-C compatible-card pool, from the one server instant, now read through the
  //    SR-2G-F context primitive that labels each row. This is still the only stage that decides
  //    WHICH card represents an owner, and it still decides it exactly once, before any ranking.
  //    Hard eligibility is untouched: the labels ride along with the frozen pool, they do not filter
  //    it, so a legacy card with no context yields one uniform label and the frozen order stands.
  const baseSelectedCards = await readMealBuddyCandidateCards(
    transport, actorUserId, sourceCardId, requestInstant
  );
  if (baseSelectedCards.length === 0) return EMPTY;

  // GEO-1D runs over the complete frozen person/card pool before ranking and exposure. The exact
  // selected card is never changed; only its P0 branch binding may allow that person to survive.
  const geoApplication = await applyMealBuddyGeoEligibility(transport, baseSelectedCards, geoOrigin);
  const selectedCards = geoApplication.cards;
  if (selectedCards.length === 0) return EMPTY;

  // The owner -> card binding, fixed here and never renegotiated. Ranking and exposure operate on
  // PERSON; the card each surviving person carries is looked up from this map, never reselected.
  const cardByOwner = new Map<string, MealBuddySelectedCard>(
    selectedCards.map((card) => [card.ownerUserId, card])
  );

  // 2. Frozen SR-1D Taste sources for the actor and every authorized candidate. Restricted to the
  //    Meal Buddy pool: the compatible-card pool already composes authorized_candidates, so its
  //    owners are a subset of this set. No card field and no interest ever enters Taste.
  const sources = await readSocialCandidateTasteSources(transport, actorUserId);
  if (sources.actor === null) return EMPTY;

  const asOf = buildSocialCandidateApiAsOf(requestInstant);
  const actorSnapshot = composeServerSnapshot(
    sources.actor.userId, adaptAuthorizedPairSources(sources.actor.sources), asOf
  );
  const rankingInputs: SocialRankingCandidateInput[] = sources.candidates
    .filter((candidate) => cardByOwner.has(candidate.userId))
    .map((candidate) => ({
      candidateUserId: candidate.userId,
      result: compareComposedServerPair(
        actorSnapshot,
        composeServerSnapshot(candidate.userId, adaptAuthorizedPairSources(candidate.sources), asOf)
      ) as SocialRankingCandidateInput["result"]
    }));

  // 3. SR-2G-F meal/menu context, then frozen SR-2A ranking INSIDE each context bucket. The context
  //    labels were decided by the database primitive from the actor's own source card; nothing here
  //    reads a dish, a weight or a client field, and no candidate is dropped — the output is a
  //    permutation of the input, so context can change WHO is exposed but never how many exist.
  const ranking = composeMealBuddyContextRanking({
    candidates: rankingInputs,
    contextByCandidateUserId: new Map(
      selectedCards.map((card) => [card.ownerUserId, card.contextState])
    )
  });

  // 4. Frozen SR-2B entitlement and exposure, same request instant. Exposure receives an ordinary
  //    SR-2A ranking result and still slices a pure prefix: the caps are untouched and nothing is
  //    reranked, refilled or drawn after this point.
  const entitlement = await resolveSocialEntitlement(entitlementRowSource, actorUserId, requestInstant);
  const exposure = applySocialExposure(ranking, entitlement);

  // 5. Frozen SR-2C profile projection over exactly the exposed prefix. An exposed person the
  //    projection omits stays omitted: no later stage refills the slot.
  const rows = await readExposedSocialProfileFacts(transport, actorUserId, exposure);
  const projection = projectPublicSocialProfiles(exposure, rows);

  // 6. Frozen SR-2C-R1 CURRENT profile-interest projection, over the same exposed prefix. Read here
  //    rather than earlier so interests can never influence who is exposed. The candidate owner's
  //    live Settings are the source; no card, snapshot or inference is consulted.
  const interestRows = await readExposedCandidateInterests(
    transport, actorUserId, exposure.exposed.map((entry) => entry.candidateUserId)
  );

  // 7. SR-2D person refs, SR-2G-A candidate-purpose card refs, compact interest derivation and DTO.
  return await toMealBuddyCandidateApiResponse({
    actorUserId, exposure, projection, interestRows, cardByOwner,
    candidateCipher, cardCipher, requestInstant
  });
}
