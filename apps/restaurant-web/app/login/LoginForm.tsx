import { signInRestaurant } from "./actions";

export function LoginForm({ error }: { error?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f5ee] px-5">
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-7 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide text-amber-700">TastKind</p>
        <h1 className="mt-2 text-2xl font-black text-stone-950">店家登入</h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">登入只建立身分；可存取的店家與分店仍由資料庫權限判定。</p>
        {error ? <p className="mt-4 rounded-md bg-rose-50 p-3 text-sm font-bold text-rose-800">登入失敗或服務暫時無法使用，請重新確認後再試。</p> : null}
        <form action={signInRestaurant} className="mt-6 grid gap-4">
          <label className="grid gap-1 text-sm font-bold text-stone-700">電子郵件<input autoComplete="email" className="rounded-md border border-stone-300 px-3 py-2" name="email" required type="email" /></label>
          <label className="grid gap-1 text-sm font-bold text-stone-700">密碼<input autoComplete="current-password" className="rounded-md border border-stone-300 px-3 py-2" name="password" required type="password" /></label>
          <button className="rounded-md bg-teal-700 px-4 py-2 font-bold text-white hover:bg-teal-800" type="submit">登入</button>
        </form>
      </div>
    </main>
  );
}
