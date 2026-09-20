import { createAdminManagementParamPage } from "../../../../../../../components/admin-shell/AdminManagementPage";
import { AdminBranchStatusWorkspace } from "../../../../../../../components/admin-shell/AdminBranchStatusWorkspace";
import { AdminWorkspaceHeader } from "../../../../../../../components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "../../../../../../../components/admin-shell/admin-ia-navigation";

export default createAdminManagementParamPage<{ restaurantId: string; branchId: string }>(
  "restaurant-branch-status",
  (_context, params) => (
    <article className="space-y-5">
      <AdminWorkspaceHeader
        description="檢視並變更單一分店的啟用／停用狀態。目前以精確的餐廳與分店識別碼開啟；餐廳搜尋與清單將於後續餐廳營運讀取模型提供。"
        entry={getAdminRoute("restaurant-branch-status")}
      />
      <AdminBranchStatusWorkspace branchId={params.branchId} restaurantId={params.restaurantId} />
    </article>
  )
);
