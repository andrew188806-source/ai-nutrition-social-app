import type {
  PlatformAdminContext,
  PlatformAdminUnavailableReason
} from "../server/platformAdminAuthority";
import {
  isCurrentAdminPermissionKey,
  type CurrentAdminPermissionKey
} from "./admin-current-permission-vocabulary";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE_PERMISSION: CurrentAdminPermissionKey = "admin_context.read";
const BRANCH_STATUS_PERMISSION: CurrentAdminPermissionKey = "admin_restaurant_branch.status.write";

export type CurrentAdminPermissionUnavailableReason =
  | PlatformAdminUnavailableReason
  | "invalid_verified_subject"
  | "missing_base_permission"
  | "permission_authority_unreachable"
  | "permission_authority_rejected"
  | "unrecognized_current_permission";

export type CurrentAdminPermissionContext =
  | Readonly<{ state: "unauthenticated" }>
  | Readonly<{ state: "not_admin" }>
  | Readonly<{ state: "unavailable"; reason: CurrentAdminPermissionUnavailableReason }>
  | Readonly<{
      state: "admin";
      subject: string;
      roleKey: "platform_admin";
      permissions: readonly CurrentAdminPermissionKey[];
    }>;

export type CurrentAdminPermissionPredicateOutcome =
  | Readonly<{ ok: true; granted: boolean }>
  | Readonly<{ ok: false; reason: "permission_authority_unreachable" | "permission_authority_rejected" }>;

export type CurrentAdminPermissionComposition = Readonly<{
  subject: string | null;
  membershipContext: PlatformAdminContext;
  branchStatusPermission: CurrentAdminPermissionPredicateOutcome | null;
}>;

export function resolveCurrentAdminPermissionContext(
  composition: CurrentAdminPermissionComposition
): CurrentAdminPermissionContext {
  const { membershipContext } = composition;
  if (membershipContext.state === "unauthenticated") return Object.freeze({ state: "unauthenticated" as const });
  if (membershipContext.state === "not_admin") return Object.freeze({ state: "not_admin" as const });
  if (membershipContext.state === "unavailable") {
    return Object.freeze({ state: "unavailable" as const, reason: membershipContext.reason });
  }
  if (composition.subject === null || !UUID.test(composition.subject)) {
    return Object.freeze({ state: "unavailable" as const, reason: "invalid_verified_subject" as const });
  }
  if ((membershipContext as Readonly<{ roleKey?: unknown }>).roleKey !== "platform_admin") {
    return Object.freeze({ state: "unavailable" as const, reason: "unrecognized_role" as const });
  }

  const recognized = new Set<CurrentAdminPermissionKey>();
  for (const permission of membershipContext.permissions as readonly unknown[]) {
    if (!isCurrentAdminPermissionKey(permission) || permission === BRANCH_STATUS_PERMISSION) {
      return Object.freeze({ state: "unavailable" as const, reason: "unrecognized_current_permission" as const });
    }
    recognized.add(permission);
  }
  if (!recognized.has(BASE_PERMISSION)) {
    return Object.freeze({ state: "unavailable" as const, reason: "missing_base_permission" as const });
  }

  const predicate = composition.branchStatusPermission;
  if (predicate === null) {
    return Object.freeze({ state: "unavailable" as const, reason: "permission_authority_rejected" as const });
  }
  if (!predicate.ok) {
    return Object.freeze({ state: "unavailable" as const, reason: predicate.reason });
  }
  if (predicate.granted) recognized.add(BRANCH_STATUS_PERMISSION);

  return Object.freeze({
    state: "admin" as const,
    subject: composition.subject,
    roleKey: membershipContext.roleKey,
    permissions: Object.freeze([...recognized].sort())
  });
}

export function hasCurrentAdminPermission(
  context: CurrentAdminPermissionContext,
  permissionKey: CurrentAdminPermissionKey
): boolean {
  return context.state === "admin" && context.permissions.includes(permissionKey);
}

export function assertCurrentAdminPermission(
  context: CurrentAdminPermissionContext,
  permissionKey: CurrentAdminPermissionKey
): Readonly<{ allowed: boolean; refusal: CurrentAdminPermissionContext["state"] | null }> {
  return hasCurrentAdminPermission(context, permissionKey)
    ? Object.freeze({ allowed: true, refusal: null })
    : Object.freeze({ allowed: false, refusal: context.state });
}
