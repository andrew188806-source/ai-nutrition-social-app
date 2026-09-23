import { LegacyAdminGateway } from "../../components/LegacyAdminGateway";

export default function LegacyCompatibilityPage() {
  return <LegacyAdminGateway title="餐廳審核" successors={[{ href: "/admin/restaurants", label: "餐廳與分店" }]} unavailable="餐廳審核佇列仍未啟用；分店狀態請從正式餐廳與分店詳情頁進入。" />;
}
