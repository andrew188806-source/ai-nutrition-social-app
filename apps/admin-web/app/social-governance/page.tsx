import { mockRelationshipStatusReviews, mockRestaurantSocialMatchReviews, mockSocialIntentTagReviews } from "@haocu/shared";
import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard, GovernanceNote, riskText, statusText } from "../../components/GovernanceUi";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function SocialGovernancePage() {
  return (
    <AdminShell title={zhTW.adminPhase5.pages.socialTitle} subtitle={zhTW.adminPhase5.pages.socialSubtitle}>
      <div className="grid gap-5">
        <GovernanceNote>{zhTW.adminPhase5.copy.socialPrivacy}</GovernanceNote>
        <CardGrid>
          {mockSocialIntentTagReviews.map((review) => (
            <DetailCard
              key={review.id}
              title={review.tagId}
              subtitle={zhTW.adminPhase5.nav.social}
              items={[
                { label: zhTW.adminPhase5.labels.status, value: statusText(review.status) },
                { label: zhTW.adminPhase5.labels.risk, value: riskText(review.datingFirstRisk), tone: review.datingFirstRisk === "medium" ? "warning" : "success" }
              ]}
            />
          ))}
          {mockRelationshipStatusReviews.map((review) => (
            <DetailCard
              key={review.id}
              title={review.settingId}
              subtitle={zhTW.adminPhase5.labels.privacy}
              items={[
                { label: zhTW.adminPhase5.labels.status, value: statusText(review.status) },
                { label: zhTW.adminPhase5.labels.privacy, value: review.privacyControlled, tone: review.privacyControlled ? "success" : "danger" }
              ]}
            />
          ))}
          {mockRestaurantSocialMatchReviews.map((review) => (
            <DetailCard
              key={review.id}
              title={review.restaurantName}
              subtitle={zhTW.adminPhase5.labels.restaurant}
              items={[
                { label: zhTW.adminPhase5.labels.status, value: statusText(review.status) },
                { label: zhTW.adminPhase5.labels.privacyRespected, value: review.respectsPrivacySettings, tone: review.respectsPrivacySettings ? "success" : "danger" },
                { label: zhTW.adminPhase5.labels.visibleUsers, value: review.visibleUserCount }
              ]}
            />
          ))}
        </CardGrid>
      </div>
    </AdminShell>
  );
}
