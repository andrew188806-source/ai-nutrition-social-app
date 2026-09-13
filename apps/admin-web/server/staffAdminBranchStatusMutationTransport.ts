import "server-only";

import type { PlatformAdminBranchStatusMutationRequest } from "../view-models/platform-admin-branch-status";
import { isRecord } from "./platformAdminBranchStatusAuthority";
import {
  BranchStatusTransportError,
  type PlatformAdminBranchStatusConfig
} from "./platformAdminBranchStatusTransport";

export const STAFF_ADMIN_BRANCH_STATUS_MUTATION_FUNCTION =
  "staff_admin_set_restaurant_branch_status_v1" as const;

export function createStaffAdminBranchStatusMutationTransport(
  config: Extract<PlatformAdminBranchStatusConfig, { mode: "live" }>,
  authorization: string,
  fetchImpl: typeof fetch = fetch
) {
  async function request(path: string, body?: Record<string, unknown>): Promise<unknown> {
    const response = await fetchImpl(`${config.url}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        apikey: config.publishableKey,
        Authorization: authorization,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000)
    });
    if (response.status === 401) throw new BranchStatusTransportError("unauthenticated");
    if (response.status === 403) throw new BranchStatusTransportError("permission_denied");
    if (!response.ok) throw new BranchStatusTransportError("dependency_unavailable");
    try { return await response.json(); }
    catch { throw new BranchStatusTransportError("dependency_unavailable"); }
  }

  return {
    async verifyIdentity(): Promise<boolean> {
      const user = await request("/auth/v1/user");
      return isRecord(user) && typeof user.id === "string"
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
        && user.is_anonymous !== true;
    },
    mutate(branchId: string, input: PlatformAdminBranchStatusMutationRequest): Promise<unknown> {
      return request(`/rest/v1/rpc/${STAFF_ADMIN_BRANCH_STATUS_MUTATION_FUNCTION}`, {
        p_restaurant_id: input.restaurantId,
        p_branch_id: branchId,
        p_expected_status: input.expectedStatus,
        p_requested_status: input.nextStatus,
        p_expected_version: input.expectedVersion,
        p_reason_code: input.reasonCode,
        p_request_id: input.requestId
      });
    }
  };
}
