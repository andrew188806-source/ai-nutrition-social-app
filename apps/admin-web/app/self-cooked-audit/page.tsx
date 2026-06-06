import { mockSelfCookedEstimationAudits } from "@haocu/shared";
import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard, GovernanceNote } from "../../components/GovernanceUi";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function SelfCookedAuditPage() {
  return (
    <AdminShell title={zhTW.adminPhase5.pages.selfCookedTitle} subtitle={zhTW.adminPhase5.pages.selfCookedSubtitle}>
      <div className="grid gap-5">
        <GovernanceNote>{zhTW.adminPhase5.copy.selfCooked}</GovernanceNote>
        <CardGrid>
          {mockSelfCookedEstimationAudits.map((audit) => (
            <DetailCard
              key={audit.id}
              title={audit.selfCookedMealId}
              subtitle={audit.nutritionChangeSummary}
              items={[
                { label: zhTW.adminPhase5.labels.dataSources, value: audit.originalEstimate },
                { label: zhTW.adminPhase5.labels.correction, value: [audit.correctedIngredients, audit.correctedPortion, audit.correctedCookingMethod] },
                { label: zhTW.adminPhase5.labels.consent, value: audit.consentForImprovement, tone: audit.consentForImprovement ? "success" : "warning" },
                { label: zhTW.adminPhase5.labels.riskyKeyword, value: audit.riskyClaimFlagIds.length, tone: audit.riskyClaimFlagIds.length > 0 ? "danger" : "success" }
              ]}
            />
          ))}
        </CardGrid>
      </div>
    </AdminShell>
  );
}
