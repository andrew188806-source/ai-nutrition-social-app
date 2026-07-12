import { DashboardShell } from "../../../components/DashboardShell";
import { Card, Section, StatusPill } from "../../../components/RestaurantCards";
import { getMenuConsoleData, getNutritionQueue } from "../../../services/restaurantConsoleService";

export default function NutritionPage() {
  const data = getMenuConsoleData();
  const queue = getNutritionQueue();
  return (
    <DashboardShell title="營養管理" subtitle="管理營養資料審核、缺少食材、缺少份量與 AI 估算異常。">
      <Section title="待處理營養資料">
        <div className="grid gap-4">
          {queue.map((nutrition) => {
            const item = data.items.find((menuItem) => menuItem.id === nutrition.menuItemId);
            return (
              <Card key={nutrition.id}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="font-black text-stone-950">{item?.name ?? "未知餐點"}</h3>
                    <p className="mt-1 text-sm text-stone-500">熱量 {nutrition.calories ?? "未填"} · 蛋白質 {nutrition.protein ?? "未填"}</p>
                  </div>
                  <StatusPill tone={nutrition.ingredientsStatus === "ai_outlier" ? "bad" : "warn"}>{statusCopy[nutrition.ingredientsStatus]}</StatusPill>
                </div>
              </Card>
            );
          })}
        </div>
      </Section>
    </DashboardShell>
  );
}

const statusCopy = {
  complete: "完整",
  missing_ingredients: "缺少食材",
  missing_portion: "缺少份量",
  ai_outlier: "AI 估算異常",
  pending_review: "待審核"
};
