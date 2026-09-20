"use client";

import { useEffect, useState } from "react";
import type { PlatformAdminAuditResult } from "../../view-models/platform-admin-audit";

const REFUSALS = {
  unauthenticated: "工作階段無法驗證，請重新登入。",
  forbidden: "目前身分沒有讀取平台管理員稽核紀錄的權限。",
  unavailable: "平台管理員稽核紀錄目前無法使用。",
  invalid_request: "分頁參數無效，請回到第一頁。"
} as const;
const ACTIONS = { grant_platform_admin: "授予平台管理員權限", revoke_platform_admin: "撤銷平台管理員權限" } as const;
const OUTCOMES = { granted: "已授權", revoked: "已撤銷", rejected: "已拒絕" } as const;

/** Reads the existing governed audit endpoint with the signed-in cookie session; page size stays server-defined. */
export function AdminMembershipAudit() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PlatformAdminAuditResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    (async () => {
      let next: PlatformAdminAuditResult;
      try {
        const response = await fetch(`/api/platform-admin/audit?page=${page}`, {
          method: "GET", credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }
        });
        const body = await response.json() as { state?: unknown };
        next = body?.state === "ready" || (typeof body?.state === "string" && body.state in REFUSALS)
          ? body as PlatformAdminAuditResult
          : { state: "unavailable" };
      } catch {
        next = { state: "unavailable" };
      }
      if (!cancelled) setResult(next);
    })();
    return () => { cancelled = true; };
  }, [page]);

  if (result === null) return <p className="text-sm text-slate-600" role="status">正在讀取稽核紀錄…</p>;
  if (result.state !== "ready") {
    return (
      <div className="space-y-3" role="alert">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{REFUSALS[result.state]}</p>
        {result.state === "invalid_request" && page > 1 ? (
          <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setPage(1)}>回到第一頁</button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">
        正式資料：平台管理員授權與撤銷紀錄。僅顯示最新 {result.sourceWindow} 筆範圍；新增紀錄可能使分頁位置變動。
      </p>
      {result.events.length === 0 ? (
        <p className="text-sm text-slate-600" role="status">此頁沒有平台管理員生命週期紀錄。</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2 font-bold">時間</th><th className="px-4 py-2 font-bold">操作</th><th className="px-4 py-2 font-bold">結果</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.events.map((event, index) => (
                <tr key={`${result.page}-${index}`}>
                  <td className="px-4 py-2 text-slate-600">{event.occurredAt}</td>
                  <td className="px-4 py-2 text-slate-900">{ACTIONS[event.action]}</td>
                  <td className="px-4 py-2 text-slate-900">{OUTCOMES[event.outcome]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav aria-label="稽核紀錄分頁" className="flex items-center gap-4 text-sm">
        <button className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40" disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}>上一頁</button>
        <span>第 {result.page} 頁 · 每頁最多 {result.pageSize} 筆</span>
        <button className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40" disabled={!result.hasNextPage} onClick={() => setPage(result.page + 1)}>下一頁</button>
      </nav>
    </div>
  );
}
