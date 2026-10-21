import {openInviteCandidateRef} from '../_shared/phone-search-candidate-ref.ts';
import {ExecutorMealBuddyRelationshipRepository} from '../_shared/meal-buddy-relationship-api/repository.ts';
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
  let knownLookupSource=false;
  try {
    const opened = await openInviteCandidateRef(createSocialCandidateRefCipher(config.value.candidateRefKey),
      authentication.value.userId, parsed.value.candidateRef, requestInstant
    );
    candidateUserId = opened.claims.candidateUserId;
    knownLookupSource=opened.phoneSearch||opened.codeSearch===true;
  } catch {
    return buildMealBuddyCandidateProfileError("invalid_request");
  }

  const transport = dependencies.createTransport();
  try {
    if(!knownLookupSource){
      const existing=await new ExecutorMealBuddyRelationshipRepository(transport).read(authentication.value.userId,candidateUserId);
      if(!existing.some(row=>['accepted','incoming_pending','outgoing_pending'].includes(row.relative_state)))return new Response(JSON.stringify({error:{code:'stranger_ref_refresh_required'}}),{status:409,headers:{'content-type':'application/json','cache-control':'no-store'}});
    }
    const response = await composeMealBuddyCandidateProfile({
      transport,
      actorUserId: authentication.value.userId,
      candidateUserId
    });
    // No longer active/authorized/public and forged references share the same opaque result.
    if (response === null) return buildMealBuddyCandidateProfileError("invalid_request");
    let result=response;
    if(!knownLookupSource){
      const current=await new ExecutorMealBuddyRelationshipRepository(transport).read(authentication.value.userId,candidateUserId);
      if(!current.some(row=>['accepted','incoming_pending','outgoing_pending'].includes(row.relative_state)))return buildMealBuddyCandidateProfileError('invalid_request');
      if(current[0]?.strangerPending)result={...response,profile:{...response.profile,displayName:current[0].counterpart.displayName,publicBio:null}};
    }
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch {
    return buildMealBuddyCandidateProfileError("server_unavailable");
  } finally {
    await transport.close();
  }
}
