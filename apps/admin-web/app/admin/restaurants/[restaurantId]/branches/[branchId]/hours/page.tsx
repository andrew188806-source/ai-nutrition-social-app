import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { FactList, ReadFailureNotice, ReadySection, dash, weekdayLabel } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readBranchHours, type HoursInterval } from "apps/admin-web/server/adminRestaurantRead";

const span = (i: HoursInterval) => `${i.start.slice(0, 5)}–${i.end.slice(0, 5)}${i.endDayOffset > 0 ? "（次日）" : ""}`;

export default createAdminOperationalPage<{ restaurantId: string; branchId: string }>("restaurant-branch-hours", async ({ params }) => {
  const result = await readBranchHours(params.restaurantId, params.branchId);
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description="分店設定的每週營業時間、特殊日期與尚未結束的休業（唯讀）。此頁只呈現已設定的資料，不推斷目前是否營業。" entry={getAdminRoute("restaurant-branch-hours")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : (
        <>
          <ReadySection label="營業時間設定">
            <FactList items={[{ label: "時區", value: dash(result.data.timezoneName) }, { label: "已設定每週營業時間", value: result.data.weeklyHoursConfigured ? "是" : "否" }]} />
          </ReadySection>
          <ReadySection label="每週營業時間">
            <h3 className="text-sm font-bold text-slate-950">每週營業時間</h3>
            {result.data.weekly.length === 0 ? <p className="mt-2 text-sm text-slate-500" data-b2-state="empty">尚未設定每週營業時間。</p> : (
              <ul className="mt-2 space-y-1 text-sm">{result.data.weekly.map((w, index) => <li key={`${w.weekday}-${index}`}><span className="inline-block w-16 font-bold">{weekdayLabel(w.weekday)}</span>{span(w)}</li>)}</ul>
            )}
          </ReadySection>
          <ReadySection label="特殊日期">
            <h3 className="text-sm font-bold text-slate-950">特殊日期（最多顯示 100 筆，最近日期在前）</h3>
            {result.data.special.length === 0 ? <p className="mt-2 text-sm text-slate-500" data-b2-state="empty">沒有特殊日期設定。</p> : (
              <ul className="mt-2 space-y-2 text-sm">{result.data.special.map((s) => <li key={s.localDate}><span className="font-bold">{s.localDate}</span>　{s.mode}{s.intervals.length ? `：${s.intervals.map(span).join("、")}` : ""}</li>)}</ul>
            )}
          </ReadySection>
          <ReadySection label="休業">
            <h3 className="text-sm font-bold text-slate-950">尚未結束的休業（最多 50 筆）</h3>
            {result.data.closures.length === 0 ? <p className="mt-2 text-sm text-slate-500" data-b2-state="empty">目前沒有進行中或即將開始的休業。</p> : (
              <ul className="mt-2 space-y-1 text-sm">{result.data.closures.map((c, index) => <li key={`${c.startsAt}-${index}`}>{c.startsAt} → {c.endsAt ?? "未定"}</li>)}</ul>
            )}
          </ReadySection>
        </>
      )}
    </article>
  );
});
