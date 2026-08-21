import { authenticateCaller, type AuthOutcome } from "../_shared/auth/authenticateCaller.ts";
import {
  carriesMealBuddyRelationshipAuthorityInput,
  ExecutorMealBuddyRelationshipRepository,
  MealBuddyRelationshipService,
  parseMealBuddyRelationshipRequest
} from "../_shared/meal-buddy-relationship-api/index.ts";
import { createMealBuddyRelationshipRefCipher } from "../_shared/meal-buddy-relationship-ref/index.ts";
import { createSocialCandidateRefCipher } from "../_shared/social-candidate-ref/index.ts";
import { createDenoSocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/denoPostgresExecutorTransport.ts";
import type { SocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/executorTransactionTransport.ts";
import { loadMealBuddyRelationshipConfig, type MealBuddyRelationshipConfigOutcome } from "./config.ts";
import { buildMealBuddyRelationshipError } from "./errors.ts";

export type MealBuddyRelationshipDependencies = Readonly<{
  loadConfig: () => MealBuddyRelationshipConfigOutcome;
  authenticateCaller: (request: Request, url: string, anonKey: string) => Promise<AuthOutcome>;
  createTransport: () => SocialRuntimeExecutorTransport;
  now?: () => Date;
}>;
export function createDefaultMealBuddyRelationshipDependencies(): MealBuddyRelationshipDependencies {
  return Object.freeze({
    loadConfig: loadMealBuddyRelationshipConfig,
    authenticateCaller,
    createTransport: createDenoSocialRuntimeExecutorTransport
  });
}

function clientUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /ref_contract_violated|relationship_action_unavailable|RELATIONSHIP_TARGET_(INVALID|UNAVAILABLE)/.test(message);
}

export async function processMealBuddyRelationshipRequest(
  request: Request,
  dependencies: MealBuddyRelationshipDependencies
): Promise<Response> {
  if (request.method !== "POST" || carriesMealBuddyRelationshipAuthorityInput(request)) {
    return buildMealBuddyRelationshipError("invalid_request");
  }
  const parsed = await parseMealBuddyRelationshipRequest(request);
  if (!parsed.ok) return buildMealBuddyRelationshipError("invalid_request");
  const config = dependencies.loadConfig();
  if (!config.ok) return buildMealBuddyRelationshipError("server_unavailable");
  const authentication = await dependencies.authenticateCaller(
    request, config.value.supabaseUrl, config.value.supabaseAnonKey
  );
  if (!authentication.ok) return buildMealBuddyRelationshipError("authentication_required");

  const transport = dependencies.createTransport();
  try {
    const service = new MealBuddyRelationshipService(
      new ExecutorMealBuddyRelationshipRepository(transport),
      createSocialCandidateRefCipher(config.value.candidateRefKey),
      createMealBuddyRelationshipRefCipher(config.value.relationshipRefKey)
    );
    const response = await service.execute(
      authentication.value.userId,
      parsed.value,
      dependencies.now?.() ?? new Date()
    );
    return new Response(JSON.stringify(response), {
      status: 200, headers: { "content-type": "application/json" }
    });
  } catch (error) {
    return buildMealBuddyRelationshipError(clientUnavailable(error) ? "invalid_request" : "server_unavailable");
  } finally {
    await transport.close();
  }
}
