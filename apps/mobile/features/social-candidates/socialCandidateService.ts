import type { SocialCandidateRepository } from "./ports";

export type SocialCandidateServiceOptions = {
  repository: SocialCandidateRepository;
};

// A pass-through service. It deliberately adds no ordering, capping, filtering, caching or merging:
// every one of those is server authority, and a client-side "convenience" here is exactly how a
// ranking or exposure rule would silently move onto the device.
export class SocialCandidateService {
  constructor(private readonly options: SocialCandidateServiceOptions) {}

  get source() {
    return this.options.repository.source;
  }

  listSocialCandidates() {
    return this.options.repository.listSocialCandidates();
  }
}
