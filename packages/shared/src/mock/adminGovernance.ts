import type {
  AdReview,
  AdminUser,
  AuditLog,
  Consent,
  DataAccessLog,
  ExerciseDataAccessLog,
  HealthGoalRecommendationAudit,
  MenuItemReview,
  RecommendationTransparencyLog,
  RelationshipStatusReview,
  RestaurantMenuIdentificationAudit,
  RestaurantSocialMatchReview,
  RiskyKeywordFlag,
  SelfCookedEstimationAudit,
  SocialIntentTagReview,
  SponsoredRecommendationReview,
  SponsoredTagReview,
  TagReview,
  UserCorrectionAudit,
  VerificationReview
} from "../types";

export const mockAdminUsers: AdminUser[] = [
  { id: "admin-1", email: "reviewer@haocu.demo", role: "governance_auditor" },
  { id: "admin-2", email: "ops@haocu.demo", role: "reviewer" }
];

export const mockVerificationReviews: VerificationReview[] = [
  {
    id: "verification-review-1",
    restaurantId: "restaurant-haochu-bowl",
    restaurantName: "好初健康碗",
    status: "pending",
    riskLevel: "low",
    reviewNote: "identity_and_nutrition_disclosure_ready",
    updatedAt: "2026-05-25T09:30:00+08:00"
  },
  {
    id: "verification-review-2",
    restaurantId: "restaurant-green-deli",
    restaurantName: "綠食便當所",
    status: "needs_changes",
    riskLevel: "medium",
    reviewNote: "menu_nutrition_source_needs_review",
    updatedAt: "2026-05-25T10:15:00+08:00"
  }
];

export const mockMenuItemReviews: MenuItemReview[] = [
  {
    id: "menu-review-1",
    menuItemId: "menu-chicken-bowl",
    restaurantName: "好初健康碗",
    menuItemName: "雞胸高蛋白碗",
    status: "pending",
    nutritionDisclosureStatus: "submitted",
    riskyClaimFlagIds: []
  },
  {
    id: "menu-review-2",
    menuItemId: "menu-fat-loss-box",
    restaurantName: "綠食便當所",
    menuItemName: "低卡減脂餐盒",
    status: "needs_changes",
    nutritionDisclosureStatus: "submitted",
    riskyClaimFlagIds: ["risk-claim-1"]
  }
];

export const mockAdReviews: AdReview[] = [
  {
    id: "ad-review-1",
    adId: "ad-protein-bowl",
    advertiserName: "好初健康碗",
    creativeTitle: "post_workout_lunch_campaign",
    status: "pending",
    sponsoredLabelVisible: true,
    riskyClaimFlagIds: []
  },
  {
    id: "ad-review-2",
    adId: "ad-claim-risk",
    advertiserName: "燃脂餐盒",
    creativeTitle: "claim_heavy_campaign",
    status: "needs_changes",
    sponsoredLabelVisible: false,
    riskyClaimFlagIds: ["risk-claim-2"]
  }
];

export const mockSponsoredRecommendationReviews: SponsoredRecommendationReview[] = [
  {
    id: "sponsored-review-1",
    sponsoredRecommendationId: "sponsored-haochu-1",
    restaurantName: "好初健康碗",
    tagIds: ["tag-restaurant-high-protein", "tag-goal-muscle-gain"],
    status: "pending",
    organicTagsSeparated: true
  },
  {
    id: "sponsored-review-2",
    sponsoredRecommendationId: "sponsored-deli-1",
    restaurantName: "綠食便當所",
    tagIds: ["tag-restaurant-low-calorie", "tag-goal-fat-loss"],
    status: "needs_changes",
    organicTagsSeparated: false
  }
];

