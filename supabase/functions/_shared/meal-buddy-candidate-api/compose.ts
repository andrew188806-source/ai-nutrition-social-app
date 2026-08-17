// The whole SR-2G-D server composition. Every stage is a frozen predecessor authority, called once.
// This module reproduces no eligibility rule, no Taste algorithm, no ranking rule, no exposure cap,
// no profile policy and no interest hierarchy of its own, and issues no refill query.
import { mealBuddyCandidateApiContractViolation } from "./policy.ts";
import { readExposedCandidateInterests, readMealBuddyCandidateCards } from "./readCandidateCards.ts";
import { toMealBuddyCandidateApiResponse } from "./toCandidateDto.ts";
import type {
  MealBuddyCandidateApiResponse, MealBuddyCandidateEntitlementRowSource, MealBuddySelectedCard
} from "./types.ts";
import {
  adaptAuthorizedPairSources, compareComposedServerPair, composeServerSnapshot
} from "../social-pair/index.ts";
import { buildSocialCandidateApiAsOf, readSocialCandidateTasteSources } from "../social-candidate-api/readCandidateTasteSources.ts";
import { rankSocialCandidates } from "../social-ranking/index.ts";
import type { SocialRankingCandidateInput } from "../social-ranking/types.ts";
import { applySocialExposure, resolveSocialEntitlement } from "../social-exposure/index.ts";
import { projectPublicSocialProfiles, readExposedSocialProfileFacts } from "../social-profile/index.ts";
import type { SocialRuntimeExecutorTransport } from "../social-runtime-transport/executorTransactionTransport.ts";
import type { SocialCandidateRefCipher } from "../social-candidate-ref/types.ts";
import type { MealBuddyCardRefCipher } from "../meal-buddy-card-ref/types.ts";

export type MealBuddyCandidateListComposition = Readonly<{
  transport: SocialRuntimeExecutorTransport;
  entitlementRowSource: MealBuddyCandidateEntitlementRowSource;
  candidateCipher: SocialCandidateRefCipher;
  cardCipher: MealBuddyCardRefCipher;
  actorUserId: string;
  sourceCardId: string;
  requestInstant: Date;
}>;

const EMPTY: MealBuddyCandidateApiResponse = Object.freeze({
  policyVersion: "meal-buddy-candidate-api-v1" as const,
  candidates: Object.freeze([])
});

export async function composeMealBuddyCandidateList(
  composition: MealBuddyCandidateListComposition
): Promise<MealBuddyCandidateApiResponse> {
  const {
    transport, entitlementRowSource, candidateCipher, cardCipher,
    actorUserId, sourceCardId, requestInstant
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

  // 1. Frozen SR-2G-C compatible-card pool, from the one server instant. This is the only stage that
  //    decides WHICH card represents an owner, and it decides it exactly once, before any ranking.
  const selectedCards = await readMealBuddyCandidateCards(
    transport, actorUserId, sourceCardId, requestInstant
  );
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

  // 3. Frozen SR-2A ranking. 4. Frozen SR-2B entitlement and exposure, same request instant.
  const ranking = rankSocialCandidates(rankingInputs);
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
