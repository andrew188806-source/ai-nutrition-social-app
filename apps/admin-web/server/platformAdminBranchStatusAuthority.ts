import "server-only";

import type {
  GovernedBranchStatus,
  PlatformAdminBranchStatusMutationRequest,
  PlatformAdminBranchStatusMutationResult,
  PlatformAdminBranchStatusPreview
} from "../view-models/platform-admin-branch-status";

export const PLATFORM_ADMIN_BRANCH_STATUS_PERMISSION = "admin_restaurant_branch.status.write" as const;
export const PLATFORM_ADMIN_BRANCH_STATUS_PREVIEW_FUNCTION = "platform_admin_restaurant_branch_status_v1" as const;
export const PLATFORM_ADMIN_BRANCH_STATUS_MUTATION_FUNCTION = "platform_admin_set_restaurant_branch_status_v1" as const;
export const PLATFORM_ADMIN_BRANCH_STATUS_BODY_LIMIT = 2048 as const;
const MAX_BIGINT = "9223372036854775807";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function readVerifiedBearer(value: string | null): string | null {
  if (value === null || value.length > 8192 || !/^Bearer [A-Za-z0-9._~-]+$/.test(value)) return null;
  return value;
}

export function readBoundedIdentity(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || value !== value.trim()) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

export function readStatusVersion(value: unknown): string | null {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(value)) return null;
  return value.length < MAX_BIGINT.length || (value.length === MAX_BIGINT.length && value <= MAX_BIGINT) ? value : null;
}

export function isUuidV4(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function transitionFor(status: GovernedBranchStatus): Readonly<{
  nextStatus: GovernedBranchStatus;
  reasonCode: "operational_pause" | "operational_resume";
}> {
  return status === "active"
    ? { nextStatus: "inactive", reasonCode: "operational_pause" }
    : { nextStatus: "active", reasonCode: "operational_resume" };
}

export function parseMutationRequest(value: unknown): PlatformAdminBranchStatusMutationRequest | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "restaurantId", "expectedStatus", "nextStatus", "expectedVersion", "reasonCode", "requestId"
  ])) return null;
  const restaurantId = readBoundedIdentity(value.restaurantId);
  const expectedVersion = readStatusVersion(value.expectedVersion);
  const expectedStatus = value.expectedStatus;
  const nextStatus = value.nextStatus;
  const requestId = value.requestId;
  if (!restaurantId || !expectedVersion || (expectedStatus !== "active" && expectedStatus !== "inactive")
    || (nextStatus !== "active" && nextStatus !== "inactive") || !isUuidV4(requestId)) return null;
  const transition = transitionFor(expectedStatus);
  if (nextStatus !== transition.nextStatus || value.reasonCode !== transition.reasonCode) return null;
  return { restaurantId, expectedStatus, nextStatus, expectedVersion, reasonCode: transition.reasonCode, requestId };
}

export function parsePreviewRows(value: unknown): PlatformAdminBranchStatusPreview | null {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0]) || !hasExactKeys(value[0], [
    "restaurant_id", "branch_id", "branch_name", "status", "status_version"
  ])) return null;
  const row = value[0];
  const restaurantId = readBoundedIdentity(row.restaurant_id);
  const branchId = readBoundedIdentity(row.branch_id);
  const statusVersion = readStatusVersion(row.status_version);
  if (!restaurantId || !branchId || !statusVersion || typeof row.branch_name !== "string"
    || row.branch_name.length < 1 || row.branch_name.length > 300 || row.branch_name !== row.branch_name.trim()) return null;
  if (row.status !== "active" && row.status !== "inactive") return { state: "mutation_rejected" };
  return { state: "ready", restaurantId, branchId, branchName: row.branch_name, status: row.status, statusVersion };
}

export function parseMutationResult(value: unknown, requestId: string): PlatformAdminBranchStatusMutationResult | null {
  if (!isRecord(value)) return null;
  if (hasExactKeys(value, ["ok", "errorCode"]) && value.ok === false) {
    const state = value.errorCode;
    if (state === "permission_denied" || state === "invalid_request" || state === "idempotency_conflict") return { state };
    return null;
  }
  if (!hasExactKeys(value, ["ok", "outcome", "errorCode", "status", "version", "occurredAt"])) return null;
  const statusVersion = readStatusVersion(value.version);
  if (value.ok === true && (value.outcome === "applied" || value.outcome === "noop") && value.errorCode === null
    && (value.status === "active" || value.status === "inactive") && statusVersion
    && typeof value.occurredAt === "string" && value.occurredAt.length <= 40 && !Number.isNaN(Date.parse(value.occurredAt))) {
    return { state: "ready", outcome: value.outcome, operation: "set_restaurant_branch_status",
      status: value.status, statusVersion, occurredAt: value.occurredAt, requestId };
  }
  if (value.ok === false && value.outcome === "rejected") {
    const state = value.errorCode;
    if (state === "target_not_found" || state === "stale_state" || state === "mutation_rejected") return { state };
  }
  return null;
}
