import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { AdminRouteId } from "../../auth/admin-route-registry";
import { getAdminRoute } from "./admin-ia-navigation";
import { getVerifiedAdminPermissionContext } from "../../auth/admin-context";
import { resolveAdminRouteAuthorization, resolveAdminRouteRequirement } from "../../auth/admin-route-authorization";
import { deriveAdminNavigationVisibility } from "../../auth/admin-navigation-visibility";
import { AdminAccessDenied, AdminAuthorityUnavailable, AdminPermissionDenied } from "./AdminAccessState";
import { AdminShell } from "./AdminShell";
import type { CurrentAdminPermissionContext } from "../../auth/admin-current-permission-context";

export type AdminOperationalContext = Extract<CurrentAdminPermissionContext, { state: "admin" }>;
export type AdminSearchParams = Readonly<Record<string, string | string[] | undefined>>;

/**
 * Canonical gate for read-only operational pages (ADMIN-B2). Identical authorization order to
 * createAdminManagementParamPage - registry route requirement, verified permission context, navigation
 * visibility - but the render callback is async and also receives the query string, so list pages can page
 * through the bounded B1 contracts. The exact CURRENT permission is enforced here on the server AND again by the
 * B1 contract itself; hiding a navigation link is never the authorization.
 */
export function createAdminOperationalPage<Params extends Record<string, string>>(
  routeId: AdminRouteId,
  render: (input: Readonly<{ context: AdminOperationalContext; params: Params; searchParams: AdminSearchParams }>) => Promise<ReactNode> | ReactNode
) {
  return async function AdminOperationalRoutePage({ params, searchParams }: { params: Params; searchParams?: AdminSearchParams }) {
    const route = getAdminRoute(routeId);
    const requirement = resolveAdminRouteRequirement(route);
    const permissionContext = await getVerifiedAdminPermissionContext();
    const decision = resolveAdminRouteAuthorization({ requirement, currentPermissionContext: permissionContext });
    if (decision.state === "redirect_login") redirect("/admin/login?reason=session");
    if (decision.state === "access_denied") return <AdminAccessDenied />;
    if (decision.state === "permission_denied") return <AdminPermissionDenied />;
    if (decision.state === "authority_unavailable") return <AdminAuthorityUnavailable />;
    if (decision.state === "not_registered" || decision.state === "login_exempt") notFound();
    const visibility = deriveAdminNavigationVisibility(permissionContext);
    if (visibility.state === "unavailable" || permissionContext.state !== "admin") return <AdminAuthorityUnavailable />;
    const body = await render({ context: permissionContext, params, searchParams: searchParams ?? {} });
    return (
      <AdminShell linkRouteIds={visibility.linkRouteIds} visibleRouteIds={visibility.visibleRouteIds}>
        {body}
      </AdminShell>
    );
  };
}
