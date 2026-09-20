import Link from "next/link";
import type { ReactNode } from "react";
import type { AdminOperationalContext } from "./AdminOperationalPage";
import { StatusPill, enc, has } from "./AdminRestaurantViews";
import type { QueueItemRow } from "../../server/adminReviewQueueRead";

/** Presentation helpers for the ADMIN-C read-only review queues. Real contract rows only; no controls of any kind. */

// Explicit, human-readable meaning of every backend reason code (the exact inclusion rule that put the row here).
const REASON_LABEL: Readonly<Record<string, string>> = {
  item_status_draft: "餐點狀態為草稿（尚未啟用）",
  menu_belongs_to_other_restaurant: "所屬菜單屬於另一間餐廳（階層不一致）",
  badge_without_current_nutrition: "營養標章為「已核可／AI 估算」，但沒有現行營養紀錄",
  multiple_current_nutrition: "有多筆標記為現行的營養紀錄",
  badge_pending_review: "營養標章狀態為「待審核」",
  nutrition_record_pending_review: "有營養紀錄的驗證狀態為「待審核」"
};

export function ReasonList({ reasons }: { reasons: readonly string[] }) {
  return (
    <ul className="space-y-1">
      {reasons.map((code) => (
        <li className="text-xs text-slate-800" data-queue-reason={code} key={code}>{REASON_LABEL[code] ?? code}</li>
      ))}
    </ul>
  );
}

/** Contextual links into the canonical ADMIN-B pages, each shown only when the viewer holds that page's own key. */
export function QueueRowLinks({ row, context }: { row: QueueItemRow; context: AdminOperationalContext }) {
  const consistent = row.menuRestaurantId === row.restaurantId;
  const restaurant = `/admin/restaurants/${enc(row.restaurantId)}`;
  const menu = `${restaurant}/menus/${enc(row.menuId)}`;
  const item = `${menu}/items/${enc(row.menuItemId)}`;
  const linkClass = "font-bold text-sky-800 hover:underline";
  const links: { label: string; href: string }[] = [];
  if (has(context, "admin.restaurants.read")) links.push({ label: "餐廳", href: restaurant });
  if (consistent && has(context, "admin.restaurants.menu.read")) links.push({ label: "菜單", href: menu });
  if (consistent && has(context, "admin.restaurants.menu_item.read")) {
    links.push({ label: "餐點", href: item });
    links.push({ label: "營養", href: `${item}/nutrition` });
  }
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {links.map((link) => <Link className={linkClass} href={link.href} key={link.label}>{link.label}</Link>)}
      {!consistent ? <span className="text-slate-500">階層不一致，無法開啟標準餐點頁面</span> : null}
      {links.length === 0 && consistent ? <span className="text-slate-400">—</span> : null}
    </div>
  );
}

export function QueueTable<T extends QueueItemRow>({ rows, context, extraColumns }: {
  rows: readonly T[];
  context: AdminOperationalContext;
  extraColumns?: readonly Readonly<{ header: string; cell: (row: T) => ReactNode }>[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-2 pr-4">餐點</th><th className="py-2 pr-4">餐廳</th><th className="py-2 pr-4">菜單</th><th className="py-2 pr-4">餐點狀態</th>
            {(extraColumns ?? []).map((col) => <th className="py-2 pr-4" key={col.header}>{col.header}</th>)}
            <th className="py-2 pr-4">原因</th><th className="py-2">前往</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 align-top">
          {rows.map((row) => (
            <tr data-queue-row={row.menuItemId} key={row.menuItemId}>
              <td className="py-2 pr-4"><span className="font-bold">{row.name}</span><div className="font-mono text-xs text-slate-500">{row.menuItemId}</div></td>
              <td className="py-2 pr-4">{row.restaurantName}<div className="font-mono text-xs text-slate-500">{row.restaurantId}</div></td>
              <td className="py-2 pr-4">{row.menuName} <StatusPill status={row.menuStatus} /><div className="text-xs text-slate-500">{row.categoryName}</div></td>
              <td className="py-2 pr-4"><StatusPill status={row.itemStatus} /></td>
              {(extraColumns ?? []).map((col) => <td className="py-2 pr-4" key={col.header}>{col.cell(row)}</td>)}
              <td className="py-2 pr-4"><ReasonList reasons={row.reasons} /></td>
              <td className="py-2"><QueueRowLinks context={context} row={row} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
