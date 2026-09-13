import "server-only";

import { resolveAdminStaffPermissionSet } from "../auth/admin-staff-permission-authority";
import type { PlatformAdminBranchStatusPreview } from "../view-models/platform-admin-branch-status";
import {
  parsePreviewRows,
  readBoundedIdentity,
  readVerifiedBearer
} from "./platformAdminBranchStatusAuthority";
import {
  BranchStatusTransportError,
  type PlatformAdminBranchStatusConfig
} from "./platformAdminBranchStatusTransport";
import { createStaffAdminBranchStatusTransport } from "./staffAdminBranchStatusTransport";

type RuntimeFailure = Exclude<PlatformAdminBranchStatusPreview, { state: "ready" }>;

function transportFailure(error: unknown): RuntimeFailure {
  if (error instanceof BranchStatusTransportError) return { state: error.state };
  return { state: "dependency_unavailable" };
}

function resolveBranchAuthority(data: unknown): "ready" | "permission_denied" | "dependency_unavailable" {
  const context = resolveAdminStaffPermissionSet({ ok: true, data });
  if (context.state === "unavailable") return "dependency_unavailable";
  if (context.state !== "ready"
    || !context.permissions.includes("admin_restaurant_branch.status.write")) {
    return "permission_denied";
  }
  return "ready";
}

export async function readStaffAdminBranchStatus(
  authorization: string | null,
  restaurantInput: unknown,
  branchInput: unknown,
  config: PlatformAdminBranchStatusConfig,
  fetchImpl: typeof fetch = fetch
): Promise<PlatformAdminBranchStatusPreview> {
  const restaurantId = readBoundedIdentity(restaurantInput);
  const branchId = readBoundedIdentity(branchInput);
  if (!restaurantId || !branchId) return { state: "invalid_request" };
  const bearer = readVerifiedBearer(authorization);
  if (!bearer) return { state: "unauthenticated" };
  if (config.mode !== "live") return { state: "dependency_unavailable" };
  const transport = createStaffAdminBranchStatusTransport(config, bearer, fetchImpl);
  try {
    if (!await transport.verifyIdentity()) return { state: "unauthenticated" };
    const before = resolveBranchAuthority(await transport.readContext());
    if (before !== "ready") return { state: before };
    const raw = await transport.preview(restaurantId, branchId);
    if (!Array.isArray(raw)) return { state: "internal_failure" };
    if (raw.length === 0) {
      const after = resolveBranchAuthority(await transport.readContext());
      return after === "ready" ? { state: "target_not_found" } : { state: after };
    }
    const preview = parsePreviewRows(raw);
    if (!preview) return { state: "internal_failure" };
    const after = resolveBranchAuthority(await transport.readContext());
    if (after !== "ready") return { state: after };
    if (preview.state === "ready"
      && (preview.restaurantId !== restaurantId || preview.branchId !== branchId)) {
      return { state: "internal_failure" };
    }
    return preview;
  } catch (error) {
    return transportFailure(error);
  }
}
