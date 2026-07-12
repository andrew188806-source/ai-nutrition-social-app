import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard, GovernanceNote } from "../../components/GovernanceUi";
import { adminAuditService } from "../../services/admin-audit-service";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function AuditTrailPage() {
  const logs = adminAuditService.listAuditLogs();
  const drafts = adminAuditService.listActionDrafts();

  return (
    <AdminShell title={zhTW.adminPhase5.pages.auditTitle} subtitle={zhTW.adminPhase5.pages.auditSubtitle}>
      <div className="grid gap-5">
        <GovernanceNote>{`Action drafts waiting for confirmation: ${drafts.length}. Confirmed high-risk actions must write AuditLog records.`}</GovernanceNote>
        <CardGrid>
          {logs.map((log) => (
            <DetailCard
              key={log.id}
              title={log.action}
              subtitle={log.targetType}
              items={[
                { label: zhTW.adminPhase5.labels.dataSources, value: log.targetId },
                { label: "Actor", value: log.actorName },
                { label: "Result", value: log.result },
                { label: zhTW.adminPhase5.labels.updatedAt, value: log.createdAt },
                { label: "Note", value: log.note ?? "n/a" }
              ]}
            />
          ))}
        </CardGrid>
      </div>
    </AdminShell>
  );
}
