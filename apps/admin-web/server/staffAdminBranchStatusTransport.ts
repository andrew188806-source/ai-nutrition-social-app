import "server-only";

import { STAFF_PERMISSION_CONTEXT_FUNCTION } from "../auth/admin-staff-permission-authority";
import {
  BranchStatusTransportError,
  type PlatformAdminBranchStatusConfig
} from "./platformAdminBranchStatusTransport";
import { isRecord } from "./platformAdminBranchStatusAuthority";

export const STAFF_ADMIN_BRANCH_STATUS_PREVIEW_FUNCTION =
  "staff_admin_restaurant_branch_status_v1" as const;

export function createStaffAdminBranchStatusTransport(
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
    try {
      return await response.json();
    } catch {
      throw new BranchStatusTransportError("dependency_unavailable");
    }
  }

  return {
    async verifyIdentity(): Promise<boolean> {
      const user = await request("/auth/v1/user");
      return isRecord(user) && typeof user.id === "string"
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
        && user.is_anonymous !== true;
    },
    readContext(): Promise<unknown> {
      return request(`/rest/v1/rpc/${STAFF_PERMISSION_CONTEXT_FUNCTION}`, {});
    },
    preview(restaurantId: string, branchId: string): Promise<unknown> {
      return request(`/rest/v1/rpc/${STAFF_ADMIN_BRANCH_STATUS_PREVIEW_FUNCTION}`, {
        p_restaurant_id: restaurantId,
        p_branch_id: branchId
      });
    }
  };
}
