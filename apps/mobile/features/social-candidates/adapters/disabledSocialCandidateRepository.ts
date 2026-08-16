import type { SocialCandidateRepository } from "../ports";
import { errCandidates, SocialCandidateClientError } from "../types";

// Production-safe default: fails closed with a stable, typed error rather than silently returning an
// empty list. An empty list is a real successful state in this contract, so a disabled runtime must
// never be able to impersonate one.
export class DisabledSocialCandidateRepository implements SocialCandidateRepository {
  readonly source = "disabled" as const;

  async listSocialCandidates() {
    return errCandidates(new SocialCandidateClientError("social_candidates_disabled", "Social candidates are disabled in this runtime."));
  }
}
