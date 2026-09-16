import "server-only";

import {
  clearAdminStepUpCookie,
  hashAdminStepUpSecret,
  readAdminStepUpCookie
} from "../auth/admin-step-up-cookie";
import { authorizeAdminStepUpRequest } from "../auth/admin-step-up-authorization";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON = /^[a-z][a-z0-9_]{0,79}$/;
const PERMISSION = /^[a-z][a-z0-9_.]{0,159}$/;
const BODY_LIMIT = 12_288;
const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff"
} as const;

type Operation =
  | "link_staff_account" | "suspend_staff_account" | "reactivate_staff_account"
  | "revoke_staff_account" | "grant_permission_delegation"
  | "revoke_permission_delegation" | "grant_console_admission"
  | "revoke_console_admission" | "grant_privileged_permission"
  | "revoke_privileged_permission";

const RPC: Readonly<Record<Operation, string>> = Object.freeze({
  link_staff_account: "staff_management_link_staff_account_v2",
  suspend_staff_account: "staff_management_suspend_staff_account_v2",
  reactivate_staff_account: "staff_management_reactivate_staff_account_v2",
  revoke_staff_account: "staff_management_revoke_staff_account_v2",
  grant_permission_delegation: "staff_management_grant_permission_delegation_v2",
  revoke_permission_delegation: "staff_management_revoke_permission_delegation_v2",
  grant_console_admission: "staff_management_grant_console_admission_v2",
  revoke_console_admission: "staff_management_revoke_console_admission_v2",
  grant_privileged_permission: "staff_management_grant_privileged_permission_v2",
  revoke_privileged_permission: "staff_management_revoke_privileged_permission_v2"
});

function json(body: object, status = 200): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}
function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function uuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
function reason(value: unknown): value is string { return typeof value === "string" && REASON.test(value); }
function permission(value: unknown): value is string { return typeof value === "string" && PERMISSION.test(value); }
function version(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function instant(value: unknown, nullable = false): value is string | null {
  return (nullable && value === null) || (typeof value === "string" && value.length <= 40
    && Number.isFinite(Date.parse(value)));
}

function shared(args: Record<string, unknown>): Record<string, unknown> | null {
  return reason(args.reasonCode) && uuid(args.requestId)
    ? { p_reason_code: args.reasonCode, p_request_id: args.requestId } : null;
}

function operationArguments(operation: Operation, args: Record<string, unknown>): Record<string, unknown> | null {
  const common = shared(args);
  if (!common) return null;
  if (operation === "link_staff_account") {
    return uuid(args.targetAuthUserId) && instant(args.effectiveFrom) && instant(args.effectiveUntil, true)
      ? { ...common, p_target_auth_user_id: args.targetAuthUserId,
        p_effective_from: args.effectiveFrom, p_effective_until: args.effectiveUntil } : null;
  }
  if (operation === "suspend_staff_account" || operation === "reactivate_staff_account"
    || operation === "revoke_staff_account") {
    return uuid(args.targetStaffAccountId) && version(args.expectedStatusVersion)
      ? { ...common, p_target_staff_account_id: args.targetStaffAccountId,
        p_expected_status_version: args.expectedStatusVersion } : null;
  }
  if (operation === "grant_permission_delegation") {
    return uuid(args.delegateStaffAccountId) && permission(args.permissionKey)
      && typeof args.canGrant === "boolean" && typeof args.canRevoke === "boolean"
      && typeof args.canSetTemporary === "boolean" && instant(args.effectiveFrom)
      && instant(args.effectiveUntil, true)
      ? { ...common, p_delegate_staff_account_id: args.delegateStaffAccountId,
        p_permission_key: args.permissionKey, p_can_grant: args.canGrant,
        p_can_revoke: args.canRevoke, p_can_set_temporary: args.canSetTemporary,
        p_effective_from: args.effectiveFrom, p_effective_until: args.effectiveUntil } : null;
  }
  if (operation === "revoke_permission_delegation") {
    return uuid(args.delegationId) && version(args.expectedStatusVersion)
      ? { ...common, p_delegation_id: args.delegationId,
        p_expected_status_version: args.expectedStatusVersion } : null;
  }
  if (operation === "grant_console_admission") {
    return uuid(args.targetStaffAccountId)
      ? { ...common, p_target_staff_account_id: args.targetStaffAccountId } : null;
  }
  if (operation === "revoke_console_admission") {
    return uuid(args.consoleAdmissionGrantId) && version(args.expectedStatusVersion)
      ? { ...common, p_console_admission_grant_id: args.consoleAdmissionGrantId,
        p_expected_status_version: args.expectedStatusVersion } : null;
  }
  if (operation === "grant_privileged_permission") {
    return uuid(args.targetStaffAccountId) && permission(args.permissionKey)
      && instant(args.effectiveFrom) && instant(args.effectiveUntil, true)
      ? { ...common, p_target_staff_account_id: args.targetStaffAccountId,
        p_permission_key: args.permissionKey, p_effective_from: args.effectiveFrom,
        p_effective_until: args.effectiveUntil } : null;
  }
  return uuid(args.privilegedPermissionGrantId) && version(args.expectedStatusVersion)
    ? { ...common, p_privileged_permission_grant_id: args.privilegedPermissionGrantId,
      p_expected_status_version: args.expectedStatusVersion } : null;
}

export function hasPermissionWriteStrongConfirmation(
  operation: Operation,
  args: Record<string, unknown>,
  confirmation: unknown
): boolean {
  if (operation !== "grant_privileged_permission"
    || args.permissionKey !== "admin.management.staff.permission.write") return true;
  const value = record(confirmation);
  if (!value || !uuid(args.targetStaffAccountId)) return false;
  const expectedPhrase = `GRANT admin.management.staff.permission.write TO ${args.targetStaffAccountId}`;
  return value.targetStaffAccountId === args.targetStaffAccountId
    && value.permissionKey === args.permissionKey
    && value.phrase === expectedPhrase;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase()
    !== "application/json") return null;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > BODY_LIMIT)) return null;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > BODY_LIMIT) return null;
    return record(JSON.parse(text));
  } catch { return null; }
}

