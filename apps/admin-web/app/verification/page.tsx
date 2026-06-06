import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard, riskText, statusText } from "../../components/GovernanceUi";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { mockVerificationReviews } from "@haocu/shared";

export default function AdminVerificationPage() {
  return (
    <AdminShell title={zhTW.adminPhase5.pages.verificationTitle} subtitle={zhTW.adminPhase5.pages.verificationSubtitle}>
      <CardGrid>
        {mockVerificationReviews.map((review) => (
          <DetailCard
            key={review.id}
            title={review.restaurantName}
            subtitle={zhTW.adminPhase5.pages.verificationSubtitle}
            items={[
              { label: zhTW.adminPhase5.labels.status, value: statusText(review.status), tone: review.status === "approved" ? "success" : "warning" },
              { label: zhTW.adminPhase5.labels.risk, value: riskText(review.riskLevel), tone: review.riskLevel === "high" ? "danger" : "default" },
              { label: zhTW.adminPhase5.labels.updatedAt, value: review.updatedAt }
            ]}
          />
        ))}
      </CardGrid>
    </AdminShell>
  );
}
