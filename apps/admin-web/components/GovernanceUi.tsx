import { zhTW } from "../../../lib/i18n/zh-TW";
import type { ReactNode } from "react";

export type DetailItem = {
  label: string;
  value: string | number | boolean | string[];
  tone?: "default" | "success" | "warning" | "danger" | "sponsored";
};

export function MetricGrid({ items }: { items: ReadonlyArray<{ label: string; value: string; note: string }> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" key={item.label}>
          <p className="text-sm font-semibold text-slate-500">{item.label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{item.value}</p>
          <p className="mt-2 text-sm text-slate-600">{item.note}</p>
        </article>
      ))}
    </div>
  );
}

export function GovernanceNote({ children }: { children: string }) {
  return <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">{children}</p>;
}

export function DetailCard({ title, subtitle, items }: { title: string; subtitle?: string; items: ReadonlyArray<DetailItem> }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        {subtitle ? <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p> : null}
      </div>
      <dl className="mt-4 grid gap-3">
        {items.map((item) => (
          <div className="grid gap-1 rounded-md bg-slate-50 p-3" key={`${title}-${item.label}`}>
            <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{item.label}</dt>
            <dd className={valueClassName(item.tone)}>{formatValue(item.value)}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 lg:grid-cols-2">{children}</div>;
}

export function Checklist({ items }: { items: readonly string[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <li className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700" key={item}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function statusText(status: keyof typeof zhTW.adminPhase5.status) {
  return zhTW.adminPhase5.status[status];
}

export function riskText(risk: keyof typeof zhTW.adminPhase5.risk) {
  return zhTW.adminPhase5.risk[risk];
}

export function confidenceText(confidence: keyof typeof zhTW.adminPhase5.confidence) {
  return zhTW.adminPhase5.confidence[confidence];
}

function formatValue(value: DetailItem["value"]) {
  if (Array.isArray(value)) {
    return value.join(" / ");
  }

  if (typeof value === "boolean") {
    return value ? zhTW.adminPhase5.booleans.yes : zhTW.adminPhase5.booleans.no;
  }

  return String(value);
}

function valueClassName(tone: DetailItem["tone"]) {
  const base = "text-sm font-semibold leading-6";
  if (tone === "success") return `${base} text-emerald-700`;
  if (tone === "warning") return `${base} text-amber-700`;
  if (tone === "danger") return `${base} text-rose-700`;
  if (tone === "sponsored") return `${base} text-violet-700`;
  return `${base} text-slate-900`;
}
