"use client";
import { useEffect, useRef, useState } from "react";
import { changeMenuItemDisplayName, displayNameFailureCopy, previewMenuItemDisplayName } from "../../runtime/restaurant-owner-menu-item-display-name-client";
import { canonicalizeDisplayName, validDisplayName, type Input, type Preview } from "../../runtime/restaurant-owner-menu-item-display-name";

type Props = Readonly<{ branchId: string; branchMenuItemId: string }>;
export function RestaurantOwnerMenuItemDisplayNameControl({ branchId, branchMenuItemId }: Props) {
  const [preview, setPreview] = useState<Preview>({ state: "dependency_unavailable" });
  const [nextDisplayName, setNextDisplayName] = useState("");
  const [confirmation, setConfirmation] = useState<"set" | "clear" | null>(null);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<string | null>(null); const pending = useRef(false);
  useEffect(() => { let cancelled = false; void previewMenuItemDisplayName(branchId, branchMenuItemId).then(value => { if (!cancelled) { setPreview(value); setNextDisplayName(value.state === "ready" ? value.branchSpecificDisplayName ?? "" : ""); setConfirmation(null); } }); return () => { cancelled = true; }; }, [branchId, branchMenuItemId]);
  if (preview.state !== "ready") return <div className="space-y-2"><button disabled className="rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-400">菜品顯示名稱控制不可用</button><p className="text-xs text-stone-500">{displayNameFailureCopy[preview.state]}</p></div>;
  const candidate = canonicalizeDisplayName(nextDisplayName);
  const setValid = validDisplayName(candidate) && candidate !== preview.branchSpecificDisplayName;
  const execute = async (operation: "set" | "clear") => {
    if (pending.current) return;
    const input: Input = operation === "set" ? { operation, expectedDisplayName: preview.branchSpecificDisplayName, nextDisplayName: candidate, expectedVersion: preview.branchSpecificDisplayNameVersion } : { operation, expectedDisplayName: preview.branchSpecificDisplayName, expectedVersion: preview.branchSpecificDisplayNameVersion };
    pending.current = true; setBusy(true); setConfirmation(null);
    try { const result = await changeMenuItemDisplayName(preview, input); setPreview(result.preview); if (result.preview.state === "ready") setNextDisplayName(result.preview.branchSpecificDisplayName ?? ""); setNotice(result.notice); } finally { pending.current = false; setBusy(false); }
  };
  const usingCanonical = preview.branchSpecificDisplayName === null;
  return <div className="space-y-2 border-t border-stone-100 pt-2">
    <p className="text-xs font-bold text-stone-700">菜品顯示名稱</p>
    <p className="text-xs text-stone-500">原始菜名：{preview.canonicalDisplayName}</p>
    {usingCanonical ? <p className="text-xs text-stone-500">目前使用原始菜名</p> : <p className="text-xs text-stone-500">自訂顯示名稱：{preview.branchSpecificDisplayName}</p>}
    <label className="block text-xs text-stone-700">自訂顯示名稱<input className="mt-1 w-full rounded border border-stone-300 p-2" maxLength={160} value={nextDisplayName} disabled={busy || confirmation !== null} onChange={event => setNextDisplayName(event.target.value)} /></label>
    <div className="flex flex-wrap gap-2"><button type="button" className="rounded-md bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50" disabled={busy || confirmation !== null || !setValid} onClick={() => setConfirmation("set")}>{usingCanonical ? "自訂顯示名稱" : "修改顯示名稱"}</button>{!usingCanonical ? <button type="button" className="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold disabled:opacity-50" disabled={busy || confirmation !== null} onClick={() => setConfirmation("clear")}>恢復原始菜名</button> : null}</div>
    {confirmation === "set" ? <div role="alertdialog" aria-label="確認菜品顯示名稱變更" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"><p>確認將這個分店的菜品顯示名稱改為「{candidate}」？</p><p className="mt-1 text-xs text-stone-600">這只會變更顯示名稱，不會修改原始菜品、營養或過敏原資料。</p><div className="mt-3 flex gap-2"><button type="button" className="rounded-md bg-rose-700 px-3 py-2 text-xs font-bold text-white" disabled={busy} onClick={() => void execute("set")}>確認變更</button><button type="button" className="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold" onClick={() => setConfirmation(null)}>取消</button></div></div> : null}
    {confirmation === "clear" ? <div role="alertdialog" aria-label="確認恢復原始菜名" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"><p>確認恢復使用原始菜名「{preview.canonicalDisplayName}」？</p><p className="mt-1 text-xs text-stone-600">恢復後，此分店將再次顯示原始菜名；營養、過敏原與其他菜品資料不會變更。</p><div className="mt-3 flex gap-2"><button type="button" className="rounded-md bg-rose-700 px-3 py-2 text-xs font-bold text-white" disabled={busy} onClick={() => void execute("clear")}>確認恢復</button><button type="button" className="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold" onClick={() => setConfirmation(null)}>取消</button></div></div> : null}
    {notice ? <p className="text-xs text-stone-600" aria-live="polite">{notice}</p> : null}
  </div>;
}
