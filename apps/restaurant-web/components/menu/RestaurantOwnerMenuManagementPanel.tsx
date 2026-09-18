"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Card, Section, StatusPill } from "../RestaurantCards";
import { catalogFailureCopy, isBoundedName, type CatalogFailure, type MenuRecord } from "../../runtime/restaurant-catalog-authoring";
import { createMenu, previewMenu, renameMenu, transitionMenu } from "../../runtime/restaurant-catalog-authoring-client";
import type { OwnerMenu } from "../../runtime/restaurant-rpc-contracts";

const STATUS_LABEL: Readonly<Record<string, string>> = { draft: "草稿", published: "已上架", archived: "已封存" };
const STATUS_TONE: Readonly<Record<string, "muted" | "good" | "neutral">> = { draft: "muted", published: "good", archived: "neutral" };
// Mirrors R2B-2's own accepted-transition allow-list exactly. No archived -> * transition exists.
const NEXT_TRANSITIONS: Readonly<Record<string, readonly { next: string; label: string }[]>> = {
  draft: [{ next: "published", label: "發布" }, { next: "archived", label: "封存" }],
  published: [{ next: "archived", label: "封存" }],
  archived: []
};

function CreateMenuForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  async function submit() {
    if (busy.current || !isBoundedName(name)) return;
    busy.current = true; setPending(true); setNotice(null);
    try {
      const result = await createMenu(name);
      if (result.ok) { setName(""); setNotice(`已建立菜單「${result.name}」（草稿，尚未發布）。`); onCreated(); }
      else setNotice(catalogFailureCopy[result.errorCode]);
    } finally { busy.current = false; setPending(false); }
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-stone-300 p-3 sm:flex-row sm:items-end">
      <label className="flex-1 text-xs font-bold text-stone-700">
        新增菜單名稱
        <input className="mt-1 w-full rounded-md border border-stone-300 p-2 text-sm font-normal" maxLength={120} value={name} disabled={pending} placeholder="例如：主菜單" onChange={(event) => setName(event.target.value)} />
      </label>
      <button type="button" className="rounded-md bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50" disabled={pending || !isBoundedName(name)} onClick={() => void submit()}>建立菜單（草稿）</button>
      {notice ? <p className="text-xs text-stone-600 sm:basis-full" aria-live="polite">{notice}</p> : null}
    </div>
  );
}

function MenuRow({ menu, onChanged }: { menu: OwnerMenu; onChanged: () => void }) {
  const [record, setRecord] = useState<MenuRecord | { errorCode: CatalogFailure } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(menu.name);
  const [confirmingTransition, setConfirmingTransition] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void previewMenu(menu.id).then((result) => { if (cancelled) return; setRecord(result.ok ? result : { errorCode: result.errorCode }); setName(result.ok ? result.name : menu.name); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu.id]);

  if (!record) return <div className="h-14 animate-pulse rounded-md bg-stone-100" />;
  if (!("nameVersion" in record)) return <Card className="text-sm"><p className="font-bold">{menu.name}</p><p className="mt-1 text-xs text-stone-500">{catalogFailureCopy[record.errorCode]}</p></Card>;

  async function submitRename() {
    if (busy.current || !record || !("nameVersion" in record) || !isBoundedName(name) || name === record.name) return;
    busy.current = true; setPending(true);
    try {
      const result = await renameMenu(record.menuId, record.name, name, record.nameVersion);
      if (result.ok) { setRecord({ ...record, name: result.name, nameVersion: result.nameVersion }); setRenaming(false); setNotice("已更新菜單名稱。"); onChanged(); }
      else setNotice(catalogFailureCopy[result.errorCode]);
    } finally { busy.current = false; setPending(false); }
  }
  async function submitTransition(next: string) {
    if (busy.current || !record || !("statusVersion" in record)) return;
    busy.current = true; setPending(true); setConfirmingTransition(null);
    try {
      const result = await transitionMenu(record.menuId, record.status, next, record.statusVersion);
      if (result.ok) { setRecord({ ...record, status: result.status as MenuRecord["status"], statusVersion: result.statusVersion }); setNotice(`已將狀態變更為「${STATUS_LABEL[result.status] ?? result.status}」。`); onChanged(); }
      else setNotice(catalogFailureCopy[result.errorCode]);
    } finally { busy.current = false; setPending(false); }
  }

  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {renaming ? (
          <div className="flex flex-1 items-center gap-2">
            <input className="flex-1 rounded-md border border-stone-300 p-2 text-sm" maxLength={120} value={name} disabled={pending} onChange={(event) => setName(event.target.value)} />
            <button type="button" className="rounded-md bg-teal-700 px-2 py-1.5 text-xs font-bold text-white disabled:opacity-50" disabled={pending || !isBoundedName(name) || name === record.name} onClick={() => void submitRename()}>儲存</button>
            <button type="button" className="rounded-md border border-stone-300 px-2 py-1.5 text-xs font-bold" disabled={pending} onClick={() => { setRenaming(false); setName(record.name); }}>取消</button>
          </div>
        ) : (
          <button type="button" className="text-left font-black text-stone-900 hover:underline" onClick={() => setRenaming(true)}>{record.name}</button>
        )}
        <StatusPill tone={STATUS_TONE[record.status] ?? "neutral"}>{STATUS_LABEL[record.status] ?? record.status}</StatusPill>
      </div>
      {record.status === "draft" ? <p className="text-xs text-stone-500">草稿狀態尚未對消費者公開，需明確發布後才會進入現有 Consumer 可見度規則。</p> : null}
      <div className="flex flex-wrap gap-2">
        {(NEXT_TRANSITIONS[record.status] ?? []).map(({ next, label }) => (
          <button key={next} type="button" className="rounded-md border border-stone-300 px-2 py-1.5 text-xs font-bold hover:bg-stone-50 disabled:opacity-50" disabled={pending} onClick={() => setConfirmingTransition(next)}>{label}</button>
        ))}
      </div>
      {confirmingTransition ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3" role="alertdialog" aria-label="確認菜單狀態變更">
          <p className="text-sm font-bold">確認將「{record.name}」變更為「{STATUS_LABEL[confirmingTransition] ?? confirmingTransition}」？</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={pending} className="rounded-md bg-rose-700 px-3 py-2 text-xs font-bold text-white" onClick={() => void submitTransition(confirmingTransition)}>確認</button>
            <button type="button" className="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold" onClick={() => setConfirmingTransition(null)}>取消</button>
          </div>
        </div>
      ) : null}
      {notice ? <p className="text-xs text-stone-600" aria-live="polite">{notice}</p> : null}
    </Card>
  );
}

export function RestaurantOwnerMenuManagementPanel({ menus }: { menus: OwnerMenu[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  return (
    <Section title="菜單" subtitle="建立與維護菜單本身；分類與餐點請於下方管理。新菜單一律以草稿建立，需明確發布。">
      <div className="space-y-3">
        <CreateMenuForm onCreated={refresh} />
        {menus.length === 0 ? <p className="text-sm text-stone-500">目前尚無菜單，請先建立一份菜單。</p> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {menus.map((menu) => <MenuRow key={menu.id} menu={menu} onChanged={refresh} />)}
          </div>
        )}
      </div>
    </Section>
  );
}
