import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { yesNo } from "apps/admin-web/components/admin-shell/AdminMenuViews";
import { FactList, ReadFailureNotice, ReadySection, StatusPill, dash } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readMenuItemDetail } from "apps/admin-web/server/adminRestaurantRead";

// Factual status only, taken verbatim from the item-detail contract (badge status/enabled and the current record's
// verification state/source/time). No "certified" verdict is derived, and confidence is not interpreted.
export default createAdminOperationalPage<{ restaurantId: string; menuId: string; itemId: string }>("restaurant-item-certification", async ({ params }) => {
  const result = await readMenuItemDetail(params.restaurantId, params.menuId, params.itemId);
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description="餐點的營養審核現況（唯讀）。只顯示資料庫現有狀態，不代表認證結論；不提供核准、駁回或修改。" entry={getAdminRoute("restaurant-item-certification")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : (
        <ReadySection label="營養審核現況">
          <h2 className="text-lg font-bold text-slate-950">{result.data.name}</h2>
          <p className="mb-4 font-mono text-xs text-slate-500">{result.data.restaurantId} / {result.data.menuId} / {result.data.menuItemId}</p>
          <FactList items={[
            { label: "餐點狀態", value: <StatusPill status={result.data.status} /> },
            { label: "營養標章狀態", value: result.data.nutritionBadgeStatus },
            { label: "標章啟用", value: yesNo(result.data.badgeEnabled) }
          ]} />
          <h3 className="mb-3 mt-5 text-sm font-bold text-slate-950">現行營養紀錄</h3>
          {result.data.currentNutrition === null ? (
            <p className="text-sm text-slate-600" data-c2-certification="none">目前沒有現行營養紀錄，因此沒有可顯示的驗證狀態。</p>
          ) : (
            <div data-c2-certification="present">
              <FactList items={[
                { label: "驗證狀態", value: dash(result.data.currentNutrition.verifiedStatus) },
                { label: "資料來源", value: dash(result.data.currentNutrition.source) },
                { label: "更新時間", value: dash(result.data.currentNutrition.updatedAt) }
              ]} />
            </div>
          )}
        </ReadySection>
      )}
    </article>
  );
});
