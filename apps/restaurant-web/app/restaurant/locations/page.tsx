import { DashboardShell } from "../../../components/DashboardShell";
import { Card, Section, StatusPill } from "../../../components/RestaurantCards";
import { LiveLocations } from "../../../components/runtime/LiveRestaurantViews";
import { RpcUnavailable } from "../../../components/runtime/RuntimeStates";
import { loadLiveLocations } from "../../../runtime/live-restaurant-reads";
import { createRestaurantRuntimeService } from "../../../services/restaurant-runtime-service-factory";

export default async function LocationsPage() {
  const runtime=createRestaurantRuntimeService();
  if(runtime.mode==="supabase") { try { return <DashboardShell title="店家與分店" subtitle="僅顯示授權分店。"><LiveLocations data={await loadLiveLocations()} /></DashboardShell>; } catch { return <RpcUnavailable/>; } }
  if(runtime.mode==="disabled") return null;
  const data=runtime.getConsoleOverview();
  return <DashboardShell title="店家與分店" subtitle="Demo data"><Section title={data.restaurant.name}><div className="grid gap-4 md:grid-cols-3">{data.branchSummary.map(branch=><Card key={branch.id}><h3 className="font-black">{branch.name}</h3><p className="mt-1 text-sm text-stone-500">{branch.address}</p><StatusPill tone={branch.isActive?"good":"muted"}>{branch.isActive?"啟用":"停用"}</StatusPill></Card>)}</div></Section></DashboardShell>;
}
