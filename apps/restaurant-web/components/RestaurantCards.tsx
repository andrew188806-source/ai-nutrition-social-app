import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-stone-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function MetricCard({ label, value, note, href }: { label: string; value: string | number; note: string; href?: string }) {
  return (
    <Card>
      <p className="text-sm font-semibold text-stone-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-stone-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-stone-600">{note}</p>
      {href ? (
        <a className="mt-4 inline-flex rounded-md bg-teal-700 px-3 py-2 text-sm font-bold text-white hover:bg-teal-800" href={href}>
          查看
        </a>
      ) : null}
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

export function Section({ title, subtitle, children, action }: { title: string; subtitle?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-stone-950">{title}</h2>
          {subtitle ? <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "muted" }) {
  const tones = {
    neutral: "border-stone-200 bg-stone-50 text-stone-700",
    good: "border-teal-100 bg-teal-50 text-teal-800",
    warn: "border-amber-100 bg-amber-50 text-amber-800",
    bad: "border-rose-100 bg-rose-50 text-rose-800",
    muted: "border-stone-200 bg-stone-100 text-stone-500"
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center">
      <p className="font-bold text-stone-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-stone-600">{body}</p>
    </div>
  );
}

export function ErrorState({ title = "資料暫時無法載入", body = "請稍後再試，或切換篩選條件重新整理。" }: { title?: string; body?: string }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
      <p className="font-bold">{title}</p>
      <p>{body}</p>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="grid gap-3">
      {[0, 1, 2].map((item) => (
        <div className="h-16 animate-pulse rounded-lg bg-stone-100" key={item} />
      ))}
    </div>
  );
}
