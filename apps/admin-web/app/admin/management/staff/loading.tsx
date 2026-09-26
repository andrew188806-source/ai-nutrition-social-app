export default function StaffLoading() {
  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10">
      <p className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500" data-staff-roster-state="loading" role="status">
        正在讀取人員資料…
      </p>
    </main>
  );
}
