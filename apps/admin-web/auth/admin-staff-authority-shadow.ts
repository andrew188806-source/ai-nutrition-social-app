import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentAdminPermissionContext } from "./admin-current-permission-context";
import {
  isCurrentAdminPermissionKey,
  type CurrentAdminPermissionKey
} from "./admin-current-permission-vocabulary";

export const ADMIN_STAFF_AUTHORITY_SHADOW_ENV = "TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW" as const;
export const STAFF_CURRENT_CONTEXT_FUNCTION = "staff_current_context_v1" as const;
export const ADMIN_STAFF_AUTHORITY_SHADOW_TIMEOUT_MS = 1_500 as const;

export type AdminStaffAuthorityShadowUnavailableReason =
  | "rpc_rejected"
  | "rpc_unreachable"
  | "malformed_response";

export type AdminStaffAuthorityShadowResult =
  | Readonly<{ state: "disabled" }>
  | Readonly<{ state: "not_applicable" }>
  | Readonly<{ state: "match" }>
  | Readonly<{
      state: "mismatch";
      missingFromStaff: readonly CurrentAdminPermissionKey[];
      extraInStaff: readonly CurrentAdminPermissionKey[];
    }>
  | Readonly<{
      state: "unavailable";
      reason: AdminStaffAuthorityShadowUnavailableReason;
    }>;

export type AdminStaffAuthorityShadowRpcOutcome =
  | Readonly<{ ok: true; data: unknown }>
  | Readonly<{ ok: false; reason: "rpc_rejected" | "rpc_unreachable" }>;

export type AdminStaffAuthorityShadowDiagnostic =
  | Readonly<{
      event: "admin_staff_authority_shadow_mismatch";
      state: "mismatch";
      missingFromStaff: readonly CurrentAdminPermissionKey[];
      extraInStaff: readonly CurrentAdminPermissionKey[];
    }>
  | Readonly<{
      event: "admin_staff_authority_shadow_unavailable";
      state: "unavailable";
      reason: AdminStaffAuthorityShadowUnavailableReason;
    }>;

type AdminStaffAuthorityShadowOptions = Readonly<{
  enabled?: boolean;
  timeoutMs?: number;
  warn?: (diagnostic: AdminStaffAuthorityShadowDiagnostic) => void;
}>;

type ParsedStaffPermissionSet =
  | Readonly<{ ok: true; permissions: readonly CurrentAdminPermissionKey[] }>
  | Readonly<{ ok: false }>;

export function isAdminStaffAuthorityShadowEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env[ADMIN_STAFF_AUTHORITY_SHADOW_ENV] === "enabled";
}

export function parseAdminStaffAuthorityShadowRows(data: unknown): ParsedStaffPermissionSet {
  if (!Array.isArray(data)) return Object.freeze({ ok: false as const });

  const permissions = new Set<CurrentAdminPermissionKey>();
  for (const row of data) {
    if (
      typeof row !== "object"
      || row === null
      || !("permission_key" in row)
      || !isCurrentAdminPermissionKey(row.permission_key)
    ) {
      return Object.freeze({ ok: false as const });
    }
    permissions.add(row.permission_key);
  }

  return Object.freeze({
    ok: true as const,
    permissions: Object.freeze([...permissions].sort())
  });
}

export function compareAdminStaffAuthorityShadow(
  authoritativeContext: CurrentAdminPermissionContext,
  staffOutcome: AdminStaffAuthorityShadowRpcOutcome | null,
  enabled: boolean
): AdminStaffAuthorityShadowResult {
  if (!enabled) return Object.freeze({ state: "disabled" as const });
  if (authoritativeContext.state !== "admin") {
    return Object.freeze({ state: "not_applicable" as const });
  }
  if (staffOutcome === null) {
    return Object.freeze({ state: "unavailable" as const, reason: "malformed_response" as const });
  }
  if (!staffOutcome.ok) {
    return Object.freeze({ state: "unavailable" as const, reason: staffOutcome.reason });
  }

  const staff = parseAdminStaffAuthorityShadowRows(staffOutcome.data);
  if (!staff.ok) {
    return Object.freeze({ state: "unavailable" as const, reason: "malformed_response" as const });
  }

  const authoritativePermissions = new Set(authoritativeContext.permissions);
  const staffPermissions = new Set(staff.permissions);
  const missingFromStaff = authoritativeContext.permissions
    .filter((permission) => !staffPermissions.has(permission))
    .sort();
  const extraInStaff = staff.permissions
    .filter((permission) => !authoritativePermissions.has(permission))
    .sort();

  if (missingFromStaff.length === 0 && extraInStaff.length === 0) {
    return Object.freeze({ state: "match" as const });
  }
  return Object.freeze({
    state: "mismatch" as const,
    missingFromStaff: Object.freeze(missingFromStaff),
    extraInStaff: Object.freeze(extraInStaff)
  });
}

function emitAdminStaffAuthorityShadowDiagnostic(
  result: AdminStaffAuthorityShadowResult,
  warn: (diagnostic: AdminStaffAuthorityShadowDiagnostic) => void
): void {
  try {
    if (result.state === "mismatch") {
      warn(Object.freeze({
        event: "admin_staff_authority_shadow_mismatch" as const,
        state: result.state,
        missingFromStaff: result.missingFromStaff,
        extraInStaff: result.extraInStaff
      }));
    } else if (result.state === "unavailable") {
      warn(Object.freeze({
        event: "admin_staff_authority_shadow_unavailable" as const,
        state: result.state,
        reason: result.reason
      }));
    }
  } catch {
    // Diagnostic transport must never change the authoritative request result.
  }
}

export async function resolveAdminStaffAuthorityShadow(
  client: SupabaseClient,
  authoritativeContext: CurrentAdminPermissionContext,
  options: AdminStaffAuthorityShadowOptions = {}
): Promise<AdminStaffAuthorityShadowResult> {
  const enabled = options.enabled ?? isAdminStaffAuthorityShadowEnabled();
  if (!enabled || authoritativeContext.state !== "admin") {
    return compareAdminStaffAuthorityShadow(authoritativeContext, null, enabled);
  }

  let outcome: AdminStaffAuthorityShadowRpcOutcome;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const requestedTimeout = options.timeoutMs ?? ADMIN_STAFF_AUTHORITY_SHADOW_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
    ? Math.min(requestedTimeout, ADMIN_STAFF_AUTHORITY_SHADOW_TIMEOUT_MS)
    : ADMIN_STAFF_AUTHORITY_SHADOW_TIMEOUT_MS;
  try {
    const result = await Promise.race([
      client.rpc(STAFF_CURRENT_CONTEXT_FUNCTION),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("staff authority shadow timeout")), timeoutMs);
      })
    ]);
    outcome = result.error
      ? Object.freeze({ ok: false as const, reason: "rpc_rejected" as const })
      : Object.freeze({ ok: true as const, data: result.data });
  } catch {
    outcome = Object.freeze({ ok: false as const, reason: "rpc_unreachable" as const });
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }

  const shadow = compareAdminStaffAuthorityShadow(authoritativeContext, outcome, true);
  emitAdminStaffAuthorityShadowDiagnostic(shadow, options.warn ?? console.warn);
  return shadow;
}
