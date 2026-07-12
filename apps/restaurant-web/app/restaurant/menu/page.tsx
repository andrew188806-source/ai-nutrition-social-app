import { DashboardShell } from "../../../components/DashboardShell";
import { MenuListPanel } from "../../../components/menu/MenuListPanel";

export default function RestaurantMenuPage() {
  return (
    <DashboardShell title="菜單管理" subtitle="管理菜單、餐點與營養標誌狀態，詳細成效仍集中在分析頁。">
      <MenuListPanel />
    </DashboardShell>
  );
}
