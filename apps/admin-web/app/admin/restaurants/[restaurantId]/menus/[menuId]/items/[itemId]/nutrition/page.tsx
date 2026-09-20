import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { NutritionFacts, yesNo } from "apps/admin-web/components/admin-shell/AdminMenuViews";
import { FactList, ReadFailureNotice, ReadySection } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readMenuItemDetail } from "apps/admin-web/server/adminRestaurantRead";

// Focused presentation of `currentNutrition` from the item-detail contract; there is no separate nutrition read.
export default createAdminOperationalPage<{ restaurantId: string; menuId: string; itemId: string }>("restaurant-item-nutrition", async ({ params }) => {
  const result = await readMenuItemDetail(params.restaurantId, params.menuId, params.itemId);
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description="餐點的現行營養資料（唯讀）。審核、認證與修改不在此頁提供。" entry={getAdminRoute("restaurant-item-nutrition")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : (
        <ReadySection label="營養資料">
          <h2 className="text-lg font-bold text-slate-950">{result.data.name}</h2>
          <p className="mb-4 font-mono text-xs text-slate-500">{result.data.restaurantId} / {result.data.menuId} / {result.data.menuItemId}</p>
          <div className="mb-4"><FactList items={[{ label: "營養標章狀態", value: result.data.nutritionBadgeStatus }, { label: "標章啟用", value: yesNo(result.data.badgeEnabled) }]} /></div>
          <NutritionFacts nutrition={result.data.currentNutrition} />
        </ReadySection>
      )}
    </article>
  );
});