export async function handleAdminStepUpMutation(request: Request): Promise<Response> {
  const authorization = await authorizeAdminStepUpRequest(request);
  if (authorization.state !== "authorized") {
    const status = authorization.state === "unauthenticated" ? 401
      : authorization.state === "unavailable" ? 503 : 403;
    return json({ ok: false, error: authorization.state }, status);
  }
  const body = await readBody(request);
  const args = record(body?.arguments);
  const operation = body?.operation;
  if (!body || !args || typeof operation !== "string" || !(operation in RPC)) {
    return json({ ok: false, error: "invalid_request" }, 400);
  }
  const typedOperation = operation as Operation;
  const rpcArguments = operationArguments(typedOperation, args);
  if (!rpcArguments || !hasPermissionWriteStrongConfirmation(typedOperation, args, body.confirmation)) {
    return json({ ok: false, error: "strong_confirmation_required" }, 422);
  }
  const receipt = readAdminStepUpCookie();
  if (!receipt) return json({ ok: false, error: "step_up_required" }, 403);
  const parameters = {
    ...rpcArguments,
    p_step_up_receipt_id: receipt.receiptId,
    p_step_up_receipt_proof_hash: hashAdminStepUpSecret(receipt.secret)
  };
  try {
    const result = await authorization.session.client.rpc(RPC[typedOperation], parameters);
    if (result.error) return json({ ok: false, error: "mutation_unavailable" }, 503);
    const value = record(result.data);
    if (!value) return json({ ok: false, error: "mutation_unavailable" }, 503);
    const errorCode = value.errorCode ?? value.error_code;
    if (typeof errorCode === "string" && errorCode.startsWith("step_up_")) {
      clearAdminStepUpCookie();
      return json({ ok: false, error: errorCode }, 403);
    }
    return json({ ok: true, result: value });
  } catch {
    return json({ ok: false, error: "mutation_unavailable" }, 503);
  }
}
