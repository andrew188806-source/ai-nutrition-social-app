import { mockRecommendationTransparencyLogs, mockRestaurantMenuIdentificationAudits, mockUserCorrectionAudits } from "@haocu/shared";
import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard, GovernanceNote, confidenceText } from "../../components/GovernanceUi";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function IdentificationAuditPage() {
  return (
    <AdminShell title={zhTW.adminPhase5.pages.identificationTitle} subtitle={zhTW.adminPhase5.pages.identificationSubtitle}>
      <div className="grid gap-5">
        <GovernanceNote>{zhTW.adminPhase5.copy.identification}</GovernanceNote>
        <CardGrid>
          {mockRestaurantMenuIdentificationAudits.map((audit) => (
            <DetailCard
              key={audit.id}
              title={`${audit.suggestedRestaurantName} / ${audit.suggestedMenuItemName}`}
              subtitle={audit.userId}
              items={[
                { label: zhTW.adminPhase5.labels.confidence, value: confidenceText(audit.confidence), tone: audit.confidence === "needs_confirmation" ? "warning" : "success" },
                { label: zhTW.adminPhase5.labels.userAction, value: zhTW.adminPhase5.userActions[audit.userAction] },
                { label: zhTW.adminPhase5.labels.dataSources, value: audit.dataSources },
                { label: zhTW.adminPhase5.labels.updatedAt, value: audit.createdAt }
              ]}
            />
          ))}
          {mockUserCorrectionAudits.map((audit) => (
            <DetailCard
              key={audit.id}
              title={audit.correctedResult}
              subtitle={audit.originalSuggestion}
              items={[
                { label: zhTW.adminPhase5.labels.correction, value: audit.futureLearningSignal },
                { label: zhTW.adminPhase5.labels.consent, value: audit.consentForImprovement, tone: audit.consentForImprovement ? "success" : "warning" }
              ]}
            />
          ))}
          {mockRecommendationTransparencyLogs.map((log) => (
            <DetailCard
              key={log.id}
              title={log.recommendationType}
              subtitle={log.userId}
              items={[
                { label: zhTW.adminPhase5.labels.tags, value: log.tagIds },
                { label: zhTW.adminPhase5.labels.dataSources, value: log.dataSources },
                { label: zhTW.adminPhase5.labels.sponsoredLabel, value: log.sponsoredInfluence, tone: log.sponsoredInfluence ? "sponsored" : "success" }
              ]}
            />
          ))}
        </CardGrid>
      </div>
    </AdminShell>
  );
}
