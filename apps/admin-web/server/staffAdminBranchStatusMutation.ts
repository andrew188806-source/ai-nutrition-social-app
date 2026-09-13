import "server-only";

import type { PlatformAdminBranchStatusMutationResult } from "../view-models/platform-admin-branch-status";
import {
  parseMutationRequest,
  parseMutationResult,
  readBoundedIdentity,
  readVerifiedBearer
} from "./platformAdminBranchStatusAuthority";
import {
  BranchStatusTransportError,
  type PlatformAdminBranchStatusConfig
} from "./platformAdminBranchStatusTransport";
import { createStaffAdminBranchStatusMutationTransport } from "./staffAdminBranchStatusMutationTransport";

function failure(error: unknown): PlatformAdminBranchStatusMutationResult {
  if (error instanceof BranchStatusTransportError) return { state: error.state };
  return { state: "dependency_unavailable" };
}

export async function mutateStaffAdminBranchStatus(
  authorization: string | null,
  branchInput: unknown,
  body: unknown,
  config: PlatformAdminBranchStatusConfig,
  fetchImpl: typeof fetch = fetch
): Promise<PlatformAdminBranchStatusMutationResult> {
  const branchId = readBoundedIdentity(branchInput);
  const input = parseMutationRequest(body);
  if (!branchId || !input) return { state: "invalid_request" };
  const bearer = readVerifiedBearer(authorization);
  if (!bearer) return { state: "unauthenticated" };
  if (config.mode !== "live") return { state: "dependency_unavailable" };
  const transport = createStaffAdminBranchStatusMutationTransport(config, bearer, fetchImpl);
  try {
    if (!await transport.verifyIdentity()) return { state: "unauthenticated" };
    const raw = await transport.mutate(branchId, input);
    return parseMutationResult(raw, input.requestId) ?? { state: "internal_failure" };
  } catch (error) {
    return failure(error);
  }
}
