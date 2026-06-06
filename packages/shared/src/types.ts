export type Id = string;

export type SubscriptionTier = "free" | "premium";

export type TagCategory =
  | "eating_habit"
  | "health_goal"
  | "social_intent"
  | "restaurant"
  | "meal"
  | "menu_item";

export interface Tag {
  id: Id;
  category: TagCategory;
  label: string;
  slug: string;
  description: string;
}

export interface User {
  id: Id;
  email: string;
  createdAt: string;
}

export interface Profile {
  id: Id;
  userId: Id;
  displayName: string;
  isAnonymousPreview: boolean;
  subscriptionTier: SubscriptionTier;
  tagIds: Id[];
}

export interface Subscription {
  id: Id;
  userId: Id;
  tier: SubscriptionTier;
  status: "mock_active" | "active" | "inactive" | "canceled";
}

export interface Meal {
  id: Id;
  userId: Id;
  imageUrl?: string;
  title: string;
  tagIds: Id[];
  createdAt: string;
}

export interface MealLog {
  id: Id;
  userId: Id;
  mealId: Id;
  loggedAt: string;
}

export interface NutritionEstimate {
  id: Id;
  mealId: Id;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  confidence: "mock" | "low" | "medium" | "high";
}

export interface Ingredient {
  id: Id;
  menuItemId: Id;
  name: string;
  amount: string;
}

export interface CookingMethod {
  id: Id;
  menuItemId: Id;
  method: string;
}

export interface Recommendation {
  id: Id;
  userId: Id;
  title: string;
  reason: string;
  tagIds: Id[];
}

export interface SocialMatch {
  id: Id;
  userId: Id;
  matchedProfileId: Id;
  compatibilityScore: number;
  sharedTagIds: Id[];
  isUnlocked: boolean;
}

export interface SocialUnlock {
  id: Id;
  userId: Id;
  profileId: Id;
  unlockedAt: string;
}

export interface VisibilitySettings {
  id: Id;
  userId: Id;
  showDisplayName: boolean;
  showPhoto: boolean;
  showMealTags: boolean;
  showHealthGoals: boolean;
  showSocialIntent: boolean;
}

export interface TagMatchReason {
  id: Id;
  tagId: Id;
  reason: string;
  visibility: "free_preview" | "premium_detail";
}

export interface CompatibilityScore {
  id: Id;
  userId: Id;
  matchedProfileId: Id;
  score: number;
  sharedTagIds: Id[];
  recentMealPattern: string;
  nutritionBehavior: string;
  socialIntentFit: string;
  tagMatchReasons: TagMatchReason[];
}

export interface MatchAttemptLimit {
  id: Id;
  tier: SubscriptionTier;
  dailyMatchAttempts: number;
  dailyProfileUnlocks: number;
}

export interface Restaurant {
  id: Id;
  ownerUserId: Id;
  name: string;
  isVerified: boolean;
  tagIds: Id[];
}

export interface MenuItem {
  id: Id;
  restaurantId: Id;
  name: string;
  priceTwd: number;
  tagIds: Id[];
  portionSize?: string;
  cookingMethod?: string;
  calories?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
  disclosureStatus?: "draft" | "ready" | "published";
}

export interface RestaurantVerificationRequest {
  id: Id;
  restaurantId: Id;
  status: "draft" | "submitted" | "approved" | "rejected";
  requestedAt?: string;
  reviewNote?: string;
}

export interface RestaurantAnalytics {
  id: Id;
  restaurantId: Id;
  profileViews: number;
  nutritionDisclosureViews: number;
  recommendationClicks: number;
  tableJoinIntents: number;
}

export type MatchConfidence = "high" | "medium" | "needs_confirmation";

export type MealOrigin = "external_dining" | "self_cooked";

export type NutritionDataSaveTarget =
  | "food_memory"
  | "user_meal_history"
  | "shared_ai_ingredient_training"
  | "reusable_ingredient_patterns"
  | "restaurant_nutrition_profile"
  | "restaurant_nutrition_cache"
  | "menu_nutrition_cache"
  | "restaurant_location_context"
  | "reusable_nutrition_estimation_database";

export interface PrecisionMealCandidate {
  id: Id;
  restaurantId: Id;
  menuItemId: Id;
  restaurantName: string;
  menuItemName: string;
  district: string;
  confidence: MatchConfidence;
  confidenceScore: number;
  tagIds: Id[];
  explanation: string;
}

export interface MealIdentificationCorrection {
  id: Id;
  userId: Id;
  originalCandidateId?: Id;
  correctedRestaurantName: string;
  correctedMealName: string;
  correctedDistrict: string;
  note?: string;
  createdAt: string;
}

