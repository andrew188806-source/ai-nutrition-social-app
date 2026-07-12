import type {
  AdminActionDraft,
  AliasReview,
  AnalyticsEventIssue,
  AuditLog,
  BranchReview,
  DataQualityIssue,
  MenuItemMergeCandidate,
  RecommendationAnomaly,
  RestaurantReview
} from "../../domain/restaurantDomain";

export const canonicalRestaurantReviews: RestaurantReview[] = [
  {
    id: "restaurant-review-haochu-tags",
    restaurantId: "restaurant-haochu-bowl",
    submittedBy: "user-mina",
    reviewerId: "platform-admin-demo",
    status: "pending",
    before: { category: "健康碗" },
    after: { category: "健康餐盒", tags: ["藍勾勾認證", "高蛋白", "均衡推薦"] },
    note: "Restaurant requested category wording update.",
    submittedAt: "2026-07-08T10:00:00+08:00"
  }
];

export const canonicalBranchReviews: BranchReview[] = [
  {
    id: "branch-review-xinyi-address",
    restaurantId: "restaurant-haochu-bowl",
    branchId: "branch-xinyi",
    submittedBy: "user-mina",
    status: "pending",
    before: { address: "台北市信義健康街 11 號" },
    after: { address: "台北市信義區健康街 11 號 1 樓" },
    note: "Address normalization needs platform review.",
    submittedAt: "2026-07-08T10:20:00+08:00"
  }
];

export const canonicalMenuItemMergeCandidates: MenuItemMergeCandidate[] = [
  {
    id: "merge-candidate-chicken-miso",
    canonicalMenuItemId: "dish-haochu-1",
    suspectedDuplicateMenuItemId: "pending-miso-chicken",
    restaurantId: "restaurant-haochu-bowl",
    branchId: "branch-xinyi",
    similarityScore: 0.86,
    usageCount: 31,
    recommendationReferenceCount: 1,
    mealRecordReferenceCount: 12,
    status: "pending",
    suggestedAction: "create_alias"
  },
  {
    id: "merge-candidate-tofu-quinoa",
    canonicalMenuItemId: "dish-haochu-3",
    suspectedDuplicateMenuItemId: "dish-mori-2",
    restaurantId: "restaurant-haochu-bowl",
    similarityScore: 0.68,
    usageCount: 9,
    recommendationReferenceCount: 0,
    mealRecordReferenceCount: 3,
    status: "pending",
    suggestedAction: "keep_separate"
  }
];

export const canonicalAliasReviews: AliasReview[] = [
  { id: "alias-review-chicken-1", aliasId: "alias-chicken-1", suggestedMenuItemId: "dish-haochu-1", usageCount: 42, status: "pending", note: "Legacy mobile name maps to official chicken bowl." },
  { id: "alias-review-tofu-1", aliasId: "alias-tofu-1", suggestedMenuItemId: "dish-haochu-3", usageCount: 16, status: "pending", note: "Restaurant-provided alias awaits platform approval." }
];

export const canonicalDataQualityIssues: DataQualityIssue[] = [
  { id: "dq-pending-oats-low-similarity", sourceType: "pending_menu_item", sourceId: "pending-overnight-oats", severity: "warning", issueCode: "LOW_SIMILARITY", message: "Pending item has no high-confidence canonical target.", resolved: false },
  { id: "dq-beef-discontinued-reco-risk", sourceType: "recommendation", sourceId: "recommendation-salmon-1", severity: "info", issueCode: "REVIEW_AVAILABILITY", message: "Recommendation inspection should confirm branch availability.", resolved: false }
];

export const canonicalRecommendationAnomalies: RecommendationAnomaly[] = [
  { id: "reco-anomaly-salmon-availability", recommendationId: "recommendation-salmon-1", menuItemId: "dish-haochu-2", branchId: "branch-xinyi", anomalyReason: "Branch availability is limited; recommendation should remain monitored.", status: "open" }
];

export const canonicalAnalyticsEventIssues: AnalyticsEventIssue[] = [
  { id: "analytics-issue-reco-missing-click", analyticsEventId: "event-ai-reco-exposure-20260701", issueCode: "RECOMMENDATION_EVENT_REVIEW", severity: "info", message: "Recommendation impression is traceable; monitor click metadata consistency." }
];

export const canonicalAdminActionDrafts: AdminActionDraft[] = [
  {
    id: "draft-map-pending-miso",
    actionType: "map_pending_item",
    targetType: "pending_menu_item",
    targetId: "pending-miso-chicken",
    before: { status: "pending" },
    after: { status: "matched_existing_item", menuItemId: "dish-haochu-1" },
    status: "draft",
    createdBy: "platform-admin-demo",
    createdAt: "2026-07-09T12:18:00+08:00",
    auditLogId: "audit-draft-map-pending-miso"
  },
  {
    id: "draft-adopt-ai-salmon",
    actionType: "adopt_ai_nutrition",
    targetType: "nutrition",
    targetId: "nutrition-haochu-salmon",
    before: { source: "ai_estimated", verifiedStatus: "ai_estimated" },
    after: { source: "admin_verified", verifiedStatus: "verified" },
    status: "draft",
    createdBy: "platform-admin-demo",
    createdAt: "2026-07-09T13:00:00+08:00",
    auditLogId: "audit-draft-adopt-ai-salmon"
  }
];

export const canonicalAdminAuditLogs: AuditLog[] = [
  { id: "audit-draft-map-pending-miso", actorUserId: "platform-admin-demo", actorName: "Platform Admin", action: "created_admin_action_draft", targetType: "pending_menu_item", targetId: "pending-miso-chicken", result: "draft_created", note: "Map pending item to dish-haochu-1 after confirmation.", createdAt: "2026-07-09T12:18:00+08:00" },
  { id: "audit-draft-adopt-ai-salmon", actorUserId: "platform-admin-demo", actorName: "Platform Admin", action: "created_admin_action_draft", targetType: "nutrition", targetId: "nutrition-haochu-salmon", result: "draft_created", note: "AI estimate requires explicit confirmation before official nutrition update.", createdAt: "2026-07-09T13:00:00+08:00" }
];
