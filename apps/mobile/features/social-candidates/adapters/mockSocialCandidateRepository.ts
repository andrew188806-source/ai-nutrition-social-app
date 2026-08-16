import { validateSocialCandidateApiResponseV1 } from "@haocu/shared";
import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import type { SocialCandidateRepository } from "../ports";
import { errCandidates, okCandidates, SocialCandidateClientError } from "../types";

export type MockSocialCandidateRepositoryOptions = {
  authPort: ConsumerAuthPort;
};

// Deliberately built from the frozen five-field DTO only. This fixture shares nothing with the Meal
// Buddy demo: no userId, no profileId, no rankScore, no matchReasons, no isPremium, no isVerified,
// no distanceKm, no tags, no restaurant/area/time field — none of those exist on this shape.
//
// Mascot keys are real SystemMascot assetKeys except the last, which is intentionally unknown so the
// fallback path is exercised. Ordering here is arbitrary fixture order and is never sorted: the mock
// stands in for a server response, and the server owns ordering.
const MOCK_CANDIDATES = Object.freeze([
  { candidateRef: "scr1.mock-candidate-01", displayName: "阿哲", mascotAvatarKey: "PB", publicBio: "健身後想找人一起補蛋白質。", willingToChat: true },
  { candidateRef: "scr1.mock-candidate-02", displayName: "小綠", mascotAvatarKey: "VG", publicBio: null, willingToChat: false },
  { candidateRef: "scr1.mock-candidate-03", displayName: "Kai", mascotAvatarKey: "TE", publicBio: "喜歡到處試新店。", willingToChat: true },
  { candidateRef: "scr1.mock-candidate-04", displayName: "夜貓子", mascotAvatarKey: "MD", publicBio: "宵夜時段最有空。", willingToChat: false },
  { candidateRef: "scr1.mock-candidate-05", displayName: "Mina", mascotAvatarKey: "ZZ-unknown", publicBio: "均衡飲食中。", willingToChat: true }
]);

// The mock runs through the same shared validator as the live adapter, so a fixture that ever
// drifted from the frozen contract would fail here exactly as a bad server response would.
export class MockSocialCandidateRepository implements SocialCandidateRepository {
  readonly source = "mock" as const;

  constructor(private readonly options: MockSocialCandidateRepositoryOptions) {}

  async listSocialCandidates() {
    const session = await this.options.authPort.getCurrentSession();
    if (!session.ok || !session.value) {
      return errCandidates(new SocialCandidateClientError("authentication_required", "Social candidates require an authenticated session."));
    }
    const validation = validateSocialCandidateApiResponseV1({
      policyVersion: "social-candidate-api-v1",
      candidates: MOCK_CANDIDATES
    });
    if (!validation.ok) {
      return errCandidates(new SocialCandidateClientError("invalid_server_response", "The mock Social candidate fixture failed local validation."));
    }
    return okCandidates(validation.value);
  }
}
