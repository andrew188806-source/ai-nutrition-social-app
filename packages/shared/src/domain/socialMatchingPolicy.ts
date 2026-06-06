export const socialMatchingPriority = [
  "same_restaurant_overlap",
  "health_goal_compatibility",
  "tag_compatibility",
  "nearby_status"
] as const;

export const socialMatchingSignals = {
  sameRestaurantOverlap: ["selected_same_restaurant_today", "recently_ate_same_restaurant", "saved_same_restaurant"],
  healthGoalCompatibility: ["fat_loss", "high_protein", "balanced_eating", "healthy_dinner"],
  tagCompatibility: ["meal_tags", "health_goal_tags", "social_intent_tags"],
  nearbyStatus: ["approximate_distance", "meal_time_fit"]
} as const;
