import { DashboardShell } from "../../../../components/DashboardShell";
import { MenuPerformancePanel } from "../../../../components/analytics/MenuPerformancePanel";

export default function MenuPerformancePage() {
  return (
    <DashboardShell title="餐點表現" subtitle="整理餐點瀏覽、收藏、加入訂單 mock event、使用者評分、推薦曝光與分店供應狀態。">
      <MenuPerformancePanel />
    </DashboardShell>
  );
}
