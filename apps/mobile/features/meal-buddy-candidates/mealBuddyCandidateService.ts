import type { MealBuddyCandidateRepository, MealBuddySourceCardRepository } from "./ports";
import {
  errCandidates,
  MealBuddyCandidateClientError,
  type MealBuddyCandidateOutcome,
  type MealBuddySourceCard,
  type MealBuddySourceCardOutcome
} from "./types";

export type MealBuddyCandidateServiceOptions = {
  sourceCardRepository: MealBuddySourceCardRepository;
  candidateRepository: MealBuddyCandidateRepository;
};

// A pass-through service. It deliberately adds no ordering, capping, filtering, caching, merging or
// retry: every one of those is server authority, and a client-side "convenience" here is exactly how
// a ranking or exposure rule would silently move onto the device.
//
// It also holds NO state between calls. No candidate, reference, session or source card is retained,
// so there is nothing for a later screen to read back and nothing that survives a sign-out.
export class MealBuddyCandidateService {
  constructor(private readonly options: MealBuddyCandidateServiceOptions) {}

  get source() {
    return this.options.candidateRepository.source;
  }

  listSourceCards(): Promise<MealBuddySourceCardOutcome> {
    return this.options.sourceCardRepository.listSourceCards();
  }

  // The reference is supplied by the caller for exactly one request and is never stored here.
  listCandidates(sourceCardRef: string): Promise<MealBuddyCandidateOutcome> {
    return this.options.candidateRepository.listCandidates(sourceCardRef);
  }

  // The narrow end-to-end read the screen actually needs: the actor's own cards, then the candidates
  // compatible with ONE chosen card. `chooseSourceCard` belongs to the caller because selecting
  // among several owned cards is a product decision; when the actor holds no active card at all the
  // result is the distinct `no_source_card` state, never an empty candidate list.
  async listCandidatesForOwnedCard(
    chooseSourceCard: (cards: readonly MealBuddySourceCard[]) => MealBuddySourceCard | null
  ): Promise<MealBuddyCandidateOutcome> {
    const cards = await this.listSourceCards();
    if (!cards.ok) return errCandidates(cards.error);
    const chosen = chooseSourceCard(cards.value);
    if (!chosen) {
      return errCandidates(new MealBuddyCandidateClientError(
        "no_source_card", "The signed-in user holds no active Meal Buddy card to search from."));
    }
    return this.listCandidates(chosen.sourceCardRef);
  }
}
