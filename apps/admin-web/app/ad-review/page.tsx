import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard, GovernanceNote, statusText } from "../../components/GovernanceUi";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { mockAdReviews, mockRiskyKeywordFlags } from "@haocu/shared";

export default function AdminAdReviewPage() {
  return (
    <AdminShell title={zhTW.adminPhase5.pages.adTitle} subtitle={zhTW.adminPhase5.pages.adSubtitle}>
      <div className="grid gap-5">
        <GovernanceNote>{zhTW.adminPhase5.copy.sponsored}</GovernanceNote>
        <CardGrid>
          {mockAdReviews.map((review) => (
            <DetailCard
              key={review.id}
              title={review.creativeTitle}
              subtitle={review.advertiserName}
              items={[
                { label: zhTW.adminPhase5.labels.status, value: statusText(review.status), tone: review.status === "needs_changes" ? "danger" : "default" },
                { label: zhTW.adminPhase5.labels.sponsoredLabel, value: review.sponsoredLabelVisible ? zhTW.adminPhase5.booleans.visible : zhTW.adminPhase5.booleans.hidden, tone: review.sponsoredLabelVisible ? "success" : "danger" },
                { label: zhTW.adminPhase5.labels.riskyKeyword, value: review.riskyClaimFlagIds.length, tone: review.riskyClaimFlagIds.length > 0 ? "danger" : "success" }
              ]}
            />
          ))}
          {mockRiskyKeywordFlags.map((flag) => (
            <DetailCard
              key={flag.id}
              title={flag.keyword}
              subtitle={zhTW.adminPhase5.copy.riskyKeywords}
              items={[
                { label: zhTW.adminPhase5.labels.risk, value: zhTW.adminPhase5.risk[flag.riskLevel], tone: "danger" },
                { label: zhTW.adminPhase5.labels.riskyKeyword, value: flag.keyword }
              ]}
            />
          ))}
        </CardGrid>
      </div>
    </AdminShell>
  );
}
