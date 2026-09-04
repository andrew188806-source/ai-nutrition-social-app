import "server-only";

import {
  PLATFORM_ADMIN_BRANCH_STATUS_BODY_LIMIT,
  parseMutationRequest,
  parseMutationResult,
  parsePreviewRows,
  readBoundedIdentity,
  readVerifiedBearer
} from "./platformAdminBranchStatusAuthority";
import {
  BranchStatusTransportError,
  createPlatformAdminBranchStatusTransport,
  getPlatformAdminBranchStatusConfig,
  type PlatformAdminBranchStatusConfig
} from "./platformAdminBranchStatusTransport";
import type {
  PlatformAdminBranchStatusMutationResult,
  PlatformAdminBranchStatusPreview
} from "../view-models/platform-admin-branch-status";

type RuntimeFailure = Exclude<PlatformAdminBranchStatusPreview, { state: "ready" }>;
const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff"
} as const;

function transportFailure(error: unknown): RuntimeFailure {
  if (error instanceof BranchStatusTransportError) return { state: error.state };
  return { state: "dependency_unavailable" };
}

async function authorize(
  authorization: string | null,
  config: PlatformAdminBranchStatusConfig,
  fetchImpl: typeof fetch
) {
  const bearer = readVerifiedBearer(authorization);
  if (!bearer) return { failure: { state: "unauthenticated" } as RuntimeFailure };
  if (config.mode !== "live") return { failure: { state: "dependency_unavailable" } as RuntimeFailure };
  const transport = createPlatformAdminBranchStatusTransport(config, bearer, fetchImpl);
  try {
    if (!await transport.verifyIdentity()) return { failure: { state: "unauthenticated" } as RuntimeFailure };
    if (!await transport.hasPermission()) return { failure: { state: "permission_denied" } as RuntimeFailure };
    return { transport };
  } catch (error) {
    return { failure: transportFailure(error) };
  }
}

export async function readPlatformAdminBranchStatus(
  authorization: string | null,
  restaurantInput: unknown,
  branchInput: unknown,
  config: PlatformAdminBranchStatusConfig,
  fetchImpl: typeof fetch = fetch
): Promise<PlatformAdminBranchStatusPreview> {
  const restaurantId = readBoundedIdentity(restaurantInput);
  const branchId = readBoundedIdentity(branchInput);
  if (!restaurantId || !branchId) return { state: "invalid_request" };
  const authority = await authorize(authorization, config, fetchImpl);
  if (authority.failure) return authority.failure;
  try {
    const raw = await authority.transport.preview(restaurantId, branchId);
    if (!Array.isArray(raw)) return { state: "internal_failure" };
    if (raw.length === 0) {
      if (!await authority.transport.hasPermission()) return { state: "permission_denied" };
      return { state: "target_not_found" };
    }
    const preview = parsePreviewRows(raw);
    if (!preview) return { state: "internal_failure" };
    if (!await authority.transport.hasPermission()) return { state: "permission_denied" };
    if (preview.state === "ready" && (preview.restaurantId !== restaurantId || preview.branchId !== branchId)) {
      return { state: "internal_failure" };
    }
    return preview;
  } catch (error) {
    return transportFailure(error);
  }
}

async function mutatePlatformAdminBranchStatus(
  authorization: string | null,
  branchInput: unknown,
  body: unknown,
  config: PlatformAdminBranchStatusConfig,
  fetchImpl: typeof fetch
): Promise<PlatformAdminBranchStatusMutationResult> {
  const branchId = readBoundedIdentity(branchInput);
  const input = parseMutationRequest(body);
  if (!branchId || !input) return { state: "invalid_request" };
  const authority = await authorize(authorization, config, fetchImpl);
  if (authority.failure) return authority.failure;
  try {
    const raw = await authority.transport.mutate(branchId, input);
    return parseMutationResult(raw, input.requestId) ?? { state: "internal_failure" };
  } catch (error) {
    return transportFailure(error);
  }
}

function responseStatus(state: PlatformAdminBranchStatusPreview["state"] | PlatformAdminBranchStatusMutationResult["state"]): number {
  return {
    ready: 200, unauthenticated: 401, permission_denied: 403, invalid_request: 400,
    target_not_found: 404, stale_state: 409, idempotency_conflict: 409,
    mutation_rejected: 422, dependency_unavailable: 503, internal_failure: 500
  }[state];
}

function json(result: PlatformAdminBranchStatusPreview | PlatformAdminBranchStatusMutationResult): Response {
  return Response.json(result, { status: responseStatus(result.state), headers: RESPONSE_HEADERS });
}

export async function handlePlatformAdminBranchStatusPreviewRequest(
  request: Request,
  branchId: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some((key) => key !== "restaurantId") || query.getAll("restaurantId").length !== 1) {
    return json({ state: "invalid_request" });
  }
  return json(await readPlatformAdminBranchStatus(
    request.headers.get("authorization"), query.get("restaurantId"), branchId,
    getPlatformAdminBranchStatusConfig(env), fetchImpl
  ));
}

export async function handlePlatformAdminBranchStatusMutationRequest(
  request: Request,
  branchId: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const authorization = request.headers.get("authorization");
  if (!readVerifiedBearer(authorization)) return json({ state: "unauthenticated" });
  const length = request.headers.get("content-length");
  if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > PLATFORM_ADMIN_BRANCH_STATUS_BODY_LIMIT)) {
    return json({ state: "invalid_request" });
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return json({ state: "invalid_request" });
  let text: string;
  try { text = await request.text(); }
  catch { return json({ state: "invalid_request" }); }
  if (new TextEncoder().encode(text).byteLength > PLATFORM_ADMIN_BRANCH_STATUS_BODY_LIMIT) return json({ state: "invalid_request" });
  let body: unknown;
  try { body = JSON.parse(text); }
  catch { return json({ state: "invalid_request" }); }
  return json(await mutatePlatformAdminBranchStatus(
    authorization, branchId, body, getPlatformAdminBranchStatusConfig(env), fetchImpl
  ));
}
