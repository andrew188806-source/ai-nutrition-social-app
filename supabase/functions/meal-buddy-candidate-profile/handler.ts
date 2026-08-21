import { authenticateCaller, type AuthOutcome } from "../_shared/auth/authenticateCaller.ts";
import { composeMealBuddyCandidateProfile } from "../_shared/meal-buddy-candidate-profile-api/compose.ts";
import {
  carriesCandidateProfileAuthorityInput,
  parseMealBuddyCandidateProfileRequest
} from "../_shared/meal-buddy-candidate-profile-api/request.ts";
import { createSocialCandidateRefCipher } from "../_shared/social-candidate-ref/index.ts";
import { createDenoSocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/denoPostgresExecutorTransport.ts";
import type { SocialRuntimeExecutorTransport } from "../_shared/social-runtime-transport/executorTransactionTransport.ts";
import {
  loadMealBuddyCandidateProfileConfig,
  type MealBuddyCandidateProfileConfigOutcome
} from "./config.ts";
import { buildMealBuddyCandidateProfileError } from "./errors.ts";

export type MealBuddyCandidateProfileDependencies = Readonly<{
  loadConfig: () => MealBuddyCandidateProfileConfigOutcome;
  authenticateCaller: (request: Request, url: string, anonKey: string) => Promise<AuthOutcome>;
  createTransport: () => SocialRuntimeExecutorTransport;
  now?: () => Date;
}>;

export function createDefaultMealBuddyCandidateProfileDependencies(): MealBuddyCandidateProfileDependencies {
  return Object.freeze({
    loadConfig: loadMealBuddyCandidateProfileConfig,
    authenticateCaller,
    createTransport: createDenoSocialRuntimeExecutorTransport
  });
}

export async function processMealBuddyCandidateProfileRequest(
  request: Request,
  dependencies: MealBuddyCandidateProfileDependencies
): Promise<Response> {
  if (request.method !== "POST" || carriesCandidateProfileAuthorityInput(request)) {
    return buildMealBuddyCandidateProfileError("invalid_request");
  }
  const parsed = await parseMealBuddyCandidateProfileRequest(request);
  if (!parsed.ok) return buildMealBuddyCandidateProfileError("invalid_request");

  const config = dependencies.loadConfig();
  if (!config.ok) return buildMealBuddyCandidateProfileError("server_unavailable");
  const authentication = await dependencies.authenticateCaller(
    request, config.value.supabaseUrl, config.value.supabaseAnonKey
  );
  if (!authentication.ok) return buildMealBuddyCandidateProfileError("authentication_required");

  const requestInstant = dependencies.now?.() ?? new Date();
  let candidateUserId: string;
  try {
    const claims = await createSocialCandidateRefCipher(config.value.candidateRefKey).open(
      authentication.value.userId, parsed.value.candidateRef, requestInstant
    );
    candidateUserId = claims.candidateUserId;
  } catch {
    return buildMealBuddyCandidateProfileError("invalid_request");
  }

  const transport = dependencies.createTransport();
  try {
    const response = await composeMealBuddyCandidateProfile({
      transport,
      actorUserId: authentication.value.userId,
      candidateUserId
    });
    // No longer active/authorized/public and forged references share the same opaque result.
    if (response === null) return buildMealBuddyCandidateProfileError("invalid_request");
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch {
    return buildMealBuddyCandidateProfileError("server_unavailable");
  } finally {
    await transport.close();
  }
}
