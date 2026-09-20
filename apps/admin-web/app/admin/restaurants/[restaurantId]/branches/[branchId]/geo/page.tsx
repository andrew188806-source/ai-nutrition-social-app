import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { FactList, ReadFailureNotice, ReadySection, dash } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readBranchGeo } from "apps/admin-web/server/adminRestaurantRead";

export default createAdminOperationalPage<{ restaurantId: string; branchId: string }>("restaurant-branch-geo", async ({ params }) => {
  const result = await readBranchGeo(params.restaurantId, params.branchId);
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description="分店的營運地理資料（唯讀；僅餐廳位置，不含使用者位置）。" entry={getAdminRoute("restaurant-branch-geo")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : (
        <ReadySection label="分店地理資料">
          <FactList items={[
            { label: "地址", value: dash(result.data.address) },
            { label: "緯度", value: dash(result.data.latitude) },
            { label: "經度", value: dash(result.data.longitude) },
            { label: "地理編碼狀態", value: dash(result.data.geocodeStatus) },
            { label: "地理編碼來源", value: dash(result.data.geocodeProvider) },
            { label: "解析時間", value: dash(result.data.geocodeResolvedAt) },
            { label: "嘗試次數", value: dash(result.data.geocodeAttempts) }
          ]} />
        </ReadySection>
      )}
    </article>
  );
});
