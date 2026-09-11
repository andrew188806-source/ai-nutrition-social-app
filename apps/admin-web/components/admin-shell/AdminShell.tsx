"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ADMIN_CANONICAL_ROOT } from "../../auth/admin-route-registry";
import { AdminBreadcrumbs } from "./AdminBreadcrumbs";
import { AdminIaScaffoldNotice } from "./AdminIaScaffoldNotice";
import { AdminSidebar } from "./AdminSidebar";
import { signOutAdmin } from "../../app/admin/login/actions";
import type { AdminRouteId } from "../../auth/admin-route-registry";

export function AdminShell({
  children,
  visibleRouteIds,
  linkRouteIds
}: {
  children: ReactNode;
  visibleRouteIds: readonly AdminRouteId[];
  linkRouteIds: readonly AdminRouteId[];
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2" href="#admin-main">
        跳至主要內容
      </a>
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col md:flex-row">
        <aside className="border-b border-slate-200 bg-white px-4 py-5 md:sticky md:top-0 md:h-screen md:w-72 md:flex-none md:overflow-y-auto md:border-b-0 md:border-r">
          <div className="mb-6 flex items-center justify-between gap-2">
            <Link className="block rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-sky-500" href={ADMIN_CANONICAL_ROOT}>
              <span className="block text-xs font-black uppercase tracking-[0.16em] text-sky-700">TastKind / 好廚</span>
              <span className="mt-1 block text-lg font-bold text-slate-950">管理後台</span>
            </Link>
            <button
              aria-controls="admin-mobile-nav"
              aria-expanded={mobileNavOpen}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 md:hidden"
              onClick={() => setMobileNavOpen((value) => !value)}
              type="button"
            >
              {mobileNavOpen ? "收合選單" : "展開選單"}
            </button>
          </div>
          <div className={`${mobileNavOpen ? "block" : "hidden"} md:block`} id="admin-mobile-nav">
            <AdminSidebar visibleRouteIds={visibleRouteIds} linkRouteIds={linkRouteIds} />
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
            <AdminBreadcrumbs />
            <form action={signOutAdmin}>
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500" type="submit">登出</button>
            </form>
          </header>
          <main className="mx-auto max-w-6xl space-y-5 px-5 py-6 sm:px-8 sm:py-8" id="admin-main">
            <AdminIaScaffoldNotice />
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
