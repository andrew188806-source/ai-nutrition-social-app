import type {
  AvailabilityReportStatus,
  CanonicalGovernanceStatus,
  CanonicalIdentityEvidence,
  CanonicalTargetReference,
  CommunitySupportEvidence,
  ConsumerCanonicalTargetProjection,
  ConsumerNutritionBadgeProjection,
  NutritionVerificationRecord,
  PartnerClaimQueueEntry,
  PartnerClaimQueueInput,
  PartnerClaimQueueItem,
  PartnerClaimQueuePage,
  PartnerSafeQueueProjection,
  RecommendationTrustInput,
  RecommendationTrustResult,
  ReportRewardStatus
} from "./types";

const STRONG_IDENTITY_EVIDENCE = new Set([
  "canonical_id",
  "place_id",
  "address_phone",
  "verified_official_source",
  "verified_partner_source"
]);

const STATE_TRANSITIONS: Readonly<Record<CanonicalGovernanceStatus, readonly CanonicalGovernanceStatus[]>> = {
  received: ["resolving", "rejected"],
  resolving: ["resolved_existing", "pending_resolution", "externally_supported", "partner_review", "admin_review", "rejected"],
  resolved_existing: ["active", "merged", "admin_review"],
  pending_resolution: ["resolving", "externally_supported", "community_supported", "partner_review", "admin_review", "rejected"],
  externally_supported: ["resolved_existing", "community_supported", "partner_review", "admin_review", "active", "rejected"],
  community_supported: ["resolved_existing", "partner_review", "admin_review", "active", "rejected"],
  partner_review: ["resolved_existing", "admin_review", "active", "rejected"],
  admin_review: ["resolved_existing", "active", "inactive_suspected", "archived", "rejected", "merged"],
  active: ["inactive_suspected", "archived", "admin_review", "merged"],
  inactive_suspected: ["active", "archived", "admin_review"],
  archived: ["active", "admin_review"],
  rejected: ["resolving", "admin_review"],
  merged: ["admin_review"]
};

const HIGH_RISK_REPORTS = new Set([
  "restaurant_closed",
  "menu_item_discontinued",
  "wrong_affiliation"
]);

export function hasStrongIdentityEvidence(evidence: readonly CanonicalIdentityEvidence[]): boolean {
  return evidence.some((item) => item.verified && !item.conflictsWithCanonical && STRONG_IDENTITY_EVIDENCE.has(item.kind));
}

export function canAutoResolveExistingTarget(evidence: readonly CanonicalIdentityEvidence[]): boolean {
  return hasStrongIdentityEvidence(evidence) && !evidence.some((item) => item.conflictsWithCanonical);
}

export function isGovernanceTransitionAllowed(from: CanonicalGovernanceStatus, to: CanonicalGovernanceStatus): boolean {
  return STATE_TRANSITIONS[from].includes(to);
}

export function supportsOrdinaryLifecycleHardDelete(): false {
  return false;
}

export function evaluateCommunitySupport(evidence: CommunitySupportEvidence): CanonicalGovernanceStatus {
  if (evidence.partnerRejectedWithStrongConflict) return "admin_review";
  if (evidence.partnerRelationshipSuspected) return "partner_review";
  if (
    evidence.distinctVerifiedObserverCount >= 2 &&
    evidence.observationsIndependent &&
    evidence.evidenceConsistent &&
    !evidence.abuseSignalPresent &&
    !evidence.partnerOrCanonicalConflict
  ) return "community_supported";
  return "pending_resolution";
}

export function isNutritionVerificationCurrent(record: NutritionVerificationRecord, now: string): boolean {
  if (record.status !== "verified" || record.invalidationReasons.length > 0) return false;
  if (record.scope === "branch" && !record.branchId) return false;
  if (record.scope === "shared_recipe" && !(
    record.sharedRecipeBasis?.recipeConfirmed &&
    record.sharedRecipeBasis.portionConfirmed &&
    record.sharedRecipeBasis.standardOperatingProcedureConfirmed
  )) return false;
  return !record.validUntil || Date.parse(record.validUntil) > Date.parse(now);
}

