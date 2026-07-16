"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { consoleNavItems } from "../data/navigation";
import { signOutRestaurant } from "../app/login/actions";

function isActive(pathname: string, href: string) {
  if (href === "/restaurant") return pathname === "/restaurant" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardShell({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  const pathname = usePathname();
  const regularItems = consoleNavItems.filter((item) => !item.phaseTwo);
  const phaseTwoItem = consoleNavItems.find((item) => item.phaseTwo);

  return (
    <div className="min-h-screen bg-[#f8f5ee] text-stone-900">
      <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col lg:flex-row">
        <aside className="flex border-b border-stone-200 bg-white/95 px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:flex-col lg:border-b-0 lg:border-r">
          <div className="min-w-52">
            <p className="text-xs font-black uppercase tracking-wide text-amber-700">TastKind</p>
            <h1 className="mt-1 text-lg font-black text-stone-950">好廚店家後台</h1>
            <p className="mt-1 text-xs font-semibold text-teal-700">Restaurant Web Console</p>
          </div>

          <nav className="ml-4 flex gap-2 overflow-x-auto lg:ml-0 lg:mt-8 lg:flex-1 lg:flex-col lg:overflow-visible">
            {regularItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <div key={item.href}>
                  <Link
                    className={`flex min-w-max items-center justify-between rounded-md px-3 py-2 text-sm font-bold transition ${
                      active ? "bg-teal-700 text-white" : "text-stone-700 hover:bg-stone-100"
                    }`}
                    href={item.href}
                  >
                    <span>{item.label}</span>
                  </Link>
                  {item.children && active ? (
                    <div className="mt-1 hidden pl-3 lg:grid lg:gap-1">
                      {item.children.map((child) => {
                        const childActive = pathname === child.href;
                        return (
                          <Link
                            className={`rounded-md px-3 py-1.5 text-xs font-bold ${
                              childActive ? "bg-amber-50 text-amber-800" : "text-stone-500 hover:bg-stone-50 hover:text-stone-800"
                            }`}
                            href={child.href}
                            key={child.href}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>

          {phaseTwoItem ? (
            <Link
              className={`mt-3 hidden rounded-md border border-dashed border-stone-300 px-3 py-3 text-sm font-bold lg:block ${
                isActive(pathname, phaseTwoItem.href) ? "bg-stone-100 text-stone-600" : "text-stone-400 hover:bg-stone-50"
              }`}
              href={phaseTwoItem.href}
            >
              <span className="block">{phaseTwoItem.label}</span>
              <span className="mt-1 inline-flex rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-600">第二階段</span>
            </Link>
          ) : null}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-stone-200 bg-[#f8f5ee]/90 px-5 py-5 backdrop-blur md:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-stone-500">第一階段店家後台</p>
                <h2 className="mt-1 text-2xl font-black text-stone-950 md:text-3xl">{title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">{subtitle}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:bg-stone-50" href="/restaurant/assistant">
                  店務助手
                </Link>
                <form action={signOutRestaurant}>
                  <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800" type="submit">登出</button>
                </form>
              </div>
            </div>
          </header>
          <main className="flex-1 px-5 py-6 md:px-8">
            <div className="mx-auto flex max-w-6xl flex-col gap-6">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
