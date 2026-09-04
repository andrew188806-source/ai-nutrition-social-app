import "server-only";

import {
  PLATFORM_ADMIN_BRANCH_STATUS_MUTATION_FUNCTION,
  PLATFORM_ADMIN_BRANCH_STATUS_PERMISSION,
  PLATFORM_ADMIN_BRANCH_STATUS_PREVIEW_FUNCTION,
  isRecord
} from "./platformAdminBranchStatusAuthority";
import type { PlatformAdminBranchStatusMutationRequest } from "../view-models/platform-admin-branch-status";

export type PlatformAdminBranchStatusConfig =
  | Readonly<{ mode: "disabled" }>
  | Readonly<{ mode: "live"; url: string; publishableKey: string }>;

export function getPlatformAdminBranchStatusConfig(env: NodeJS.ProcessEnv = process.env): PlatformAdminBranchStatusConfig {
  if (env.TASTKIND_ADMIN_BRANCH_STATUS_DATA_SOURCE !== "supabase") return { mode: "disabled" };
  try {
    const url = new URL(env.TASTKIND_SUPABASE_URL ?? "");
    const publishableKey = env.TASTKIND_SUPABASE_PUBLISHABLE_KEY ?? "";
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/"
      || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) return { mode: "disabled" };
    return { mode: "live", url: url.origin, publishableKey };
  } catch {
    return { mode: "disabled" };
  }
}

export class BranchStatusTransportError extends Error {
  constructor(readonly state: "unauthenticated" | "permission_denied" | "dependency_unavailable") {
    super("Platform Admin branch status request failed");
  }
}

export function createPlatformAdminBranchStatusTransport(
  config: Extract<PlatformAdminBranchStatusConfig, { mode: "live" }>,
  authorization: string,
  fetchImpl: typeof fetch = fetch
) {
  async function request(path: string, body?: Record<string, unknown>): Promise<unknown> {
    const response = await fetchImpl(`${config.url}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { apikey: config.publishableKey, Authorization: authorization, Accept: "application/json", "Content-Type": "application/json" },
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
    async hasPermission(): Promise<boolean> {
      const result = await request("/rest/v1/rpc/platform_admin_has_permission_v1", {
        requested_permission_key: PLATFORM_ADMIN_BRANCH_STATUS_PERMISSION
      });
      if (result !== true && result !== false) throw new BranchStatusTransportError("dependency_unavailable");
      return result;
    },
    preview(restaurantId: string, branchId: string): Promise<unknown> {
      return request(`/rest/v1/rpc/${PLATFORM_ADMIN_BRANCH_STATUS_PREVIEW_FUNCTION}`, {
        p_restaurant_id: restaurantId, p_branch_id: branchId
      });
    },
    mutate(branchId: string, input: PlatformAdminBranchStatusMutationRequest): Promise<unknown> {
      return request(`/rest/v1/rpc/${PLATFORM_ADMIN_BRANCH_STATUS_MUTATION_FUNCTION}`, {
        p_restaurant_id: input.restaurantId, p_branch_id: branchId,
        p_expected_status: input.expectedStatus, p_requested_status: input.nextStatus,
        p_expected_version: input.expectedVersion, p_reason_code: input.reasonCode, p_request_id: input.requestId
      });
    }
  };
}