export const mockRiskyKeywordFlags: RiskyKeywordFlag[] = [
  {
    id: "risk-claim-1",
    entityType: "menu_item",
    entityId: "menu-fat-loss-box",
    keyword: "治療",
    riskLevel: "high",
    reason: "medical_treatment_claim"
  },
  {
    id: "risk-claim-2",
    entityType: "ad",
    entityId: "ad-claim-risk",
    keyword: "保證瘦",
    riskLevel: "high",
    reason: "guaranteed_weight_loss_claim"
  },
  {
    id: "risk-social-1",
    entityType: "social_intent",
    entityId: "tag-social-open-dating",
    keyword: "約會",
    riskLevel: "medium",
    reason: "dating_first_positioning_risk"
  }
];

export const mockTagReviews: TagReview[] = [
  { id: "tag-review-1", tagId: "tag-eating-high-protein", category: "eating_habit", status: "approved", riskLevel: "low", reviewNote: "lifestyle_description" },
  { id: "tag-review-2", tagId: "tag-goal-fat-loss", category: "health_goal", status: "pending", riskLevel: "medium", reviewNote: "avoid_medical_claims" },
  { id: "tag-review-3", tagId: "tag-restaurant-verified", category: "restaurant", status: "approved", riskLevel: "low", reviewNote: "not_government_certification" }
];

export const mockSponsoredTagReviews: SponsoredTagReview[] = [
  { id: "sponsored-tag-review-1", tagId: "tag-restaurant-high-protein", sponsoredRecommendationId: "sponsored-haochu-1", status: "approved", isClearlySponsored: true },
  { id: "sponsored-tag-review-2", tagId: "tag-goal-fat-loss", sponsoredRecommendationId: "sponsored-deli-1", status: "needs_changes", isClearlySponsored: false }
];

export const mockSocialIntentTagReviews: SocialIntentTagReview[] = [
  { id: "social-tag-review-1", tagId: "tag-social-find-meal-friend", status: "approved", datingFirstRisk: "low", reviewNote: "healthy_meal_companion" },
  { id: "social-tag-review-2", tagId: "tag-social-single-open", status: "pending", datingFirstRisk: "medium", reviewNote: "keep_optional_and_privacy_controlled" },
  { id: "social-tag-review-3", tagId: "tag-social-chat-only", status: "approved", datingFirstRisk: "low", reviewNote: "safe_remote_interaction" }
];

export const mockRelationshipStatusReviews: RelationshipStatusReview[] = [
  { id: "relationship-review-1", settingId: "relationship-settings-demo-1", status: "approved", privacyControlled: true, reviewNote: "friends_only_default" },
  { id: "relationship-review-2", settingId: "relationship-settings-demo-2", status: "pending", privacyControlled: true, reviewNote: "optional_preference_data" }
];

export const mockRestaurantSocialMatchReviews: RestaurantSocialMatchReview[] = [
  {
    id: "restaurant-social-review-1",
    restaurantSocialMatchCardId: "restaurant-social-haochu-1",
    restaurantName: "好初健康碗",
    status: "approved",
    respectsPrivacySettings: true,
    visibleUserCount: 3
  }
];

export const mockRestaurantMenuIdentificationAudits: RestaurantMenuIdentificationAudit[] = [
  {
    id: "identification-audit-1",
    userId: "user-demo-1",
    suggestedRestaurantName: "好初健康碗",
    suggestedMenuItemName: "雞胸高蛋白碗",
    confidence: "medium",
    userAction: "confirmed",
    dataSources: ["meal_photo_analysis", "mock_location_district", "nearby_restaurant_candidates", "menu_database", "food_memory_history"],
    createdAt: "2026-05-25T12:10:00+08:00"
  },
  {
    id: "identification-audit-2",
    userId: "user-demo-2",
    suggestedRestaurantName: "綠食便當所",
    suggestedMenuItemName: "低卡減脂餐盒",
    confidence: "needs_confirmation",
    userAction: "corrected",
    dataSources: ["meal_photo_analysis", "mock_location_district", "nearby_restaurant_candidates", "menu_database", "user_correction_behavior"],
    createdAt: "2026-05-25T12:24:00+08:00"
  }
];

