import { DashboardShell } from "../../../../components/DashboardShell";
import { ExposureAnalyticsPanel } from "../../../../components/analytics/ExposureAnalyticsPanel";

export default function ExposureAnalyticsPage() {
  return (
    <DashboardShell title="曝光來源" subtitle="查看總曝光、我的城市曝光、AI 推薦、搜尋、飯友配對、收藏回訪與店家頁直接瀏覽。">
      <ExposureAnalyticsPanel />
    </DashboardShell>
  );
}
