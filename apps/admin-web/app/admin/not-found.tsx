import Link from "next/link";
import { ADMIN_CANONICAL_ROOT } from "../../auth/admin-route-registry";

export default function AdminNotFound() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Admin route not found</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">找不到這個管理後台位置</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">此路徑不在 canonical Admin 資訊架構中，系統不會自動改送至總覽或父層。</p>
      <Link className="mt-6 inline-flex rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2" href={ADMIN_CANONICAL_ROOT}>
        回到管理後台總覽
      </Link>
    </section>
  );
}

