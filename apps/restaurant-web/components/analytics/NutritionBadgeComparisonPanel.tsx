"use client";

import { useMemo, useState } from "react";
import { Card, EmptyState, Section, StatusPill } from "../RestaurantCards";
import { getNutritionBadgeComparison } from "../../services/restaurantConsoleService";

export function NutritionBadgeComparisonPanel() {
  const data = getNutritionBadgeComparison();
  const [branchId, setBranchId] = useState("all");
  const [itemId, setItemId] = useState("all");
  const [sort, setSort] = useState("viewGrowth");
  const rows = useMemo(() => {
    return data.rows
      .filter((row) => branchId === "all" || row.branchId === branchId)
      .filter((row) => itemId === "all" || row.menuItemId === itemId)
      .sort((a, b) => (sort === "addToCartGrowth" ? b.addToCartGrowth - a.addToCartGrowth : b.viewGrowth - a.viewGrowth));
  }, [branchId, data.rows, itemId, sort]);

  return (
    <>
      <Card className="border-amber-100 bg-amber-50/70">
        <p className="text-lg font-black text-amber-950">加入營養標誌後，瀏覽增加 {data.averageViewGrowth}%，加入訂單增加 {data.averageAddToCartGrowth}%。</p>
        <p className="mt-2 text-sm leading-6 text-amber-900">這是加入標誌前後比較所觀察到的變化，可能受到活動、價格與季節影響。</p>
      </Card>

      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          <select className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" onChange={(event) => setItemId(event.target.value)} value={itemId}>
            <option value="all">全部餐點</option>
            {data.menuItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" onChange={(event) => setBranchId(event.target.value)} value={branchId}>
            <option value="all">全部分店</option>
            {data.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <select className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" defaultValue="30d">
            <option value="30d">近 30 天</option>
            <option value="90d">近 90 天</option>
          </select>
          <select className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" onChange={(event) => setSort(event.target.value)} value={sort}>
            <option value="viewGrowth">依瀏覽成長排序</option>
            <option value="addToCartGrowth">依加入訂單成長排序</option>
          </select>
        </div>
      </Card>

      <Section title="加入標誌前後比較">
        <Card className="overflow-x-auto">
          {rows.length ? (
            <table className="min-w-[940px] w-full text-left text-sm">
              <thead className="text-xs uppercase text-stone-500">
                <tr className="border-b border-stone-200">
                  <th className="py-3 pr-4">餐點名稱</th>
                  <th className="py-3 pr-4">分店</th>
                  <th className="py-3 pr-4">標誌啟用日期</th>
                  <th className="py-3 pr-4">啟用前瀏覽</th>
                  <th className="py-3 pr-4">啟用後瀏覽</th>
                  <th className="py-3 pr-4">瀏覽成長率</th>
                  <th className="py-3 pr-4">前加入訂單</th>
                  <th className="py-3 pr-4">後加入訂單</th>
                  <th className="py-3 pr-4">加入訂單成長</th>
                  <th className="py-3 pr-4">收藏變化</th>
                  <th className="py-3 pr-4">轉換率變化</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-b border-stone-100" key={row.id}>
                    <td className="py-3 pr-4 font-bold text-stone-950">{row.itemName}</td>
                    <td className="py-3 pr-4">{row.branchName}</td>
                    <td className="py-3 pr-4">{row.badgeEnabledAt}</td>
                    <td className="py-3 pr-4">{row.beforeViews}</td>
                    <td className="py-3 pr-4">{row.afterViews}</td>
                    <td className="py-3 pr-4"><StatusPill tone={row.viewGrowth >= 0 ? "good" : "bad"}>{row.viewGrowth}%</StatusPill></td>
                    <td className="py-3 pr-4">{row.beforeAddToCart}</td>
                    <td className="py-3 pr-4">{row.afterAddToCart}</td>
                    <td className="py-3 pr-4"><StatusPill tone={row.addToCartGrowth >= 0 ? "good" : "bad"}>{row.addToCartGrowth}%</StatusPill></td>
                    <td className="py-3 pr-4">{row.favoriteDelta > 0 ? "+" : ""}{row.favoriteDelta}</td>
                    <td className="py-3 pr-4">{row.conversionRateDelta > 0 ? "+" : ""}{row.conversionRateDelta}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="沒有比較資料" body="請調整餐點、分店或日期篩選。" />
          )}
        </Card>
      </Section>
    </>
  );
}
