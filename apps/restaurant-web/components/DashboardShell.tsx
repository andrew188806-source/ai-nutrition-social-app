import Link from "next/link";
import type { ReactNode } from "react";
import { zhTW } from "../../../lib/i18n/zh-TW";

interface NavItem {
  href: string;
  label: string;
}

const navItems: NavItem[] = [
  { href: "/", label: zhTW.restaurant.overviewTitle },
  { href: "/profile", label: zhTW.restaurant.profileTitle },
  { href: "/menu", label: zhTW.restaurant.menuTitle },
  { href: "/verification", label: zhTW.restaurant.verificationTitle },
  { href: "/analytics", label: zhTW.restaurant.analyticsTitle },
  { href: "/vip", label: zhTW.restaurant.vipTitle }
];

export function DashboardShell({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-4 border-b border-stone-200 pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-amber-700">{zhTW.restaurant.platformHeader}</p>
          <p className="text-sm font-semibold text-teal-700">{zhTW.common.phaseBadge}</p>
          <h1 className="mt-2 text-3xl font-bold text-stone-900">{title}</h1>
          <p className="mt-2 max-w-2xl text-stone-600">{subtitle}</p>
        </div>
        <Link className="rounded-md bg-teal-700 px-4 py-3 text-center font-semibold text-white" href="/login">
          {zhTW.restaurant.navLogin}
        </Link>
      </header>
      <nav className="flex flex-wrap gap-3">
        {navItems.map((item) => (
          <Link className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800" href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">{children ?? zhTW.common.demoOnly}</section>
    </main>
  );
}
