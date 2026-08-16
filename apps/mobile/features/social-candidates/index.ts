// SR-2E real Taste-based Social candidate feature.
//
// Deliberately isolated from the Meal Buddy demo: this barrel exports no candidate mock, no
// client-side ranking, no invite/match/chat action state and no profile-detail navigation, and the
// feature imports none of mealBuddyCardMock, mealBuddyRanking, mealBuddySocialStore,
// mealBuddyFlowMock or the DEMO_ONLY community profile resolver.
export type {
  SocialCandidate,
  SocialCandidateListResult,
  SocialCandidateOutcome,
  SocialCandidateClientErrorCode
} from "./types";
export { SocialCandidateClientError, okCandidates, errCandidates } from "./types";
export type { SocialCandidateRepository } from "./ports";
export { SocialCandidateService } from "./socialCandidateService";
export {
  getSocialCandidateRuntimeFlags,
  type SocialCandidateSource,
  type SocialCandidateRuntimeFlags
} from "./featureFlags";
export {
  createSocialCandidateRepository,
  createSocialCandidateService,
  type SocialCandidateFactoryDependencies
} from "./factories";
export {
  SOCIAL_CANDIDATE_LIST_FUNCTION_NAME,
  type SupabaseSocialCandidateClientLike
} from "./supabaseSocialCandidateContracts";
export {
  bindSocialCandidateRuntimeDependencies,
  clearSocialCandidateRuntimeDependencies,
  getSocialCandidateRuntimeDependencies
} from "./runtimeBinding";
export { resolveSocialCandidateMascot, type SocialCandidateMascot } from "./mascotAdapter";
export { SocialCandidateCard } from "./SocialCandidateCard";
