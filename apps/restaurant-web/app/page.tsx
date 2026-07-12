import { DashboardShell } from "../components/DashboardShell";
import { DashboardHome } from "../components/dashboard/DashboardHome";

export default function RestaurantOverviewPage() {
  return (
    <DashboardShell title="首頁" subtitle="掌握曝光、營養標誌、待確認餐點與分店營運摘要。">
      <DashboardHome />
    </DashboardShell>
  );
}
