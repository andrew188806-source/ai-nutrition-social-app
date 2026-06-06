import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard, GovernanceNote } from "../../components/GovernanceUi";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { mockAdminConsents, mockAdminDataAccessLogs } from "@haocu/shared";

export default function AdminEsgPage() {
  return (
    <AdminShell title={zhTW.adminPhase5.pages.esgTitle} subtitle={zhTW.adminPhase5.pages.esgSubtitle}>
      <div className="grid gap-5">
        <GovernanceNote>{zhTW.adminPhase5.home.governanceNote}</GovernanceNote>
        <CardGrid>
          {mockAdminConsents.map((consent) => (
            <DetailCard
              key={consent.id}
              title={consent.consentType}
              subtitle={consent.userId}
              items={[
                { label: zhTW.adminPhase5.labels.consent, value: consent.granted ? zhTW.adminPhase5.booleans.granted : zhTW.adminPhase5.booleans.denied, tone: consent.granted ? "success" : "warning" },
                { label: zhTW.adminPhase5.labels.updatedAt, value: consent.updatedAt }
              ]}
            />
          ))}
          {mockAdminDataAccessLogs.map((log) => (
            <DetailCard
              key={log.id}
              title={log.action}
              subtitle={log.actorId}
              items={[
                { label: zhTW.adminPhase5.labels.dataSources, value: log.targetUserId ?? zhTW.adminPhase5.labels.mockOnly },
                { label: zhTW.adminPhase5.labels.updatedAt, value: log.createdAt }
              ]}
            />
          ))}
        </CardGrid>
      </div>
    </AdminShell>
  );
}
