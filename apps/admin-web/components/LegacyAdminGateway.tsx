import Link from "next/link";

type Successor = Readonly<{ href: string; label: string }>;

export function LegacyAdminGateway({
  title,
  successors = [],
  unavailable
}: Readonly<{ title: string; successors?: readonly Successor[]; unavailable?: string }>) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
      <p className="mt-4 text-slate-700">
        此舊版管理頁面已停止提供資料。請使用下列正式管理功能；存取權限由各正式頁面驗證。
      </p>
      {successors.length > 0 && (
        <ul className="mt-6 space-y-3">
          {successors.map(({ href, label }) => (
            <li key={href}>
              <Link className="text-sky-700 underline" href={href}>{label}</Link>
            </li>
          ))}
        </ul>
      )}
      {unavailable && <p className="mt-6 rounded border border-amber-300 bg-amber-50 p-4 text-slate-800">{unavailable}</p>}
      <p className="mt-8"><Link className="text-sky-700 underline" href="/admin">返回正式管理介面</Link></p>
    </main>
  );
}
