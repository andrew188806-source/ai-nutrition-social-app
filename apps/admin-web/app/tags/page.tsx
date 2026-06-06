import { mockRiskyKeywordFlags, mockSocialIntentTagReviews, mockSponsoredTagReviews, mockTagReviews } from "@haocu/shared";
import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard, GovernanceNote, riskText, statusText } from "../../components/GovernanceUi";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function TagGovernancePage() {
  return (
    <AdminShell title={zhTW.adminPhase5.pages.tagTitle} subtitle={zhTW.adminPhase5.pages.tagSubtitle}>
      <div className="grid gap-5">
        <GovernanceNote>{zhTW.adminPhase5.copy.riskyKeywords}</GovernanceNote>
        <CardGrid>
          {mockTagReviews.map((review) => (
            <DetailCard
              key={review.id}
              title={review.tagId}
              subtitle={review.category}
              items={[
                { label: zhTW.adminPhase5.labels.status, value: statusText(review.status) },
                { label: zhTW.adminPhase5.labels.risk, value: riskText(review.riskLevel), tone: review.riskLevel === "medium" ? "warning" : "success" }
              ]}
            />
          ))}
          {mockSponsoredTagReviews.map((review) => (
            <DetailCard
              key={review.id}
              title={review.tagId}
              subtitle={zhTW.adminPhase5.nav.sponsored}
              items={[
                { label: zhTW.adminPhase5.labels.status, value: statusText(review.status) },
                { label: zhTW.adminPhase5.labels.sponsoredLabel, value: review.isClearlySponsored ? zhTW.adminPhase5.booleans.visible : zhTW.adminPhase5.booleans.hidden, tone: review.isClearlySponsored ? "success" : "danger" }
              ]}
            />
          ))}
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
          {mockRiskyKeywordFlags.map((flag) => (
            <DetailCard
              key={flag.id}
              title={flag.keyword}
              subtitle={flag.entityType}
              items={[
                { label: zhTW.adminPhase5.labels.risk, value: riskText(flag.riskLevel), tone: "danger" },
                { label: zhTW.adminPhase5.labels.riskyKeyword, value: flag.keyword }
              ]}
            />
          ))}
        </CardGrid>
      </div>
    </AdminShell>
  );
}