export interface RestaurantNutritionProfile {
  id: Id;
  restaurantId: Id;
  menuItemId: Id;
  source: "restaurant_menu" | "food_memory" | "user_correction" | "mock_dataset";
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  reuseCount: number;
  confidence: MatchConfidence;
  updatedAt: string;
}

export interface MenuNutritionCacheEntry {
  id: Id;
  restaurantId: Id;
  menuItemId: Id;
  cacheKey: string;
  nutritionProfileId: Id;
  hitCount: number;
  lastUsedAt: string;
}

export interface ExternalDiningCorrectionFlywheelRecord {
  id: Id;
  userId: Id;
  restaurantId: Id;
  menuItemId: Id;
  mealId: Id;
  correctionSource: "manual_add" | "manual_correct" | "ingredient_breakdown";
  savedToFoodMemory: boolean;
  savedToUserMealHistory: boolean;
  savedToSharedAiIngredientTraining: boolean;
  savedToRestaurantNutritionProfile: boolean;
  savedToRestaurantNutritionCache: boolean;
  savedToMenuNutritionCache: boolean;
  savedToReusableNutritionDataset: boolean;
  savedToRestaurantLocationContext: boolean;
  aiBreakdownTriggered: boolean;
  createdAt: string;
}

export interface IngredientEstimation {
  id: Id;
  selfCookedMealId: Id;
  ingredientName: string;
  estimatedAmount: string;
  confidence: MatchConfidence;
}

export interface PortionEstimation {
  id: Id;
  selfCookedMealId: Id;
  portionLabel: string;
  estimatedGrams: number;
  confidence: MatchConfidence;
}

export interface CookingMethodEstimation {
  id: Id;
  selfCookedMealId: Id;
  method: string;
  confidence: MatchConfidence;
}

export interface SelfCookedMeal {
  id: Id;
  userId: Id;
  title: string;
  notes: string;
  ingredientEstimationIds: Id[];
  portionEstimationIds: Id[];
  cookingMethodEstimationIds: Id[];
  nutritionEstimateId: Id;
  tagIds: Id[];
  savedToFoodMemory: boolean;
  savedToUserMealHistory: boolean;
  savedToSharedAiIngredientTraining: boolean;
  savedToReusableIngredientPatterns: boolean;
}

export type WorkoutType = "walking" | "strength_training" | "running" | "cycling" | "rest_day";

export interface ExerciseProfile {
  id: Id;
  userId: Id;
  weeklyActivityLevel: "low" | "moderate" | "high";
  preferredWorkoutTypes: WorkoutType[];
}

export interface MockActivityData {
  id: Id;
  userId: Id;
  dailySteps: number;
  workoutType: WorkoutType;
  workoutDurationMinutes: number;
  caloriesBurned: number;
  weeklyActivityLevel: "low" | "moderate" | "high";
}

export interface RecoveryMealRecommendation {
  id: Id;
  userId: Id;
  title: string;
  reason: string;
  tagIds: Id[];
  isPremiumOnly: boolean;
}

export interface FutureLearningRecord {
  id: Id;
  correctionId: Id;
  candidateId: Id;
  signal: "increase_confidence" | "needs_more_examples";
  note: string;
}

export interface RelationshipStatusSettings {
  id: Id;
  userId: Id;
  mode: "friends_only" | "open_to_meet_people" | "chat_only";
  relationshipIntent: "not_considering_romance" | "single_open_to_meet" | "open_social";
}

export interface SocialPrivacySettings {
  id: Id;
  userId: Id;
  socialCardEnabled: boolean;
  anonymousTagsOnly: boolean;
  hidePhoto: boolean;
  hideHealthGoals: boolean;
  optOutRestaurantMatches: boolean;
  optOutGroupTables: boolean;
}

export interface RestaurantSocialMatchCard {
  id: Id;
  restaurantId: Id;
  restaurantName: string;
  similarPeopleCount: number;
  title: string;
  reason: string;
  tagIds: Id[];
  respectsPrivacy: boolean;
}

export interface RestaurantVipMember {
  id: Id;
  restaurantId: Id;
  userId: Id;
  displayName: string;
  consentGranted: boolean;
  tagIds: Id[];
}

export interface Ad {
  id: Id;
  title: string;
  status: "draft" | "pending_review" | "approved" | "rejected";
}

export interface SponsoredRecommendation {
  id: Id;
  adId: Id;
  restaurantId: Id;
  tagIds: Id[];
}

export type TableStatus = "open" | "waiting" | "completed";

