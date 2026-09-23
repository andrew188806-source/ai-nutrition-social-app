import { LegacyAdminGateway } from "../../components/LegacyAdminGateway";

export default function LegacyCompatibilityPage() {
  return <LegacyAdminGateway title="菜單審核" successors={[{ href: "/admin/restaurants", label: "餐廳" }, { href: "/admin/restaurants/menu-management/data-quality", label: "待補資料" }, { href: "/admin/nutrition/certification/pending", label: "營養認證待審" }]} />;
}
