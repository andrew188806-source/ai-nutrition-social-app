export type Id = string;

export type RestaurantStatus = "active" | "paused";
export type MenuStatus = "draft" | "active" | "archived";
export type MenuItemStatus = "draft" | "active" | "archived";
export type BranchMenuItemStatus = "available" | "hidden" | "discontinued";
export type NutritionBadgeStatus = "approved" | "ai_estimated" | "pending_review" | "missing";
export type VerificationStatus = "verified" | "ai_estimated" | "pending_review" | "rejected";
export type AccessScope = "platform" | "restaurant" | "branch" | "self";

export interface Restaurant {
  id: Id;
  name: string;
  legalName: string;
  city: string;
  category: string;
  tags: string[];
  plan: "demo" | "starter" | "growth";
  status: RestaurantStatus;
}

export interface RestaurantBranch {
  id: Id;
  restaurantId: Id;
  name: string;
  district: string;
  address: string;
  isActive: boolean;
}

export interface Menu {
  id: Id;
  restaurantId: Id;
  name: string;
  status: MenuStatus;
}

export interface MenuCategory {
  id: Id;
  menuId: Id;
  name: string;
  sortOrder: number;
}

export interface MenuItem {
  id: Id;
  restaurantId: Id;
  menuCategoryId: Id;
  name: string;
  description: string;
  imageUrl?: string;
  tagIds: string[];
  allergens: string[];
  status: MenuItemStatus;
  nutritionId?: Id;
  nutritionBadgeStatus: NutritionBadgeStatus;
  badgeEnabled: boolean;
}

export interface BranchMenuItem {
  id: Id;
  restaurantId: Id;
  branchId: Id;
  menuItemId: Id;
  price: number;
  availability: "available" | "limited" | "unavailable";
  soldOut: boolean;
  branchSpecificName?: string;
  branchSpecificDescription?: string;
  branchSpecificStatus: BranchMenuItemStatus;
}

export interface MenuItemVariant {
  id: Id;
  menuItemId: Id;
  name: string;
  priceDelta: number;
  status: "active" | "inactive";
}

export type MenuItemAliasSourceType = "restaurant" | "user_input" | "ai_detected" | "admin" | "imported" | "legacy";
export type MenuItemAliasStatus = "pending" | "approved" | "rejected" | "merged";

