import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard } from "../../components/GovernanceUi";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { mockAdminConsents } from "@haocu/shared";

export default function AdminConsentsPage() {
  return (
    <AdminShell title={zhTW.adminPhase5.pages.consentTitle} subtitle={zhTW.adminPhase5.pages.consentSubtitle}>
      <CardGrid>
        {mockAdminConsents.map((consent) => (
          <DetailCard
            key={consent.id}
            title={consent.userId}
            subtitle={consent.consentType}
            items={[
              { label: zhTW.adminPhase5.labels.consent, value: consent.granted ? zhTW.adminPhase5.booleans.granted : zhTW.adminPhase5.booleans.denied, tone: consent.granted ? "success" : "warning" },
              { label: zhTW.adminPhase5.labels.updatedAt, value: consent.updatedAt }
            ]}
          />
        ))}
      </CardGrid>
    </AdminShell>
  );
}
