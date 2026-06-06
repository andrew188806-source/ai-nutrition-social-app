import { mockAdminAuditLogs } from "@haocu/shared";
import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard } from "../../components/GovernanceUi";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function AuditTrailPage() {
  return (
    <AdminShell title={zhTW.adminPhase5.pages.auditTitle} subtitle={zhTW.adminPhase5.pages.auditSubtitle}>
      <CardGrid>
        {mockAdminAuditLogs.map((log) => (
          <DetailCard
            key={log.id}
            title={log.action}
            subtitle={log.entityType}
            items={[
              { label: zhTW.adminPhase5.labels.dataSources, value: log.entityId },
              { label: zhTW.adminPhase5.labels.updatedAt, value: log.createdAt }
            ]}
          />
        ))}
      </CardGrid>
    </AdminShell>
  );
}
