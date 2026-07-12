import { Card, Section, StatusPill } from "../RestaurantCards";
import { getMenuPerformance } from "../../services/restaurantConsoleService";

export function MenuPerformancePanel() {
  const rows = getMenuPerformance();

  return (
    <Section title="餐點表現" subtitle="加入訂單為 mock event 指標，不代表已建立完整訂單系統。">
      <Card className="overflow-x-auto">
        <table className="min-w-[860px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-stone-500">
            <tr className="border-b border-stone-200">
              <th className="py-3 pr-4">餐點</th>
              <th className="py-3 pr-4">瀏覽</th>
              <th className="py-3 pr-4">收藏</th>
              <th className="py-3 pr-4">加入訂單</th>
              <th className="py-3 pr-4">評分</th>
              <th className="py-3 pr-4">個人化推薦曝光</th>
              <th className="py-3 pr-4">營養標誌</th>
              <th className="py-3 pr-4">分店供應</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b border-stone-100" key={row.id}>
                <td className="py-3 pr-4">
                  <p className="font-bold text-stone-950">{row.name}</p>
                  <p className="text-xs text-stone-500">{row.categoryName}</p>
                </td>
                <td className="py-3 pr-4">{row.views}</td>
                <td className="py-3 pr-4">{row.favorites}</td>
                <td className="py-3 pr-4">{row.addToCart}</td>
                <td className="py-3 pr-4">{row.rating}</td>
                <td className="py-3 pr-4">{row.personalizedExposure}</td>
                <td className="py-3 pr-4"><StatusPill tone={row.badgeEnabled ? "good" : "warn"}>{row.badgeLabel}</StatusPill></td>
                <td className="py-3 pr-4">{row.isAvailable ? row.branchNames : "部分分店停售"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Section>
  );
}
