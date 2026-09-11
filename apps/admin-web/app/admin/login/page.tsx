import { getAdminAuthConfig } from "../../../config/admin-auth";
import { signInAdmin } from "./actions";

const messages = {
  credentials: "登入資料無效，請重新確認後再試。",
  configuration: "管理員登入目前尚未完成安全設定。",
  unavailable: "管理權限服務暫時無法使用，請稍後重試。",
  not_admin: "此帳號沒有管理後台存取權限。"
} as const;

export default function AdminLoginPage({ searchParams }: Readonly<{
  searchParams?: Readonly<{ error?: string; reason?: string }>;
}>) {
  const config = getAdminAuthConfig();
  const error = searchParams?.error;
  const message = error && error in messages ? messages[error as keyof typeof messages]
    : searchParams?.reason === "session" ? "工作階段已失效，請重新登入。"
      : null;
  const available = config.state === "ready";
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-5 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">TastKind / 好廚</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">管理員登入</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">請使用已獲授權的管理員帳號。登入身分不會單獨授予管理權限。</p>
        {message ? <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">{message}</p> : null}
        {!available && !message ? <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950" role="alert">管理員登入目前尚未完成安全設定。</p> : null}
        <form action={signInAdmin} className="mt-6 space-y-4">
          <label className="block text-sm font-bold text-slate-800">
            電子郵件
            <input autoComplete="email" className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 font-normal focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200" disabled={!available} name="email" required type="email" />
          </label>
          <label className="block text-sm font-bold text-slate-800">
            密碼
            <input autoComplete="current-password" className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 font-normal focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200" disabled={!available} name="password" required type="password" />
          </label>
          <button className="inline-flex w-full justify-center rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400" disabled={!available} type="submit">
            登入管理後台
          </button>
        </form>
      </section>
    </main>
  );
}
