import { DeferredCapabilityNotice } from "../../components/runtime/DeferredCapabilityNotice";

// No Restaurant verification submission or review capability exists yet; this route stays
// reachable but shows no submission, review status or badge.
export default function RestaurantVerificationPage() {
  return (
    <DeferredCapabilityNotice
      body="店家藍勾勾驗證的申請與審核流程尚未啟用。目前無法提交驗證資料，也沒有任何送審或審核狀態。"
      title="藍勾勾驗證"
    />
  );
}
