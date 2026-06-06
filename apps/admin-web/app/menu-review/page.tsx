import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard, GovernanceNote, statusText } from "../../components/GovernanceUi";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { mockMenuItemReviews } from "@haocu/shared";

export default function AdminMenuReviewPage() {
  return (
    <AdminShell title={zhTW.adminPhase5.pages.menuTitle} subtitle={zhTW.adminPhase5.pages.menuSubtitle}>
      <div className="grid gap-5">
        <GovernanceNote>{zhTW.adminPhase5.copy.riskyKeywords}</GovernanceNote>
        <CardGrid>
          {mockMenuItemReviews.map((review) => (
            <DetailCard
              key={review.id}
              title={review.menuItemName}
              subtitle={review.restaurantName}
              items={[
                { label: zhTW.adminPhase5.labels.status, value: statusText(review.status), tone: review.status === "needs_changes" ? "warning" : "default" },
                { label: zhTW.adminPhase5.nav.menuReview, value: statusText(review.nutritionDisclosureStatus) },
                { label: zhTW.adminPhase5.labels.riskyKeyword, value: review.riskyClaimFlagIds.length, tone: review.riskyClaimFlagIds.length > 0 ? "danger" : "success" }
              ]}
            />
          ))}
        </CardGrid>
      </div>
    </AdminShell>
  );
}
