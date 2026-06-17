import type { DemoMode } from "../../components/DemoUi";
import { resolveCommunityProfileDisplay, type AvatarSource } from "../display-resolvers";
import type { RankedMealBuddyCandidate } from "./types";

export type BuddyDisplaySource = {
  profileId?: string;
  userId?: string;
  displayName: string;
  avatarText?: string;
  mascotId?: string;
  area?: string;
  distanceKm?: number;
  age?: string;
  ageRange?: string;
  diningStyle?: string;
  nutritionGoal?: string;
  recentMealStyle?: string;
  preferredDiningMode?: string;
  tags?: readonly string[];
  isVerified?: boolean;
  shortBio?: string;
};

export function getBuddyDisplayProfile(source: BuddyDisplaySource, mode: DemoMode) {
  const isPremium = mode === "premium";
  const resolvedProfile = source.profileId || source.userId ? resolveCommunityProfileDisplay(source.profileId ?? source.userId ?? "") : null;
  const displayName = resolvedProfile?.displayName ?? source.displayName;
  const area = source.area || "";
  const firstChar = displayName.slice(0, 1) || "?";
  const avatarSource = resolvedProfile?.avatarSource ?? fallbackAvatarSource(source, firstChar);
  const tags = resolvedProfile?.tags ?? source.tags ?? [];

  return {
    displayName,
    avatarSource,
    mascotId: resolvedProfile?.mascotId ?? source.mascotId,
    selectedMascotName: resolvedProfile?.selectedMascotName ?? null,
    photoUrl: resolvedProfile?.photoUrl ?? null,
    profileMode: resolvedProfile?.profileMode ?? (isPremium ? "premium_anonymous" : "free_anonymous"),
    isPremium: resolvedProfile?.isPremium ?? isPremium,
    avatarText: avatarTextForSource(avatarSource, source.avatarText, firstChar, isPremium),
    ageText: isPremium ? (source.age || source.ageRange || "29 歲") : (source.ageRange || "25-34 歲"),
    locationText: isPremium && typeof source.distanceKm === "number" ? `${area} · ${source.distanceKm.toFixed(1)} km` : `${area}附近`,
    tags: isPremium ? [...tags] : [...tags].slice(0, 3),
    diningStyle: source.diningStyle || "清爽飲食",
    nutritionGoal: source.nutritionGoal || "均衡飲食",
    recentMealStyle: source.recentMealStyle || "最近也在找飯友",
    preferredDiningMode: source.preferredDiningMode || "先聊聊",
    shortBio: resolvedProfile?.shortProfileSummary || source.shortBio || "正在找飲食節奏接近的飯友。",
    verificationText: source.isVerified ? "已驗證" : "Demo 資料",
    exactDistanceVisible: isPremium && typeof source.distanceKm === "number"
  };
}

export function getCandidateDisplayProfile(candidate: RankedMealBuddyCandidate, mode: DemoMode) {
  return getBuddyDisplayProfile(
    {
      userId: candidate.userId,
      profileId: candidate.userId,
      displayName: candidate.displayName,
      mascotId: candidate.mascotId,
      area: candidate.area,
      distanceKm: candidate.distanceKm,
      diningStyle: candidate.foodCategory,
      nutritionGoal: candidate.nutritionGoal,
      preferredDiningMode: candidate.intentionType === "chat_first" ? "先聊聊" : "可直接約飯",
      tags: candidate.tags,
      isVerified: candidate.isVerified,
      shortBio: candidate.socialNote
    },
    mode
  );
}

function fallbackAvatarSource(source: BuddyDisplaySource, firstChar: string): AvatarSource {
  if (source.mascotId) {
    return { type: "mascot", mascotId: source.mascotId };
  }
  return { type: "initial", value: source.avatarText || firstChar };
}

function avatarTextForSource(avatarSource: AvatarSource, avatarText: string | undefined, firstChar: string, isPremium: boolean) {
  if (avatarSource.type === "initial") {
    return avatarSource.value;
  }
  return isPremium ? (avatarText || firstChar) : (avatarText || "飯");
}
