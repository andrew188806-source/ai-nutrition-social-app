"use client";

import { useEffect, useRef, useState } from "react";
import {
  changeBranchPublicPhone,
  previewBranchPublicPhone,
  publicPhoneFailureCopy
} from "../../runtime/restaurant-owner-branch-public-phone-client";
import {
  canonicalizePublicPhone,
  isValidPublicPhone,
  type PublicPhoneInput,
  type PublicPhonePreview
} from "../../runtime/restaurant-owner-branch-public-phone";

export function RestaurantOwnerBranchPublicPhoneControl({ branchId }: { branchId: string }) {
  const [preview, setPreview] = useState<PublicPhonePreview>({ state: "dependency_unavailable" });
  const [loading, setLoading] = useState(true);
  const [nextPublicPhone, setNextPublicPhone] = useState("");
  const [confirmation, setConfirmation] = useState<"set" | "clear" | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void previewBranchPublicPhone(branchId).then((value) => {
      if (cancelled) return;
      setPreview(value);
      setNextPublicPhone(value.state === "ready" ? value.publicPhone ?? "" : "");
      setConfirmation(null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [branchId]);

  if (loading) {
    return <button disabled className="mt-3 rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-400">
      正在讀取公開電話
    </button>;
  }

  if (preview.state !== "ready") {
    return <div className="mt-3 space-y-2">
      <button disabled className="rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-400">
        公開電話控制不可用
      </button>
      <p className="text-xs text-stone-500">{publicPhoneFailureCopy[preview.state]}</p>
    </div>;
  }

  const candidate = canonicalizePublicPhone(nextPublicPhone);
  const setValid = isValidPublicPhone(candidate) && candidate !== preview.publicPhone;
  const validationMessage = nextPublicPhone.length > 0 && !isValidPublicPhone(candidate)
    ? "電話顯示文字須為 1–32 個字元，且不可包含換行、Tab 或控制字元。"
    : null;
  const execute = async (operation: "set" | "clear") => {
    if (pending.current) return;
    const input: PublicPhoneInput = operation === "set"
      ? {
          operation,
          expectedPublicPhone: preview.publicPhone,
          nextPublicPhone: candidate,
          expectedVersion: preview.publicPhoneVersion
        }
      : {
          operation,
          expectedPublicPhone: preview.publicPhone,
          expectedVersion: preview.publicPhoneVersion
        };
    pending.current = true;
    setBusy(true);
    setConfirmation(null);
    try {
      const result = await changeBranchPublicPhone(preview, input);
      setPreview(result.preview);
      if (result.preview.state === "ready") setNextPublicPhone(result.preview.publicPhone ?? "");
      setNotice(result.notice);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return <div className="mt-3 space-y-2 border-t border-stone-100 pt-3">
    <p className="text-xs font-bold text-stone-700">公開電話</p>
    {preview.publicPhone
      ? <p className="text-xs text-stone-500">目前公開：{preview.publicPhone}</p>
      : <p className="text-xs text-stone-500">目前未發布公開電話</p>}
    <label className="block text-xs text-stone-700">
      電話顯示文字
      <input
        className="mt-1 w-full rounded border border-stone-300 p-2"
        maxLength={64}
        value={nextPublicPhone}
        disabled={busy || confirmation !== null}
        onChange={(event) => setNextPublicPhone(event.target.value)}
      />
    </label>
    {validationMessage ? <p className="text-xs text-rose-700" role="alert">
      {validationMessage}
    </p> : null}
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="rounded-md bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        disabled={busy || confirmation !== null || !setValid}
        onClick={() => setConfirmation("set")}
      >
        {preview.publicPhone === null ? "發布電話" : "修改電話"}
      </button>
      {preview.publicPhone !== null ? <button
        type="button"
        className="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold disabled:opacity-50"
        disabled={busy || confirmation !== null}
        onClick={() => setConfirmation("clear")}
      >
        清除公開電話
      </button> : null}
    </div>
    {confirmation === "set" ? <div
      role="alertdialog"
      aria-label="確認公開電話變更"
      className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"
    >
      <p>確認將此分店的公開電話設為「{candidate}」？</p>
      <p className="mt-1 text-xs text-stone-600">儲存後會立即顯示在公開餐廳頁。</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-md bg-rose-700 px-3 py-2 text-xs font-bold text-white"
          disabled={busy}
          onClick={() => void execute("set")}
        >
          確認發布
        </button>
        <button
          type="button"
          className="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold"
          onClick={() => setConfirmation(null)}
        >
          取消
        </button>
      </div>
    </div> : null}
    {confirmation === "clear" ? <div
      role="alertdialog"
      aria-label="確認清除公開電話"
      className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"
    >
      <p>確認清除此分店的公開電話？</p>
      <p className="mt-1 text-xs text-stone-600">清除後公開餐廳頁將不再顯示電話。</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-md bg-rose-700 px-3 py-2 text-xs font-bold text-white"
          disabled={busy}
          onClick={() => void execute("clear")}
        >
          確認清除
        </button>
        <button
          type="button"
          className="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold"
          onClick={() => setConfirmation(null)}
        >
          取消
        </button>
      </div>
    </div> : null}
    {notice ? <p className="text-xs text-stone-600" aria-live="polite">{notice}</p> : null}
  </div>;
}
