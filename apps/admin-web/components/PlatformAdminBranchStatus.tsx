"use client";

import { useState } from "react";
import type {
  GovernedBranchStatus,
  PlatformAdminBranchStatusMutationRequest,
  PlatformAdminBranchStatusMutationResult,
  PlatformAdminBranchStatusPreview
} from "../view-models/platform-admin-branch-status";

function transitionFor(status: GovernedBranchStatus): Readonly<{
  nextStatus: GovernedBranchStatus;
  reasonCode: "operational_pause" | "operational_resume";
}> {
  return status === "active"
    ? { nextStatus: "inactive", reasonCode: "operational_pause" }
    : { nextStatus: "active", reasonCode: "operational_resume" };
}

type PendingOperation = Readonly<{
  branchId: string;
  body: PlatformAdminBranchStatusMutationRequest;
}>;

const labels: Record<Exclude<PlatformAdminBranchStatusPreview["state"], "ready">, string> = {
  unauthenticated: "尚未建立可驗證的管理員工作階段。",
  permission_denied: "目前帳號沒有分店狀態寫入權限。",
  invalid_request: "請以有效的 restaurantId 與 branchId 開啟此頁。",
  target_not_found: "找不到符合的正式分店。",
  mutation_rejected: "此分店目前不支援啟用／停用控制。",
  dependency_unavailable: "正式狀態服務目前無法使用。",
  internal_failure: "正式狀態回應未通過安全檢查。"
};

function endpoint(restaurantId: string, branchId: string): string {
  return `/api/platform-admin/restaurant-branches/${encodeURIComponent(branchId)}/status?restaurantId=${encodeURIComponent(restaurantId)}`;
}

export function PlatformAdminBranchStatus({ initialPreview }: Readonly<{
  initialPreview: PlatformAdminBranchStatusPreview;
}>) {
  const [preview, setPreview] = useState(initialPreview);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [pending, setPending] = useState<PendingOperation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh(restaurantId: string, branchId: string): Promise<void> {
    try {
      const response = await fetch(endpoint(restaurantId, branchId), {
        method: "GET", credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }
      });
      const result = await response.json() as PlatformAdminBranchStatusPreview;
      setPreview(result);
    } catch {
      setPreview({ state: "dependency_unavailable" });
    }
  }

  async function send(operation: PendingOperation): Promise<void> {
    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch(endpoint(operation.body.restaurantId, operation.branchId).split("?", 1)[0], {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(operation.body)
      });
      const result = await response.json() as PlatformAdminBranchStatusMutationResult;
      if (result.state === "dependency_unavailable" || result.state === "internal_failure") {
        setPending(operation);
        setNotice("提交結果不確定。請用相同 requestId 明確重試，或先停止並查證。 ");
        return;
      }
      setPending(null);
      if (result.state === "ready") {
        setNotice(result.outcome === "noop" ? "狀態已一致；未產生額外變更。" : "分店狀態已套用。 ");
        await refresh(operation.body.restaurantId, operation.branchId);
        return;
      }
      if (result.state === "stale_state") {
        setNotice("分店狀態已由其他操作變更。已重新讀取，請重新確認。 ");
        await refresh(operation.body.restaurantId, operation.branchId);
        return;
      }
      const mapped: Record<string, string> = {
        unauthenticated: "工作階段無法驗證。", permission_denied: "權限已失效。",
        invalid_request: "請求未通過驗證。", target_not_found: "正式分店已不存在。",
        idempotency_conflict: "requestId 已被另一個不同操作使用。", mutation_rejected: "狀態轉換遭拒。"
      };
      setNotice(mapped[result.state] ?? "狀態變更失敗。 ");
      if (result.state === "permission_denied" || result.state === "unauthenticated") setPreview({ state: result.state });
    } catch {
      setPending(operation);
      setNotice("提交結果不確定。請用相同 requestId 明確重試，或先停止並查證。 ");
    } finally {
      setSubmitting(false);
    }
  }

  function confirm(): void {
    if (preview.state !== "ready" || !globalThis.crypto?.randomUUID) return;
    const transition = transitionFor(preview.status);
    const operation: PendingOperation = {
      branchId: preview.branchId,
      body: {
        restaurantId: preview.restaurantId,
        expectedStatus: preview.status,
        nextStatus: transition.nextStatus,
        expectedVersion: preview.statusVersion,
        reasonCode: transition.reasonCode,
        requestId: globalThis.crypto.randomUUID()
      }
    };
    setConfirmationOpen(false);
    setPending(operation);
    void send(operation);
  }

  if (preview.state !== "ready") {
    return (
      <section className="rounded-xl border border-slate-300 bg-white p-5" aria-label="Governed branch status">
        <h2 className="text-lg font-semibold">正式分店狀態控制</h2>
        <p className="mt-2 text-sm text-slate-600">{labels[preview.state]}</p>
        <button className="mt-4 rounded-lg bg-slate-200 px-4 py-2 text-sm text-slate-500" disabled>狀態變更不可用</button>
      </section>
    );
  }

  const transition = transitionFor(preview.status);
  return (
    <section className="rounded-xl border border-emerald-300 bg-white p-5" aria-label="Governed branch status">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Canonical live preview</p>
          <h2 className="mt-1 text-lg font-semibold">{preview.branchName}</h2>
          <p className="mt-1 text-sm text-slate-600">目前狀態：{preview.status} · 版本 {preview.statusVersion}</p>
        </div>
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={submitting || pending !== null} onClick={() => setConfirmationOpen(true)}>
          {preview.status === "active" ? "檢視停用變更" : "檢視啟用變更"}
        </button>
      </div>

      {confirmationOpen ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4" role="alertdialog" aria-modal="true" aria-label="確認分店狀態變更">
          <p className="font-semibold">確認 {preview.branchName}：{preview.status} → {transition.nextStatus}</p>
          <p className="mt-2 text-sm text-slate-700">此分店可能在受治理的公開目錄讀取中變為不可用或可用。</p>
          <div className="mt-3 flex gap-2">
            <button className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white" onClick={confirm}>確認變更</button>
            <button className="rounded-lg border border-slate-400 px-4 py-2 text-sm" onClick={() => setConfirmationOpen(false)}>取消</button>
          </div>
        </div>
      ) : null}

      {pending ? (
        <button className="mt-4 rounded-lg border border-amber-600 px-4 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50"
          disabled={submitting} onClick={() => void send(pending)}>
          使用相同 requestId 重試
        </button>
      ) : null}
      {notice ? <p className="mt-3 text-sm" aria-live="polite">{notice}</p> : null}
    </section>
  );
}
