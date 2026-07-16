import { DashboardShell } from "../../../components/DashboardShell";
import { Card, Section } from "../../../components/RestaurantCards";
import { LiveNutrition } from "../../../components/runtime/LiveRestaurantViews";
import { RpcUnavailable } from "../../../components/runtime/RuntimeStates";
import { loadLiveNutrition } from "../../../runtime/live-restaurant-reads";
import { createRestaurantRuntimeService } from "../../../services/restaurant-runtime-service-factory";

export default async function NutritionPage() { const runtime=createRestaurantRuntimeService(); if(runtime.mode==="supabase") { try { return <DashboardShell title="營養管理" subtitle="僅顯示目前 owner/internal nutrition。"><LiveNutrition data={await loadLiveNutrition()}/></DashboardShell>; } catch { return <RpcUnavailable/>; } } if(runtime.mode==="disabled") return null; const rows=runtime.getNutritionQueue(); return <DashboardShell title="營養管理" subtitle="Demo data"><Section title="示範營養佇列"><div className="grid gap-4">{rows.map(row=><Card key={row.id}>示範營養資料：{row.calories??"—"} kcal</Card>)}</div></Section></DashboardShell>; }
