import { Card, EmptyState, Section, StatusPill } from "../RestaurantCards";
import { getMenuConsoleData } from "../../services/restaurantConsoleService";

function nutritionTone(status: string) {
  if (status === "已審核") return "good";
  if (status === "AI 估算") return "warn";
  if (status === "待審核") return "neutral";
  return "muted";
}

export function MenuListPanel() {
  const data = getMenuConsoleData();

  return (
    <Section title="菜單列表" subtitle="營養標誌狀態顯示在餐點摘要內，詳細比較請至成效分析頁。">
      <div className="grid gap-4 lg:grid-cols-2">
        {data.items.length ? (
          data.items.map((item) => (
            <Card key={item.id}>
              <div className="flex gap-4">
                {item.photoUrl ? (
                  <img alt="" className="h-20 w-20 rounded-md object-cover" src={item.photoUrl} />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-md bg-stone-100 text-xs font-bold text-stone-400">無照片</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-black text-stone-950">{item.name}</h3>
                      <p className="mt-1 text-sm text-stone-500">{item.categoryName} · NT$ {item.price}</p>
                    </div>
                    <StatusPill tone={item.isAvailable ? "good" : "muted"}>{item.isAvailable ? "供應中" : "停售"}</StatusPill>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusPill tone={nutritionTone(item.badgeLabel)}>{item.badgeLabel}</StatusPill>
                    {item.badgeEnabled && item.viewGrowth !== undefined && item.addToCartGrowth !== undefined ? (
                      <StatusPill tone="good">瀏覽 +{item.viewGrowth}%｜加入訂單 +{item.addToCartGrowth}%</StatusPill>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-stone-600">{item.branchNames}</p>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <EmptyState title="目前沒有餐點" body="建立餐點後，營養標誌狀態會出現在這裡。" />
        )}
      </div>
    </Section>
  );
}
