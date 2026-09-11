import {
  ADMIN_AVAILABILITY_ZH_TW,
  type AdminAvailability
} from "../../auth/admin-route-registry";

const badgeClass: Readonly<Record<AdminAvailability, string>> = {
  LIVE: "border-emerald-200 bg-emerald-50 text-emerald-800",
  DEMO: "border-amber-200 bg-amber-50 text-amber-800",
  NOT_ENABLED: "border-slate-200 bg-slate-100 text-slate-600"
};

export function AdminAvailabilityBadge({ availability }: { availability: AdminAvailability }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${badgeClass[availability]}`}>
      {ADMIN_AVAILABILITY_ZH_TW[availability]}
    </span>
  );
}

