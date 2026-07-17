import type {
  AvailabilityReport,
  CanonicalAliasRedirect,
  CanonicalIdentityEvidence,
  CanonicalObservation,
  CanonicalTargetKind,
  CanonicalTargetReference,
  ConsumerCanonicalTargetProjection,
  ConsumerNutritionBadgeProjection,
  PartnerClaimQueueInput,
  PartnerClaimQueuePage,
  RecommendationTrustInput,
  RecommendationTrustResult
} from "./types";

export interface SubmitCanonicalObservationInput {
  targetKind: CanonicalTargetKind;
  observedAt: string;
  rawName?: string;
  rawPhotoReference?: string;
  rawAddress?: string;
  rawLocation?: string;
  restaurantId?: string;
  branchId?: string;
  evidence: readonly CanonicalIdentityEvidence[];
}

export interface CanonicalRestaurantMenuGovernancePort {
  submitObservation(input: SubmitCanonicalObservationInput): Promise<CanonicalObservation>;
  resolveCandidate(observationId: string, evidence: readonly CanonicalIdentityEvidence[]): Promise<CanonicalTargetReference>;
  registerProvisional(observationId: string): Promise<CanonicalTargetReference>;
  mergeTarget(sourceTargetId: string, canonicalTargetId: string): Promise<CanonicalAliasRedirect>;
  submitAvailabilityReport(input: Omit<AvailabilityReport, "reportId" | "status" | "rewardStatus">): Promise<AvailabilityReport>;
  reviewReport(reportId: string, decision: "confirm" | "reject" | "reverse" | "reopen" | "escalate_partner" | "escalate_admin"): Promise<AvailabilityReport>;
  listPartnerClaimQueue(input: PartnerClaimQueueInput): Promise<PartnerClaimQueuePage>;
  recordPartnerDecision(queueItemId: string, decision: "confirm" | "reject" | "defer" | "resume" | "escalate_admin"): Promise<void>;
  projectBadges(target: CanonicalTargetReference): Promise<ConsumerNutritionBadgeProjection>;
  projectConsumerTarget(target: CanonicalTargetReference): Promise<ConsumerCanonicalTargetProjection>;
  calculateTrustTier(input: RecommendationTrustInput): Promise<RecommendationTrustResult>;
}
