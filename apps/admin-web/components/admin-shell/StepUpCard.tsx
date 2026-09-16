"use client";

import { useCallback, useEffect, useState } from "react";
import { postJson } from "./adminMutationClient";

type StepUpStatus =
  | Readonly<{ checked: false }>
  | Readonly<{ checked: true; active: boolean; remainingSeconds?: number }>;

export function StepUpCard({ onVerified }: { onVerified?: () => void }) {
  const [status, setStatus] = useState<StepUpStatus>({ checked: false });
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    const result = await postJson("/api/admin/step-up/status", {});
    const active = result.status === 200 && Boolean(result.body.ok) && Boolean(result.body.active);
    setStatus({
      checked: true,
      active,
      remainingSeconds: typeof result.body.remainingSeconds === "number" ? result.body.remainingSeconds : undefined
    });
    return active;
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const verify = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    const result = await postJson("/api/admin/step-up/verify", { factorId, code });
    setBusy(false);
    if (result.status === 200 && result.body.ok) {
      setMessage("Step-Up 驗證成功，15 分鐘內可執行高權限操作。");
      setCode("");
      await refresh();
      onVerified?.();
    } else {
      setMessage(`驗證失敗：${String(result.body.error ?? "unknown_error")}`);
    }
  }, [factorId, code, refresh, onVerified]);

  const clear = useCallback(async () => {
    setBusy(true);
    await postJson("/api/admin/step-up/clear", {});
    setBusy(false);
    await refresh();
  }, [refresh]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">Step-Up 狀態</h2>
      <p className="mt-1 text-xs text-slate-500">高權限操作（停用／撤銷／授予）皆需要 15 分鐘內有效的 TOTP Step-Up 驗證。</p>
      {status.checked ? (
        <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${status.active ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {status.active
            ? `目前已完成 Step-Up，約剩餘 ${Math.ceil((status.remainingSeconds ?? 0) / 60)} 分鐘。`
            : "目前尚未完成 Step-Up，需要先驗證才能執行高權限操作。"}
        </p>
      ) : null}
      {status.checked && status.active ? (
        <button
          className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          disabled={busy}
          onClick={() => void clear()}
          type="button"
        >
          結束 Step-Up
        </button>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-bold text-slate-700">
            Authenticator Factor ID
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              onChange={(event) => setFactorId(event.target.value)}
              placeholder="於「設定」頁面查看"
              value={factorId}
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            6 位數驗證碼
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              inputMode="numeric"
              onChange={(event) => setCode(event.target.value)}
              value={code}
            />
          </label>
          <div className="flex items-end">
            <button
              className="w-full rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50"
              disabled={busy || !factorId || !/^[0-9]{6,8}$/.test(code)}
              onClick={() => void verify()}
              type="button"
            >
              進行 Step-Up 驗證
            </button>
          </div>
        </div>
      )}
      {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}
