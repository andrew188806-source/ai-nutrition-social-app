import { DashboardShell } from "../../components/DashboardShell";
import { DashboardHome } from "../../components/dashboard/DashboardHome";
import { LiveDashboard } from "../../components/runtime/LiveRestaurantViews";
import { ConfigurationUnavailable, RpcUnavailable } from "../../components/runtime/RuntimeStates";
import { loadLiveDashboard } from "../../runtime/live-restaurant-reads";
import { createRestaurantRuntimeService } from "../../services/restaurant-runtime-service-factory";

export default async function RestaurantPage() {
  const runtime = createRestaurantRuntimeService();
  if (runtime.mode === "disabled") return <ConfigurationUnavailable />;
  if (runtime.mode === "mock") return <DashboardShell title="首頁" subtitle="示範模式店家營運摘要。"><DashboardHome /></DashboardShell>;
  try { return <DashboardShell title="首頁" subtitle="Tenant-safe 店家唯讀摘要。"><LiveDashboard data={await loadLiveDashboard()} /></DashboardShell>; }
  catch { return <RpcUnavailable />; }
}
