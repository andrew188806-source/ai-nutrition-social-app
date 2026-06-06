import type { DemoMode } from "../../components/DemoUi";
import type { RankedMealBuddyCandidate } from "./types";

export type BuddyDisplaySource = {
  displayName: string;
  avatarText?: string;
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
  const area = source.area || "附近區域";
  const firstChar = source.displayName.slice(0, 1) || "友";

  return {
    displayName: source.displayName,
    avatarText: isPremium ? (source.avatarText || firstChar) : (source.avatarText || "飯"),
    ageText: isPremium ? (source.age || source.ageRange || "29 歲") : (source.ageRange || "25-34 歲"),
    locationText: isPremium && typeof source.distanceKm === "number" ? `${area} · ${source.distanceKm.toFixed(1)} km` : `${area}附近`,
    tags: isPremium ? [...(source.tags || [])] : [...(source.tags || [])].slice(0, 3),
    diningStyle: source.diningStyle || "清爽外食",
    nutritionGoal: source.nutritionGoal || "均衡飲食",
    recentMealStyle: source.recentMealStyle || "最近偏好清爽高蛋白餐",
    preferredDiningMode: source.preferredDiningMode || "聊聊後再決定",
    shortBio: source.shortBio || "喜歡輕鬆吃飯，也在找適合日常的健康餐。",
    verificationText: source.isVerified ? "已驗證" : "測試資料",
    exactDistanceVisible: isPremium && typeof source.distanceKm === "number"
  };
}

export function getCandidateDisplayProfile(candidate: RankedMealBuddyCandidate, mode: DemoMode) {
  return getBuddyDisplayProfile(
    {
      displayName: candidate.displayName,
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
