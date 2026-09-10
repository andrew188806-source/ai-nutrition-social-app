"use client";

import { useEffect, useRef, useState } from "react";
import {
  changePublicWebsite, previewPublicWebsite, publicWebsiteFailureCopy
} from "../../runtime/restaurant-owner-public-website-client";
import {
  canonicalizePublicWebsiteUrl, type PublicWebsiteInput, type PublicWebsitePreview
} from "../../runtime/restaurant-owner-public-website";

export function RestaurantOwnerPublicWebsiteControl() {
  const [preview, setPreview] = useState<PublicWebsitePreview>({ state: "dependency_unavailable" });
  const [loading, setLoading] = useState(true);
  const [nextUrl, setNextUrl] = useState("");
  const [confirmation, setConfirmation] = useState<"set" | "clear" | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void previewPublicWebsite().then((value) => {
      if (cancelled) return;
      setPreview(value);
      setNextUrl(value.state === "ready" ? value.publicWebsiteUrl ?? "" : "");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);
  if (loading) return <p className="text-sm text-stone-500">正在讀取公開網站…</p>;
  if (preview.state !== "ready") return <div className="space-y-2">
    <p className="text-sm font-bold text-stone-700">公開網站控制不可用</p>
    <p className="text-xs text-stone-500">{publicWebsiteFailureCopy[preview.state]}</p>
  </div>;
  const canonical = canonicalizePublicWebsiteUrl(nextUrl);
  const setValid = canonical !== null && canonical !== preview.publicWebsiteUrl;
  const invalid = nextUrl.length > 0 && canonical === null;
  const execute = async (operation: "set" | "clear") => {
    if (pending.current || (operation === "set" && !canonical)) return;
    const input: PublicWebsiteInput = operation === "set"
      ? { operation, expectedPublicWebsiteUrl: preview.publicWebsiteUrl,
          nextPublicWebsiteUrl: canonical!, expectedVersion: preview.publicWebsiteUrlVersion }
      : { operation, expectedPublicWebsiteUrl: preview.publicWebsiteUrl,
          expectedVersion: preview.publicWebsiteUrlVersion };
    pending.current = true; setBusy(true); setConfirmation(null);
    try {
      const result = await changePublicWebsite(preview, input);
      setPreview(result.preview);
      if (result.preview.state === "ready") setNextUrl(result.preview.publicWebsiteUrl ?? "");
      setNotice(result.notice);
    } finally { pending.current = false; setBusy(false); }
  };
  return <div className="space-y-3">
    <div>
      <p className="text-sm font-black text-stone-800">公開網站</p>
      <p className="mt-1 break-all text-xs text-stone-500">
        {preview.publicWebsiteUrl ? `目前公開：${preview.publicWebsiteUrl}` : "目前未發布公開網站"}
      </p>
    </div>
    <label className="block text-xs text-stone-700">
      HTTP(S) 網址
      <input type="url" className="mt-1 w-full rounded border border-stone-300 p-2"
        placeholder="https://example.com/" value={nextUrl}
        disabled={busy || confirmation !== null}
        onChange={(event) => { setNextUrl(event.target.value); setNotice(null); }} />
    </label>
    {invalid ? <p className="text-xs text-rose-700" role="alert">
      請輸入不含憑證或控制字元、最長 2048 字元的完整 http:// 或 https:// 網址。
    </p> : null}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="rounded-md bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        disabled={busy || confirmation !== null || !setValid}
        onClick={() => setConfirmation("set")}>
        {preview.publicWebsiteUrl === null ? "發布網站" : "修改網站"}
      </button>
      {preview.publicWebsiteUrl !== null ? <button type="button"
        className="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold disabled:opacity-50"
        disabled={busy || confirmation !== null} onClick={() => setConfirmation("clear")}>
        清除公開網站
      </button> : null}
    </div>
    {confirmation ? <div role="alertdialog" aria-label="確認公開網站變更"
      className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
      <p>{confirmation === "set" ? `確認發布「${canonical}」？` : "確認清除餐廳公開網站？"}</p>
      <p className="mt-1 text-xs text-stone-600">儲存後會立即反映在公開餐廳資料。</p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="rounded-md bg-rose-700 px-3 py-2 text-xs font-bold text-white"
          disabled={busy} onClick={() => void execute(confirmation)}>確認</button>
        <button type="button" className="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold"
          onClick={() => setConfirmation(null)}>取消</button>
      </div>
    </div> : null}
    {notice ? <p className="text-xs text-stone-600" aria-live="polite">{notice}</p> : null}
  </div>;
}
