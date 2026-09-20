import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { FactList, ReadFailureNotice, ReadySection, dash } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readRestaurantAbout } from "apps/admin-web/server/adminRestaurantRead";

export default createAdminOperationalPage<{ restaurantId: string }>("restaurant-about", async ({ params }) => {
  const result = await readRestaurantAbout(params.restaurantId);
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description="餐廳自行提供的介紹內容（唯讀）。" entry={getAdminRoute("restaurant-about")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : (
        <ReadySection label="餐廳介紹">
          <h2 className="text-lg font-bold text-slate-950">{result.data.name}</h2>
          {result.data.about === null ? (
            <p className="mt-3 text-sm text-slate-500" data-b2-state="empty">此餐廳尚未提供介紹。</p>
          ) : (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900">{result.data.about}</p>
          )}
          <div className="mt-5"><FactList items={[{ label: "來源", value: dash(result.data.aboutSource) }, { label: "版本", value: dash(result.data.aboutVersion) }]} /></div>
        </ReadySection>
      )}
    </article>
  );
});
