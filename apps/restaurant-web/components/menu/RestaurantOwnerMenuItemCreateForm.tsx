"use client";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Card, EmptyState, Section } from "../RestaurantCards";
import { catalogFailureCopy, isAllergenList, isBoundedDescription, isBoundedName, type CatalogFailure, type ItemRecord } from "../../runtime/restaurant-catalog-authoring";
import { createItem } from "../../runtime/restaurant-catalog-authoring-client";
import type { OwnerBranch, OwnerMenu, OwnerMenuCategory } from "../../runtime/restaurant-rpc-contracts";
import { RestaurantOwnerBranchLinkageStep } from "./RestaurantOwnerBranchLinkageStep";

export function RestaurantOwnerMenuItemCreateForm({ menus, categories, branches }: { menus: OwnerMenu[]; categories: OwnerMenuCategory[]; branches: OwnerBranch[] }) {
  const router = useRouter();
  const [menuId, setMenuId] = useState(menus[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [allergensText, setAllergensText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<CatalogFailure | null>(null);
  const [created, setCreated] = useState<ItemRecord | null>(null);
  const busy = useRef(false);

  const scopedCategories = useMemo(() => categories.filter((category) => category.menuId === menuId), [categories, menuId]);
  const activeCategoryId = scopedCategories.some((category) => category.id === categoryId) ? categoryId : (scopedCategories[0]?.id ?? "");
  const allergens = allergensText.split(/[,、]/).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  const descriptionValue = description.trim().length > 0 ? description.trim() : null;
  const valid = isBoundedName(name) && activeCategoryId.length > 0 && isBoundedDescription(descriptionValue) && isAllergenList(allergens);

  if (menus.length === 0) {
    return (
      <Section title="新增餐點" subtitle="建立本店餐廳自有的餐點資料。">
        <EmptyState title="尚未建立任何菜單" body="請先於「菜單管理」建立一份菜單，才能新增餐點。" />
        <a className="mt-3 inline-flex rounded-md bg-teal-700 px-3 py-2 text-sm font-bold text-white hover:bg-teal-800" href="/restaurant/menu">前往菜單管理</a>
      </Section>
    );
  }
  if (scopedCategories.length === 0) {
    return (
      <Section title="新增餐點" subtitle="建立本店餐廳自有的餐點資料。">
        <EmptyState title="所選菜單尚無分類" body="請先於「菜單管理」為此菜單建立一個分類，才能新增餐點。" />
        <a className="mt-3 inline-flex rounded-md bg-teal-700 px-3 py-2 text-sm font-bold text-white hover:bg-teal-800" href="/restaurant/menu">前往菜單管理</a>
      </Section>
    );
  }

  async function submit() {
    if (busy.current || !valid) return;
    busy.current = true; setPending(true); setError(null);
    try {
      const result = await createItem(activeCategoryId, name, descriptionValue, allergens.length > 0 ? allergens : null);
      if (result.ok) { setCreated(result); router.refresh(); } else setError(result.errorCode);
    } finally { busy.current = false; setPending(false); }
  }

  if (created) {
    return (
      <Section title="新增餐點" subtitle="建立本店餐廳自有的餐點資料。">
        <Card className="space-y-2 border-teal-200 bg-teal-50">
          <p className="font-black text-teal-900">已建立餐點「{created.name}」（草稿）</p>
          <p className="text-sm text-teal-800">草稿狀態尚未對消費者公開；需於菜單管理將餐點狀態變更為上架，並連結至至少一間分店且該分店供應設定符合現有 Consumer 可見度規則，才會出現在正式頁面。</p>
        </Card>
        <RestaurantOwnerBranchLinkageStep menuItemId={created.menuItemId} branches={branches} title="連結至分店（可選）" />
        <div className="flex gap-2">
          <a className="rounded-md bg-teal-700 px-3 py-2 text-sm font-bold text-white hover:bg-teal-800" href="/restaurant/menu">前往菜單管理查看</a>
          <button type="button" className="rounded-md border border-stone-300 px-3 py-2 text-sm font-bold" onClick={() => { setCreated(null); setName(""); setDescription(""); setAllergensText(""); }}>再新增一筆餐點</button>
        </div>
      </Section>
    );
  }

  return (
    <Section title="新增餐點" subtitle="建立本店餐廳自有的餐點資料（restaurant-tenant-local，非跨店共用資料）。">
      <Card className="space-y-3">
        <label className="block text-xs font-bold text-stone-700">
          所屬菜單
          <select className="mt-1 w-full rounded-md border border-stone-300 p-2 text-sm font-normal" value={menuId} disabled={pending} onChange={(event) => { setMenuId(event.target.value); setCategoryId(""); }}>
            {menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}（{menu.status}）</option>)}
          </select>
        </label>
        <label className="block text-xs font-bold text-stone-700">
          所屬分類
          <select className="mt-1 w-full rounded-md border border-stone-300 p-2 text-sm font-normal" value={activeCategoryId} disabled={pending} onChange={(event) => setCategoryId(event.target.value)}>
            {scopedCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label className="block text-xs font-bold text-stone-700">
          餐點名稱（本店預設顯示名稱）
          <input className="mt-1 w-full rounded-md border border-stone-300 p-2 text-sm font-normal" maxLength={120} value={name} disabled={pending} placeholder="例如：招牌牛肉麵" onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="block text-xs font-bold text-stone-700">
          描述（選填）
          <textarea className="mt-1 w-full rounded-md border border-stone-300 p-2 text-sm font-normal" maxLength={800} rows={3} value={description} disabled={pending} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="block text-xs font-bold text-stone-700">
          過敏原（選填，以逗號分隔；僅供參考，非經驗證之過敏原權威資料）
          <input className="mt-1 w-full rounded-md border border-stone-300 p-2 text-sm font-normal" value={allergensText} disabled={pending} placeholder="例如：花生、牛奶" onChange={(event) => setAllergensText(event.target.value)} />
        </label>
        <p className="text-xs text-stone-500">目前不提供圖片上傳、營養標示編輯；營養資料將顯示現有的「尚無目前營養資料」狀態，不代表已驗證。</p>
        <button type="button" className="rounded-md bg-teal-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={pending || !valid} onClick={() => void submit()}>建立餐點（草稿）</button>
        {error ? <p className="text-xs text-rose-700" aria-live="polite">{catalogFailureCopy[error]}</p> : null}
      </Card>
    </Section>
  );
}
