export type VisibilityLevel = "public" | "premiumOnly" | "private" | "hidden";

export type PreviewMode = "free" | "premium" | "owner";

export type SystemMascot = {
  id: string;
  name: string;
  description: string;
  personalityType: string;
  tags: readonly string[];
  avatarType: "system";
  assetKey: string;
  isPremiumOnly: boolean;
  visibilityDefault: VisibilityLevel;
};

export type CommunityCardSettingsState = {
  age: string;
  gender: string;
  nickname: string;
  intro: string;
  selectedEatingTags: string[];
  selectedHealthTags: string[];
  selectedBuddyTags: string[];
  avoidedFoods: string[];
  dietTypes: string[];
  spicePreference: string;
  gatheringStyle: string;
  paymentPreference: string;
  areaVisibility: string;
  calorieGoalVisibility: string;
  breakfastTime: string;
  lunchTime: string;
  dinnerTime: string;
  lateNightTime: string;
  selectedMascotId: string;
  privateAvatarAssetKey: string | null;
  publicMascotAvatarId: string;
  hasUploadedPhoto: boolean;
  fieldVisibility: Record<string, VisibilityLevel>;
};
