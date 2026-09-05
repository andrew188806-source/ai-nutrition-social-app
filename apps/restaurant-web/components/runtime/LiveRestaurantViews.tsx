import { BranchFilterPicker, Card, MetricCard, Section, StatusPill } from "../RestaurantCards";
import type { AwaitedReturn } from "../../runtime/runtime-types";
import type { OwnerBranch } from "../../runtime/restaurant-rpc-contracts";
import type { loadLiveDashboard, loadLiveLocations, loadLiveMenu, loadLiveNutrition } from "../../runtime/live-restaurant-reads";
import { RestaurantOwnerAvailabilityControl } from "../menu/RestaurantOwnerAvailabilityControl";
import { RestaurantOwnerPriceControl } from "../menu/RestaurantOwnerPriceControl";
import { RestaurantOwnerVisibilityControl } from "../menu/RestaurantOwnerVisibilityControl";
import { RestaurantOwnerSoldOutControl } from "../menu/RestaurantOwnerSoldOutControl";
import { RestaurantOwnerMenuItemDisplayNameControl } from "../menu/RestaurantOwnerMenuItemDisplayNameControl";
import { RestaurantOwnerBranchDisplayNameControl } from "../branch/RestaurantOwnerBranchDisplayNameControl";

export function LiveDashboard({ data, branches, selectedBranchId }: { data: AwaitedReturn<typeof loadLiveDashboard>; branches: OwnerBranch[]; selectedBranchId: string | null }) {
  const branchItems = selectedBranchId ? data.branchItems.filter((row) => row.branchId === selectedBranchId) : data.branchItems;
  return <><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><MetricCard label="授權分店" note="資料庫授權結果" value={data.branches.length} /><MetricCard label="菜單" note="唯讀核心資料" value={data.menus.length} /><MetricCard label="餐點" note="唯讀核心資料" value={data.items.length} /><MetricCard label="目前營養資料" note="僅 current rows" value={data.nutrition.length} /></div><Section title={data.restaurant.name} subtitle="目前僅顯示經 tenant-safe RPC 授權的核心唯讀摘要。" action={<BranchFilterPicker basePath="/restaurant" branches={branches} selectedBranchId={selectedBranchId} />}><Card><p className="text-sm text-stone-600">分店供應項目 {branchItems.length} 筆；成效、待辦與助手資料未連接此唯讀 runtime。</p></Card></Section></>;
}
export function LiveLocations({ data }: { data: AwaitedReturn<typeof loadLiveLocations> }) {
  return <Section title={data.restaurant.name} subtitle="僅顯示目前身分經資料庫授權的分店。"><div className="grid gap-4 md:grid-cols-2">{data.branches.map(branch=><Card key={branch.id}><div className="flex justify-between gap-3"><div><h3 className="font-black">{branch.name}</h3><p className="mt-1 text-sm text-stone-500">{branch.address ?? "地址未提供"}</p></div><StatusPill tone={branch.status==="active"?"good":"muted"}>{branch.status}</StatusPill></div><RestaurantOwnerBranchDisplayNameControl branchId={branch.id}/></Card>)}</div></Section>;
}
export function LiveMenu({ data, branches, selectedBranchId }: { data: AwaitedReturn<typeof loadLiveMenu>; branches: OwnerBranch[]; selectedBranchId: string | null }) {
  const categories=new Map(data.categories.map(category=>[category.id,category.name]));
  const branchNames=new Map(branches.map(branch=>[branch.id,branch.name]));
  const branchItems = selectedBranchId ? data.branchItems.filter((row) => row.branchId === selectedBranchId) : data.branchItems;
  const branchItemsByItem=new Map<string,typeof branchItems>(); branchItems.forEach(row=>branchItemsByItem.set(row.menuItemId,[...(branchItemsByItem.get(row.menuItemId)??[]),row]));
  const nutritionIds=new Set(data.nutrition.map(row=>row.menuItemId));
  const items = selectedBranchId ? data.items.filter((item) => branchItemsByItem.has(item.id)) : data.items;
  return <Section title="菜單與餐點" subtitle={`${data.menus.length} 份菜單；正式售完控制需由資料庫即時授權。`} action={<BranchFilterPicker basePath="/restaurant/menu" branches={branches} selectedBranchId={selectedBranchId} />}><div className="grid gap-4 lg:grid-cols-2">{items.map(item=>{const offers=branchItemsByItem.get(item.id)??[];return <Card key={item.id}><h3 className="font-black">{item.name}</h3><p className="mt-1 text-sm text-stone-500">{categories.get(item.menuCategoryId)??"未分類"} · {item.status}</p><p className="mt-3 text-sm text-stone-600">授權分店供應 {offers.length} 筆 · {nutritionIds.has(item.id)?"有目前營養資料":"無目前營養資料"}</p><div className="mt-4 space-y-3">{offers.map(offer=><div className="flex flex-col gap-2 rounded-md border border-stone-200 p-3 sm:flex-row sm:items-center sm:justify-between" key={offer.id}><div><p className="text-sm font-bold text-stone-800">{branchNames.get(offer.branchId)??"授權分店"}</p><p className="text-xs text-stone-500">{offer.soldOut?"菜單讀取顯示：已售完":"菜單讀取顯示：供應中"}</p></div><RestaurantOwnerSoldOutControl branchId={offer.branchId} branchMenuItemId={offer.id} branchName={branchNames.get(offer.branchId)??"授權分店"} itemName={item.name}/><RestaurantOwnerAvailabilityControl key={offer.id} branchId={offer.branchId} branchMenuItemId={offer.id} branchName={branchNames.get(offer.branchId)??"授權分店"} itemName={item.name}/><RestaurantOwnerPriceControl branchId={offer.branchId} branchMenuItemId={offer.id} branchName={branchNames.get(offer.branchId)??"授權分店"} itemName={item.name}/><RestaurantOwnerVisibilityControl branchId={offer.branchId} branchMenuItemId={offer.id} branchName={branchNames.get(offer.branchId)??"授權分店"} itemName={item.name}/><RestaurantOwnerMenuItemDisplayNameControl branchId={offer.branchId} branchMenuItemId={offer.id}/></div>)}</div></Card>;})}</div></Section>;
}
export function LiveNutrition({ data }: { data: AwaitedReturn<typeof loadLiveNutrition> }) {
  const names=new Map(data.items.map(item=>[item.id,item.name]));
  return <Section title="目前營養資料" subtitle="不包含審核佇列、食材、信心分數、來源稽核或寫入功能。"><div className="grid gap-4 lg:grid-cols-2">{data.nutrition.map(row=><Card key={row.id}><h3 className="font-black">{names.get(row.menuItemId)??"授權餐點"}</h3><p className="mt-2 text-sm text-stone-600">熱量 {row.calories??"—"} · 蛋白質 {row.protein??"—"} · 碳水 {row.carbohydrates??"—"} · 脂肪 {row.fat??"—"}</p><p className="mt-2 text-xs font-bold text-teal-700">{row.verifiedStatus}</p></Card>)}</div></Section>;
}
