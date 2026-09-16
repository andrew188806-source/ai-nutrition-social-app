"use client";

import { useCallback, useEffect, useState } from "react";

type Factor = Readonly<{ factorId: string; status: "verified" | "unverified"; label: string; createdAt: string | null }>;
type Enrollment = Readonly<{ factorId: string; qrCode: string; secret: string; uri: string }>;

async function postJson(url: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  let parsed: Record<string, unknown> = {};
  try { parsed = await response.json(); } catch { /* non-JSON error body */ }
  return { status: response.status, body: parsed };
}

export function SecuritySettingsPanel() {
  const [factors, setFactors] = useState<readonly Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await postJson("/api/admin/step-up/factors", {});
    if (result.status === 200 && result.body.ok) {
      setFactors((result.body.factors as Factor[] | undefined) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const startEnroll = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    const result = await postJson("/api/admin/step-up/enroll", { friendlyName: "TastKind Admin" });
    setBusy(false);
    if (result.status === 200 && result.body.ok) {
      setEnrollment(result.body.enrollment as Enrollment);
    } else {
      setMessage(`啟動設定失敗：${String(result.body.error ?? "unknown_error")}`);
    }
  }, []);

  const finishEnroll = useCallback(async () => {
    if (!enrollment) return;
    setBusy(true);
    setMessage(null);
    const result = await postJson("/api/admin/step-up/enroll/verify", { factorId: enrollment.factorId, code: verifyCode });
    setBusy(false);
    if (result.status === 200 && result.body.ok) {
      setMessage("Authenticator 設定完成，之後可用於 Step-Up 驗證。");
      setEnrollment(null);
      setVerifyCode("");
      await refresh();
    } else {
      setMessage(`驗證失敗：${String(result.body.error ?? "unknown_error")}`);
    }
  }, [enrollment, verifyCode, refresh]);

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Authenticator（TOTP）</h2>
        <p className="mt-1 text-xs text-slate-500">高權限操作需要 15 分鐘內有效的 Step-Up 驗證，驗證方式為 TOTP。此階段不提供密碼單獨重設高權限的途徑。</p>
        {loading ? <p className="mt-3 text-sm text-slate-500">讀取中…</p> : (
          <ul className="mt-3 space-y-2">
            {factors.length === 0 ? <li className="text-sm text-slate-500">尚未設定任何 Authenticator。</li> : factors.map((factor) => (
              <li className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700" key={factor.factorId}>
                <span>{factor.label}</span>
                <span className={`rounded-full border px-2 py-0.5 font-bold ${factor.status === "verified" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                  {factor.status === "verified" ? "已驗證" : "尚未驗證"}
                </span>
                <span className="font-mono text-[10px] text-slate-400">{factor.factorId}</span>
              </li>
            ))}
          </ul>
        )}

        {!enrollment ? (
          <button
            className="mt-4 rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50"
            disabled={busy}
            onClick={() => void startEnroll()}
            type="button"
          >
            新增 Authenticator
          </button>
        ) : (
          <div className="mt-4 space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-4">
            <p className="text-sm font-bold text-sky-900">請用 Authenticator App 掃描以下 QR Code，或手動輸入密鑰：</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="TOTP QR Code" className="h-40 w-40 rounded-lg border border-white bg-white p-2" src={enrollment.qrCode} />
            <p className="font-mono text-xs text-sky-900">密鑰：{enrollment.secret}</p>
            <p className="font-mono text-xs text-sky-900">Factor ID：{enrollment.factorId}</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-bold text-sky-900">
                輸入 App 顯示的 6 位數驗證碼
                <input
                  className="mt-1 w-40 rounded-lg border border-sky-300 px-3 py-2 text-sm"
                  inputMode="numeric"
                  onChange={(event) => setVerifyCode(event.target.value)}
                  value={verifyCode}
                />
              </label>
              <button
                className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50"
                disabled={busy || !/^[0-9]{6,8}$/.test(verifyCode)}
                onClick={() => void finishEnroll()}
                type="button"
              >
                完成設定
              </button>
            </div>
          </div>
        )}
        {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}
      </div>
    </section>
  );
}
