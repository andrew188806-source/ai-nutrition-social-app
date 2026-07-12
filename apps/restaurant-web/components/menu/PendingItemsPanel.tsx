"use client";

import { useMemo, useState } from "react";
import { Card, EmptyState, Section, StatusPill } from "../RestaurantCards";
import { getMenuConsoleData, getPendingMenuItems, pendingStatusLabels } from "../../services/restaurantConsoleService";

type PendingItem = ReturnType<typeof getPendingMenuItems>[number];

export function PendingItemsPanel() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [activeItem, setActiveItem] = useState<PendingItem | null>(null);
  const [mockResult, setMockResult] = useState("");
  const items = getPendingMenuItems();
  const menu = getMenuConsoleData();

  const filteredItems = useMemo(() => {
    return items
      .filter((item) => status === "all" || item.status === status)
      .filter((item) => item.userInputName.includes(query.trim()) || item.branchName.includes(query.trim()));
  }, [items, query, status]);

  return (
    <>
      <Card>
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <input className="rounded-md border border-stone-300 px-3 py-2 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="搜尋使用者輸入名稱或分店" value={query} />
          <select className="rounded-md border border-stone-300 px-3 py-2 text-sm" onChange={(event) => setStatus(event.target.value)} value={status}>
            <option value="all">全部狀態</option>
            {Object.entries(pendingStatusLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Section title="待確認餐點">
        <div className="grid gap-4">
          {filteredItems.length ? (
            filteredItems.map((item) => (
              <Card key={item.id}>
                <div className="grid gap-4 lg:grid-cols-[120px_1fr]">
                  {item.photoUrl ? (
                    <img alt="" className="h-28 w-full rounded-md object-cover lg:w-28" src={item.photoUrl} />
                  ) : (
                    <div className="flex h-28 items-center justify-center rounded-md bg-stone-100 text-sm font-bold text-stone-400">無照片</div>
                  )}
                  <div>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-lg font-black text-stone-950">{item.userInputName}</h3>
                        <p className="mt-1 text-sm text-stone-500">{item.restaurantName} · {item.branchName} · 出現 {item.occurrenceCount} 次</p>
                      </div>
                      <StatusPill tone={item.status === "pending" ? "warn" : item.status === "rejected" ? "bad" : "neutral"}>{item.statusLabel}</StatusPill>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <Info label="最近出現" value={new Date(item.lastSeenAt).toLocaleString("zh-TW")} />
                      <Info label="AI 推測分類" value={item.aiCategoryGuess} />
                      <Info label="可能對應" value={item.suggestedItemName} />
                      <Info label="相似度" value={`${Math.round(item.similarity * 100)}%`} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button className="rounded-md bg-teal-700 px-3 py-2 text-sm font-bold text-white hover:bg-teal-800" onClick={() => setActiveItem(item)}>
                        對應現有餐點
                      </button>
                      <a className="rounded-md border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700 hover:bg-stone-50" href={`/restaurant/menu/items/new?pending=${item.id}`}>
                        建立新餐點
                      </a>
                      <button className="rounded-md border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700" onClick={() => setMockResult(`${item.userInputName} 已標記為停售餐點草稿`)}>
                        標記為停售餐點
                      </button>
                      <button className="rounded-md border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700" onClick={() => setMockResult(`${item.userInputName} 已標記為非本店餐點草稿`)}>
                        標記為非本店餐點
                      </button>
                      <button className="rounded-md border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700" onClick={() => setMockResult(`${item.userInputName} 已暫時忽略`)}>
                        暫時忽略
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <EmptyState title="沒有符合條件的待確認餐點" body="請調整搜尋或狀態篩選。" />
          )}
        </div>
      </Section>

      {mockResult ? <Card className="border-teal-100 bg-teal-50 text-sm font-bold text-teal-900">{mockResult}，並留下操作者、操作時間、處理結果與備註。</Card> : null}

      {activeItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-stone-950">對應現有餐點</h3>
                <p className="mt-1 text-sm text-stone-600">{activeItem.userInputName} · AI 建議：{activeItem.suggestedItemName}</p>
              </div>
              <button className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-bold" onClick={() => setActiveItem(null)}>
                關閉
              </button>
            </div>

            <input className="mt-5 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" placeholder="搜尋目前菜單餐點" />
            <div className="mt-4 grid gap-2">
              {menu.items.slice(0, 4).map((item) => (
                <label className="flex items-center justify-between gap-3 rounded-md border border-stone-200 p-3" key={item.id}>
                  <span>
                    <span className="block font-bold text-stone-900">{item.name}</span>
                    <span className="text-sm text-stone-500">{item.categoryName} · {item.branchNames}</span>
                  </span>
                  <input name="match-item" type="radio" />
                </label>
              ))}
            </div>
            <textarea className="mt-4 min-h-24 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" placeholder="處理備註" />
            <div className="mt-4 rounded-md bg-stone-50 p-3 text-sm leading-6 text-stone-600">
              操作者：林敏娜 · 操作時間：{new Date().toLocaleString("zh-TW")} · 處理結果：儲存為對應草稿
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-md border border-stone-300 px-4 py-2 text-sm font-bold" onClick={() => setActiveItem(null)}>
                取消
              </button>
              <button
                className="rounded-md bg-teal-700 px-4 py-2 text-sm font-bold text-white"
                onClick={() => {
                  setMockResult(`${activeItem.userInputName} 已儲存為對應草稿`);
                  setActiveItem(null);
                }}
              >
                儲存草稿
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-stone-50 p-3">
      <p className="text-xs font-bold text-stone-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-stone-900">{value}</p>
    </div>
  );
}
