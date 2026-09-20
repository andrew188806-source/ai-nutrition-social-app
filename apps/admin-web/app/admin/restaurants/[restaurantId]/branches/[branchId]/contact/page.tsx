import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { FactList, ReadFailureNotice, ReadySection, dash } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readBranchContact } from "apps/admin-web/server/adminRestaurantRead";

export default createAdminOperationalPage<{ restaurantId: string; branchId: string }>("restaurant-branch-contact", async ({ params }) => {
  const result = await readBranchContact(params.restaurantId, params.branchId);
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description="分店對外公開的聯絡電話（唯讀）。" entry={getAdminRoute("restaurant-branch-contact")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : (
        <ReadySection label="分店聯絡資料">
          <h2 className="text-lg font-bold text-slate-950">{result.data.name}</h2>
          <div className="mt-4"><FactList items={[{ label: "公開電話", value: dash(result.data.publicPhone) }, { label: "電話版本", value: dash(result.data.publicPhoneVersion) }]} /></div>
        </ReadySection>
      )}
    </article>
  );
});
