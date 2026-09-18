import { DashboardShell } from "../../../../../components/DashboardShell";
import { RestaurantOwnerMenuItemCreateForm } from "../../../../../components/menu/RestaurantOwnerMenuItemCreateForm";
import { RpcUnavailable } from "../../../../../components/runtime/RuntimeStates";
import { loadLiveMenu } from "../../../../../runtime/live-restaurant-reads";
import { loadValidatedBranch } from "../../../../../runtime/restaurant-access-context";
import { createRestaurantRuntimeService } from "../../../../../services/restaurant-runtime-service-factory";

// R2C: Restaurant catalog authoring writes (Menu/Category/Item create, Branch linkage create) exist
// only in the live Supabase R2B RPC family -- there is no mock-mode equivalent. Mock mode continues
// to render its existing read-only demo experience elsewhere and is not touched by this route.
export default async function NewMenuItemPage() {
  const runtime = createRestaurantRuntimeService();
  if (runtime.mode !== "supabase") {
    return (
      <DashboardShell title="新增餐點" subtitle="此功能僅於正式 Supabase 模式提供，Demo 模式暫不支援此項寫入操作。">
        <p className="text-sm text-stone-600">目前為示範資料模式，無法建立正式餐點資料。請切換至正式環境以使用此功能。</p>
      </DashboardShell>
    );
  }
  try {
    const [data, branch] = [await loadLiveMenu(), await loadValidatedBranch()];
    return (
      <DashboardShell title="新增餐點" subtitle="建立本店餐廳自有的菜單、分類與餐點資料。">
        <RestaurantOwnerMenuItemCreateForm menus={data.menus} categories={data.categories} branches={branch.branches} />
      </DashboardShell>
    );
  } catch (e) {
    console.error(`[restaurant-web] menu item creation unavailable: ${e instanceof Error ? `${e.name}: ${e.message}` : "unknown error"}`);
    return <RpcUnavailable />;
  }
}
