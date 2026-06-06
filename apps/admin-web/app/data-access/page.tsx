import { mockAdminDataAccessLogs } from "@haocu/shared";
import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard } from "../../components/GovernanceUi";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function DataAccessPage() {
  return (
    <AdminShell title={zhTW.adminPhase5.pages.dataAccessTitle} subtitle={zhTW.adminPhase5.pages.dataAccessSubtitle}>
      <CardGrid>
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
    </AdminShell>
  );
}
