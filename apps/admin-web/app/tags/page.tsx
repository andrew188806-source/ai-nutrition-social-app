import { LegacyAdminGateway } from "../../components/LegacyAdminGateway";

export default function LegacyCompatibilityPage() {
  return <LegacyAdminGateway title="標籤治理" successors={[{ href: "/admin/restaurants/menu-management/data-quality", label: "待補資料" }, { href: "/admin/social/policies", label: "社群政策" }]} unavailable="贊助內容的標籤審核仍未啟用。" />;
}
