import Link from "next/link";
import { ADMIN_CANONICAL_ROOT } from "../../../auth/admin-route-registry";
import { AdminAvailabilityBadge } from "../../../components/admin-shell/AdminAvailabilityBadge";

export default function AdminLoginPlaceholderPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-5 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">TastKind / 好廚</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950">管理員登入</h1>
          </div>
          <AdminAvailabilityBadge availability="NOT_ENABLED" />
        </div>
        <p className="mt-5 text-sm leading-6 text-slate-600">安全的瀏覽器管理員 session 將於 RA-3-IA-P3 接入。本頁不接受 bearer token，也不會把 token 放入網址或瀏覽器儲存空間。</p>
        <Link className="mt-6 inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500" href={ADMIN_CANONICAL_ROOT}>
          查看資訊架構預覽
        </Link>
      </section>
    </main>
  );
}

