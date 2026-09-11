import {
  ADMIN_ROUTE_REGISTRY,
  type AdminRouteDefinition,
  type AdminRouteId
} from "./admin-route-registry";
import type { CurrentAdminPermissionContext } from "./admin-current-permission-context";
import {
  resolveAdminRouteAuthorization,
  resolveAdminRouteRequirement
} from "./admin-route-authorization";

export type AdminNavigationVisibilityModel =
  | Readonly<{ state: "unavailable" }>
  | Readonly<{
      state: "ready";
      visibleRouteIds: readonly AdminRouteId[];
      linkRouteIds: readonly AdminRouteId[];
    }>;

function hasValidHierarchy(registry: readonly AdminRouteDefinition[]): boolean {
  const byId = new Map<string, AdminRouteDefinition>();
  for (const route of registry) {
    if (byId.has(route.id)) return false;
    byId.set(route.id, route);
  }
  for (const route of registry) {
    const seen = new Set<string>([route.id]);
    let parentId = route.parentId;
    while (parentId !== null) {
      if (seen.has(parentId)) return false;
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) return false;
      parentId = parent.parentId;
    }
  }
  return true;
}

/**
 * Produces presentation-only canonical route IDs from request-fresh verified
 * authority. Permission keys and permission decisions never cross into the
 * client shell. A retained ancestor is visible as structure but appears in
 * linkRouteIds only when its own route is authorized.
 */
export function deriveAdminNavigationVisibility(
  permissionContext: CurrentAdminPermissionContext,
  registry: readonly AdminRouteDefinition[] = ADMIN_ROUTE_REGISTRY
): AdminNavigationVisibilityModel {
  if (permissionContext.state !== "admin" || !hasValidHierarchy(registry)) {
    return Object.freeze({ state: "unavailable" as const });
  }

  const byId = new Map(registry.map((route) => [route.id, route]));
  const linked = new Set<string>();
  for (const route of registry) {
    const requirement = resolveAdminRouteRequirement(route);
    const decision = resolveAdminRouteAuthorization({
      requirement,
      currentPermissionContext: permissionContext
    });
    if (decision.state === "authority_unavailable") {
      return Object.freeze({ state: "unavailable" as const });
    }
    if (
      route.navigationVisibility !== "HIDDEN"
      && (decision.state === "allow_base_admin" || decision.state === "allow_current_permission")
    ) {
      linked.add(route.id);
    }
  }

  const visible = new Set(linked);
  for (const routeId of linked) {
    let parentId = byId.get(routeId)?.parentId ?? null;
    while (parentId !== null) {
      const parent = byId.get(parentId)!;
      if (parent.navigationVisibility !== "HIDDEN") visible.add(parent.id);
      parentId = parent.parentId;
    }
  }

  const orderedIds = registry.map((route) => route.id);
  return Object.freeze({
    state: "ready" as const,
    visibleRouteIds: Object.freeze(orderedIds.filter((id) => visible.has(id)) as AdminRouteId[]),
    linkRouteIds: Object.freeze(orderedIds.filter((id) => linked.has(id)) as AdminRouteId[])
  });
}
