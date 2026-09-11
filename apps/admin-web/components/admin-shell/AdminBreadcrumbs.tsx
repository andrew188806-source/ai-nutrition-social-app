"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getAdminBreadcrumbs } from "./admin-ia-navigation";

export function AdminBreadcrumbs() {
  const pathname = usePathname();
  const items = getAdminBreadcrumbs(pathname);
  if (items.length === 0) return null;
  return (
    <nav aria-label="麵包屑" className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-2 text-sm text-slate-500">
        {items.map((item, index) => (
          <li className="flex items-center gap-2" key={item.id}>
            {index > 0 ? <span aria-hidden="true" className="text-slate-300">/</span> : null}
            {item.current || item.href === null ? (
              <span aria-current={item.current ? "page" : undefined} className={item.current ? "font-semibold text-slate-900" : undefined}>
                {item.label}
              </span>
            ) : (
              <Link className="rounded hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500" href={item.href}>
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

