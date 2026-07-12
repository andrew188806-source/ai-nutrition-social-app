import { DashboardShell } from "../../../../../components/DashboardShell";
import { Card } from "../../../../../components/RestaurantCards";

export default function NewMenuItemPage() {
  return (
    <DashboardShell title="建立新餐點" subtitle="可由待確認餐點帶入名稱、照片與分店；建立後仍需審核，不直接公開上架。">
      <Card>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="rounded-md border border-stone-300 px-3 py-2 text-sm" placeholder="餐點名稱" />
          <input className="rounded-md border border-stone-300 px-3 py-2 text-sm" placeholder="分店" />
          <input className="rounded-md border border-stone-300 px-3 py-2 text-sm" placeholder="分類" />
          <input className="rounded-md border border-stone-300 px-3 py-2 text-sm" placeholder="價格" />
        </div>
        <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm font-bold text-amber-900">草稿建立後需管理者確認，不會直接上架。</div>
      </Card>
    </DashboardShell>
  );
}
