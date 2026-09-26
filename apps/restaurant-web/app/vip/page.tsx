import { DeferredCapabilityNotice } from "../../components/runtime/DeferredCapabilityNotice";

// No VIP membership, member-agreement data or subscription capability exists yet; this route stays
// reachable but only states that the feature is not enabled.
export default function RestaurantVipPage() {
  return (
    <DeferredCapabilityNotice
      body="店家 VIP 會員與使用者同意資料功能尚未啟用。目前沒有任何會員、同意紀錄或會員洞察可供查看，也無法訂閱或購買 VIP 方案。"
      title="VIP 會員與同意資料"
    />
  );
}
