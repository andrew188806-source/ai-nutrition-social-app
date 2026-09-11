import Link from "next/link";
import { signOutAdmin } from "../../app/admin/login/actions";

export function AdminAccessDenied() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-5 py-10">
      <section className="w-full max-w-xl rounded-xl border border-amber-200 bg-white p-7 shadow-sm" role="alert">
        <p className="text-xs font-black uppercase tracking-wide text-amber-700">Access denied</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">沒有管理後台存取權限</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">目前登入的帳號無法使用管理後台。請登出後改用已獲授權的管理員帳號。</p>
        <form action={signOutAdmin} className="mt-5">
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50" type="submit">登出</button>
        </form>
      </section>
    </main>
  );
}

export function AdminAuthorityUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-5 py-10">
      <section className="w-full max-w-xl rounded-xl border border-rose-200 bg-white p-7 shadow-sm" role="alert">
        <p className="text-xs font-black uppercase tracking-wide text-rose-700">Temporarily unavailable</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">管理權限服務暫時無法使用</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">系統目前無法安全確認管理權限，因此沒有顯示管理內容。請稍後重試。</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50" href="/admin">重試</Link>
          <form action={signOutAdmin}>
            <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50" type="submit">登出</button>
          </form>
        </div>
      </section>
    </main>
  );
}
