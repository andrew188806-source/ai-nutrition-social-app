"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Section, StatusPill } from "../RestaurantCards";
import { getAssistantConsoleData } from "../../services/restaurantConsoleService";

export function AssistantConsole() {
  const data = getAssistantConsoleData();
  const [prompt, setPrompt] = useState(data.suggestions[0]?.prompt ?? "");
  const [draftVisible, setDraftVisible] = useState(false);

  return (
    <>
      <Card>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input className="rounded-md border border-stone-300 px-3 py-3 text-sm" onChange={(event) => setPrompt(event.target.value)} value={prompt} />
          <button className="rounded-md bg-teal-700 px-5 py-3 text-sm font-bold text-white" onClick={() => setDraftVisible(true)}>
            產生草稿
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.suggestions.map((suggestion) => (
            <button className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-700" key={suggestion.id} onClick={() => setPrompt(suggestion.prompt)}>
              {suggestion.prompt}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Section title="待處理摘要">
          <Card>
            <div className="grid gap-3">
              <ResultLine title="待確認餐點" value={`${data.pendingItems.length} 筆`} href="/restaurant/menu/pending-items" />
              <ResultLine title="已停用但權限尚未移除" value={`${data.inactiveUsers.length} 筆`} href="/restaurant/staff" />
              <ResultLine title="最近審核紀錄" value={`${data.auditLogs.length} 筆`} href="/restaurant/settings" />
            </div>
          </Card>
        </Section>

        <Section title="操作導引">
          <Card>
            <ol className="grid gap-3 text-sm leading-6 text-stone-700">
              <li>1. 使用者下指令</li>
              <li>2. 產生操作草稿</li>
              <li>3. 顯示變更前後差異</li>
              <li>4. 管理者確認後才可執行</li>
            </ol>
          </Card>
        </Section>
      </div>

      {draftVisible ? (
        <Section title="產生的操作草稿" subtitle="目前只展示 UI 與 mock flow，不直接寫入正式資料。">
          <div className="grid gap-4">
            {data.drafts.map((draft) => (
              <Card key={draft.id}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="font-black text-stone-950">{draft.title}</h3>
                    <p className="mt-2 text-sm text-stone-500">來源問題：{prompt}</p>
                  </div>
                  <StatusPill tone="warn">等待管理者確認</StatusPill>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-md bg-rose-50 p-3 text-sm leading-6 text-rose-900">
                    <p className="font-bold">變更前</p>
                    <p>{draft.before}</p>
                  </div>
                  <div className="rounded-md bg-teal-50 p-3 text-sm leading-6 text-teal-900">
                    <p className="font-bold">變更後</p>
                    <p>{draft.after}</p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button className="rounded-md border border-stone-300 px-4 py-2 text-sm font-bold" onClick={() => setDraftVisible(false)}>
                    取消
                  </button>
                  <button className="rounded-md bg-stone-900 px-4 py-2 text-sm font-bold text-white">
                    管理者確認 mock
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function ResultLine({ title, value, href }: { title: string; value: string; href: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-stone-100 bg-stone-50 p-3">
      <div>
        <p className="font-bold text-stone-950">{title}</p>
        <p className="text-sm text-stone-500">{value}</p>
      </div>
      <Link className="rounded-md bg-white px-3 py-1.5 text-sm font-bold text-stone-700" href={href}>
        前往
      </Link>
    </div>
  );
}
