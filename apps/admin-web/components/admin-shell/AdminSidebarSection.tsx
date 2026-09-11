"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminAvailabilityBadge } from "./AdminAvailabilityBadge";
import type { AdminScaffoldNavigationNode } from "./admin-ia-navigation";

export function AdminSidebarSection({
  node,
  activeIds,
  currentId,
  separated = false,
  depth = 0
}: {
  node: AdminScaffoldNavigationNode;
  activeIds: ReadonlySet<string>;
  currentId: string | null;
  separated?: boolean;
  depth?: number;
}) {
  const active = activeIds.has(node.id);
  const [expanded, setExpanded] = useState(active || depth === 0);
  const hasChildren = node.children.length > 0;
  return (
    <li className={separated ? "mt-4 border-t border-slate-200 pt-4" : undefined}>
      <div className={`flex items-center gap-1 rounded-lg ${active ? "bg-sky-50" : "hover:bg-slate-50"}`}>
        <Link
          aria-current={currentId === node.id ? "page" : undefined}
          className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500 ${active ? "text-sky-800" : "text-slate-700"}`}
          href={node.href}
        >
          <span className="block truncate">{node.label}</span>
        </Link>
        {depth > 0 ? <AdminAvailabilityBadge availability={node.availability} /> : null}
        {hasChildren ? (
          <button
            aria-expanded={expanded}
            aria-label={`${expanded ? "收合" : "展開"}${node.label}`}
            className="mr-1 rounded p-2 text-slate-500 hover:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            <span aria-hidden="true">{expanded ? "−" : "+"}</span>
          </button>
        ) : null}
      </div>
      {hasChildren && expanded ? (
        <ul className="ml-3 mt-1 space-y-1 border-l border-slate-200 pl-2">
          {node.children.map((child) => (
            <AdminSidebarSection activeIds={activeIds} currentId={currentId} depth={depth + 1} key={child.id} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
