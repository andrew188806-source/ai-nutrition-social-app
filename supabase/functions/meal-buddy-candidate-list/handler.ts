import { authenticateCaller, type AuthOutcome } from "../_shared/auth/authenticateCaller.ts";
import { composeMealBuddyCandidateList } from "../_shared/meal-buddy-candidate-api/compose.ts";
import {
  carriesMealBuddyCandidateAuthorityInput,
  parseMealBuddyCandidateRequest
} from "../_shared/meal-buddy-candidate-api/request.ts";
import type { MealBuddyCandidateEntitlementRowSource } from "../_shared/meal-buddy-candidate-api/types.ts";
import { createSocialCandidateRefCipher } from "../_shared/social-candidate-ref/index.ts";
import {
  createMealBuddyCardRefCipher,
  MEAL_BUDDY_CARD_REF_PURPOSE_SOURCE
} from "../_shared/meal-buddy-card-ref/index.ts";
import { createDenoSocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/denoPostgresExecutorTransport.ts";
import type { SocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/executorTransactionTransport.ts";
import { loadMealBuddyCandidateListConfig, type MealBuddyCandidateListConfigOutcome } from "./config.ts";
import { buildMealBuddyCandidateListError } from "./errors.ts";

export type MealBuddyCandidateListDependencies = Readonly<{
  loadConfig: () => MealBuddyCandidateListConfigOutcome;
  authenticateCaller: (request: Request, url: string, anonKey: string) => Promise<AuthOutcome>;
  createTransport: () => SocialRuntimeExecutorTransport;
}>;

export function createDefaultMealBuddyCandidateListDependencies(): MealBuddyCandidateListDependencies {
  return Object.freeze({
    loadConfig: loadMealBuddyCandidateListConfig,
    authenticateCaller,
    createTransport: createDenoSocialRuntimeExecutorTransport
  });
}

export async function processMealBuddyCandidateListRequest(
  request: Request,
  dependencies: MealBuddyCandidateListDependencies
): Promise<Response> {
  if (request.method !== "POST") return buildMealBuddyCandidateListError("invalid_request");
  if (carriesMealBuddyCandidateAuthorityInput(request)) {
    return buildMealBuddyCandidateListError("invalid_request");
  }
  const parsed = await parseMealBuddyCandidateRequest(request);
  if (!parsed.ok) return buildMealBuddyCandidateListError("invalid_request");

  const config = dependencies.loadConfig();
  if (!config.ok) return buildMealBuddyCandidateListError("server_unavailable");

  // The ONLY source of actor identity. No header, body field, query parameter or reference claim can
  // name the actor, so a reference is never a way to act as somebody else.
  const authentication = await dependencies.authenticateCaller(
    request,
    config.value.supabaseUrl,
    config.value.supabaseAnonKey
  );
  if (!authentication.ok) return buildMealBuddyCandidateListError("authentication_required");
  const actorUserId = authentication.value.userId;

  // Exactly one request instant governs the source-reference expiry check, the pool authority
  // instant, the Taste as-of window, entitlement resolution and both minted references. There is no
  // caller-supplied clock anywhere.
  const requestInstant = new Date();
  const cardCipher = createMealBuddyCardRefCipher(config.value.cardRefKey);

  // The reference must open for THIS actor and for the SOURCE purpose. A candidate-purpose
  // reference, another actor's reference, a tampered reference and an expired reference are one
  // indistinguishable failure. Opening it is not authorization: the frozen SR-2G-C pool re-verifies
  // ownership and active state against the same instant before returning a single candidate.
  let sourceCardId: string;
  try {
    const claims = await cardCipher.open(
      actorUserId, MEAL_BUDDY_CARD_REF_PURPOSE_SOURCE, parsed.value.sourceCardRef, requestInstant
    );
    sourceCardId = claims.cardId;
  } catch {
    return buildMealBuddyCandidateListError("invalid_request");
  }

  const transport = dependencies.createTransport();
  try {
    const response = await composeMealBuddyCandidateList({
      transport,
      entitlementRowSource: authentication.value.userScopedClient as unknown as MealBuddyCandidateEntitlementRowSource,
      candidateCipher: createSocialCandidateRefCipher(config.value.candidateRefKey),
      cardCipher,
      actorUserId,
      sourceCardId,
      requestInstant
    });
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch {
    // A dependency or invariant failure is a 503. It is never converted into an empty success, and
    // never distinguished from any other infrastructure failure.
    return buildMealBuddyCandidateListError("server_unavailable");
  } finally {
    await transport.close();
  }
}
