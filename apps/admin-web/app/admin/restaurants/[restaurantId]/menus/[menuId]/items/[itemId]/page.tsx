import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { NutritionFacts, yesNo } from "apps/admin-web/components/admin-shell/AdminMenuViews";
import { FactList, ReadFailureNotice, ReadySection, StatusPill, SubLinks, dash, enc, has } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readMenuItemDetail } from "apps/admin-web/server/adminRestaurantRead";

export default createAdminOperationalPage<{ restaurantId: string; menuId: string; itemId: string }>("restaurant-menu-item-detail", async ({ context, params }) => {
  const result = await readMenuItemDetail(params.restaurantId, params.menuId, params.itemId);
  const base = `/admin/restaurants/${enc(params.restaurantId)}/menus/${enc(params.menuId)}/items/${enc(params.itemId)}`;
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description="單一餐點的營運資料（唯讀）：識別、狀態、過敏原與現行營養資料。" entry={getAdminRoute("restaurant-menu-item-detail")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : (
        <>
          <ReadySection label="餐點資料">
            <h2 className="text-lg font-bold text-slate-950">{result.data.name}</h2>
            <p className="mb-4 font-mono text-xs text-slate-500">{result.data.restaurantId} / {result.data.menuId} / {result.data.menuItemId}</p>
            <FactList items={[
              { label: "狀態", value: <StatusPill status={result.data.status} /> },
              { label: "菜單", value: result.data.menuName },
              { label: "分類", value: result.data.categoryName },
              { label: "說明", value: dash(result.data.description) },
              { label: "圖片網址", value: dash(result.data.imageUrl) },
              { label: "過敏原", value: result.data.allergens.length === 0 ? null : result.data.allergens.join("、") },
              { label: "營養標章狀態", value: result.data.nutritionBadgeStatus },
              { label: "標章啟用", value: yesNo(result.data.badgeEnabled) },
              { label: "分店關聯數", value: result.data.branchLinkCount }
            ]} />
          </ReadySection>
          <ReadySection label="現行營養資料">
            <h3 className="mb-3 text-sm font-bold text-slate-950">現行營養資料</h3>
            <NutritionFacts nutrition={result.data.currentNutrition} />
          </ReadySection>
          <SubLinks links={[
            { label: "營養資料（專頁）", href: `${base}/nutrition`, allowed: has(context, "admin.restaurants.menu_item.read") },
            { label: "過敏原（專頁）", href: `${base}/allergens`, allowed: has(context, "admin.restaurants.menu_item.read") },
            { label: "營養審核現況（專頁）", href: `${base}/certification`, allowed: has(context, "admin.restaurants.menu_item.read") }
          ]} />
        </>
      )}
    </article>
  );
});
