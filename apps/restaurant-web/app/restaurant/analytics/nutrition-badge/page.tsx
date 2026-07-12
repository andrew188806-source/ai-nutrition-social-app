import { DashboardShell } from "../../../../components/DashboardShell";
import { NutritionBadgeComparisonPanel } from "../../../../components/analytics/NutritionBadgeComparisonPanel";

export default function NutritionBadgeAnalyticsPage() {
  return (
    <DashboardShell title="營養標誌成效" subtitle="以加入標誌前後比較呈現觀察到的變化，不宣稱標誌必然造成成長。">
      <NutritionBadgeComparisonPanel />
    </DashboardShell>
  );
}
