import { socialCandidateApiContractViolation } from "./policy.ts";
import { buildSocialCandidateApiAsOf, readSocialCandidateTasteSources } from "./readCandidateTasteSources.ts";
import { toSocialCandidateApiResponse } from "./toCandidateDto.ts";
import type { SocialCandidateApiResponse, SocialCandidateEntitlementRowSource } from "./types.ts";
import {
  adaptAuthorizedPairSources,
  compareComposedServerPair,
  composeServerSnapshot
} from "../social-pair/index.ts";
import { rankSocialCandidates } from "../social-ranking/index.ts";
import type { SocialRankingCandidateInput } from "../social-ranking/types.ts";
import { applySocialExposure, resolveSocialEntitlement } from "../social-exposure/index.ts";
import { projectPublicSocialProfiles, readExposedSocialProfileFacts } from "../social-profile/index.ts";
import type { SocialRuntimeExecutorTransport } from "../social-runtime-transport/executorTransactionTransport.ts";
import type { SocialCandidateRefCipher } from "../social-candidate-ref/types.ts";

export type SocialCandidateListComposition = Readonly<{
  transport: SocialRuntimeExecutorTransport;
  entitlementRowSource: SocialCandidateEntitlementRowSource;
  cipher: SocialCandidateRefCipher;
  actorUserId: string;
  requestInstant: Date;
}>;

// The whole SR-2D server composition. Every stage is the frozen predecessor authority, called once:
// this module reproduces no ranking rule, no exposure cap, no projection policy and no candidate
// source of its own, and issues no secondary or refill query.
//
// Consistency: the Taste source read, the entitlement read and the profile projection are three
// authoritative reads on two different connections, so there is no single global MVCC snapshot and
// none is claimed. Forcing one would mean moving the entitlement read onto the executor connection,
// which would widen executor privilege — a regression SR-2D deliberately does not make.
export async function composeSocialCandidateList(
  composition: SocialCandidateListComposition
): Promise<SocialCandidateApiResponse> {
  const { transport, entitlementRowSource, cipher, actorUserId, requestInstant } = composition;
  if (typeof actorUserId !== "string" || actorUserId.length === 0) {
    return socialCandidateApiContractViolation();
  }
  if (!(requestInstant instanceof Date) || !Number.isFinite(requestInstant.getTime())) {
    return socialCandidateApiContractViolation();
  }

  // 1. Canonical candidate source. The verified actor is the only input.
  const sources = await readSocialCandidateTasteSources(transport, actorUserId);
  if (sources.actor === null) {
    return await toSocialCandidateApiResponse(
      actorUserId,
      Object.freeze({ policyVersion: "social-exposure-v1" as const, exposed: Object.freeze([]), truncated: false }),
      Object.freeze({ policyVersion: "social-profile-projection-v1" as const, candidates: Object.freeze([]) }),
      cipher,
      requestInstant
    );
  }

  // 2. Frozen SR-1D Taste composition, from the one request instant.
  const asOf = buildSocialCandidateApiAsOf(requestInstant);
  const actorSnapshot = composeServerSnapshot(
    sources.actor.userId,
    adaptAuthorizedPairSources(sources.actor.sources),
    asOf
  );
  const rankingInputs: SocialRankingCandidateInput[] = sources.candidates.map((candidate) => ({
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

  // 5. Frozen SR-2C profile projection over exactly the exposed prefix.
  const rows = await readExposedSocialProfileFacts(transport, actorUserId, exposure);
  const projection = projectPublicSocialProfiles(exposure, rows);

  // 6. SR-2D reference sealing and client DTO.
  return await toSocialCandidateApiResponse(actorUserId, exposure, projection, cipher, requestInstant);
}
