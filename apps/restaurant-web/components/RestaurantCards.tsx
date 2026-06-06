import type { ReactNode } from "react";

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">{children}</div>;
}

export function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card>
      <p className="text-sm font-semibold text-stone-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-stone-950">{value}</p>
      <p className="mt-2 text-sm text-stone-600">{note}</p>
    </Card>
  );
}

export function TagList({ tags }: { tags: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800" key={tag}>
          {tag}
        </span>
      ))}
    </div>
  );
}

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-stone-950">{title}</h2>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
