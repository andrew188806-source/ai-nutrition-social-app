"use client";

import { useCallback, useState } from "react";
import { StepUpCard } from "./StepUpCard";
import { isReasonValid, submitMutation } from "./adminMutationClient";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function LinkStaffAccountPanel() {
  const [open, setOpen] = useState(false);
  const [targetAuthUserId, setTargetAuthUserId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [reasonCode, setReasonCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [newStaffAccountId, setNewStaffAccountId] = useState<string | null>(null);

  const validUuid = UUID.test(targetAuthUserId.trim());

  const submit = useCallback(async () => {
    if (!validUuid) { setResult("Auth UUID 格式不正確。"); return; }
    if (!confirmed) { setResult("請先勾選確認目標 UUID 無誤。"); return; }
    if (!isReasonValid(reasonCode)) { setResult("原因代碼格式不正確。"); return; }
    setBusy(true);
    setResult(null);
    const now = new Date().toISOString();
    const outcome = await submitMutation("link_staff_account", {
      targetAuthUserId: targetAuthUserId.trim(),
      effectiveFrom: now,
      effectiveUntil: null,
      reasonCode,
      requestId: crypto.randomUUID()
    });
    setBusy(false);
    if (outcome.kind === "applied") {
      const staffAccountId = String(outcome.result.staffAccountId ?? "");
      setNewStaffAccountId(staffAccountId || null);
      setResult("成功：已建立人員帳號連結。");
    } else if (outcome.kind === "rejected") {
      setResult(`遭拒絕：${outcome.errorCode}`);
    } else if (outcome.kind === "step_up_required") {
      setResult("Step-Up 已逾期或尚未完成，請重新驗證後再試一次。");
    } else {
      setResult(`失敗：${outcome.error}`);
    }
  }, [targetAuthUserId, confirmed, reasonCode, validUuid]);

  if (!open) {
    return (
      <button
        className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800"
        onClick={() => setOpen(true)}
        type="button"
      >
        新增管理人員（連結既有帳號）
      </button>
    );
  }

  return (
    <section className="space-y-5 rounded-xl border border-sky-200 bg-sky-50 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-950">新增管理人員 — 連結既有帳號</h2>
        <button className="text-xs font-bold text-slate-500 hover:underline" onClick={() => setOpen(false)} type="button">收合</button>
      </div>
      <p className="text-xs text-slate-600">
        目標人員必須已經有 TastKind 的 Auth 帳號（Auth UUID）。本頁不提供以電子郵件搜尋帳號的功能——
        取得 Auth UUID 的方式請見《最高權限開啟 SOP》附註。
      </p>
      <StepUpCard />
      {newStaffAccountId ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          已建立人員帳號：<span className="font-mono">{newStaffAccountId}</span>——接下來請進入
          <a className="mx-1 font-bold underline" href={`/admin/management/staff/${newStaffAccountId}`}>該人員的詳情頁</a>
          逐項授權，或使用「建立 Primary Permission Manager」精靈。
        </p>
      ) : (
        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-700">
            目標 Auth UUID
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              onChange={(event) => { setTargetAuthUserId(event.target.value); setConfirmed(false); }}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={targetAuthUserId}
            />
          </label>
          {validUuid ? (
            <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
              <input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
              <span>我確認要連結的目標 Auth UUID 就是：<span className="font-mono">{targetAuthUserId.trim()}</span></span>
            </label>
          ) : null}
          <label className="block text-xs font-bold text-slate-700">
            原因代碼
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              onChange={(event) => setReasonCode(event.target.value)}
              placeholder="只能用小寫英文字母、數字與底線，例如 new_hire_onboarding"
              value={reasonCode}
            />
          </label>
          <button
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            disabled={busy || !validUuid || !confirmed}
            onClick={() => void submit()}
            type="button"
          >
            送出：建立人員帳號連結
          </button>
        </div>
      )}
      {result ? <p className="text-sm text-slate-700">{result}</p> : null}
    </section>
  );
}
