import { redirect } from "next/navigation";
import { DashboardShell } from "../../../components/DashboardShell";
import { MenuListPanel } from "../../../components/menu/MenuListPanel";
import { LiveMenu } from "../../../components/runtime/LiveRestaurantViews";
import { RpcUnavailable } from "../../../components/runtime/RuntimeStates";
import { loadLiveMenu } from "../../../runtime/live-restaurant-reads";
import { loadValidatedBranch } from "../../../runtime/restaurant-access-context";
import { createRestaurantRuntimeService } from "../../../services/restaurant-runtime-service-factory";

export default async function MenuPage({ searchParams }: { searchParams: { branch?: string } }) {
  const runtime = createRestaurantRuntimeService();
  if (runtime.mode === "supabase") {
    let branch;
    try { branch = await loadValidatedBranch(searchParams.branch); }
    catch (e) { console.error(`[restaurant-web] menu unavailable: ${e instanceof Error ? `${e.name}: ${e.message}` : "unknown error"}`); return <RpcUnavailable/>; }
    if (branch.invalid) redirect("/restaurant/menu");
    try {
      const data = await loadLiveMenu();
      return <DashboardShell title="菜單管理" subtitle="Tenant-safe 核心唯讀欄位。"><LiveMenu data={data} branches={branch.branches} selectedBranchId={branch.selected?.id ?? null}/></DashboardShell>;
    } catch (e) { console.error(`[restaurant-web] menu unavailable: ${e instanceof Error ? `${e.name}: ${e.message}` : "unknown error"}`); return <RpcUnavailable/>; }
  }
  if (runtime.mode==="disabled") return null;
  return <DashboardShell title="菜單管理" subtitle="Demo data"><MenuListPanel/></DashboardShell>;
}
