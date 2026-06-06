import { mockExerciseDataAccessLogs, mockHealthGoalRecommendationAudits } from "@haocu/shared";
import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard, GovernanceNote } from "../../components/GovernanceUi";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function ExerciseGovernancePage() {
  return (
    <AdminShell title={zhTW.adminPhase5.pages.exerciseTitle} subtitle={zhTW.adminPhase5.pages.exerciseSubtitle}>
      <div className="grid gap-5">
        <GovernanceNote>{zhTW.adminPhase5.copy.exercise}</GovernanceNote>
        <CardGrid>
          {mockExerciseDataAccessLogs.map((log) => (
            <DetailCard
              key={log.id}
              title={log.userId}
              subtitle={log.purpose}
              items={[
                { label: zhTW.adminPhase5.labels.consent, value: log.consentGranted, tone: log.consentGranted ? "success" : "warning" },
                { label: zhTW.adminPhase5.labels.accessFields, value: log.accessedFields },
                { label: zhTW.adminPhase5.labels.updatedAt, value: log.createdAt }
              ]}
            />
          ))}
          {mockHealthGoalRecommendationAudits.map((audit) => (
            <DetailCard
              key={audit.id}
              title={audit.userId}
              subtitle={audit.explanation}
              items={[
                { label: zhTW.adminPhase5.labels.affectedOutputs, value: audit.affectedOutputs },
                { label: zhTW.adminPhase5.labels.mockOnly, value: audit.usesMockExerciseData, tone: audit.usesMockExerciseData ? "success" : "danger" },
                { label: zhTW.adminPhase5.labels.noWearable, value: audit.noWearableConnected, tone: audit.noWearableConnected ? "success" : "danger" }
              ]}
            />
          ))}
        </CardGrid>
      </div>
    </AdminShell>
  );
}