export interface MenuItemAlias {
  id: Id;
  menuItemId: Id;
  aliasName: string;
  normalizedAliasName: string;
  sourceType: MenuItemAliasSourceType;
  restaurantId: Id;
  branchId?: Id;
  confidenceScore: number;
  status: MenuItemAliasStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Ingredient {
  id: Id;
  name: string;
  defaultUnit: string;
}

export interface IngredientNutrition {
  id: Id;
  ingredientId: Id;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  saturatedFat?: number;
  perUnit: string;
}

export interface MenuItemIngredient {
  id: Id;
  ingredientId: Id;
  menuItemId: Id;
  amount: number;
  unit: string;
  preparationMethod: string;
  source: "restaurant" | "ai_estimate" | "admin";
  status: "complete" | "missing_ingredients" | "missing_portion" | "ai_outlier";
}

export interface MenuItemNutrition {
  id: Id;
  menuItemId: Id;
  calories?: number;
  protein?: number;
  carbohydrates?: number;
  fat?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  saturatedFat?: number;
  servingSize?: string;
  source: "restaurant_verified" | "admin_verified" | "ai_estimated" | "pending";
  confidenceScore: number;
  verifiedStatus: VerificationStatus;
  updatedAt: string;
}

export interface NutritionEstimate {
  id: Id;
  menuItemId: Id;
  calories?: number;
  protein?: number;
  carbohydrates?: number;
  fat?: number;
  confidenceScore: number;
  modelVersion: string;
  createdAt: string;
}

export interface NutritionReview {
  id: Id;
  menuItemId: Id;
  nutritionId?: Id;
  status: "pending" | "approved" | "rejected" | "needs_changes";
  note?: string;
  reviewerId?: Id;
  reviewedAt?: string;
}

export interface NutritionChangeLog {
  id: Id;
  menuItemId: Id;
  changedBy: Id;
  before: Record<string, string | number | boolean | null>;
  after: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export type PendingMenuItemStatus = "pending" | "matched_existing_item" | "confirmed_new_item" | "rejected" | "needs_more_information";

export interface PendingMenuItem {
  id: Id;
  restaurantId: Id;
  branchId: Id;
  userInputName: string;
  normalizedInputName: string;
  occurrenceCount: number;
  lastSeenAt: string;
  photoUrl?: string;
  aiCategoryGuess: string;
  aiSuggestedMenuItemId?: Id;
  similarity: number;
  status: PendingMenuItemStatus;
}

export interface MealRecord {
  id: Id;
  userId: Id;
  restaurantId?: Id;
  branchId?: Id;
  menuItemId?: Id;
  mealName: string;
  loggedAt: string;
}

export interface UserFoodPreference {
  id: Id;
  userId: Id;
  tagIds: string[];
  avoidIngredientIds: Id[];
  updatedAt: string;
}

export interface MenuItemRating {
  id: Id;
  userId: Id;
  restaurantId: Id;
  branchId?: Id;
  menuItemId: Id;
  isFavorite: boolean;
  finished: boolean;
  privateRating: number;
  dislikeReasons: string[];
  tasteFeeling: string;
  portionFeeling: string;
  priceFeeling: string;
  repurchaseIntent: "yes" | "maybe" | "no";
  visibility: "private" | "anonymous_aggregate";
  createdAt: string;
}

export interface RecommendationResult {
  id: Id;
  userId: Id;
  restaurantId: Id;
  branchId: Id;
  menuItemId: Id;
  score: number;
  reasonCodes: string[];
  nutritionFitScore: number;
  tasteFitScore: number;
  distanceScore: number;
  availabilityScore: number;
  generatedAt: string;
  modelVersion: string;
}

export interface RestaurantReview {
  id: Id;
  restaurantId: Id;
  submittedBy: Id;
  reviewerId?: Id;
  status: "pending" | "approved" | "returned" | "rejected";
  before: Partial<Restaurant>;
  after: Partial<Restaurant>;
  note?: string;
  submittedAt: string;
  reviewedAt?: string;
}

export interface BranchReview {
  id: Id;
  restaurantId: Id;
  branchId: Id;
  submittedBy: Id;
  reviewerId?: Id;
  status: "pending" | "approved" | "returned" | "rejected";
  before: Partial<RestaurantBranch>;
  after: Partial<RestaurantBranch>;
  note?: string;
  submittedAt: string;
  reviewedAt?: string;
}

export interface MenuItemMergeCandidate {
  id: Id;
  canonicalMenuItemId: Id;
  suspectedDuplicateMenuItemId: Id;
  restaurantId: Id;
  branchId?: Id;
  similarityScore: number;
  usageCount: number;
  recommendationReferenceCount: number;
  mealRecordReferenceCount: number;
  status: "pending" | "draft_created" | "kept_separate" | "ignored";
  suggestedAction: "merge" | "keep_separate" | "create_alias" | "request_more_information" | "ignore";
  mergedIntoMenuItemId?: Id;
}

export interface AliasReview {
  id: Id;
  aliasId: Id;
  suggestedMenuItemId: Id;
  usageCount: number;
  status: "pending" | "approved" | "target_changed" | "rejected" | "merged" | "typo" | "wrong_restaurant";
  note?: string;
}

export interface DataQualityIssue {
  id: Id;
  sourceType: "analytics_event" | "recommendation" | "pending_menu_item" | "nutrition" | "menu_item";
  sourceId: Id;
  severity: "info" | "warning" | "critical";
  issueCode: string;
  message: string;
  resolved: boolean;
}

export interface RecommendationAnomaly {
  id: Id;
  recommendationId: Id;
  menuItemId: Id;
  branchId: Id;
  anomalyReason: string;
  status: "open" | "ignored" | "investigation_draft_created";
}

export interface AnalyticsEventIssue {
  id: Id;
  analyticsEventId: Id;
  issueCode: string;
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface AdminActionDraft {
  id: Id;
  actionType:
    | "approve_restaurant_review"
    | "return_restaurant_review"
    | "reject_restaurant_review"
    | "merge_menu_items"
    | "keep_menu_items_separate"
    | "create_menu_item_alias"
    | "approve_alias"
    | "change_alias_target"
    | "reject_alias"
    | "map_pending_item"
    | "create_formal_menu_item_draft"
    | "approve_nutrition"
    | "adopt_ai_nutrition"
    | "partial_adopt_ai_nutrition"
    | "mark_recommendation_anomaly";
  targetType: "restaurant" | "branch" | "menu_item" | "alias" | "pending_menu_item" | "nutrition" | "analytics_event" | "recommendation";
  targetId: Id;
  before: Record<string, string | number | boolean | null | undefined>;
  after: Record<string, string | number | boolean | null | undefined>;
  status: "draft" | "confirmed_mock" | "cancelled";
  createdBy: Id;
  createdAt: string;
  auditLogId?: Id;
}

export type AnalyticsEventType =
  | "menu_item_impression"
  | "menu_item_view"
  | "menu_item_favorite"
  | "menu_item_add_to_cart"
  | "menu_item_order"
  | "nutrition_badge_enabled"
  | "nutrition_badge_disabled"
  | "recommendation_impression"
  | "recommendation_click"
  | "restaurant_page_view"
  | "pending_menu_item_submitted"
  | "pending_menu_item_resolved"
  | "employee_transferred"
  | "employee_role_changed";

export type AnalyticsSource = "my_city" | "ai_recommendation" | "search" | "meal_buddy" | "favorite" | "direct" | "restaurant_page" | "manual_input" | "admin";

export interface AnalyticsEvent {
  id: Id;
  eventType: AnalyticsEventType;
  userId?: Id;
  restaurantId: Id;
  branchId?: Id;
  menuItemId?: Id;
  recommendationId?: Id;
  source: AnalyticsSource;
  occurredAt: string;
  metadata: Record<string, string | number | boolean | null | undefined>;
}

export type EmployeeRole = "owner" | "manager" | "nutrition_editor" | "branch_staff" | "viewer" | "platform_admin";

export interface RestaurantEmployee {
  id: Id;
  restaurantId: Id;
  name: string;
  title: string;
  phone?: string;
  status: "active" | "inactive";
  defaultBranchId?: Id;
  effectiveDate: string;
}

export interface RestaurantUser {
  id: Id;
  authUserId: Id;
  employeeId?: Id;
  email: string;
  displayName: string;
  loginStatus: "enabled" | "disabled";
  permissionScope: AccessScope;
}

export interface EmployeeBranchAssignment {
  id: Id;
  employeeId: Id;
  branchId: Id;
  effectiveDate: string;
}

export interface EmployeeRoleAssignment {
  id: Id;
  employeeId: Id;
  role: EmployeeRole;
  scope: AccessScope;
  branchId?: Id;
  effectiveDate: string;
}

export interface EmployeeTransferLog {
  id: Id;
  employeeId: Id;
  fromBranchId?: Id;
  toBranchId: Id;
  operatorUserId: Id;
  effectiveDate: string;
  note: string;
}

export interface AssistantSuggestion {
  id: Id;
  prompt: string;
  category: "query" | "reminder" | "guide" | "draft";
}

export interface AssistantActionDraft {
  id: Id;
  title: string;
  targetType: "menu_item" | "employee" | "branch_assignment" | "nutrition";
  before: string;
  after: string;
  status: "draft" | "waiting_admin_confirmation" | "applied_mock";
}

export interface AuditLog {
  id: Id;
  actorUserId: Id;
  actorName: string;
  action: string;
  targetType: string;
  targetId: Id;
  result: string;
  note?: string;
  createdAt: string;
}
