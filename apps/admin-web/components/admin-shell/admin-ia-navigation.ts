import {
  ADMIN_ROUTE_REGISTRY,
  ADMIN_TOP_LEVEL_WORKSPACE_IDS,
  type AdminAvailability,
  type AdminRouteDefinition,
  type AdminRouteId
} from "../../auth/admin-route-registry";

export type AdminRouteMatch = Readonly<{
  entry: AdminRouteDefinition;
  params: Readonly<Record<string, string>>;
}>;

export type AdminBreadcrumbItem = Readonly<{
  id: AdminRouteId;
  label: string;
  href: string | null;
  current: boolean;
}>;

export type AdminScaffoldNavigationNode = Readonly<{
  id: AdminRouteId;
  label: string;
  href: string;
  availability: AdminAvailability;
  children: readonly AdminScaffoldNavigationNode[];
}>;

const routeById: ReadonlyMap<string, AdminRouteDefinition> = new Map(
  ADMIN_ROUTE_REGISTRY.map((entry) => [entry.id, entry])
);

const normalizePathname = (pathname: string): string => {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || "/";
  if (pathOnly === "/") return pathOnly;
  return pathOnly.replace(/\/+$/, "") || "/";
};

const segments = (pathname: string): readonly string[] =>
  normalizePathname(pathname).split("/").filter(Boolean);

const dynamicSegment = /^\[([^/\]]+)\]$/;

function matchTemplate(template: string, pathname: string): Readonly<Record<string, string>> | null {
  const templateSegments = segments(template);
  const pathnameSegments = segments(pathname);
  if (templateSegments.length !== pathnameSegments.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < templateSegments.length; index += 1) {
    const templateSegment = templateSegments[index]!;
    const pathnameSegment = pathnameSegments[index]!;
    const dynamic = dynamicSegment.exec(templateSegment);
    if (dynamic) {
      try {
        params[dynamic[1]!] = decodeURIComponent(pathnameSegment);
      } catch {
        return null;
      }
    } else if (templateSegment !== pathnameSegment) {
      return null;
    }
  }
  return params;
}

const matcherOrder = [...ADMIN_ROUTE_REGISTRY].sort((left, right) => {
  const leftDynamic = segments(left.route).filter((segment) => dynamicSegment.test(segment)).length;
  const rightDynamic = segments(right.route).filter((segment) => dynamicSegment.test(segment)).length;
  if (leftDynamic !== rightDynamic) return leftDynamic - rightDynamic;
  return segments(right.route).length - segments(left.route).length;
});

export function matchAdminRoute(pathname: string): AdminRouteMatch | null {
  const normalized = normalizePathname(pathname);
  if (normalized !== "/admin" && !normalized.startsWith("/admin/")) return null;
  for (const entry of matcherOrder) {
    const params = matchTemplate(entry.route, normalized);
    if (params) return { entry, params };
  }
  return null;
}

export function getAdminRoute(routeId: AdminRouteId): AdminRouteDefinition {
  const entry = routeById.get(routeId);
  if (!entry) throw new Error(`Unknown Admin route ID: ${routeId}`);
  return entry;
}

export function getAdminRouteChain(routeId: AdminRouteId): readonly AdminRouteDefinition[] {
  const chain: AdminRouteDefinition[] = [];
  const seen = new Set<string>();
  let current: AdminRouteDefinition | undefined = getAdminRoute(routeId);
  while (current) {
    if (seen.has(current.id)) throw new Error(`Admin route cycle: ${routeId}`);
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId === null ? undefined : routeById.get(current.parentId);
  }
  return chain;
}

function materializeRoute(template: string, params: Readonly<Record<string, string>>): string | null {
  let complete = true;
  const result = template.replace(/\[([^/\]]+)\]/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) {
      complete = false;
      return `[${key}]`;
    }
    return encodeURIComponent(value);
  });
  return complete ? result : null;
}

export function getAdminBreadcrumbs(pathname: string): readonly AdminBreadcrumbItem[] {
  const match = matchAdminRoute(pathname);
  if (!match) return [];
  const chain = getAdminRouteChain(match.entry.id as AdminRouteId);
  return chain.map((entry, index) => ({
    id: entry.id as AdminRouteId,
    label: entry.zhTWLabel,
    href: materializeRoute(entry.route, match.params),
    current: index === chain.length - 1
  }));
}

/**
 * IA preview navigation only. The optional visible IDs are presentation input;
 * this function performs no authentication or authorization.
 */
export function buildAdminScaffoldNavigation(
  visibleRouteIds: readonly AdminRouteId[] = ADMIN_ROUTE_REGISTRY
    .filter((entry) => entry.navigationVisibility === "ORDINARY")
    .map((entry) => entry.id as AdminRouteId)
): readonly AdminScaffoldNavigationNode[] {
  const visible = new Set<string>(visibleRouteIds);
  const buildNode = (entry: AdminRouteDefinition): AdminScaffoldNavigationNode | null => {
    if (entry.navigationVisibility !== "ORDINARY") return null;
    const children = ADMIN_ROUTE_REGISTRY
      .filter((candidate) => candidate.parentId === entry.id)
      .sort((left, right) => left.order - right.order)
      .map(buildNode)
      .filter((candidate): candidate is AdminScaffoldNavigationNode => candidate !== null);
    const isTopLevelParent = ADMIN_TOP_LEVEL_WORKSPACE_IDS.includes(entry.id as typeof ADMIN_TOP_LEVEL_WORKSPACE_IDS[number])
      && entry.id !== "dashboard";
    if (!visible.has(entry.id) && children.length === 0) return null;
    if (isTopLevelParent && children.length === 0) return null;
    return {
      id: entry.id as AdminRouteId,
      label: entry.zhTWLabel,
      href: entry.route,
      availability: entry.availability,
      children
    };
  };

  return ADMIN_TOP_LEVEL_WORKSPACE_IDS
    .map((id) => buildNode(getAdminRoute(id)))
    .filter((entry): entry is AdminScaffoldNavigationNode => entry !== null);
}

export function getAdminDescendants(routeId: AdminRouteId): readonly AdminRouteDefinition[] {
  const descendants: AdminRouteDefinition[] = [];
  const visit = (parentId: string) => {
    for (const child of ADMIN_ROUTE_REGISTRY.filter((entry) => entry.parentId === parentId).sort((a, b) => a.order - b.order)) {
      descendants.push(child);
      visit(child.id);
    }
  };
  visit(routeId);
  return descendants;
}

