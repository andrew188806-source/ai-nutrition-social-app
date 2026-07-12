"use client";

import { useMemo, useState } from "react";
import { Card, EmptyState, ErrorState, Section, StatusPill } from "../RestaurantCards";
import { getExposureAnalytics } from "../../services/restaurantConsoleService";

export function ExposureAnalyticsPanel() {
  const [branchId, setBranchId] = useState("all");
  const [dateRange, setDateRange] = useState("30d");
  const [query, setQuery] = useState("");
  const data = useMemo(() => getExposureAnalytics(branchId, dateRange), [branchId, dateRange]);
  const rows = data.bySource.filter((row) => row.label.includes(query.trim()));

  return (
    <>
      <Card>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <input
            className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋曝光來源"
            value={query}
          />
          <select className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" onChange={(event) => setBranchId(event.target.value)} value={branchId}>
            <option value="all">全部分店</option>
            {data.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <select className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" onChange={(event) => setDateRange(event.target.value)} value={dateRange}>
            <option value="7d">近 7 天</option>
            <option value="30d">近 30 天</option>
            <option value="90d">近 90 天</option>
          </select>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <p className="text-sm font-bold text-stone-500">總曝光</p>
          <p className="mt-2 text-3xl font-black text-stone-950">{data.totals.impressions.toLocaleString("zh-TW")}</p>
        </Card>
        <Card>
          <p className="text-sm font-bold text-stone-500">點擊率</p>
          <p className="mt-2 text-3xl font-black text-stone-950">{data.totals.impressions ? ((data.totals.clicks / data.totals.impressions) * 100).toFixed(1) : "0.0"}%</p>
        </Card>
        <Card>
          <p className="text-sm font-bold text-stone-500">店家頁瀏覽數</p>
          <p className="mt-2 text-3xl font-black text-stone-950">{data.totals.storePageViews.toLocaleString("zh-TW")}</p>
        </Card>
        <Card>
          <p className="text-sm font-bold text-stone-500">新使用者觸及數</p>
          <p className="mt-2 text-3xl font-black text-stone-950">{data.totals.newUserReach.toLocaleString("zh-TW")}</p>
        </Card>
      </div>

      <Section title="曝光來源圖表" subtitle="mock data 已按分店、日期區間與來源拆分，後續可由 Supabase query 替換。">
        <Card>
          {rows.length ? (
            <div className="grid gap-4">
              {rows.map((row) => (
                <div key={row.source}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-stone-950">{row.label}</p>
                      <p className="text-sm text-stone-500">{row.impressions.toLocaleString("zh-TW")} 次曝光 · CTR {row.ctr}%</p>
                    </div>
                    <StatusPill tone="neutral">{row.percentage}%</StatusPill>
                  </div>
                  <div className="mt-2 h-3 rounded-full bg-stone-100">
                    <div className="h-3 rounded-full bg-teal-600" style={{ width: `${row.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="沒有符合的曝光來源" body="請調整搜尋字詞、日期或分店篩選。" />
          )}
        </Card>
      </Section>

      {data.records.length === 0 ? <ErrorState title="篩選後暫無資料" body="目前 mock dataset 沒有這個分店與日期區間的組合。" /> : null}
    </>
  );
}