export interface GroupMealTable {
  id: Id;
  restaurantId: Id;
  hostUserId: Id;
  mealTheme: string;
  status: TableStatus;
  currentMemberCount: number;
  targetMemberCount: 4;
  tagIds: Id[];
  isPremiumOnly: boolean;
  compatibilityReason: string;
}

export interface GroupTableMember {
  id: Id;
  tableId: Id;
  userId: Id;
  profileId: Id;
  isAnonymousPreview: boolean;
  joinedAt: string;
}

export type FoodMemoryVisibility = "private" | "anonymous_social" | "visible_to_matches";

export interface MealRevisitScore {
  userRating: number;
  tasteRating: number;
  fullnessRating: number;
  healthinessRating: number;
  valueForMoneyRating: number;
  revisitIntention: "yes" | "maybe" | "no";
}

export interface FoodMemoryEntry {
  id: Id;
  userId: Id;
  date: string;
  mealTime: "breakfast" | "lunch" | "dinner" | "snack";
  district: string;
  restaurantName: string;
  mealName: string;
  imageUrl?: string;
  nutritionEstimateId: Id;
  rating: MealRevisitScore;
  eatingHabitTagIds: Id[];
  healthGoalTagIds: Id[];
  restaurantTagIds: Id[];
  mealTagIds: Id[];
  socialIntentTagIds: Id[];
  note: string;
  visibility: FoodMemoryVisibility;
  isFavorite: boolean;
}

export interface FoodMemoryFilter {
  id: Id;
  userId: Id;
  date?: string;
  district?: string;
  restaurantName?: string;
  mealType?: FoodMemoryEntry["mealTime"];
  minRating?: number;
  tagIds?: Id[];
  revisitIntention?: MealRevisitScore["revisitIntention"];
  favoritesOnly?: boolean;
}

export interface FoodMemoryFavorite {
  id: Id;
  userId: Id;
  foodMemoryEntryId: Id;
  createdAt: string;
}

export interface SocialPromptSuggestion {
  id: Id;
  userId: Id;
  foodMemoryEntryId?: Id;
  matchedProfileId?: Id;
  promptType: "chat_topic" | "recommend_to_match" | "find_similar_people" | "start_group_table";
  visibility: "free_preview" | "premium_detail";
  tagIds: Id[];
}

export interface WeightGoalSettings {
  currentWeightKg: number;
  targetWeightKg: number;
  targetDate: string;
  activityLevel: "low" | "moderate" | "high";
  dietaryPreference: string;
  avoidFoods: string[];
  preferredMealTypes: string[];
  healthGoalTagIds: Id[];
}

export interface NutritionGoalTarget {
  dailyCalorieMin: number;
  dailyCalorieMax: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}

export interface RecommendedMealTarget {
  id: Id;
  healthGoalPlanId: Id;
  mealTime: FoodMemoryEntry["mealTime"];
  title: string;
  tagIds: Id[];
}

export interface HealthGoalPlan {
  id: Id;
  userId: Id;
  tier: SubscriptionTier;
  settings: WeightGoalSettings;
  nutritionTarget: NutritionGoalTarget;
  weeklyProgressTarget: string;
  todayEat: string[];
  todayAvoid: string[];
  isPremiumLocked: boolean;
}

export interface HealthGoalProgress {
  id: Id;
  healthGoalPlanId: Id;
  weekStartDate: string;
  weightKg?: number;
  note: string;
}

export interface TableJoinLimit {
  id: Id;
  tier: SubscriptionTier;
  dailyJoinLimit: number;
}

export interface TableCreateLimit {
  id: Id;
  tier: SubscriptionTier;
  dailyCreateLimit: number;
}

export interface Consent {
  id: Id;
  userId: Id;
  consentType: "social_discovery" | "restaurant_vip_insights" | "ads_personalization";
  granted: boolean;
  updatedAt: string;
}

export interface DataAccessLog {
  id: Id;
  actorId: Id;
  targetUserId?: Id;
  action: string;
  createdAt: string;
}

export interface AuditLog {
  id: Id;
  actorId: Id;
  entityType: string;
  entityId: Id;
  action: string;
  createdAt: string;
}

export interface PlatformSetting {
  id: Id;
  key: string;
  value: string;
}

export interface TagAssignment {
  id: Id;
  tagId: Id;
  targetId: Id;
}

export type AdminReviewStatus = "pending" | "approved" | "rejected" | "needs_changes";
export type GovernanceRiskLevel = "low" | "medium" | "high";

export interface AdminUser {
  id: Id;
  email: string;
  role: "super_admin" | "reviewer" | "governance_auditor";
}

