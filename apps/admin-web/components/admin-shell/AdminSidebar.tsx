"use client";

import { usePathname } from "next/navigation";
import { AdminSidebarSection } from "./AdminSidebarSection";
import {
  buildAdminScaffoldNavigation,
  getAdminRouteChain,
  matchAdminRoute
} from "./admin-ia-navigation";
import type { AdminRouteId } from "../../auth/admin-route-registry";

export function AdminSidebar({
  visibleRouteIds,
  linkRouteIds
}: {
  visibleRouteIds: readonly AdminRouteId[];
  linkRouteIds: readonly AdminRouteId[];
}) {
  const pathname = usePathname();
  const match = matchAdminRoute(pathname);
  const currentId = match ? match.entry.id as AdminRouteId : null;
  const chain = currentId ? getAdminRouteChain(currentId) : [];
  const activeIds = new Set(chain.map((entry) => entry.id));
  const navigation = buildAdminScaffoldNavigation(visibleRouteIds, linkRouteIds);
  return (
    <nav aria-label="管理後台主要導覽">
      <p className="mb-3 px-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">工作區</p>
      <ul className="space-y-1">
        {navigation.map((node) => (
          <AdminSidebarSection activeIds={activeIds} currentId={currentId} key={node.id} node={node} separated={node.id === "engineering"} />
        ))}
      </ul>
    </nav>
  );
}
