import Link from "next/link";

/**
 * Public (outside the owner session middleware) notice for a Restaurant capability that has
 * no current backend. It renders no records, statuses or console chrome, so it cannot be read
 * as a working feature; the owner console link still goes through the normal session gate.
 */
export function DeferredCapabilityNotice({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f5ee] px-5 py-10 text-stone-900">
      <section className="w-full max-w-xl rounded-lg border border-stone-200 bg-white p-7 shadow-sm" data-restaurant-capability="deferred">
        <p className="text-xs font-black uppercase tracking-wide text-amber-700">TastKind 好廚店家後台</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-black text-stone-950">{title}</h1>
          <span className="inline-flex rounded-full bg-stone-200 px-2.5 py-1 text-xs font-bold text-stone-600">尚未啟用</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-stone-600">{body}</p>
        <Link className="mt-5 inline-flex rounded-md bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800" href="/restaurant">
          返回店家後台
        </Link>
      </section>
    </main>
  );
}
