"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { StatusPill } from "../RestaurantCards";
import { catalogFailureCopy, isAllergenList, isBoundedDescription, isBoundedName, type CatalogFailure, type ItemRecord } from "../../runtime/restaurant-catalog-authoring";
import { editItem, previewItem, transitionItem } from "../../runtime/restaurant-catalog-authoring-client";
import type { OwnerBranch, OwnerMenuCategory, OwnerMenuItem } from "../../runtime/restaurant-rpc-contracts";
import { RestaurantOwnerBranchLinkageStep } from "./RestaurantOwnerBranchLinkageStep";

const STATUS_LABEL: Readonly<Record<string, string>> = { draft: "草稿", active: "上架", archived: "已封存" };
const STATUS_TONE: Readonly<Record<string, "muted" | "good" | "neutral">> = { draft: "muted", active: "good", archived: "neutral" };
// Mirrors R2B-4's own accepted-transition allow-list exactly.
const NEXT_TRANSITIONS: Readonly<Record<string, readonly { next: string; label: string }[]>> = {
  draft: [{ next: "active", label: "上架" }, { next: "archived", label: "封存" }],
  active: [{ next: "archived", label: "封存" }],
  archived: []
};

function ContentEditForm({ record, categories, onUpdated }: { record: ItemRecord; categories: OwnerMenuCategory[]; onUpdated: (record: ItemRecord) => void }) {
  const [name, setName] = useState(record.name);
  const [description, setDescription] = useState(record.description ?? "");
  const [allergensText, setAllergensText] = useState(record.allergens.join("、"));
  const [categoryId, setCategoryId] = useState(record.menuCategoryId);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);

  const allergens = allergensText.split(/[,、]/).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  const descriptionValue = description.trim().length > 0 ? description.trim() : null;
  const valid = isBoundedName(name) && isBoundedDescription(descriptionValue) && isAllergenList(allergens);
  const dirty = name !== record.name || descriptionValue !== record.description || JSON.stringify(allergens) !== JSON.stringify(record.allergens) || categoryId !== record.menuCategoryId;

  async function submit() {
    if (busy.current || !valid || !dirty) return;
    busy.current = true; setPending(true);
    try {
      const result = await editItem(record.menuItemId, record.name, name, record.description, descriptionValue, record.allergens, allergens, record.menuCategoryId, categoryId, record.contentVersion);
      if (result.ok) { onUpdated({ ...record, name: result.name, description: result.description, allergens: result.allergens, menuCategoryId: result.menuCategoryId, contentVersion: result.contentVersion }); setNotice("已更新餐點內容。"); }
      else setNotice(catalogFailureCopy[result.errorCode]);
    } finally { busy.current = false; setPending(false); }
  }

  return (
    <div className="space-y-2 rounded-md border border-stone-200 p-3">
      <label className="block text-xs font-bold text-stone-700">
        本店餐點名稱（restaurant-level，非分店專屬顯示名稱）
        <input className="mt-1 w-full rounded-md border border-stone-300 p-2 text-sm font-normal" maxLength={120} value={name} disabled={pending} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="block text-xs font-bold text-stone-700">
        描述
        <textarea className="mt-1 w-full rounded-md border border-stone-300 p-2 text-sm font-normal" maxLength={800} rows={2} value={description} disabled={pending} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label className="block text-xs font-bold text-stone-700">
        過敏原（以逗號分隔，僅供參考）
        <input className="mt-1 w-full rounded-md border border-stone-300 p-2 text-sm font-normal" value={allergensText} disabled={pending} onChange={(event) => setAllergensText(event.target.value)} />
      </label>
      {categories.length > 0 ? (
        <label className="block text-xs font-bold text-stone-700">
          分類
          <select className="mt-1 w-full rounded-md border border-stone-300 p-2 text-sm font-normal" value={categoryId} disabled={pending} onChange={(event) => setCategoryId(event.target.value)}>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
      ) : null}
      <button type="button" className="rounded-md bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50" disabled={pending || !valid || !dirty} onClick={() => void submit()}>儲存內容</button>
      {notice ? <p className="text-xs text-stone-600" aria-live="polite">{notice}</p> : null}
    </div>
  );
}

