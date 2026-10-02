/** Facts must be supplied by a future trusted server adapter. These types do not authenticate them. */
export interface SourceBinding {
  readonly actorId: string;
  readonly resourceId: string;
  readonly sourceIdentity: string;
  readonly sourceRevision: string;
  readonly factAsOf: string;
  readonly provenance: "resolved" | "unknown";
}
export interface Fact<T> { readonly binding: SourceBinding; readonly value: T }
export type Tier = "free" | "paid";
export interface Entitlement { readonly tier: Tier; readonly validFrom: string; readonly validUntil: string | null }
export interface Acquisition {
  readonly eventId: string;
  readonly at: string;
  readonly tier: Tier;
}
export interface Upgrade {
  readonly eventId: string;
  readonly at: string;
  readonly tier: "paid";
  /** Monthly promotion uses the fixed account zone/version effective at the event. */
  readonly reportPeriod?: ReportPeriod;
}
export interface DetailGrant {
  readonly kind: "detail";
  readonly policyVersion: string;
  readonly originalRecordedAt: string;
  readonly acquisition: Acquisition;
  readonly retainedUntil: string;
  /** Required for a Free-acquired grant that has already been extended. */
  readonly extension?: Upgrade;
}
export interface ReportPeriod {
  readonly monthKey: string;
  readonly timezone: string;
  readonly timezoneVersion: string;
}
export interface MonthBinding extends ReportPeriod {
  readonly reportId: string;
  readonly monthBindingVersion: string;
  readonly collision: boolean;
}
export interface MonthlyGrant {
  readonly kind: "monthly";
  readonly policyVersion: string;
  readonly reportId: string;
  readonly monthKey: string;
  readonly timezone: string;
  readonly timezoneVersion: string;
  readonly monthBindingVersion: string;
  readonly acquisition: Acquisition;
  readonly acquisitionPeriod: ReportPeriod;
  readonly permanent: boolean;
  readonly promotion?: Upgrade;
}
export type Grant = DetailGrant | MonthlyGrant;
export type Action =
  | { readonly kind: "evaluate" }
  | { readonly kind: "create"; readonly newResource: true; readonly acquisition: Fact<Acquisition>; readonly reportPeriod?: ReportPeriod }
  | { readonly kind: "upgrade"; readonly events: readonly Fact<Upgrade>[] };
export interface RetentionInput {
  readonly policyVersion: string;
  readonly actorId: string;
  readonly resourceId: string;
  readonly evaluationInstant: string;
  readonly resourceKind: "detail" | "monthly";
  readonly originalRecordedAt?: Fact<string>;
  readonly monthBinding?: Fact<MonthBinding>;
  readonly activeReportPeriod?: Fact<ReportPeriod>;
  readonly acquiredGrant?: Fact<Grant>;
  readonly currentEntitlement: Fact<Entitlement>;
  readonly materialState: Fact<"present" | "collapsed" | "deleted" | "unknown">;
  readonly protection: Fact<"none" | "saved_meal" | "unknown">;
  readonly coreEligibility: Fact<"allow" | "deny" | "unknown">;
  readonly rightsState: Fact<"clear" | "deletion_required" | "unknown">;
  readonly action: Action;
}
export interface Reason { readonly code: string; readonly field: string }
export interface GrantTransitionProposal {
  readonly kind: "create" | "extend" | "promote" | "noop" | "pending";
  readonly grant: Grant | null;
  readonly persisted: false;
}
export interface RetentionEvaluation {
  readonly policyVersion: string;
  readonly retentionStatus: "within_acquired_term" | "due" | "permanent" | "unknown";
  readonly visibilityStatus: "visible" | "hidden_by_current_tier" | "expired" | "material_unavailable" | "core_denied" | "rights_restricted" | "unknown";
  readonly originalRecordedAt: string | null;
  readonly retainedUntil: string | null;
  readonly monthBinding: MonthBinding | null;
  readonly grantTransitionProposal: GrantTransitionProposal;
  readonly reasons: readonly Reason[];
  readonly purgeAllowed: false;
}
