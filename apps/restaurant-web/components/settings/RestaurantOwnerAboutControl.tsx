"use client";

import { useEffect, useRef, useState } from "react";
import {
  changeRestaurantAbout, previewRestaurantAbout, restaurantAboutFailureCopy
} from "../../runtime/restaurant-owner-about-client";
import {
  canonicalizeRestaurantAbout, RESTAURANT_ABOUT_MAX_CODE_POINTS,
  type RestaurantAboutInput, type RestaurantAboutPreview
} from "../../runtime/restaurant-owner-about";

export function RestaurantOwnerAboutControl() {
  const [preview, setPreview] = useState<RestaurantAboutPreview>({ state: "dependency_unavailable" });
  const [loading, setLoading] = useState(true);
  const [nextText, setNextText] = useState("");
  const [confirmation, setConfirmation] = useState<"set" | "clear" | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void previewRestaurantAbout().then((value) => {
      if (cancelled) return;
      setPreview(value);
      setNextText(value.state === "ready" ? value.restaurantAbout ?? "" : "");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);
  if (loading) return <p className="text-sm text-stone-500">正在讀取店家介紹…</p>;
  if (preview.state !== "ready") return <div className="space-y-2">
    <p className="text-sm font-bold text-stone-700">店家介紹控制不可用</p>
    <p className="text-xs text-stone-500">{restaurantAboutFailureCopy[preview.state]}</p>
  </div>;
  const canonical = canonicalizeRestaurantAbout(nextText);
  const codePointCount = [...nextText].length;
  const overLimit = codePointCount > RESTAURANT_ABOUT_MAX_CODE_POINTS;
  const setValid = canonical !== null && canonical !== preview.restaurantAbout;
  const invalid = nextText.length > 0 && canonical === null;
  const execute = async (operation: "set" | "clear") => {
    if (pending.current || (operation === "set" && !canonical)) return;
    const input: RestaurantAboutInput = operation === "set"
      ? { operation, expectedRestaurantAbout: preview.restaurantAbout,
          nextRestaurantAbout: canonical!, expectedVersion: preview.restaurantAboutVersion }
      : { operation, expectedRestaurantAbout: preview.restaurantAbout,
          expectedVersion: preview.restaurantAboutVersion };
    pending.current = true; setBusy(true); setConfirmation(null);
    try {
      const result = await changeRestaurantAbout(preview, input);
      setPreview(result.preview);
      if (result.preview.state === "ready") setNextText(result.preview.restaurantAbout ?? "");
      setNotice(result.notice);
    } finally { pending.current = false; setBusy(false); }
  };
  return <div className="space-y-3">
    <div>
      <p className="text-sm font-black text-stone-800">店家介紹</p>
      <p className="mt-1 text-xs text-stone-500">
        {preview.restaurantAbout ? "目前已公開店家介紹" : "目前未發布店家介紹"}
      </p>
    </div>
    <label className="block text-xs text-stone-700">
      介紹內容
      <textarea rows={6} className="mt-1 w-full rounded border border-stone-300 p-2"
        placeholder="介紹您的餐廳特色…" value={nextText}
        disabled={busy || confirmation !== null}
        onChange={(event) => { setNextText(event.target.value); setNotice(null); }} />
    </label>
    <p className={"text-xs " + (overLimit ? "text-rose-700" : "text-stone-500")} aria-live="polite">
      {codePointCount} / {RESTAURANT_ABOUT_MAX_CODE_POINTS}
    </p>
    {invalid ? <p className="text-xs text-rose-700" role="alert">
      請輸入 1 至 800 字的內容,不可全為空白,且不可包含 Tab、換行以外的控制字元。
    </p> : null}
    <p className="text-xs text-stone-500">
      店家介紹儲存後會直接公開;營養與過敏原等資訊以好廚的專屬資料欄位為準。
    </p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="rounded-md bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        disabled={busy || confirmation !== null || !setValid}
        onClick={() => setConfirmation("set")}>
        {preview.restaurantAbout === null ? "發布介紹" : "更新介紹"}
      </button>
      {preview.restaurantAbout !== null ? <button type="button"
        className="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold disabled:opacity-50"
        disabled={busy || confirmation !== null} onClick={() => setConfirmation("clear")}>
        清除店家介紹
      </button> : null}
    </div>
    {confirmation ? <div role="alertdialog" aria-label="確認店家介紹變更"
      className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
      <p>{confirmation === "set" ? "確認發布更新後的店家介紹？" : "確認清除店家介紹？"}</p>
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
