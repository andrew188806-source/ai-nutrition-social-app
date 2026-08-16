import type { SocialCandidateOutcome } from "./types";

// The whole read surface. `listSocialCandidates` takes NO argument: the server derives the actor
// from the verified session and owns ranking, entitlement exposure and profile projection, so there
// is nothing for a caller to supply and no parameter for an actor or limit to hide in.
export interface SocialCandidateRepository {
  readonly source: "disabled" | "mock" | "supabase-live";
  listSocialCandidates(): Promise<SocialCandidateOutcome>;
}