export function projectNutritionBadges(input: {
  exactMenuItemVerification?: NutritionVerificationRecord;
  currentRestaurantOrBranchMenuItemVerifications: readonly NutritionVerificationRecord[];
  now: string;
}): ConsumerNutritionBadgeProjection {
  return {
    menuItemBadge: Boolean(input.exactMenuItemVerification && isNutritionVerificationCurrent(input.exactMenuItemVerification, input.now)),
    restaurantOrBranchBadge: input.currentRestaurantOrBranchMenuItemVerifications.some((record) => isNutritionVerificationCurrent(record, input.now))
  };
}

export function projectConsumerTarget(target: CanonicalTargetReference, nutritionBadge: boolean): ConsumerCanonicalTargetProjection {
  return {
    kind: target.kind,
    targetId: target.targetId,
    restaurantId: target.restaurantId,
    branchId: target.branchId,
    nutritionBadge
  };
}

export function calculateRecommendationTrustTier(input: RecommendationTrustInput): RecommendationTrustResult {
  if (!input.allergySafe || !input.otherwiseSafe || !input.available || input.userExcluded) {
    return { targetId: input.targetId, tier: null, eligibleForGeneralRecommendations: false, reason: "hard_filter_failed" };
  }
  if (input.exactItemNutritionVerified) return { targetId: input.targetId, tier: 1, eligibleForGeneralRecommendations: true, reason: "exact_item_nutrition_verified" };
  if (input.belongsToNutritionBadgedRestaurantOrBranch) return { targetId: input.targetId, tier: 2, eligibleForGeneralRecommendations: true, reason: "nutrition_badged_parent" };
  if (input.adminExistenceConfirmed) return { targetId: input.targetId, tier: 3, eligibleForGeneralRecommendations: true, reason: "admin_existence_confirmed" };
  if (input.distinctIndependentVerifiedUsers >= 2) return { targetId: input.targetId, tier: 4, eligibleForGeneralRecommendations: true, reason: "community_supported" };
  if (input.registeredProvisional) return { targetId: input.targetId, tier: 5, eligibleForGeneralRecommendations: false, reason: "single_user_provisional" };
  return { targetId: input.targetId, tier: null, eligibleForGeneralRecommendations: false, reason: "insufficient_evidence" };
}

export function compareRecommendationTrust(a: RecommendationTrustResult, b: RecommendationTrustResult): number {
  return (a.tier ?? Number.POSITIVE_INFINITY) - (b.tier ?? Number.POSITIVE_INFINITY) || a.targetId.localeCompare(b.targetId);
}

export function canIssueReportReward(reportStatus: AvailabilityReportStatus, rewardStatus: ReportRewardStatus): boolean {
  return rewardStatus !== "issued" || reportStatus === "confirmed";
}

export function getInitialReportReviewStatus(partnerRelationship: "none" | "suspected" | "claimed" | "verified" | "rejected"): AvailabilityReportStatus {
  return partnerRelationship === "claimed" || partnerRelationship === "verified" || partnerRelationship === "suspected"
    ? "partner_review"
    : "admin_review";
}

export function isReportTransitionAllowed(from: AvailabilityReportStatus, to: AvailabilityReportStatus): boolean {
  const transitions: Readonly<Record<AvailabilityReportStatus, readonly AvailabilityReportStatus[]>> = {
    submitted: ["under_review", "partner_review", "admin_review", "rejected"],
    under_review: ["partner_review", "admin_review", "confirmed", "rejected"],
    partner_review: ["admin_review", "confirmed", "rejected"],
    admin_review: ["confirmed", "rejected"],
    confirmed: ["reversed", "under_review"],
    rejected: ["under_review"],
    reversed: ["under_review", "confirmed"]
  };
  return transitions[from].includes(to);
}

export function isCanonicalPartnerAffiliation(target: CanonicalTargetReference): boolean {
  return target.identityProvenance !== "server_registered_provisional" && target.resolutionStatus !== "pending_resolution";
}

