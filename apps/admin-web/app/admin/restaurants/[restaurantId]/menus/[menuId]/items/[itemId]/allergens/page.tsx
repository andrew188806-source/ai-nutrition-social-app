import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { FactList, ReadFailureNotice, ReadySection, StatusPill } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readMenuItemDetail } from "apps/admin-web/server/adminRestaurantRead";

// Focused presentation of `allergens` from the item-detail contract; there is no separate allergen read. Codes are shown exactly as recorded (no inference, no translation, no AI guess).
export default createAdminOperationalPage<{ restaurantId: string; menuId: string; itemId: string }>("restaurant-item-allergens", async ({ params }) => {
  const result = await readMenuItemDetail(params.restaurantId, params.menuId, params.itemId);
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description="餐點已記錄的過敏原（唯讀）。只顯示資料庫現有紀錄，不推測、不編輯、不審核。" entry={getAdminRoute("restaurant-item-allergens")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : (
        <ReadySection label="過敏原">
          <h2 className="text-lg font-bold text-slate-950">{result.data.name}</h2>
          <p className="mb-4 font-mono text-xs text-slate-500">{result.data.restaurantId} / {result.data.menuId} / {result.data.menuItemId}</p>
          <div className="mb-4"><FactList items={[{ label: "餐點狀態", value: <StatusPill status={result.data.status} /> }, { label: "已記錄過敏原數", value: result.data.allergens.length }]} /></div>
          {result.data.allergens.length === 0 ? (
            <p className="text-sm text-slate-600" data-c2-allergens="none">此餐點目前沒有記錄任何過敏原。</p>
          ) : (
            <ul className="flex flex-wrap gap-2" data-c2-allergens="present">
              {result.data.allergens.map((allergen) => <li className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-sm font-bold text-slate-900" data-c2-allergen={allergen} key={allergen}>{allergen}</li>)}
            </ul>
          )}
        </ReadySection>
      )}
    </article>
  );
});