export interface VerificationReview {
  id: Id;
  restaurantId: Id;
  restaurantName: string;
  status: AdminReviewStatus;
  riskLevel: GovernanceRiskLevel;
  reviewNote: string;
  updatedAt: string;
}

export interface MenuItemReview {
  id: Id;
  menuItemId: Id;
  restaurantName: string;
  menuItemName: string;
  status: AdminReviewStatus;
  nutritionDisclosureStatus: "draft" | "submitted" | "published";
  riskyClaimFlagIds: Id[];
}

export interface AdReview {
  id: Id;
  adId: Id;
  advertiserName: string;
  creativeTitle: string;
  status: AdminReviewStatus;
  sponsoredLabelVisible: boolean;
  riskyClaimFlagIds: Id[];
}

export interface SponsoredRecommendationReview {
  id: Id;
  sponsoredRecommendationId: Id;
  restaurantName: string;
  tagIds: Id[];
  status: AdminReviewStatus;
  organicTagsSeparated: boolean;
}

export interface RiskyKeywordFlag {
  id: Id;
  entityType: "menu_item" | "ad" | "tag" | "social_intent" | "health_goal";
  entityId: Id;
  keyword: string;
  riskLevel: GovernanceRiskLevel;
  reason: string;
}

export interface TagReview {
  id: Id;
  tagId: Id;
  category: TagCategory;
  status: AdminReviewStatus;
  riskLevel: GovernanceRiskLevel;
  reviewNote: string;
}

export interface SponsoredTagReview {
  id: Id;
  tagId: Id;
  sponsoredRecommendationId: Id;
  status: AdminReviewStatus;
  isClearlySponsored: boolean;
}

export interface SocialIntentTagReview {
  id: Id;
  tagId: Id;
  status: AdminReviewStatus;
  datingFirstRisk: GovernanceRiskLevel;
  reviewNote: string;
}

export interface RelationshipStatusReview {
  id: Id;
  settingId: Id;
  status: AdminReviewStatus;
  privacyControlled: boolean;
  reviewNote: string;
}

export interface RestaurantSocialMatchReview {
  id: Id;
  restaurantSocialMatchCardId: Id;
  restaurantName: string;
  status: AdminReviewStatus;
  respectsPrivacySettings: boolean;
  visibleUserCount: number;
}

export interface RestaurantMenuIdentificationAudit {
  id: Id;
  userId: Id;
  suggestedRestaurantName: string;
  suggestedMenuItemName: string;
  confidence: MatchConfidence;
  userAction: "confirmed" | "corrected" | "manual_entry";
  dataSources: Array<"meal_photo_analysis" | "mock_location_district" | "nearby_restaurant_candidates" | "menu_database" | "food_memory_history" | "user_correction_behavior">;
  createdAt: string;
}

export interface UserCorrectionAudit {
  id: Id;
  correctionId: Id;
  originalSuggestion: string;
  correctedResult: string;
  futureLearningSignal: FutureLearningRecord["signal"];
  consentForImprovement: boolean;
}

export interface RecommendationTransparencyLog {
  id: Id;
  userId: Id;
  recommendationType: "next_meal" | "restaurant" | "social_match" | "group_table" | "sponsored";
  tagIds: Id[];
  dataSources: string[];
  sponsoredInfluence: boolean;
}

export interface SelfCookedEstimationAudit {
  id: Id;
  selfCookedMealId: Id;
  originalEstimate: string;
  correctedIngredients: string;
  correctedPortion: string;
  correctedCookingMethod: string;
  nutritionChangeSummary: string;
  consentForImprovement: boolean;
  riskyClaimFlagIds: Id[];
}

export interface IngredientCorrectionLog {
  id: Id;
  selfCookedMealId: Id;
  fromValue: string;
  toValue: string;
}

export interface PortionCorrectionLog {
  id: Id;
  selfCookedMealId: Id;
  fromValue: string;
  toValue: string;
}

export interface CookingMethodCorrectionLog {
  id: Id;
  selfCookedMealId: Id;
  fromValue: string;
  toValue: string;
}

export interface ExerciseDataAccessLog {
  id: Id;
  userId: Id;
  consentGranted: boolean;
  accessedFields: Array<"daily_steps" | "workout_type" | "workout_duration" | "calories_burned" | "weekly_activity_level">;
  purpose: "health_goal_recommendation" | "recovery_meal_recommendation";
  createdAt: string;
}

export interface HealthGoalRecommendationAudit {
  id: Id;
  userId: Id;
  affectedOutputs: Array<"daily_calorie_range" | "protein_target" | "recovery_meal" | "next_meal" | "restaurant_menu">;
  usesMockExerciseData: boolean;
  noWearableConnected: boolean;
  explanation: string;
}
