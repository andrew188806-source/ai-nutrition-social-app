"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Card } from "../RestaurantCards";
import { catalogFailureCopy, isNextPrice } from "../../runtime/restaurant-catalog-authoring";
import { linkItemToBranch } from "../../runtime/restaurant-catalog-authoring-client";
import type { OwnerBranch } from "../../runtime/restaurant-rpc-contracts";

type LinkOutcome = { branchId: string; branchName: string; ok: boolean; message: string };

// Shared by the item-creation flow and by the per-item "link to another branch" control in
// LiveMenu (components/runtime/LiveRestaurantViews.tsx) -- one branch-linkage submission surface.
export function RestaurantOwnerBranchLinkageStep({ menuItemId, branches, title = "連結至分店" }: { menuItemId: string; branches: OwnerBranch[]; title?: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [outcomes, setOutcomes] = useState<LinkOutcome[]>([]);
  const busy = useRef(false);

  function toggle(branchId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(branchId)) next.delete(branchId); else next.add(branchId);
      return next;
    });
  }

  async function submit() {
    if (busy.current || selected.size === 0) return;
    const targets = branches.filter((branch) => selected.has(branch.id) && isNextPrice(prices[branch.id] ?? ""));
    if (targets.length === 0) return;
    busy.current = true; setPending(true);
    const results: LinkOutcome[] = [];
    for (const branch of targets) {
      // Sequential, not Promise.all -- same contention reasoning as runtime/live-restaurant-reads.ts,
      // and it keeps per-branch result reporting simple and ordered.
      // eslint-disable-next-line no-await-in-loop
      const result = await linkItemToBranch(branch.id, menuItemId, prices[branch.id], null);
      results.push({ branchId: branch.id, branchName: branch.name, ok: result.ok, message: result.ok ? `已連結，售價 NT$${result.price.replace(/\.00$/, "")}` : catalogFailureCopy[result.errorCode] });
    }
    setOutcomes((current) => [...current, ...results]);
    setSelected(new Set());
    busy.current = false; setPending(false);
    if (results.some((outcome) => outcome.ok)) router.refresh();
  }

  const linkedBranchIds = new Set(outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.branchId));
  const remaining = branches.filter((branch) => !linkedBranchIds.has(branch.id));

  return (
    <Card className="space-y-3">
      <h3 className="font-black text-stone-900">{title}</h3>
      <p className="text-xs text-stone-500">選擇分店並輸入初始售價（整數新台幣，1–999999）。售完、供應狀態、分店專屬名稱等欄位維持現有控制項管理，初始值已由系統安全設定。</p>
      {remaining.length === 0 ? <p className="text-sm text-stone-500">所有授權分店皆已連結此餐點。</p> : (
        <div className="space-y-2">
          {remaining.map((branch) => (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-stone-200 p-2" key={branch.id}>
              <label className="flex flex-1 items-center gap-2 text-sm font-bold text-stone-800">
                <input type="checkbox" checked={selected.has(branch.id)} disabled={pending} onChange={() => toggle(branch.id)} />
                {branch.name}
              </label>
              <label className="text-xs text-stone-700">
                初始售價（整數 TWD）
                <input className="ml-2 w-24 rounded-md border border-stone-300 p-2 text-sm font-normal" inputMode="numeric" pattern="[0-9]*" maxLength={6} disabled={pending || !selected.has(branch.id)} value={prices[branch.id] ?? ""} onChange={(event) => setPrices((current) => ({ ...current, [branch.id]: event.target.value.replace(/[^0-9]/g, "") }))} />
              </label>
            </div>
          ))}
          <button type="button" className="rounded-md bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50" disabled={pending || selected.size === 0 || [...selected].some((id) => !isNextPrice(prices[id] ?? ""))} onClick={() => void submit()}>連結選取的分店</button>
        </div>
      )}
      {outcomes.length > 0 ? (
        <ul className="space-y-1 text-xs" aria-live="polite">
          {outcomes.map((outcome, index) => (
            <li className={outcome.ok ? "text-teal-800" : "text-rose-800"} key={`${outcome.branchId}-${index}`}>
              {outcome.branchName}：{outcome.message}{!outcome.ok ? "（可重試）" : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
