// SR-2H-A server-facing detail types. These intentionally mirror the shared Mobile contract while
// keeping the Edge runtime independent from the workspace package resolver.
export type MealBuddyCandidateProfileDto = Readonly<{
  displayName: string;
  mascotAvatarKey: string;
  publicBio: string | null;
  willingToChat: boolean;
  publicInterestTags: readonly string[];
  foodInterestTags: readonly string[];
}>;

export type MealBuddyCandidateProfileApiResponse = Readonly<{
  policyVersion: "meal-buddy-candidate-profile-v1";
  profile: MealBuddyCandidateProfileDto;
}>;