export const mockUserCorrectionAudits: UserCorrectionAudit[] = [
  {
    id: "correction-audit-1",
    correctionId: "correction-demo-1",
    originalSuggestion: "好初健康碗 / 雞胸高蛋白碗",
    correctedResult: "好初健康碗 / 香煎雞胸蔬菜盤",
    futureLearningSignal: "increase_confidence",
    consentForImprovement: true
  }
];

export const mockRecommendationTransparencyLogs: RecommendationTransparencyLog[] = [
  {
    id: "transparency-1",
    userId: "user-demo-1",
    recommendationType: "restaurant",
    tagIds: ["tag-eating-high-protein", "tag-goal-calorie", "tag-restaurant-verified"],
    dataSources: ["Food Memory", "tag match", "mock district"],
    sponsoredInfluence: false
  },
  {
    id: "transparency-2",
    userId: "user-demo-1",
    recommendationType: "sponsored",
    tagIds: ["tag-restaurant-high-protein"],
    dataSources: ["ad review", "sponsored tag match"],
    sponsoredInfluence: true
  }
];

export const mockSelfCookedEstimationAudits: SelfCookedEstimationAudit[] = [
  {
    id: "self-cooked-audit-1",
    selfCookedMealId: "self-cooked-demo-1",
    originalEstimate: "chicken_breast_140g_broccoli_120g_brown_rice_100g",
    correctedIngredients: "chicken_breast_150g_broccoli_100g_brown_rice_90g",
    correctedPortion: "regular_plate_340g",
    correctedCookingMethod: "pan_seared_less_oil",
    nutritionChangeSummary: "calories_minus_40_protein_plus_3g",
    consentForImprovement: true,
    riskyClaimFlagIds: []
  }
];

export const mockExerciseDataAccessLogs: ExerciseDataAccessLog[] = [
  {
    id: "exercise-access-1",
    userId: "user-demo-1",
    consentGranted: true,
    accessedFields: ["daily_steps", "workout_type", "workout_duration", "calories_burned", "weekly_activity_level"],
    purpose: "health_goal_recommendation",
    createdAt: "2026-05-25T12:30:00+08:00"
  }
];

export const mockHealthGoalRecommendationAudits: HealthGoalRecommendationAudit[] = [
  {
    id: "health-goal-audit-1",
    userId: "user-demo-1",
    affectedOutputs: ["daily_calorie_range", "protein_target", "recovery_meal", "next_meal", "restaurant_menu"],
    usesMockExerciseData: true,
    noWearableConnected: true,
    explanation: "mock_activity_adjusts_lifestyle_recommendations_only"
  }
];

export const mockAdminConsents: Consent[] = [
  { id: "consent-social-1", userId: "user-demo-1", consentType: "social_discovery", granted: true, updatedAt: "2026-05-24T19:10:00+08:00" },
  { id: "consent-vip-1", userId: "user-demo-1", consentType: "restaurant_vip_insights", granted: false, updatedAt: "2026-05-24T19:12:00+08:00" },
  { id: "consent-ads-1", userId: "user-demo-2", consentType: "ads_personalization", granted: true, updatedAt: "2026-05-24T20:20:00+08:00" }
];

export const mockAdminDataAccessLogs: DataAccessLog[] = [
  { id: "data-access-1", actorId: "admin-1", targetUserId: "user-demo-1", action: "view_consent_summary", createdAt: "2026-05-25T11:00:00+08:00" },
  { id: "data-access-2", actorId: "restaurant-haochu-bowl", targetUserId: "user-demo-1", action: "view_consented_vip_tags", createdAt: "2026-05-25T11:08:00+08:00" }
];

export const mockAdminAuditLogs: AuditLog[] = [
  { id: "audit-1", actorId: "admin-1", entityType: "restaurant_verification", entityId: "verification-review-1", action: "review_opened", createdAt: "2026-05-25T11:30:00+08:00" },
  { id: "audit-2", actorId: "admin-2", entityType: "ad_review", entityId: "ad-review-2", action: "flagged_sponsored_label_missing", createdAt: "2026-05-25T11:40:00+08:00" }
];
