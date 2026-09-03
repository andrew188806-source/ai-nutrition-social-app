import { headers } from "next/headers";
import { AdminShell } from "../../components/AdminShell";
import { PlatformAdminAudit } from "../../components/PlatformAdminAudit";
import { loadAuditTrail } from "../../server/platformAdminAuditRuntime";
import { CardGrid, DetailCard, GovernanceNote } from "../../components/GovernanceUi";
import { adminAuditService } from "../../services/admin-audit-service";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AuditTrailPage({ searchParams = {} }: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const query = new URLSearchParams();
  for (const key of ["page", "pageSize"]) {
    const value = searchParams[key];
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }
  const composition = await loadAuditTrail(headers().get("authorization"), query);
  if (composition.mode === "live") {
    return (
      <AdminShell title="平台管理員生命週期稽核" subtitle="平台管理員授權與撤銷紀錄">
        <PlatformAdminAudit result={composition.result} />
      </AdminShell>
    );
  }
  const logs = adminAuditService.listAuditLogs();
  const drafts = adminAuditService.listActionDrafts();

  return (
    <AdminShell title={zhTW.adminPhase5.pages.auditTitle} subtitle={zhTW.adminPhase5.pages.auditSubtitle}>
      <div className="grid gap-5">
        <GovernanceNote>示範資料（Mock）：以下內容不代表正式稽核紀錄，也不授予管理員權限。</GovernanceNote>
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