export function RestaurantOwnerItemCatalogControls({ item, categories, branches, linkedBranchIds }: { item: OwnerMenuItem; categories: OwnerMenuCategory[]; branches: OwnerBranch[]; linkedBranchIds: string[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [record, setRecord] = useState<ItemRecord | { errorCode: CatalogFailure } | null>(null);
  const [confirmingTransition, setConfirmingTransition] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  const unlinkedBranches = branches.filter((branch) => !linkedBranchIds.includes(branch.id));

  async function open() {
    setExpanded(true);
    if (record) return;
    const result = await previewItem(item.id);
    setRecord(result.ok ? result : { errorCode: result.errorCode });
  }

  async function submitTransition(next: string) {
    if (busy.current || !record || !("statusVersion" in record)) return;
    busy.current = true; setPending(true); setConfirmingTransition(null);
    try {
      const result = await transitionItem(record.menuItemId, record.status, next, record.statusVersion);
      if (result.ok) { setRecord({ ...record, status: result.status as ItemRecord["status"], statusVersion: result.statusVersion }); setNotice(`已將狀態變更為「${STATUS_LABEL[result.status] ?? result.status}」。`); router.refresh(); }
      else setNotice(catalogFailureCopy[result.errorCode]);
    } finally { busy.current = false; setPending(false); }
  }

  if (!expanded) {
    return <button type="button" className="rounded-md border border-stone-300 px-2 py-1.5 text-xs font-bold hover:bg-stone-50" onClick={() => void open()}>編輯餐點內容／狀態／分店連結</button>;
  }
  if (!record) return <div className="h-24 animate-pulse rounded-md bg-stone-100" />;
  if (!("contentVersion" in record)) return <p className="text-xs text-rose-700">{catalogFailureCopy[record.errorCode]}</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <StatusPill tone={STATUS_TONE[record.status] ?? "neutral"}>{STATUS_LABEL[record.status] ?? record.status}</StatusPill>
        {record.status === "draft" ? <span className="text-xs text-stone-500">草稿狀態不會出現在一般 Consumer 可見度規則中。</span> : null}
      </div>
      <ContentEditForm record={record} categories={categories} onUpdated={(next) => { setRecord(next); router.refresh(); }} />
      <div className="flex flex-wrap gap-2">
        {(NEXT_TRANSITIONS[record.status] ?? []).map(({ next, label }) => (
          <button key={next} type="button" className="rounded-md border border-stone-300 px-2 py-1.5 text-xs font-bold hover:bg-stone-50 disabled:opacity-50" disabled={pending} onClick={() => setConfirmingTransition(next)}>{label}</button>
        ))}
      </div>
      {confirmingTransition ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3" role="alertdialog" aria-label="確認餐點狀態變更">
          <p className="text-sm font-bold">確認將「{record.name}」變更為「{STATUS_LABEL[confirmingTransition] ?? confirmingTransition}」？</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={pending} className="rounded-md bg-rose-700 px-3 py-2 text-xs font-bold text-white" onClick={() => void submitTransition(confirmingTransition)}>確認</button>
            <button type="button" className="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold" onClick={() => setConfirmingTransition(null)}>取消</button>
          </div>
        </div>
      ) : null}
      {notice ? <p className="text-xs text-stone-600" aria-live="polite">{notice}</p> : null}
      {unlinkedBranches.length > 0 ? <RestaurantOwnerBranchLinkageStep menuItemId={item.id} branches={unlinkedBranches} title="連結至其他分店" /> : null}
      <button type="button" className="text-xs font-bold text-stone-500 underline" onClick={() => setExpanded(false)}>收合</button>
    </div>
  );
}