export function getPartnerClaimPriorityBand(item: PartnerClaimQueueItem, now?: string): PartnerClaimQueueEntry["priorityBand"] {
  if (item.reportType && HIGH_RISK_REPORTS.has(item.reportType)) return 1;
  if (item.evidenceKinds.some((kind) => kind === "place_id" || kind === "address_phone")) return 2;
  if (item.evidenceKinds.includes("exact_name_location")) return 3;
  if (item.distinctVerifiedObserverCount >= 2) return 4;
  const recentlyObserved = now ? Date.parse(now) - Date.parse(item.lastObservedAt) <= 14 * 24 * 60 * 60 * 1000 : false;
  if (item.occurrenceCount >= 3 || recentlyObserved) return 5;
  if (item.evidenceKinds.includes("similar_name_location")) return 6;
  return 7;
}

function queueScopeId(restaurantId: string, branchId?: string): string {
  return branchId ? `${restaurantId}:branch:${branchId}` : `${restaurantId}:headquarters`;
}

function compareQueueEntries(a: PartnerClaimQueueEntry & { createdAt: string }, b: PartnerClaimQueueEntry & { createdAt: string }): number {
  return a.priorityBand - b.priorityBand ||
    b.distinctVerifiedObserverCount - a.distinctVerifiedObserverCount ||
    Date.parse(b.lastObservedAt) - Date.parse(a.lastObservedAt) ||
    b.confidence - a.confidence ||
    Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
    a.queueItemId.localeCompare(b.queueItemId);
}

function parseQueueTimestamp(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function listPartnerClaimQueue(input: PartnerClaimQueueInput): PartnerClaimQueuePage {
  const limit = Math.max(1, Math.min(20, input.limit ?? 20));
  const verifiedAt = parseQueueTimestamp(input.partnerVerifiedAt);
  const now = parseQueueTimestamp(input.now);
  if (verifiedAt === null || now === null || verifiedAt > now) return { items: [], nextCursor: null };
  const historicalStart = verifiedAt - 60 * 24 * 60 * 60 * 1000;
  const scopeId = queueScopeId(input.restaurantId, input.branchId);
  const sorted = input.items
    .filter((item) => item.pending && item.restaurantId === input.restaurantId)
    .filter((item) => {
      const observedAt = parseQueueTimestamp(item.lastObservedAt);
      const firstObservedAt = item.observedAt ? parseQueueTimestamp(item.observedAt) : observedAt;
      const deferredUntil = item.deferredUntil ? parseQueueTimestamp(item.deferredUntil) : null;
      if (observedAt === null || firstObservedAt === null || observedAt > now || firstObservedAt > observedAt) return false;
      if (item.deferredUntil && (deferredUntil === null || deferredUntil > now)) return false;
      return input.intake === "historical"
        ? observedAt >= historicalStart && observedAt <= verifiedAt
        : observedAt > verifiedAt && observedAt <= now;
    })
    .filter((item) => item.ambiguousBranch ? !input.branchId : item.branchId === input.branchId)
    .filter((item) => !item.deliveredScopeIds.includes(scopeId))
    .map((item) => ({
      queueItemId: item.queueItemId,
      kind: item.kind,
      intake: input.intake,
      route: item.ambiguousBranch ? "headquarters" as const : input.branchId ? "branch" as const : "headquarters" as const,
      restaurantId: item.restaurantId,
      branchId: item.ambiguousBranch ? undefined : item.branchId,
      priorityBand: getPartnerClaimPriorityBand(item, input.now),
      lastObservedAt: item.lastObservedAt,
      confidence: item.confidence,
      distinctVerifiedObserverCount: item.distinctVerifiedObserverCount,
      createdAt: item.createdAt
    }))
    .sort(compareQueueEntries);
  const start = input.cursor ? Math.max(0, sorted.findIndex((item) => item.queueItemId === input.cursor) + 1) : 0;
  const page = sorted.slice(start, start + limit);
  return {
    items: page.map(({ createdAt: _createdAt, ...entry }) => entry),
    nextCursor: start + limit < sorted.length ? page.at(-1)?.queueItemId ?? null : null
  };
}

export function projectPartnerSafeQueueEntry(entry: PartnerClaimQueueEntry, targetId: string): PartnerSafeQueueProjection {
  return {
    queueItemId: entry.queueItemId,
    kind: entry.kind,
    route: entry.route,
    targetId,
    observedAt: entry.lastObservedAt
  };
}
