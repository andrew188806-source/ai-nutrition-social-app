import type { Meal, Profile, Restaurant } from "../types";

export const mockProfiles: Profile[] = [
  {
    id: "profile-demo-user",
    userId: "user-demo",
    displayName: "Demo 使用者",
    isAnonymousPreview: false,
    subscriptionTier: "free",
    tagIds: ["tag-eating-balanced", "tag-goal-calorie", "tag-social-healthy-meal"]
  },
  {
    id: "profile-social-preview",
    userId: "user-social-preview",
    displayName: "匿名健康餐夥伴",
    isAnonymousPreview: true,
    subscriptionTier: "premium",
    tagIds: ["tag-eating-high-protein", "tag-goal-muscle-gain", "tag-social-lunch"]
  }
];

export const mockMeals: Meal[] = [
  {
    id: "meal-demo-lunch",
    userId: "user-demo",
    title: "雞胸便當",
    tagIds: ["tag-eating-high-protein", "tag-goal-calorie"],
    createdAt: "2026-05-25T12:00:00.000Z"
  }
];

export const mockRestaurants: Restaurant[] = [
  {
    id: "restaurant-demo-verified",
    ownerUserId: "user-restaurant-owner",
    name: "好食光健康餐盒",
    isVerified: true,
    tagIds: ["tag-restaurant-verified", "tag-restaurant-nutrition", "tag-restaurant-high-protein"]
  }
];
