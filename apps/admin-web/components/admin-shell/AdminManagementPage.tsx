import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { AdminRouteId } from "../../auth/admin-route-registry";
import { getAdminRoute } from "./admin-ia-navigation";
import { getVerifiedAdminPermissionContext } from "../../auth/admin-context";
import {
  resolveAdminRouteAuthorization,
  resolveAdminRouteRequirement
} from "../../auth/admin-route-authorization";
import { deriveAdminNavigationVisibility } from "../../auth/admin-navigation-visibility";
import { AdminAccessDenied, AdminAuthorityUnavailable, AdminPermissionDenied } from "./AdminAccessState";
import { AdminShell } from "./AdminShell";
import type { CurrentAdminPermissionContext } from "../../auth/admin-current-permission-context";

type AdminContext = Extract<CurrentAdminPermissionContext, { state: "admin" }>;

/**
 * Same auth gate as createAdminRegistryPage (canonical registry + permission
 * context + navigation visibility), but renders caller-supplied content
 * instead of the generic workspace landing / placeholder body. Used for
 * Platform Management pages that read or mutate real staff authority data.
 */
export function createAdminManagementPage(
  routeId: AdminRouteId,
  render: (context: AdminContext) => ReactNode
) {
  return createAdminManagementParamPage(routeId, (context) => render(context));
}

/**
 * Same gate, for a dynamic route: Next.js supplies `params` to the page
 * component, and the render callback receives them alongside the verified
 * admin context.
 */
export function createAdminManagementParamPage<Params extends Record<string, string>>(
  routeId: AdminRouteId,
  render: (context: AdminContext, params: Params) => ReactNode
) {
  return async function AdminManagementCustomPage({ params }: { params: Params }) {
    const route = getAdminRoute(routeId);
    const requirement = resolveAdminRouteRequirement(route);
    const permissionContext = await getVerifiedAdminPermissionContext();
    const decision = resolveAdminRouteAuthorization({
      requirement,
      currentPermissionContext: permissionContext
    });
    if (decision.state === "redirect_login") redirect("/admin/login?reason=session");
    if (decision.state === "access_denied") return <AdminAccessDenied />;
    if (decision.state === "permission_denied") return <AdminPermissionDenied />;
    if (decision.state === "authority_unavailable") return <AdminAuthorityUnavailable />;
    if (decision.state === "not_registered" || decision.state === "login_exempt") notFound();
    const visibility = deriveAdminNavigationVisibility(permissionContext);
    if (visibility.state === "unavailable" || permissionContext.state !== "admin") {
      return <AdminAuthorityUnavailable />;
    }
    return (
      <AdminShell linkRouteIds={visibility.linkRouteIds} visibleRouteIds={visibility.visibleRouteIds}>
        {render(permissionContext, params)}
      </AdminShell>
    );
  };
}
