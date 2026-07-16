import { DashboardShell } from "../DashboardShell";
import type { OwnerRestaurant } from "../../runtime/restaurant-rpc-contracts";
import { selectRestaurant } from "../../app/restaurant/selection-actions";

export function DemoDataMarker() {
  return <div className="bg-amber-100 px-4 py-2 text-center text-sm font-black text-amber-900">Demo data — 非遠端或即時店家資料</div>;
}

export function ConfigurationUnavailable() {
  return <RuntimeMessage title="設定不可用" body="店家唯讀 runtime 尚未正確設定，因此不會顯示任何 tenant 資料。" />;
}
export function NoActiveAccess() {
  return <RuntimeMessage title="沒有可用的店家存取權" body="目前帳號沒有可使用的店家權限。如需協助，請聯絡管理者。" />;
}
export function RpcUnavailable() {
  return <RuntimeMessage title="店家資料暫時無法使用" body="唯讀服務目前無法完成請求；系統不會改用示範資料。" />;
}
export function DeferredRuntimeModule({ title }: { title: string }) {
  return <RuntimeMessage title={title} body="此模組尚未連接目前的唯讀 runtime，因此暫時無法使用。" />;
}
export function RestaurantChooser({ restaurants }: { restaurants: OwnerRestaurant[] }) {
  return (
    <DashboardShell title="選擇店家" subtitle="此帳號有多個有效店家存取權；請明確選擇本次工作店家。">
      <div className="grid gap-3 md:grid-cols-2">
        {restaurants.map((restaurant) => (
          <form action={selectRestaurant} className="rounded-lg border border-stone-200 bg-white p-5" key={restaurant.id}>
            <input name="restaurantId" type="hidden" value={restaurant.id} />
            <p className="font-black text-stone-950">{restaurant.name}</p>
            <p className="mt-1 text-sm text-stone-500">{restaurant.city ?? "地區未提供"}</p>
            <button className="mt-4 rounded-md bg-teal-700 px-4 py-2 text-sm font-bold text-white" type="submit">使用這家店</button>
          </form>
        ))}
      </div>
    </DashboardShell>
  );
}

function RuntimeMessage({ title, body }: { title: string; body: string }) {
  return <DashboardShell title={title} subtitle={body}><div className="rounded-lg border border-stone-200 bg-white p-6 text-sm font-semibold text-stone-600">{body}</div></DashboardShell>;
}
