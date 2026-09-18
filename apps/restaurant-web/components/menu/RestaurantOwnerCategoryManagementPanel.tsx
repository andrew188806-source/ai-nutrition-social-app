"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Card, Section } from "../RestaurantCards";
import { catalogFailureCopy, isBoundedName, isSortOrder, type CatalogFailure, type CategoryRecord } from "../../runtime/restaurant-catalog-authoring";
import { createCategory, editCategory, previewCategory } from "../../runtime/restaurant-catalog-authoring-client";
import type { OwnerMenu, OwnerMenuCategory } from "../../runtime/restaurant-rpc-contracts";

function CreateCategoryForm({ menuId, onCreated }: { menuId: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  async function submit() {
    if (busy.current || !isBoundedName(name)) return;
    busy.current = true; setPending(true); setNotice(null);
    try {
      // Sort order is left to the server's own deterministic next-slot default -- the Owner is not
      // asked to enter a technical ordering number just to create a category.
      const result = await createCategory(menuId, name, null);
      if (result.ok) { setName(""); setNotice(`已建立分類「${result.name}」。`); onCreated(); }
      else setNotice(catalogFailureCopy[result.errorCode]);
    } finally { busy.current = false; setPending(false); }
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-stone-300 p-3 sm:flex-row sm:items-end">
      <label className="flex-1 text-xs font-bold text-stone-700">
        新增分類名稱
        <input className="mt-1 w-full rounded-md border border-stone-300 p-2 text-sm font-normal" maxLength={120} value={name} disabled={pending} placeholder="例如：主餐" onChange={(event) => setName(event.target.value)} />
      </label>
      <button type="button" className="rounded-md bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50" disabled={pending || !isBoundedName(name)} onClick={() => void submit()}>建立分類</button>
      {notice ? <p className="text-xs text-stone-600 sm:basis-full" aria-live="polite">{notice}</p> : null}
    </div>
  );
}

function CategoryRow({ category, onChanged }: { category: OwnerMenuCategory; onChanged: () => void }) {
  const [record, setRecord] = useState<CategoryRecord | { errorCode: CatalogFailure } | null>(null);
  const [name, setName] = useState(category.name);
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder));
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void previewCategory(category.id).then((result) => {
      if (cancelled) return;
      setRecord(result.ok ? result : { errorCode: result.errorCode });
      if (result.ok) { setName(result.name); setSortOrder(String(result.sortOrder)); }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id]);

  if (!record) return <div className="h-14 animate-pulse rounded-md bg-stone-100" />;
  if (!("contentVersion" in record)) return <Card className="text-sm"><p className="font-bold">{category.name}</p><p className="mt-1 text-xs text-stone-500">{catalogFailureCopy[record.errorCode]}</p></Card>;

  const nextSortOrder = Number(sortOrder);
  const dirty = name !== record.name || nextSortOrder !== record.sortOrder;
  const valid = isBoundedName(name) && isSortOrder(nextSortOrder);

  async function submit() {
    if (busy.current || !record || !("contentVersion" in record) || !valid || !dirty) return;
    busy.current = true; setPending(true);
    try {
      const result = await editCategory(record.menuCategoryId, record.name, name, record.sortOrder, nextSortOrder, record.contentVersion);
      if (result.ok) { setRecord({ ...record, name: result.name, sortOrder: result.sortOrder, contentVersion: result.contentVersion }); setNotice("已更新分類。"); onChanged(); }
      else setNotice(catalogFailureCopy[result.errorCode]);
    } finally { busy.current = false; setPending(false); }
  }

  return (
    <Card className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="flex-1 text-xs font-bold text-stone-700">
        分類名稱
        <input className="mt-1 w-full rounded-md border border-stone-300 p-2 text-sm font-normal" maxLength={120} value={name} disabled={pending} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="w-24 text-xs font-bold text-stone-700">
        排序
        <input className="mt-1 w-full rounded-md border border-stone-300 p-2 text-sm font-normal" inputMode="numeric" pattern="[0-9]*" value={sortOrder} disabled={pending} onChange={(event) => setSortOrder(event.target.value.replace(/[^0-9]/g, ""))} />
      </label>
      <button type="button" className="rounded-md bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50" disabled={pending || !valid || !dirty} onClick={() => void submit()}>儲存</button>
      {notice ? <p className="basis-full text-xs text-stone-600" aria-live="polite">{notice}</p> : null}
    </Card>
  );
}

export function RestaurantOwnerCategoryManagementPanel({ menus, categories }: { menus: OwnerMenu[]; categories: OwnerMenuCategory[] }) {
  const router = useRouter();
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(menus[0]?.id ?? null);
  const refresh = () => router.refresh();
  if (menus.length === 0) return null;
  const activeMenuId = selectedMenuId && menus.some((menu) => menu.id === selectedMenuId) ? selectedMenuId : menus[0].id;
  const scoped = categories.filter((category) => category.menuId === activeMenuId);
  return (
    <Section title="分類" subtitle="每個分類都屬於一份菜單。目前不提供分類刪除；可隨時重新命名或調整排序。">
      <div className="space-y-3">
        <label className="block text-xs font-bold text-stone-700">
          選擇菜單
          <select className="ml-2 rounded-md border border-stone-300 p-2 text-sm font-normal" value={activeMenuId} onChange={(event) => setSelectedMenuId(event.target.value)}>
            {menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}（{menu.status}）</option>)}
          </select>
        </label>
        <CreateCategoryForm menuId={activeMenuId} onCreated={refresh} />
        {scoped.length === 0 ? <p className="text-sm text-stone-500">此菜單尚無分類，請先建立一個分類。</p> : (
          <div className="grid gap-3">{scoped.map((category) => <CategoryRow key={category.id} category={category} onChanged={refresh} />)}</div>
        )}
      </div>
    </Section>
  );
}
