import type { ConsumerAuthPort } from "../consumer-auth/ports";
import type { ConsumerAuthSourceLike } from "../meal-photo-upload/featureFlags";
import { DisabledSocialCandidateRepository } from "./adapters/disabledSocialCandidateRepository";
import { MockSocialCandidateRepository } from "./adapters/mockSocialCandidateRepository";
import { SupabaseSocialCandidateRepository } from "./adapters/supabaseSocialCandidateRepository";
import { getSocialCandidateRuntimeFlags, type SocialCandidateRuntimeFlags } from "./featureFlags";
import type { SocialCandidateRepository } from "./ports";
import { SocialCandidateService } from "./socialCandidateService";
import type { SupabaseSocialCandidateClientLike } from "./supabaseSocialCandidateContracts";

export type SocialCandidateFactoryDependencies = {
  authPort?: ConsumerAuthPort;
  candidateClient?: SupabaseSocialCandidateClientLike;
};

export function createSocialCandidateRepository(
  authSource: ConsumerAuthSourceLike,
  supabaseAuthEnabled: boolean,
  dependencies: SocialCandidateFactoryDependencies = {},
  flags: SocialCandidateRuntimeFlags = getSocialCandidateRuntimeFlags(authSource, supabaseAuthEnabled)
): SocialCandidateRepository {
  if (flags.issues.length || flags.candidateSource === "disabled") {
    return new DisabledSocialCandidateRepository();
  }
  if (flags.candidateSource === "mock") {
    if (!dependencies.authPort) return new DisabledSocialCandidateRepository();
    return new MockSocialCandidateRepository({ authPort: dependencies.authPort });
  }
  if (!dependencies.authPort || !dependencies.candidateClient) {
    return new DisabledSocialCandidateRepository();
  }
  return new SupabaseSocialCandidateRepository({
    authPort: dependencies.authPort,
    candidateClient: dependencies.candidateClient
  });
}

export function createSocialCandidateService(
  authSource: ConsumerAuthSourceLike,
  supabaseAuthEnabled: boolean,
  dependencies: SocialCandidateFactoryDependencies = {},
  flags?: SocialCandidateRuntimeFlags
): SocialCandidateService {
  return new SocialCandidateService({
    repository: createSocialCandidateRepository(
      authSource,
      supabaseAuthEnabled,
      dependencies,
      flags ?? getSocialCandidateRuntimeFlags(authSource, supabaseAuthEnabled)
    )
  });
}
