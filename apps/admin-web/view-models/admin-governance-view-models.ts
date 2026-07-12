import type { RestaurantDomain } from "@haocu/shared/domain";

export type GovernanceDiffValue = string | number | boolean | null | undefined | string[];

export type ReviewStatus = "pending" | "approved" | "returned" | "rejected";
export type AdminWorkflowAction =
  | "approve"
  | "return_for_changes"
  | "reject"
  | "merge"
  | "keep_separate"
  | "create_alias"
  | "request_more_information"
  | "ignore"
  | "change_target"
  | "mark_typo"
  | "wrong_restaurant"
  | "adopt_ai"
  | "partial_adopt_ai"
  | "mark_anomaly";

export type AdminPageState = {
  loading: boolean;
  error?: string;
  filterLabel: string;
  searchPlaceholder: string;
  noResultsLabel: string;
};

export type RestaurantReviewViewModel = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  branchId?: string;
  branchName?: string;
  status: ReviewStatus;
  submitter: string;
  reviewer?: string;
  submittedAt: string;
  reviewedAt?: string;
  before: Record<string, GovernanceDiffValue>;
  after: Record<string, GovernanceDiffValue>;
  notes?: string;
  availableActions: AdminWorkflowAction[];
  actionDraft?: RestaurantDomain.AdminActionDraft;
};

export type DuplicateMenuItemViewModel = {
  id: string;
  canonicalMenuItemId: string;
  suspectedDuplicateMenuItemId: string;
  officialMenuItemName: string;
  suspectedName: string;
  restaurantId: string;
  restaurantName: string;
  branchId?: string;
  branchName?: string;
  aliases: RestaurantDomain.MenuItemAlias[];
  ingredients: RestaurantDomain.MenuItemIngredient[];
  nutrition?: RestaurantDomain.MenuItemNutrition;
  similarityScore: number;
  usageCount: number;
  recommendationReferenceCount: number;
  mealRecordReferenceCount: number;
  availableActions: AdminWorkflowAction[];
  actionDraft?: RestaurantDomain.AdminActionDraft;
};

export type AliasReviewViewModel = {
  id: string;
  aliasId: string;
  aliasName: string;
  normalizedAliasName: string;
  sourceType: RestaurantDomain.MenuItemAliasSourceType;
  restaurantId: string;
  restaurantName: string;
  branchId?: string;
  branchName?: string;
  suggestedMenuItemId: string;
  suggestedMenuItemName: string;
  confidenceScore: number;
  usageCount: number;
  status: RestaurantDomain.AliasReview["status"];
  availableActions: AdminWorkflowAction[];
  actionDraft?: RestaurantDomain.AdminActionDraft;
};

export type PendingMenuItemReviewViewModel = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  branchId: string;
  branchName?: string;
  userEnteredName: string;
  aiDetectedName: string;
  candidateMenuItemId?: string;
  candidateMenuItemName?: string;
  uploadedPhoto?: string;
  occurrenceCount: number;
  mostRecentOccurrence: string;
  restaurantProcessingStatus: RestaurantDomain.PendingMenuItem["status"];
  platformProcessingStatus: "pending_platform_review" | "draft_created" | "returned" | "rejected";
  similarityScore: number;
  source: "manual_input" | "ai_detected" | "restaurant_console";
  availableActions: AdminWorkflowAction[];
  actionDraft?: RestaurantDomain.AdminActionDraft;
};

export type NutritionReviewViewModel = {
  id: string;
  menuItemId: string;
  menuItemName: string;
  restaurantId: string;
  restaurantName: string;
  officialNutrition?: RestaurantDomain.MenuItemNutrition;
  aiEstimate?: RestaurantDomain.NutritionEstimate;
  review?: RestaurantDomain.NutritionReview;
  changeHistory: RestaurantDomain.NutritionChangeLog[];
  confidenceScore: number;
  source: RestaurantDomain.MenuItemNutrition["source"] | "missing";
  verifiedStatus: RestaurantDomain.VerificationStatus | "missing";
  before: Record<string, GovernanceDiffValue>;
  after: Record<string, GovernanceDiffValue>;
  availableActions: AdminWorkflowAction[];
  actionDraft?: RestaurantDomain.AdminActionDraft;
};

export type AnalyticsQualityIssueViewModel = {
  id: string;
  eventId?: string;
  recommendationId?: string;
  severity: "info" | "warning" | "critical";
  issueCode: string;
  message: string;
  restaurantId?: string;
  branchId?: string;
  menuItemId?: string;
  source: string;
  occurredAt?: string;
};

export type RecommendationAnomalyViewModel = {
  id: string;
  recommendationId: string;
  userId: string;
  menuItemId: string;
  menuItemName?: string;
  branchId: string;
  branchOffersItem: boolean;
  menuItemDiscontinued: boolean;
  nutritionMissing: boolean;
  score: number;
  reasonCodes: string[];
  anomalyReason: string;
  availableActions: AdminWorkflowAction[];
};

export type AuditLogViewModel = {
  id: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  result: string;
  note?: string;
  createdAt: string;
};
