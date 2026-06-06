import type { TagAssignment } from "../types";

export const mockUserTags: TagAssignment[] = [
  { id: "user-tag-demo-balanced", targetId: "user-demo", tagId: "tag-eating-balanced" },
  { id: "user-tag-demo-calorie", targetId: "user-demo", tagId: "tag-goal-calorie" },
  { id: "user-tag-demo-social", targetId: "user-demo", tagId: "tag-social-healthy-meal" }
];

export const mockMealTags: TagAssignment[] = [
  { id: "meal-tag-demo-protein", targetId: "meal-demo-lunch", tagId: "tag-eating-high-protein" },
  { id: "meal-tag-demo-calorie", targetId: "meal-demo-lunch", tagId: "tag-goal-calorie" }
];

export const mockRestaurantTags: TagAssignment[] = [
  { id: "restaurant-tag-demo-verified", targetId: "restaurant-demo-verified", tagId: "tag-restaurant-verified" },
  { id: "restaurant-tag-demo-nutrition", targetId: "restaurant-demo-verified", tagId: "tag-restaurant-nutrition" }
];

export const mockMenuItemTags: TagAssignment[] = [
  { id: "menu-item-tag-demo-protein", targetId: "menu-item-demo-chicken", tagId: "tag-restaurant-high-protein" },
];
