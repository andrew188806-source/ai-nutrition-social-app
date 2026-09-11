import type { AdminRouteDefinition } from "../../auth/admin-route-registry";
import { AdminAvailabilityBadge } from "./AdminAvailabilityBadge";

export function AdminWorkspaceHeader({ entry, description }: { entry: AdminRouteDefinition; description: string }) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-700">{entry.internalName}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{entry.zhTWLabel}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <AdminAvailabilityBadge availability={entry.availability} />
    </header>
  );
}

