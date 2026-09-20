import Link from "next/link";
import type { ReactNode } from "react";
import type { CurrentAdminPermissionKey } from "../../auth/admin-current-permission-vocabulary";
import type { AdminOperationalContext } from "./AdminOperationalPage";
import type { ReadFailure } from "../../server/adminRestaurantRead";

/** Presentation helpers for the ADMIN-B2 read-only Restaurant / Branch pages. Real contract data only. */

const FAILURE_COPY: Readonly<Record<ReadFailure["state"], Readonly<{ title: string; body: string; tone: string }>>> = {
  forbidden: { title: "沒有存取權限", body: "此帳號沒有讀取這項資料所需的權限。", tone: "border-amber-200 bg-amber-50 text-amber-950" },
  invalid_request: { title: "請求無效", body: "網址中的識別碼或分頁參數無效。", tone: "border-slate-300 bg-slate-50 text-slate-900" },
  not_found: { title: "找不到資料", body: "找不到符合的資料；也可能是分店不屬於這間餐廳。", tone: "border-slate-300 bg-slate-50 text-slate-900" },
  unavailable: { title: "資料暫時無法使用", body: "無法安全取得正式資料，因此沒有顯示內容。請稍後重試。", tone: "border-rose-200 bg-rose-50 text-rose-950" }
};

export function ReadFailureNotice({ state }: { state: ReadFailure["state"] }) {
  const copy = FAILURE_COPY[state];
  return (
    <section className={`rounded-xl border px-5 py-4 ${copy.tone}`} data-b2-state={state} role={state === "unavailable" ? "alert" : "status"}>
      <h2 className="text-base font-bold">{copy.title}</h2>
      <p className="mt-1 text-sm leading-6">{copy.body}</p>
    </section>
  );
}

export function ReadySection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" data-b2-state="ready">
      {children}
    </section>
  );
}

export function FactList({ items }: { items: readonly Readonly<{ label: string; value: ReactNode }>[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{item.label}</dt>
          <dd className="mt-1 break-words text-sm text-slate-900">{item.value ?? <span className="text-slate-400">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export const dash = (value: string | number | null | undefined): ReactNode => (value === null || value === undefined || value === "" ? null : String(value));

export function StatusPill({ status }: { status: string }) {
  const tone = status === "active" || status === "published" ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : status === "draft" || status === "paused" || status === "inactive" || status === "temporary_closed" ? "bg-amber-50 text-amber-900 border-amber-200"
    : "bg-slate-100 text-slate-700 border-slate-300";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${tone}`}>{status}</span>;
}

export const has = (context: AdminOperationalContext, key: CurrentAdminPermissionKey): boolean => context.permissions.includes(key);
export const enc = encodeURIComponent;

export function SubLinks({ links }: { links: readonly Readonly<{ label: string; href: string; allowed: boolean }>[] }) {
  return (
    <nav aria-label="相關功能" className="flex flex-wrap gap-3">
      {links.map((link) => link.allowed ? (
        <Link className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:border-sky-300 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500" href={link.href} key={link.label}>{link.label}</Link>
      ) : (
        <span className="rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-400" key={link.label} title="此帳號沒有這項功能的權限">{link.label}（無權限）</span>
      ))}
    </nav>
  );
}

/** Minimal previous/next controls over the bounded B1 page (`?page=N`, 20 rows). */
export function PageControls({ basePath, page, hasMore }: { basePath: string; page: number; hasMore: boolean }) {
  return (
    <nav aria-label="分頁" className="mt-4 flex items-center gap-4 text-sm">
      {page > 1 ? <Link className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold" href={`${basePath}?page=${page - 1}`}>上一頁</Link> : <span className="text-slate-300">上一頁</span>}
      <span>第 {page} 頁 · 每頁 20 筆</span>
      {hasMore ? <Link className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold" href={`${basePath}?page=${page + 1}`}>下一頁</Link> : <span className="text-slate-300">下一頁</span>}
    </nav>
  );
}

/** `?page=` -> positive integer, or NaN (which the read layer answers with `invalid_request`). */
export function parsePageParam(value: string | string[] | undefined): number {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9][0-9]{0,5}$/.test(value)) return Number.NaN;
  return Number(value);
}

/** ISO weekday 1..7 (Monday = 1), exactly as the B1 hours contract returns it. */
export const weekdayLabel = (weekday: number): string => ["週一", "週二", "週三", "週四", "週五", "週六", "週日"][weekday - 1] ?? `週 ${weekday}`;
