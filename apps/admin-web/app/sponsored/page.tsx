import { mockSponsoredRecommendationReviews, mockSponsoredTagReviews } from "@haocu/shared";
import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard, GovernanceNote, statusText } from "../../components/GovernanceUi";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function SponsoredGovernancePage() {
  return (
    <AdminShell title={zhTW.adminPhase5.pages.sponsoredTitle} subtitle={zhTW.adminPhase5.pages.sponsoredSubtitle}>
      <div className="grid gap-5">
        <GovernanceNote>{zhTW.adminPhase5.copy.sponsored}</GovernanceNote>
        <CardGrid>
          {mockSponsoredRecommendationReviews.map((review) => (
            <DetailCard
              key={review.id}
              title={review.restaurantName}
              subtitle={review.sponsoredRecommendationId}
              items={[
                { label: zhTW.adminPhase5.labels.status, value: statusText(review.status), tone: review.status === "needs_changes" ? "warning" : "default" },
                { label: zhTW.adminPhase5.labels.tags, value: review.tagIds },
                { label: zhTW.adminPhase5.labels.sponsoredSeparated, value: review.organicTagsSeparated, tone: review.organicTagsSeparated ? "success" : "danger" }
              ]}
            />
          ))}
          {mockSponsoredTagReviews.map((review) => (
            <DetailCard
              key={review.id}
              title={review.tagId}
              subtitle={review.sponsoredRecommendationId}
              items={[
                { label: zhTW.adminPhase5.labels.status, value: statusText(review.status) },
                { label: zhTW.adminPhase5.labels.sponsoredLabel, value: review.isClearlySponsored ? zhTW.adminPhase5.booleans.visible : zhTW.adminPhase5.booleans.hidden, tone: review.isClearlySponsored ? "success" : "danger" }
              ]}
            />
          ))}
        </CardGrid>
      </div>
    </AdminShell>
  );
}
