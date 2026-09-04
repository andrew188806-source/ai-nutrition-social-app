/** Browser-safe RA-1C-P1 projections. Bigint versions stay opaque decimal strings. */
export type GovernedBranchStatus = "active" | "inactive";

export type PlatformAdminBranchStatusPreview =
  | Readonly<{
      state: "ready";
      restaurantId: string;
      branchId: string;
      branchName: string;
      status: GovernedBranchStatus;
      statusVersion: string;
    }>
  | Readonly<{
      state:
        | "unauthenticated"
        | "permission_denied"
        | "invalid_request"
        | "target_not_found"
        | "mutation_rejected"
        | "dependency_unavailable"
        | "internal_failure";
    }>;

export type PlatformAdminBranchStatusMutationRequest = Readonly<{
  restaurantId: string;
  expectedStatus: GovernedBranchStatus;
  nextStatus: GovernedBranchStatus;
  expectedVersion: string;
  reasonCode: "operational_pause" | "operational_resume";
  requestId: string;
}>;

export type PlatformAdminBranchStatusMutationResult =
  | Readonly<{
      state: "ready";
      outcome: "applied" | "noop";
      operation: "set_restaurant_branch_status";
      status: GovernedBranchStatus;
      statusVersion: string;
      occurredAt: string;
      requestId: string;
    }>
  | Readonly<{
      state:
        | "unauthenticated"
        | "permission_denied"
        | "invalid_request"
        | "target_not_found"
        | "stale_state"
        | "idempotency_conflict"
        | "mutation_rejected"
        | "dependency_unavailable"
        | "internal_failure";
    }>;
