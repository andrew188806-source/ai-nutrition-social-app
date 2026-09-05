"use client";

import { useEffect, useRef, useState } from "react";
import { AVAILABILITIES, isAvailability, type Availability, type RestaurantOwnerAvailabilityPreview } from "../../runtime/restaurant-owner-availability";
import {
  availabilityLabels, availabilityConsequences, availabilityFailureCopy,
  previewAvailability, changeAvailability
} from "../../runtime/restaurant-owner-availability-client";

type Props = Readonly<{ branchId: string; branchMenuItemId: string; branchName: string; itemName: string }>;

export function RestaurantOwnerAvailabilityControl(props: Props) {
  const [preview, setPreview] = useState<RestaurantOwnerAvailabilityPreview>({ state: "dependency_unavailable" });
  const [loading, setLoading] = useState(true);
  const [next, setNext] = useState<Availability | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPreview({ state: "dependency_unavailable" });
    setNext(null);
    setConfirmationOpen(false);
    void previewAvailability(props.branchId, props.branchMenuItemId).then(result => {
      if (!cancelled) {
        setPreview(result);
        setNext(result.state === "ready" ? result.availability : null);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [props.branchId, props.branchMenuItemId]);

  async function submit(): Promise<void> {
    if (pending.current || !confirmationOpen || preview.state !== "ready" || next === null
      || next === preview.availability) return;
    pending.current = true;
    setSubmitting(true);
    setConfirmationOpen(false);
    setNotice(null);
    try {
      const result = await changeAvailability(preview, next);
      setPreview(result.preview);
      setNext(result.preview.state === "ready" ? result.preview.availability : null);
      setNotice(result.notice);
    } finally { pending.current = false; setSubmitting(false); }
  }

  if (loading) return <button disabled className="rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-400">讀取供應狀態…</button>;
  if (preview.state !== "ready") return <div className="space-y-2">
    <button disabled className="rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-400">供應控制不可用</button>
    <p className="text-xs text-stone-500">{availabilityFailureCopy[preview.state]}</p>
  </div>;

  return <div className="space-y-2">
    <p className="text-xs font-bold text-stone-700">目前供應：{availabilityLabels[preview.availability]}</p>
    <label className="block text-xs text-stone-700">供應狀態
      <select className="ml-2 rounded-md border border-stone-300 p-2" value={next ?? preview.availability}
        disabled={submitting || confirmationOpen} onChange={event => {
          if (isAvailability(event.target.value)) setNext(event.target.value);
        }}>
        {AVAILABILITIES.map(value => <option key={value} value={value}>{availabilityLabels[value]}</option>)}
      </select>
    </label>
    <button type="button" className="rounded-md bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
      disabled={submitting || next === null || next === preview.availability}
      onClick={() => setConfirmationOpen(true)}>變更供應</button>
    {confirmationOpen && next !== null ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-3"
      role="alertdialog" aria-label="確認餐點供應變更">
      <p className="text-sm font-bold">確認變更「{props.itemName}」</p>
      <p className="mt-1 text-xs">{props.branchName}：{availabilityLabels[preview.availability]} → {availabilityLabels[next]}</p>
      <p className="mt-2 text-xs leading-5">{availabilityConsequences[next]}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={submitting} className="rounded-md bg-rose-700 px-3 py-2 text-xs font-bold text-white"
          onClick={() => void submit()}>確認變更</button>
        <button type="button" className="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold"
          onClick={() => setConfirmationOpen(false)}>取消</button>
      </div>
    </div> : null}
    {notice ? <p className="text-xs text-stone-600" aria-live="polite">{notice}</p> : null}
  </div>;
}
