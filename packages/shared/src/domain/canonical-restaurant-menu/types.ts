export type CanonicalCatalogId = string;

export type CanonicalTargetKind = "restaurant" | "branch" | "menu_item";

export type CanonicalGovernanceStatus =
  | "received"
  | "resolving"
  | "resolved_existing"
  | "pending_resolution"
  | "externally_supported"
  | "community_supported"
  | "partner_review"
  | "admin_review"
  | "active"
  | "inactive_suspected"
  | "archived"
  | "rejected"
  | "merged";

export type CanonicalIdentityProvenance =
  | "canonical_id"
  | "place_id"
  | "address_phone"
  | "verified_official_source"
  | "verified_partner_source"
  | "community_evidence"
  | "server_registered_provisional"
  | "merged_alias";

export type CanonicalIdentityEvidenceKind =
  | "canonical_id"
  | "place_id"
  | "address_phone"
  | "verified_official_source"
  | "verified_partner_source"
  | "exact_name_location"
  | "similar_name_location"
  | "name_only"
  | "photo_only"
  | "raw_address"
  | "raw_location";

export interface CanonicalIdentityEvidence {
  kind: CanonicalIdentityEvidenceKind;
  value: string;
  verified: boolean;
  conflictsWithCanonical?: boolean;
}

export interface CanonicalTargetReference {
  kind: CanonicalTargetKind;
  targetId: CanonicalCatalogId;
  resolutionStatus: CanonicalGovernanceStatus;
  identityProvenance: CanonicalIdentityProvenance;
  restaurantId?: CanonicalCatalogId;
  branchId?: CanonicalCatalogId;
}

export interface CanonicalObservation {
  observationId: CanonicalCatalogId;
  targetKind: CanonicalTargetKind;
  observedAt: string;
  rawName?: string;
  rawPhotoReference?: string;
  rawAddress?: string;
  rawLocation?: string;
  restaurantId?: CanonicalCatalogId;
  branchId?: CanonicalCatalogId;
  evidence: readonly CanonicalIdentityEvidence[];
}

export interface CanonicalAliasRedirect {
  aliasTargetId: CanonicalCatalogId;
  canonicalTargetId: CanonicalCatalogId;
  mergedAt: string;
  historyPreserved: true;
}

export type CatalogExistenceStatus = "unreviewed" | "supported" | "active" | "inactive_suspected" | "archived";
export type CatalogAvailabilityStatus = "unknown" | "available" | "temporarily_unavailable" | "seasonal" | "discontinued";
export type PartnerRelationshipStatus = "none" | "suspected" | "claimed" | "verified" | "rejected";
export type NutritionVerificationStatus = "unverified" | "ai_estimated" | "pending" | "verified" | "invalidated" | "expired";

export interface CanonicalGovernanceDimensions {
  existence: CatalogExistenceStatus;
  availability: CatalogAvailabilityStatus;
  partnerRelationship: PartnerRelationshipStatus;
  nutritionVerification: NutritionVerificationStatus;
}

export type NutritionVerificationInvalidationReason =
  | "recipe_changed"
  | "portion_changed"
  | "ingredient_changed"
  | "cooking_method_changed"
  | "expired"
  | "conflicting_evidence";

export interface NutritionVerificationRecord {
  targetId: CanonicalCatalogId;
  scope: "branch" | "shared_recipe";
  branchId?: CanonicalCatalogId;
  status: NutritionVerificationStatus;
  validUntil?: string;
  invalidationReasons: readonly NutritionVerificationInvalidationReason[];
  sharedRecipeBasis?: {
    recipeConfirmed: boolean;
    portionConfirmed: boolean;
    standardOperatingProcedureConfirmed: boolean;
  };
}

export interface ConsumerNutritionBadgeProjection {
  menuItemBadge: boolean;
  restaurantOrBranchBadge: boolean;
}

export interface ConsumerCanonicalTargetProjection {
  kind: CanonicalTargetKind;
  targetId: CanonicalCatalogId;
  restaurantId?: CanonicalCatalogId;
  branchId?: CanonicalCatalogId;
  nutritionBadge: boolean;
}

export type RecommendationTrustTier = 1 | 2 | 3 | 4 | 5;

