import Link from "next/link";
import { Card, MetricCard, Section, StatusPill } from "../RestaurantCards";
import { getConsoleOverview } from "../../services/restaurantConsoleService";

export function DashboardHome() {
  const overview = getConsoleOverview();

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          href="/restaurant/analytics/exposure"
          label={overview.cards.cityExposure.title}
          note={`${overview.cards.cityExposure.growth} 較上月 · ${overview.cards.cityExposure.people}`}
          value={overview.cards.cityExposure.value}
        />
        <MetricCard
          href="/restaurant/analytics/nutrition-badge"
          label={overview.cards.nutritionBadge.title}
          note={`平均瀏覽 ${overview.cards.nutritionBadge.viewGrowth} · 加入訂單 ${overview.cards.nutritionBadge.addToCartGrowth}`}
          value={`${overview.cards.nutritionBadge.enabledCount} 道`}
        />
        <MetricCard
          href="/restaurant/menu/pending-items"
          label={overview.cards.pendingMenuItems.title}
          note={`本週新增 ${overview.cards.pendingMenuItems.weeklyNew} 筆 · 常見：${overview.cards.pendingMenuItems.topName}`}
          value={overview.cards.pendingMenuItems.count}
        />
        <MetricCard
          href="/restaurant/nutrition"
          label={overview.cards.pendingNutrition.title}
          note={`缺食材 ${overview.cards.pendingNutrition.missingIngredients} · 缺份量 ${overview.cards.pendingNutrition.missingPortion} · AI 異常 ${overview.cards.pendingNutrition.aiOutlier}`}
          value={overview.cards.pendingNutrition.review}
        />
      </div>

      <Card className="border-teal-100 bg-teal-50/70">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-teal-900">{overview.cards.cityExposure.body}</p>
            <p className="mt-1 text-sm leading-6 text-teal-800">加入訂單目前只呈現分析事件，不包含完整訂單流程。</p>
          </div>
          <Link className="rounded-md bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800" href="/restaurant/analytics/exposure">
            查看詳細成效
          </Link>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Section title="最近餐點表現">
          <Card>
            <div className="grid gap-3">
              {overview.recentPerformance.map((item) => (
                <div className="flex flex-col gap-2 rounded-md border border-stone-100 bg-stone-50 p-3 md:flex-row md:items-center md:justify-between" key={item.id}>
                  <div>
                    <p className="font-bold text-stone-950">{item.itemName}</p>
                    <p className="text-sm text-stone-500">{item.branchName}</p>
                  </div>
                  <div className="flex gap-2">
                    <StatusPill tone={item.viewGrowth >= 0 ? "good" : "bad"}>瀏覽 {item.viewGrowth}%</StatusPill>
                    <StatusPill tone={item.addToCartGrowth >= 0 ? "good" : "bad"}>加入訂單 {item.addToCartGrowth}%</StatusPill>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Section>

        <Section title="最近待處理事項">
          <Card>
            <div className="grid gap-3">
              {overview.recentTasks.map((task) => (
                <div className="rounded-md border border-stone-100 bg-white p-3" key={task.id}>
                  <p className="font-bold text-stone-900">{task.title}</p>
                  <p className="mt-1 text-sm text-stone-500">{task.meta}</p>
                </div>
              ))}
            </div>
          </Card>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Section title="分店營運摘要">
          <Card>
            <div className="grid gap-3 md:grid-cols-3">
              {overview.branchSummary.map((branch) => (
                <div className="rounded-md bg-stone-50 p-4" key={branch.id}>
                  <p className="font-bold text-stone-950">{branch.name}</p>
                  <p className="mt-2 text-sm text-stone-600">{branch.district}</p>
                  <p className="mt-3 text-sm font-bold text-teal-700">{branch.itemCount} 道餐點 · {branch.employees} 位人員</p>
                </div>
              ))}
            </div>
          </Card>
        </Section>

        <Section title="店務助手入口">
          <Card>
            <div className="grid gap-2">
              {overview.assistantSuggestions.map((suggestion) => (
                <Link className="rounded-md border border-stone-200 px-3 py-2 text-sm font-bold text-stone-700 hover:bg-stone-50" href="/restaurant/assistant" key={suggestion.id}>
                  {suggestion.prompt}
                </Link>
              ))}
            </div>
          </Card>
        </Section>
      </div>
    </>
  );
}
