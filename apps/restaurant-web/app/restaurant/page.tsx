import { redirect } from "next/navigation";
import { DashboardShell } from "../../components/DashboardShell";
import { DashboardHome } from "../../components/dashboard/DashboardHome";
import { LiveDashboard } from "../../components/runtime/LiveRestaurantViews";
import { ConfigurationUnavailable, RpcUnavailable } from "../../components/runtime/RuntimeStates";
import { loadLiveDashboard } from "../../runtime/live-restaurant-reads";
import { loadValidatedBranch } from "../../runtime/restaurant-access-context";
import { createRestaurantRuntimeService } from "../../services/restaurant-runtime-service-factory";

export default async function RestaurantPage({ searchParams }: { searchParams: { branch?: string } }) {
  const runtime = createRestaurantRuntimeService();
  if (runtime.mode === "disabled") return <ConfigurationUnavailable />;
  if (runtime.mode === "mock") return <DashboardShell title="首頁" subtitle="示範模式店家營運摘要。"><DashboardHome /></DashboardShell>;
  let branch;
  try { branch = await loadValidatedBranch(searchParams.branch); }
  catch (e) { console.error(`[restaurant-web] dashboard unavailable: ${e instanceof Error ? `${e.name}: ${e.message}` : "unknown error"}`); return <RpcUnavailable />; }
  // Stale, cross-restaurant, or unauthorized branch selections fail closed:
  // drop the invalid query param and fall back to the unfiltered legal default.
  if (branch.invalid) redirect("/restaurant");
  try {
    const data = await loadLiveDashboard();
    return <DashboardShell title="首頁" subtitle="Tenant-safe 店家唯讀摘要。"><LiveDashboard data={data} branches={branch.branches} selectedBranchId={branch.selected?.id ?? null} /></DashboardShell>;
  }
  catch (e) { console.error(`[restaurant-web] dashboard unavailable: ${e instanceof Error ? `${e.name}: ${e.message}` : "unknown error"}`); return <RpcUnavailable />; }
}