export interface RecommendationTrustInput {
  targetId: CanonicalCatalogId;
  exactItemNutritionVerified: boolean;
  belongsToNutritionBadgedRestaurantOrBranch: boolean;
  adminExistenceConfirmed: boolean;
  distinctIndependentVerifiedUsers: number;
  registeredProvisional: boolean;
  allergySafe: boolean;
  otherwiseSafe: boolean;
  available: boolean;
  userExcluded: boolean;
}

export interface RecommendationTrustResult {
  targetId: CanonicalCatalogId;
  tier: RecommendationTrustTier | null;
  eligibleForGeneralRecommendations: boolean;
  reason:
    | "exact_item_nutrition_verified"
    | "nutrition_badged_parent"
    | "admin_existence_confirmed"
    | "community_supported"
    | "single_user_provisional"
    | "hard_filter_failed"
    | "insufficient_evidence";
}

export interface CommunitySupportEvidence {
  distinctVerifiedObserverCount: number;
  observationsIndependent: boolean;
  evidenceConsistent: boolean;
  abuseSignalPresent: boolean;
  partnerOrCanonicalConflict: boolean;
  partnerRelationshipSuspected: boolean;
  partnerRejectedWithStrongConflict: boolean;
}

export type AvailabilityReportType =
  | "restaurant_closed"
  | "restaurant_temporarily_closed"
  | "menu_item_discontinued"
  | "menu_item_temporarily_unavailable"
  | "seasonal_item"
  | "wrong_branch"
  | "wrong_affiliation"
  | "duplicate"
  | "incorrect_name"
  | "incorrect_price"
  | "incorrect_photo";

export type AvailabilityReportStatus =
  | "submitted"
  | "under_review"
  | "partner_review"
  | "admin_review"
  | "confirmed"
  | "rejected"
  | "reversed";

export type ReportRewardStatus = "not_eligible" | "pending_review" | "approved" | "issued" | "rejected" | "reversed";

export interface AvailabilityReport {
  reportId: CanonicalCatalogId;
  target: CanonicalTargetReference;
  reportType: AvailabilityReportType;
  status: AvailabilityReportStatus;
  rewardStatus: ReportRewardStatus;
  submittedAt: string;
}

export type PartnerClaimQueueItemKind = "observation" | "candidate" | "report";
export type PartnerClaimQueueRoute = "branch" | "headquarters" | "admin";
export type PartnerClaimQueueIntake = "historical" | "live";

export interface PartnerClaimQueueItem {
  queueItemId: CanonicalCatalogId;
  kind: PartnerClaimQueueItemKind;
  restaurantId: CanonicalCatalogId;
  branchId?: CanonicalCatalogId;
  ambiguousBranch: boolean;
  pending: boolean;
  createdAt: string;
  observedAt?: string;
  lastObservedAt: string;
  confidence: number;
  distinctVerifiedObserverCount: number;
  occurrenceCount: number;
  reportType?: AvailabilityReportType;
  evidenceKinds: readonly CanonicalIdentityEvidenceKind[];
  deliveredScopeIds: readonly CanonicalCatalogId[];
  deferredUntil?: string;
}

export interface PartnerClaimQueueEntry {
  queueItemId: CanonicalCatalogId;
  kind: PartnerClaimQueueItemKind;
  intake: PartnerClaimQueueIntake;
  route: PartnerClaimQueueRoute;
  restaurantId: CanonicalCatalogId;
  branchId?: CanonicalCatalogId;
  priorityBand: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  lastObservedAt: string;
  confidence: number;
  distinctVerifiedObserverCount: number;
}

export interface PartnerClaimQueuePage {
  items: readonly PartnerClaimQueueEntry[];
  nextCursor: string | null;
}

export interface PartnerClaimQueueInput {
  items: readonly PartnerClaimQueueItem[];
  intake: PartnerClaimQueueIntake;
  partnerVerifiedAt: string;
  restaurantId: CanonicalCatalogId;
  branchId?: CanonicalCatalogId;
  cursor?: string | null;
  limit?: number;
  now: string;
}

export interface PartnerSafeQueueProjection {
  queueItemId: CanonicalCatalogId;
  kind: PartnerClaimQueueItemKind;
  route: PartnerClaimQueueRoute;
  targetId: CanonicalCatalogId;
  observedAt: string;
}
