import type { PlatformAdminContext } from "../server/platformAdminAuthority";
import {
  ADMIN_PERMISSION_REGISTRY,
  type AdminRouteDefinition
} from "./admin-route-registry";
import {
  hasCurrentAdminPermission,
  type CurrentAdminPermissionContext
} from "./admin-current-permission-context";
import {
  isCurrentAdminPermissionKey,
  type CurrentAdminPermissionKey
} from "./admin-current-permission-vocabulary";

const BASE_PERMISSION = "admin_context.read" as const;
const plannedPermissionKeys: ReadonlySet<string> = new Set(
  ADMIN_PERMISSION_REGISTRY
    .filter((permission) => permission.status === "PLANNED")
    .map((permission) => permission.key)
);

export type AdminRouteRequirement =
  | Readonly<{ state: "not_registered" }>
  | Readonly<{ state: "login_exempt" }>
  | Readonly<{ state: "base_admin" }>
  | Readonly<{ state: "current_permissions"; permissions: readonly CurrentAdminPermissionKey[] }>
  | Readonly<{ state: "invalid_metadata" }>;

export type AdminRouteAuthorizationDecision =
  | Readonly<{ state: "not_registered" }>
  | Readonly<{ state: "login_exempt" }>
  | Readonly<{ state: "redirect_login" }>
  | Readonly<{ state: "access_denied" }>
  | Readonly<{ state: "permission_denied" }>
  | Readonly<{ state: "authority_unavailable" }>
  | Readonly<{ state: "allow_base_admin" }>
  | Readonly<{ state: "allow_current_permission" }>;

export function resolveAdminRouteRequirement(
  route: AdminRouteDefinition | null
): AdminRouteRequirement {
  if (route === null) return Object.freeze({ state: "not_registered" as const });
  if (route.id === "admin-login") return Object.freeze({ state: "login_exempt" as const });
  if (route.navigationVisibility === "HIDDEN") return Object.freeze({ state: "not_registered" as const });

  const currentPermissions = new Set<CurrentAdminPermissionKey>();
  let hasPlannedPermission = false;
  for (const permission of route.requiredPermissions as readonly unknown[]) {
    if (permission === BASE_PERMISSION) continue;
    if (isCurrentAdminPermissionKey(permission)) {
      currentPermissions.add(permission);
    } else if (typeof permission === "string" && plannedPermissionKeys.has(permission)) {
      hasPlannedPermission = true;
    } else {
      return Object.freeze({ state: "invalid_metadata" as const });
    }
  }

  if (currentPermissions.size > 0 && hasPlannedPermission) {
    return Object.freeze({ state: "invalid_metadata" as const });
  }
  if (currentPermissions.size > 0) {
    return Object.freeze({
      state: "current_permissions" as const,
      permissions: Object.freeze([...currentPermissions].sort())
    });
  }

  // PLANNED keys are design metadata. Until P3-P6 creates their database
  // authority they preserve the verified P3-P1 base-Admin policy only.
  return Object.freeze({ state: "base_admin" as const });
}

function decideBaseAdmin(context: PlatformAdminContext | null): AdminRouteAuthorizationDecision {
  if (context === null || context.state === "unavailable") {
    return Object.freeze({ state: "authority_unavailable" as const });
  }
  if (context.state === "unauthenticated") return Object.freeze({ state: "redirect_login" as const });
  if (context.state === "not_admin") return Object.freeze({ state: "access_denied" as const });
  return context.permissions.includes(BASE_PERMISSION)
    ? Object.freeze({ state: "allow_base_admin" as const })
    : Object.freeze({ state: "access_denied" as const });
}

function decideCurrentPermissions(
  context: CurrentAdminPermissionContext | null,
  permissions: readonly CurrentAdminPermissionKey[]
): AdminRouteAuthorizationDecision {
  if (context === null || context.state === "unavailable") {
    return Object.freeze({ state: "authority_unavailable" as const });
  }
  if (context.state === "unauthenticated") return Object.freeze({ state: "redirect_login" as const });
  if (context.state === "not_admin") return Object.freeze({ state: "access_denied" as const });
  return permissions.every((permission) => hasCurrentAdminPermission(context, permission))
    ? Object.freeze({ state: "allow_current_permission" as const })
    : Object.freeze({ state: "permission_denied" as const });
}

export function resolveAdminRouteAuthorization(input: Readonly<{
  requirement: AdminRouteRequirement;
  baseContext?: PlatformAdminContext | null;
  currentPermissionContext?: CurrentAdminPermissionContext | null;
}>): AdminRouteAuthorizationDecision {
  if (input.requirement.state === "not_registered") return Object.freeze({ state: "not_registered" as const });
  if (input.requirement.state === "login_exempt") return Object.freeze({ state: "login_exempt" as const });
  if (input.requirement.state === "invalid_metadata") return Object.freeze({ state: "authority_unavailable" as const });
  if (input.requirement.state === "base_admin") return decideBaseAdmin(input.baseContext ?? null);
  return decideCurrentPermissions(input.currentPermissionContext ?? null, input.requirement.permissions);
}
