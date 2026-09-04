"use client";

import { useEffect, useState } from "react";
import type {
  RestaurantOwnerSoldOutMutationRequest,
  RestaurantOwnerSoldOutMutationResult,
  RestaurantOwnerSoldOutPreview
} from "../../runtime/restaurant-owner-sold-out";

type Props = Readonly<{
  branchId: string;
  branchMenuItemId: string;
  branchName: string;
  itemName: string;
}>;

const failureCopy: Record<Exclude<RestaurantOwnerSoldOutPreview["state"], "ready">, string> = {
  unauthenticated: "工作階段無法驗證，售完控制不可用。",
  permission_denied: "目前帳號沒有此餐點的售完管理權限。",
  invalid_request: "餐點識別資料無效，售完控制不可用。",
  target_not_found: "找不到可管理的分店餐點。",
  stale_state: "餐點狀態已變更，請重新載入。",
  no_change: "餐點已是指定狀態。",
  dependency_unavailable: "正式售完服務目前無法使用。",
  internal_failure: "正式售完回應未通過安全檢查。"
};

function endpoint(branchId: string, branchMenuItemId: string): string {
  return `/api/restaurant/branches/${encodeURIComponent(branchId)}/menu-items/${encodeURIComponent(branchMenuItemId)}/sold-out`;
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch { return { state: "internal_failure" }; }
}

export function RestaurantOwnerSoldOutControl(props: Props) {
  const [preview, setPreview] = useState<RestaurantOwnerSoldOutPreview>({ state: "dependency_unavailable" });
  const [loading, setLoading] = useState(true);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh(): Promise<RestaurantOwnerSoldOutPreview> {
    try {
      const response = await fetch(endpoint(props.branchId, props.branchMenuItemId), {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      const result = await readJson(response) as RestaurantOwnerSoldOutPreview;
      setPreview(result);
      return result;
    } catch {
      const result = { state: "dependency_unavailable" } as const;
      setPreview(result);
      return result;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [props.branchId, props.branchMenuItemId]);

  async function reconcileUncertain(intendedState: boolean): Promise<void> {
    const current = await refresh();
    if (current.state === "ready" && current.soldOut === intendedState) {
      setNotice("已重新讀取正式狀態；變更已套用。 ");
      return;
    }
    setNotice("提交結果不確定，已重新讀取正式狀態。請確認後再明確操作；系統不會自動重送。 ");
  }

  async function submit(): Promise<void> {
    if (preview.state !== "ready") return;
    const intendedState = !preview.soldOut;
    const request: RestaurantOwnerSoldOutMutationRequest = {
      expectedSoldOut: preview.soldOut,
      nextSoldOut: intendedState,
      expectedVersion: preview.soldOutVersion
    };
    setConfirmationOpen(false);
    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch(endpoint(props.branchId, props.branchMenuItemId), {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      const result = await readJson(response) as RestaurantOwnerSoldOutMutationResult;
      if (result.state === "ready") {
        await refresh();
        setNotice(result.soldOut ? "已標記為售完。 " : "已恢復供應。 ");
      } else if (result.state === "stale_state") {
        await refresh();
        setNotice("此餐點已由其他操作變更。已重新讀取，請依最新狀態重新確認。 ");
      } else if (result.state === "dependency_unavailable" || result.state === "internal_failure") {
        await reconcileUncertain(intendedState);
      } else {
        if (result.state === "unauthenticated" || result.state === "permission_denied"
          || result.state === "target_not_found") setPreview({ state: result.state });
        setNotice(failureCopy[result.state]);
      }
    } catch {
      await reconcileUncertain(intendedState);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <button className="rounded-md bg-stone-100 px-3 py-2 text-xs font-bold text-stone-400" disabled>讀取正式狀態…</button>;
  }
  if (preview.state !== "ready") {
    return (
      <div className="space-y-2">
        <button className="rounded-md bg-stone-100 px-3 py-2 text-xs font-bold text-stone-400" disabled>售完控制不可用</button>
        <p className="text-xs text-stone-500">{failureCopy[preview.state]}</p>
      </div>
    );
  }

  const nextSoldOut = !preview.soldOut;
  return (
    <div className="space-y-2">
      <button
        className="rounded-md bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        disabled={submitting}
        onClick={() => setConfirmationOpen(true)}
        type="button"
      >
        {preview.soldOut ? "恢復供應" : "標記售完"}
      </button>
      {confirmationOpen ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3" role="alertdialog" aria-modal="true" aria-label="確認餐點供應狀態變更">
          <p className="text-sm font-bold text-stone-900">確認變更「{props.itemName}」</p>
          <p className="mt-1 text-xs text-stone-700">{props.branchName}：{preview.soldOut ? "已售完" : "供應中"} → {nextSoldOut ? "已售完" : "供應中"}</p>
          <p className="mt-2 text-xs leading-5 text-stone-700">售完後，此分店餐點可能暫時不會出現在可供應餐點與推薦中。</p>
          <div className="mt-3 flex gap-2">
            <button className="rounded-md bg-rose-700 px-3 py-2 text-xs font-bold text-white" onClick={() => void submit()} type="button">確認變更</button>
            <button className="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold" onClick={() => setConfirmationOpen(false)} type="button">取消</button>
          </div>
        </div>
      ) : null}
      {notice ? <p className="text-xs text-stone-600" aria-live="polite">{notice}</p> : null}
    </div>
  );
}
