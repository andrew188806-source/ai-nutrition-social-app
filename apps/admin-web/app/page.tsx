import { AdminShell } from "../components/AdminShell";
import { Checklist, GovernanceNote, MetricGrid } from "../components/GovernanceUi";
import { zhTW } from "../../../lib/i18n/zh-TW";

export default function AdminOverviewPage() {
  return (
    <AdminShell title={zhTW.adminPhase5.home.title} subtitle={zhTW.adminPhase5.home.subtitle}>
      <div className="grid gap-6">
        <GovernanceNote>{zhTW.adminPhase5.home.governanceNote}</GovernanceNote>
        <MetricGrid items={zhTW.adminPhase5.home.metrics} />
        <Checklist items={zhTW.adminPhase5.home.sections} />
      </div>
    </AdminShell>
  );
}
