import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { FactList, ReadFailureNotice, ReadySection, dash } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readRestaurantContact } from "apps/admin-web/server/adminRestaurantRead";

export default createAdminOperationalPage<{ restaurantId: string }>("restaurant-contact", async ({ params }) => {
  const result = await readRestaurantContact(params.restaurantId);
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description="餐廳公開的網站與社群連結（唯讀）。不含負責人身分或私人聯絡資料。" entry={getAdminRoute("restaurant-contact")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : (
        <ReadySection label="餐廳聯絡資料">
          <h2 className="text-lg font-bold text-slate-950">{result.data.name}</h2>
          <div className="mt-4"><FactList items={[{ label: "公開網站", value: dash(result.data.publicWebsiteUrl) }, { label: "網站版本", value: dash(result.data.publicWebsiteUrlVersion) }]} /></div>
          <h3 className="mt-5 text-sm font-bold text-slate-950">公開社群連結</h3>
          {result.data.socialLinks.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500" data-b2-state="empty">尚未提供社群連結。</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {result.data.socialLinks.map((link) => <li key={link.provider}><span className="font-bold">{link.provider}</span>：<span className="break-all">{link.publicUrl ?? "未提供網址"}</span></li>)}
            </ul>
          )}
        </ReadySection>
      )}
    </article>
  );
});
