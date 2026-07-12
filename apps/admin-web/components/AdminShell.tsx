import Link from "next/link";
import type { ReactNode } from "react";
import { zhTW } from "../../../lib/i18n/zh-TW";

const navItems = [
  { href: "/", label: zhTW.adminPhase5.nav.overview },
  { href: "/verification", label: zhTW.adminPhase5.nav.verification },
  { href: "/menu-review", label: zhTW.adminPhase5.nav.menuReview },
  { href: "/restaurant-review", label: "Restaurant review" },
  { href: "/pending-menu-items", label: "Pending items" },
  { href: "/duplicate-menu-items", label: "Duplicates" },
  { href: "/alias-review", label: "Aliases" },
  { href: "/nutrition-review", label: "Nutrition" },
  { href: "/data-quality", label: "Data quality" },
  { href: "/ad-review", label: zhTW.adminPhase5.nav.ads },
  { href: "/sponsored", label: zhTW.adminPhase5.nav.sponsored },
  { href: "/esg", label: zhTW.adminPhase5.nav.esg },
  { href: "/data-access", label: zhTW.adminPhase5.nav.dataAccess },
  { href: "/consents", label: zhTW.adminPhase5.nav.consents },
  { href: "/audit-trail", label: zhTW.adminPhase5.nav.auditTrail },
  { href: "/tags", label: zhTW.adminPhase5.nav.tags },
  { href: "/social-governance", label: zhTW.adminPhase5.nav.social },
  { href: "/identification-audit", label: zhTW.adminPhase5.nav.identification },
  { href: "/self-cooked-audit", label: zhTW.adminPhase5.nav.selfCooked },
  { href: "/exercise-governance", label: zhTW.adminPhase5.nav.exercise },
  { href: "/settings", label: zhTW.adminPhase5.nav.settings }
];

export function AdminShell({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-amber-700">{zhTW.admin.platformHeader}</p>
          <p className="text-sm font-semibold text-sky-700">{zhTW.common.phaseBadge}</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">{title}</h1>
          <p className="mt-2 max-w-2xl text-slate-600">{subtitle}</p>
        </div>
        <Link className="rounded-md bg-sky-700 px-4 py-3 text-center font-semibold text-white" href="/login">
          {zhTW.admin.loginTitle}
        </Link>
      </header>
      <nav className="flex flex-wrap gap-3">
        {navItems.map((item) => (
          <Link className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800" href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">{children ?? zhTW.common.demoOnly}</section>
    </main>
  );
}
