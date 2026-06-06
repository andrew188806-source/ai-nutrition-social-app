import { AdminShell } from "../../components/AdminShell";
import { Checklist, GovernanceNote } from "../../components/GovernanceUi";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function AdminSettingsPage() {
  return (
    <AdminShell title={zhTW.adminPhase5.pages.settingsTitle} subtitle={zhTW.adminPhase5.pages.settingsSubtitle}>
      <div className="grid gap-5">
        <GovernanceNote>{zhTW.adminPhase5.home.governanceNote}</GovernanceNote>
        <Checklist items={zhTW.adminPhase5.settings} />
      </div>
    </AdminShell>
  );
}
