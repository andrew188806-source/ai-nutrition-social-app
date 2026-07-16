import { DashboardShell } from "../../../components/DashboardShell";
import { MenuListPanel } from "../../../components/menu/MenuListPanel";
import { LiveMenu } from "../../../components/runtime/LiveRestaurantViews";
import { RpcUnavailable } from "../../../components/runtime/RuntimeStates";
import { loadLiveMenu } from "../../../runtime/live-restaurant-reads";
import { createRestaurantRuntimeService } from "../../../services/restaurant-runtime-service-factory";

export default async function MenuPage() { const runtime=createRestaurantRuntimeService(); if(runtime.mode==="supabase") { try { return <DashboardShell title="菜單管理" subtitle="Tenant-safe 核心唯讀欄位。"><LiveMenu data={await loadLiveMenu()}/></DashboardShell>; } catch { return <RpcUnavailable/>; } } if(runtime.mode==="disabled") return null; return <DashboardShell title="菜單管理" subtitle="Demo data"><MenuListPanel/></DashboardShell>; }
