import { Card, MetricCard, Section, StatusPill } from "../RestaurantCards";
import type { AwaitedReturn } from "../../runtime/runtime-types";
import type { loadLiveDashboard, loadLiveLocations, loadLiveMenu, loadLiveNutrition } from "../../runtime/live-restaurant-reads";

export function LiveDashboard({ data }: { data: AwaitedReturn<typeof loadLiveDashboard> }) {
  return <><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><MetricCard label="授權分店" note="資料庫授權結果" value={data.branches.length} /><MetricCard label="菜單" note="唯讀核心資料" value={data.menus.length} /><MetricCard label="餐點" note="唯讀核心資料" value={data.items.length} /><MetricCard label="目前營養資料" note="僅 current rows" value={data.nutrition.length} /></div><Section title={data.restaurant.name} subtitle="目前僅顯示經 tenant-safe RPC 授權的核心唯讀摘要。"><Card><p className="text-sm text-stone-600">分店供應項目 {data.branchItems.length} 筆；成效、待辦與助手資料未連接此唯讀 runtime。</p></Card></Section></>;
}
export function LiveLocations({ data }: { data: AwaitedReturn<typeof loadLiveLocations> }) {
  return <Section title={data.restaurant.name} subtitle="僅顯示目前身分經資料庫授權的分店。"><div className="grid gap-4 md:grid-cols-2">{data.branches.map(branch=><Card key={branch.id}><div className="flex justify-between gap-3"><div><h3 className="font-black">{branch.name}</h3><p className="mt-1 text-sm text-stone-500">{branch.address ?? "地址未提供"}</p></div><StatusPill tone={branch.status==="active"?"good":"muted"}>{branch.status}</StatusPill></div></Card>)}</div></Section>;
}
export function LiveMenu({ data }: { data: AwaitedReturn<typeof loadLiveMenu> }) {
  const categories=new Map(data.categories.map(category=>[category.id,category.name]));
  const branchItemsByItem=new Map<string,number>(); data.branchItems.forEach(row=>branchItemsByItem.set(row.menuItemId,(branchItemsByItem.get(row.menuItemId)??0)+1));
  const nutritionIds=new Set(data.nutrition.map(row=>row.menuItemId));
  return <Section title="菜單與餐點" subtitle={`${data.menus.length} 份菜單；只呈現 Phase 2V-C 窄型欄位。`}><div className="grid gap-4 lg:grid-cols-2">{data.items.map(item=><Card key={item.id}><h3 className="font-black">{item.name}</h3><p className="mt-1 text-sm text-stone-500">{categories.get(item.menuCategoryId)??"未分類"} · {item.status}</p><p className="mt-3 text-sm text-stone-600">授權分店供應 {branchItemsByItem.get(item.id)??0} 筆 · {nutritionIds.has(item.id)?"有目前營養資料":"無目前營養資料"}</p></Card>)}</div></Section>;
}
export function LiveNutrition({ data }: { data: AwaitedReturn<typeof loadLiveNutrition> }) {
  const names=new Map(data.items.map(item=>[item.id,item.name]));
  return <Section title="目前營養資料" subtitle="不包含審核佇列、食材、信心分數、來源稽核或寫入功能。"><div className="grid gap-4 lg:grid-cols-2">{data.nutrition.map(row=><Card key={row.id}><h3 className="font-black">{names.get(row.menuItemId)??"授權餐點"}</h3><p className="mt-2 text-sm text-stone-600">熱量 {row.calories??"—"} · 蛋白質 {row.protein??"—"} · 碳水 {row.carbohydrates??"—"} · 脂肪 {row.fat??"—"}</p><p className="mt-2 text-xs font-bold text-teal-700">{row.verifiedStatus}</p></Card>)}</div></Section>;
}
